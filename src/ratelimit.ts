import { RedisClientType } from 'redis';
import { ConfigurationError, RedisError } from './errors';
import {
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
	private scriptSha: string | null = null;

	constructor(
		redis: RedisClientType,
		private readonly options: RatelimitOptions
	) {
		this.redis = redis;
		this.validateOptions(options);
	}

	static fixedWindow(params: RatelimitOptionsWithoutType): RatelimitOptions {
		return { type: 'fixed', ...params };
	}

	static slidingWindow(
		params: RatelimitOptionsWithoutType
	): RatelimitOptions {
		return { type: 'sliding', ...params };
	}

	private validateOptions(options: RatelimitOptions): void {
		if (options.limit <= 0) {
			throw new ConfigurationError('Limit must be greater than 0');
		}
		if (options.window <= 0) {
			throw new ConfigurationError('Window must be greater than 0');
		}
		if (options.type !== 'fixed' && options.type !== 'sliding') {
			throw new ConfigurationError(
				'Type must be either "fixed" or "sliding"'
			);
		}
	}

	private getKey(identifier: string, suffix: string): string {
		const prefix = this.options.prefix || 'ratelimit';
		return `${prefix}:${identifier}:${suffix}`;
	}

	async limit(identifier: string): Promise<RatelimitResponse> {
		try {
			if (this.options.type === 'fixed') {
				return await this.fixedWindowLimit(identifier);
			} else {
				return await this.slidingWindowLimit(identifier);
			}
		} catch (error) {
			throw new RedisError(
				'Failed to check rate limit',
				error instanceof Error ? error : new Error(String(error))
			);
		}
	}

	private async loadScript(): Promise<void> {
		try {
			this.scriptSha = await this.redis.scriptLoad(SLIDING_WINDOW_SCRIPT);
		} catch (error) {
			throw new RedisError(
				'Failed to load rate limit script',
				error instanceof Error ? error : new Error(String(error))
			);
		}
	}

	private async fixedWindowLimit(
		identifier: string
	): Promise<RatelimitResponse> {
		const now = Date.now();
		const currentWindow = Math.floor(now / 1000 / this.options.window);
		const windowKey = this.getKey(identifier, currentWindow.toString());

		const count = await this.redis.incr(windowKey);

		if (count === 1) {
			await this.redis.expire(windowKey, this.options.window);
		}

		const windowEnd = (currentWindow + 1) * this.options.window * 1000;
		const reset = windowEnd;

		if (count > this.options.limit) {
			const ttl = await this.redis.ttl(windowKey);
			return {
				success: false,
				limit: this.options.limit,
				remaining: 0,
				retry_after: ttl * 1000,
				reset,
			};
		}

		return {
			success: true,
			limit: this.options.limit,
			remaining: this.options.limit - count,
			retry_after: 0,
			reset,
		};
	}

	private async slidingWindowLimit(
		identifier: string
	): Promise<RatelimitResponse> {
		if (!this.scriptSha) {
			await this.loadScript();
		}

		const now = Date.now();
		const windowMs = this.options.window * 1000;
		const currentWindow = Math.floor(now / windowMs);

		const currentKey = this.getKey(identifier, currentWindow.toString());
		const previousKey = this.getKey(
			identifier,
			(currentWindow - 1).toString()
		);

		const [remaining, retry_after] = (await this.redis.evalSha(
			this.scriptSha!,
			{
				keys: [currentKey, previousKey],
				arguments: [
					this.options.limit.toString(),
					now.toString(),
					windowMs.toString(),
					'1',
				],
			}
		)) as [number, number];

		return {
			success: remaining >= 0,
			limit: this.options.limit,
			remaining: Math.max(0, remaining),
			retry_after: retry_after,
			reset: Date.now() + this.options.window * 2000,
		};
	}
}

/**
 * Sliding window rate limiting using weighted scoring from current and previous windows.
 * Calculates retry_after based on how many requests need to expire from the previous window.
 */
export const SLIDING_WINDOW_SCRIPT = `
local currentKey = KEYS[1]
local previousKey = KEYS[2]
local tokens = tonumber(ARGV[1])
local now = tonumber(ARGV[2])
local window = tonumber(ARGV[3])
local incrementBy = tonumber(ARGV[4])

local current_count = tonumber(redis.call("GET", currentKey) or "0")
local previous_count = tonumber(redis.call("GET", previousKey) or "0")

local percentageInCurrent = (now % window) / window
local weighted_previous = (1 - percentageInCurrent) * previous_count
local cumulative_count = math.floor(weighted_previous) + current_count

if cumulative_count >= tokens then
    local needed = math.max(1, (cumulative_count + 1) - tokens)
    local retry_after = window

    if previous_count > 0 then
        local expire_percent_needed = needed / previous_count
        local time_passed = percentageInCurrent * window
        local time_remaining = window - time_passed
        retry_after = math.ceil(expire_percent_needed * window)
        
        if retry_after > time_remaining then
            retry_after = time_remaining
        end
    end

    return { -1, retry_after }
end

local new_count = redis.call("INCRBY", currentKey, incrementBy)

if new_count == incrementBy then
    redis.call("PEXPIRE", currentKey, window * 2 + 1000)
end

return { tokens - (math.floor(weighted_previous) + new_count), 0 }
`;
