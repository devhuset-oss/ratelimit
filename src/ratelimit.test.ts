import {
	describe,
	expect,
	it,
	beforeAll,
	afterAll,
	beforeEach,
} from 'bun:test';
import type { RedisClientType } from 'redis';
import { createClient } from 'redis';
import { Ratelimit } from './ratelimit';
import { ConfigurationError, RedisError } from './errors';
import { randomUUID } from 'crypto';
import type { RatelimitResponse } from './types';

describe('Rate Limiter Test Suite', () => {
	let redis: RedisClientType;

	beforeAll(async () => {
		redis = createClient();
		await redis.connect();
	});

	beforeEach(async () => {
		await redis.flushDb();
	});

	afterAll(async () => {
		await redis.quit();
	});

	const createLimiter = ({
		type = 'fixed',
		limit = 5,
		window = 10,
		prefix = `test-${randomUUID()}`,
	} = {}): Ratelimit => {
		const config =
			type === 'fixed'
				? Ratelimit.fixedWindow({ limit, window, prefix })
				: Ratelimit.slidingWindow({ limit, window, prefix });
		return new Ratelimit(redis, config);
	};

	describe('Configuration Validation', () => {
		it('throws on invalid limit values', () => {
			const invalidLimits = [0, -1];

			invalidLimits.forEach((limit) => {
				expect(
					() =>
						new Ratelimit(
							redis,
							Ratelimit.fixedWindow({ limit, window: 10 }),
						),
				).toThrow(ConfigurationError);
			});
		});

		it('throws on invalid window values', () => {
			const invalidWindows = [0, -1];

			invalidWindows.forEach((window) => {
				expect(
					() =>
						new Ratelimit(
							redis,
							Ratelimit.fixedWindow({ limit: 10, window }),
						),
				).toThrow(ConfigurationError);
			});
		});

		it('throws on invalid limiter type', () => {
			expect(
				() =>
					new Ratelimit(redis, {
						type: 'invalid' as unknown as 'fixed' | 'sliding',
						limit: 10,
						window: 10,
					}),
			).toThrow(ConfigurationError);
		});
	});

	describe('Redis Error Handling', () => {
		it('handles Redis connection failures', () => {
			const brokenRedis = createClient({ url: 'redis://localhost:6380' }); // wrong port
			const limiter = new Ratelimit(
				// @ts-expect-error - broken redis client
				brokenRedis,
				Ratelimit.fixedWindow({ limit: 5, window: 10 }),
			);

			expect(limiter.limit('test')).rejects.toThrow(RedisError);
		});

		it('handles Redis script loading failures for sliding window', () => {
			const limiter = createLimiter({ type: 'sliding' });

			// @ts-expect-error - Accessing private property for testing
			limiter.redis.scriptLoad = () => {
				throw new Error('Script load failed');
			};

			expect(limiter.limit('test')).rejects.toThrow(RedisError);
		});
	});

	describe('Key Prefix Handling', () => {
		it('uses default prefix when none provided', async () => {
			const limiter = createLimiter({ prefix: undefined });
			const result = await limiter.limit('test');
			expect(result.success).toBe(true);
		});

		it('uses custom prefix when provided', async () => {
			const prefix = `prefix-${randomUUID()}`;
			const limiter = createLimiter({ prefix });
			const result = await limiter.limit('test');
			expect(result.success).toBe(true);
		});
	});

	describe('Response Structure', () => {
		it('returns correct structure for successful request', async () => {
			const limiter = createLimiter();
			const result = await limiter.limit('test');

			expect(result).toEqual(
				expect.objectContaining({
					success: true,
					limit: 5,
					retry_after: 0,
				}) as RatelimitResponse,
			);

			expect(result.remaining).toBeGreaterThanOrEqual(0);
			expect(result.remaining).toBeLessThanOrEqual(4);
			expect(result.reset).toBeGreaterThan(Date.now());
			expect(typeof result.reset).toBe('number');
		});

		it('returns correct structure for rate limited request', async () => {
			const limiter = createLimiter({ limit: 1 });

			// Use up the limit
			await limiter.limit('test');

			// This request should be rate limited
			const result = await limiter.limit('test');

			expect(result).toEqual(
				expect.objectContaining({
					success: false,
					limit: 1,
					remaining: 0,
				}) as RatelimitResponse,
			);

			expect(result.retry_after).toBeGreaterThan(0);
			expect(result.reset).toBeGreaterThan(Date.now());
			expect(typeof result.reset).toBe('number');
		});

		it('returns same reset time for same window', async () => {
			const limiter = createLimiter();

			const [result1, result2] = await Promise.all([
				limiter.limit('test'),
				limiter.limit('test'),
			]);

			expect(result1.reset).toBe(result2.reset);
		});
	});
});
