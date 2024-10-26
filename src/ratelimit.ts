import { RedisClientType } from 'redis';
import { ConfigurationError, RedisError } from './errors';

interface RatelimitResponse {
	success: boolean;
	limit: number; // The configured limit
	remaining: number; // Remaining requests in window
	reset: number; // When the limit resets (unix timestamp in ms)
}

interface RatelimitOptionsWithoutType {
	/**
	 * Maximum number of requests allowed within the window
	 */
	limit: number;

	/**
	 * Time window in seconds
	 */
	window: number;

	/**
	 * Optional prefix for Redis keys
	 * @default "ratelimit"
	 */
	prefix?: string;
}

interface RatelimitOptions extends RatelimitOptionsWithoutType {
	type: 'fixed' | 'sliding';
}

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

		// Increment counter
		const count = await this.redis.incr(windowKey);

		// Set expiry on new keys
		if (count === 1) {
			await this.redis.expire(windowKey, this.options.window);
		}

		// Calculate reset time
		const resetTime = (currentWindow + 1) * this.options.window;

		// Check if over limit
		if (count > this.options.limit) {
			const ttl = await this.redis.ttl(windowKey);
			return {
				success: false, // Always false for fixed window
				limit: this.options.limit,
				remaining: 0,
				reset: Math.floor(now / 1000) + ttl,
			};
		}

		return {
			success: true, // Always true for fixed window
			limit: this.options.limit,
			remaining: this.options.limit - count,
			reset: resetTime,
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

		const remaining = (await this.redis.evalSha(this.scriptSha!, {
			keys: [currentKey, previousKey],
			arguments: [
				this.options.limit.toString(),
				now.toString(),
				windowMs.toString(),
				'1',
			],
		})) as number;

		return {
			success: remaining >= 0,
			limit: this.options.limit,
			remaining: Math.max(0, remaining),
			reset: (currentWindow + 1) * windowMs,
		};
	}
}

export const SLIDING_WINDOW_SCRIPT = `
local currentKey  = KEYS[1]           -- identifier including prefixes
local previousKey = KEYS[2]           -- key of the previous bucket
local tokens      = tonumber(ARGV[1]) -- tokens per window
local now         = tonumber(ARGV[2]) -- current timestamp in milliseconds
local window      = tonumber(ARGV[3]) -- interval in milliseconds
local incrementBy = tonumber(ARGV[4]) -- increment rate per request, default is 1

-- Get current window count
local current_count = tonumber(redis.call("GET", currentKey) or "0")
-- Get previous window count
local previous_count = tonumber(redis.call("GET", previousKey) or "0")

-- Calculate the percentage of the current window that has passed
local percentageInCurrent = (now % window) / window

-- Calculate weighted previous count using math.floor
local weighted_previous = math.floor((1 - percentageInCurrent) * previous_count)

-- Check if cumulative requests exceed the limit **before** incrementing
local cumulative_count = weighted_previous + current_count

if cumulative_count >= tokens then
  return -1
end

-- If we get here, increment the current window
local new_count = redis.call("INCRBY", currentKey, incrementBy)

-- Set expiration for the current key if it's the first time it's set
if new_count == incrementBy then
  redis.call("PEXPIRE", currentKey, window * 2 + 1000)
end

-- Calculate remaining tokens
local remaining = tokens - (weighted_previous + new_count)
return remaining
`;
