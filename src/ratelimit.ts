import { RedisClientType } from 'redis';
import { ConfigurationError, RedisError } from './errors';
import {
	LimiterOptions,
	LimiterOptionsWithoutType,
	RatelimitResponse,
} from './types';

/**
 * Rate limiter implementation supporting both fixed and sliding window algorithms
 */
export class Ratelimit {
	private redis: RedisClientType;
	private options: LimiterOptions;

	/**
	 * Create a new rate limiter instance
	 * @param redis - Redis client instance
	 * @param options - Rate limiter configuration
	 */
	constructor(redis: RedisClientType, options: LimiterOptions) {
		this.validateOptions(options);
		this.redis = redis;
		this.options = options;
	}

	/**
	 * Create a fixed window rate limiter configuration
	 */
	static fixedWindow(params: LimiterOptionsWithoutType): LimiterOptions {
		return { type: 'fixed', ...params };
	}

	/**
	 * Create a sliding window rate limiter configuration
	 */
	static slidingWindow(params: LimiterOptionsWithoutType): LimiterOptions {
		return { type: 'sliding', ...params };
	}

	/**
	 * Generate Redis key with prefix
	 */
	private getKey(key: string, suffix: string): string {
		const prefix = this.options.prefix || 'ratelimit';
		return `${prefix}:${key}:${suffix}`;
	}

	/**
	 * Validate configuration options
	 */
	private validateOptions(options: LimiterOptions): void {
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

	/**
	 * Check if a request should be rate limited
	 */
	async limit(key: string): Promise<RatelimitResponse> {
		try {
			return this.options.type === 'fixed'
				? this.fixedWindowLimit(key)
				: this.slidingWindowLimit(key);
		} catch (error) {
			throw new RedisError('Failed to check rate limit', error as Error);
		}
	}

	/**
	 * Fixed window rate limiting implementation
	 */
	private async fixedWindowLimit(key: string): Promise<RatelimitResponse> {
		const now = Date.now();
		const currentWindow = Math.floor(now / 1000 / this.options.window);
		const windowKey = this.getKey(key, currentWindow.toString());

		const count = await this.redis.incr(windowKey);
		if (count === 1) {
			await this.redis.expire(windowKey, this.options.window);
		}

		const resetTime = (currentWindow + 1) * this.options.window;

		if (count > this.options.limit) {
			const ttl = await this.redis.ttl(windowKey);
			return {
				success: false,
				reset: Math.floor(now / 1000) + ttl,
				remaining: 0,
				retryAfter: ttl,
			};
		}

		return {
			success: true,
			reset: resetTime,
			remaining: this.options.limit - count,
		};
	}

	/**
	 * Sliding window rate limiting implementation
	 */
	private async slidingWindowLimit(key: string): Promise<RatelimitResponse> {
		const now = Date.now();
		const windowMs = this.options.window * 1000;
		const currentWindow = Math.floor(now / windowMs);

		const currentKey = this.getKey(key, currentWindow.toString());
		const previousKey = this.getKey(key, (currentWindow - 1).toString());

		const [currentCountStr, previousCountStr] = await Promise.all([
			this.redis.get(currentKey),
			this.redis.get(previousKey),
		]);

		const currentCount = parseInt(currentCountStr || '0', 10);
		const previousCount = parseInt(previousCountStr || '0', 10);

		const timeIntoCurrentWindow = now % windowMs;
		const proportionOfWindowRemaining =
			(windowMs - timeIntoCurrentWindow) / windowMs;
		const weightedPrevious = previousCount * proportionOfWindowRemaining;
		const rate = weightedPrevious + currentCount + 1;

		const nextWindowStart = (currentWindow + 1) * windowMs;
		const resetTimestamp = Math.floor(nextWindowStart / 1000);

		if (rate > this.options.limit) {
			const retryAfter = previousCount
				? Math.ceil(
						((rate - this.options.limit) / previousCount) *
							this.options.window
					)
				: this.options.window;

			return {
				success: false,
				reset: resetTimestamp,
				remaining: 0,
				retryAfter,
			};
		}

		await this.redis.incr(currentKey);
		await this.redis.expire(currentKey, this.options.window * 2);

		return {
			success: true,
			reset: resetTimestamp,
			remaining: Math.floor(this.options.limit - rate),
		};
	}
}
