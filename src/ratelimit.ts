import type { RedisClientType } from 'redis';
import { ConfigurationError, RedisError } from './errors';
import type {
	RatelimitOptions,
	RatelimitOptionsWithoutType,
	RatelimitResponse,
} from './types';

/**
 * Redis-based rate limiter supporting both fixed and sliding window algorithms.
 * Fixed window divides time into discrete chunks while sliding window
 * provides smoother rate limiting using weighted scoring.
 */
export class Ratelimit {
	private readonly redis: RedisClientType;
	private script_sha: string | null = null;

	constructor(
		redis: RedisClientType,
		private readonly options: RatelimitOptions,
		private readonly time_provider: () => number = Date.now,
	) {
		this.redis = redis;
		this.validateOptions(options);
	}

	public static fixedWindow(
		params: RatelimitOptionsWithoutType,
	): RatelimitOptions {
		return { type: 'fixed', ...params };
	}

	public static slidingWindow(
		params: RatelimitOptionsWithoutType,
	): RatelimitOptions {
		return { type: 'sliding', ...params };
	}

	public async limit(identifier: string): Promise<RatelimitResponse> {
		try {
			return this.options.type === 'fixed'
				? await this.fixedWindowLimit(identifier)
				: await this.slidingWindowLimit(identifier);
		} catch (error) {
			throw new RedisError(
				'Failed to check rate limit',
				error instanceof Error ? error : new Error(String(error)),
			);
		}
	}

	private validateOptions(options: RatelimitOptions): void {
		if (options.limit <= 0) {
			throw new ConfigurationError('Limit must be greater than 0');
		}
		if (options.window <= 0) {
			throw new ConfigurationError('Time window must be greater than 0');
		}
		if (options.type !== 'fixed' && options.type !== 'sliding') {
			throw new ConfigurationError(
				'Type must be either "fixed" or "sliding"',
			);
		}
	}

	private getKey(identifier: string, suffix: string): string {
		const prefix = this.options.prefix || 'ratelimit';
		return `${prefix}:${identifier}:${suffix}`;
	}

	private async loadScript(): Promise<void> {
		try {
			this.script_sha = await this.redis.scriptLoad(
				SLIDING_WINDOW_SCRIPT,
			);
		} catch (error) {
			throw new RedisError(
				'Failed to load rate limit script',
				error instanceof Error ? error : new Error(String(error)),
			);
		}
	}

	private async fixedWindowLimit(
		identifier: string,
	): Promise<RatelimitResponse> {
		const now = this.time_provider();
		const window_size = this.options.window;
		const current_window = Math.floor(now / (window_size * 1000));
		const window_key = this.getKey(identifier, current_window.toString());
		const window_end = (current_window + 1) * (window_size * 1000);

		const count = await this.redis.incr(window_key);
		if (count === 1) {
			await this.redis.expire(window_key, window_size);
		}

		if (count > this.options.limit) {
			const ttl = await this.redis.ttl(window_key);
			return {
				success: false,
				limit: this.options.limit,
				remaining: 0,
				retry_after: Math.max(ttl * 1000, 0),
				reset: window_end,
			};
		}

		return {
			success: true,
			limit: this.options.limit,
			remaining: this.options.limit - count,
			retry_after: 0,
			reset: window_end,
		};
	}

	private async slidingWindowLimit(
		identifier: string,
	): Promise<RatelimitResponse> {
		if (!this.script_sha) {
			await this.loadScript();
		}

		const now = this.time_provider();
		const window = this.options.window * 1000;
		const current_window = Math.floor(now / window);
		const previous_window = current_window - 1;

		const current_key = this.getKey(identifier, current_window.toString());
		const previous_key = this.getKey(
			identifier,
			previous_window.toString(),
		);

		const [remaining, retry_after] = (await this.redis.evalSha(
			this.script_sha!,
			{
				keys: [current_key, previous_key],
				arguments: [
					this.options.limit.toString(),
					now.toString(),
					window.toString(),
					'1',
				],
			},
		)) as [number, number];

		return {
			success: remaining >= 0,
			limit: this.options.limit,
			remaining: Math.max(0, remaining),
			retry_after,
			reset: this.time_provider() + this.options.window * 2000,
		};
	}
}

/**
 * Sliding window rate limiting using weighted scoring from current and previous windows.
 * Calculates retry_after based on how many requests need to expire from the previous window.
 */
export const SLIDING_WINDOW_SCRIPT = `
local current_key = KEYS[1]
local previous_key = KEYS[2]
local tokens = tonumber(ARGV[1])
local now = tonumber(ARGV[2])
local window = tonumber(ARGV[3])
local increment_by = tonumber(ARGV[4])

local current_count = tonumber(redis.call("GET", current_key) or "0")
local previous_count = tonumber(redis.call("GET", previous_key) or "0")

local time_in_current = now % window
local time_remaining_previous = window - time_in_current
local weighted_previous = (previous_count * time_remaining_previous) / window
local cumulative_count = math.floor(weighted_previous) + current_count + increment_by

if cumulative_count > tokens then
    local needed = cumulative_count - tokens + increment_by
    local retry_after = window
    
    if previous_count > 0 then
        local time_needed = (needed * window) / previous_count
        retry_after = math.ceil(time_needed)
        
        if retry_after > time_remaining_previous then
            retry_after = time_remaining_previous
        end
    end
    
    return { -1, retry_after }
end

current_count = current_count + increment_by
redis.call("SET", current_key, current_count)
redis.call("PEXPIRE", current_key, window * 2 + 1000)

return { tokens - (math.floor(weighted_previous) + current_count), 0 }
`;
