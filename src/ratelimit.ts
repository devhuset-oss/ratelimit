import { type Valkey } from './client';
import { ConfigurationError, ValkeyError } from './errors';
import type {
	RatelimitOptions,
	RatelimitOptionsWithoutType,
	RatelimitResponse,
} from './types';

/**
 * Valkey-based rate limiter supporting both fixed and sliding window algorithms.
 * Fixed window divides time into discrete chunks while sliding window
 * provides smoother rate limiting using weighted scoring.
 */
export class Ratelimit {
	private readonly valkey: Valkey;

	constructor(
		valkey: Valkey,
		private readonly options: RatelimitOptions,
		private readonly time_provider: () => number = Date.now,
	) {
		this.valkey = valkey;
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
			throw new ValkeyError(
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

	private async fixedWindowLimit(
		identifier: string,
	): Promise<RatelimitResponse> {
		const now = this.time_provider();
		const window_size = this.options.window;
		const current_window = Math.floor(now / (window_size * 1000));
		const window_key = this.getKey(identifier, current_window.toString());
		const window_end = (current_window + 1) * (window_size * 1000);

		const count = await this.valkey.incr(window_key);
		if (count === 1) {
			await this.valkey.expire(window_key, window_size);
		}

		if (count > this.options.limit) {
			const ttl = await this.valkey.ttl(window_key);
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
		const now = this.time_provider();
		const window = this.options.window * 1000;
		const current_window = Math.floor(now / window);
		const previous_window = current_window - 1;

		const current_key = this.getKey(identifier, current_window.toString());
		const previous_key = this.getKey(
			identifier,
			previous_window.toString(),
		);

		const [remaining, retry_after] =
			await this.valkey.slidingWindowRateLimit(
				[current_key, previous_key],
				this.options.limit.toString(),
				now.toString(),
				window.toString(),
				'1',
			);

		return {
			success: remaining >= 0,
			limit: this.options.limit,
			remaining: Math.max(0, remaining),
			retry_after,
			reset: this.time_provider() + this.options.window * 2000,
		};
	}
}
