import { describe, expect, it, beforeAll, afterAll } from 'bun:test';
import type { RedisClientType } from 'redis';
import { createClient } from 'redis';
import { Ratelimit } from './ratelimit';
import { ConfigurationError, RedisError } from './errors';
import { randomUUID } from 'crypto';

let redis: RedisClientType;

beforeAll(async () => {
	redis = createClient();
	await redis.connect();
});

afterAll(async () => {
	await redis.quit();
});

describe('Rate Limiter Configuration', () => {
	it('throws on invalid limit', () => {
		expect(
			() =>
				new Ratelimit(
					redis,
					Ratelimit.fixedWindow({
						limit: 0,
						window: 10,
					}),
				),
		).toThrow(ConfigurationError);

		expect(
			() =>
				new Ratelimit(
					redis,
					Ratelimit.fixedWindow({
						limit: -1,
						window: 10,
					}),
				),
		).toThrow(ConfigurationError);
	});

	it('throws on invalid window', () => {
		expect(
			() =>
				new Ratelimit(
					redis,
					Ratelimit.fixedWindow({
						limit: 10,
						window: 0,
					}),
				),
		).toThrow(ConfigurationError);

		expect(
			() =>
				new Ratelimit(
					redis,
					Ratelimit.fixedWindow({
						limit: 10,
						window: -1,
					}),
				),
		).toThrow(ConfigurationError);
	});

	it('throws on invalid type', () => {
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

describe('Rate Limiter Redis Errors', () => {
	it('handles Redis connection failures', () => {
		const brokenRedis = createClient({ url: 'redis://localhost:6380' }); // wrong port
		const limiter = new Ratelimit(
			// @ts-expect-error - broken redis client
			brokenRedis,
			Ratelimit.fixedWindow({
				limit: 5,
				window: 10,
			}),
		);

		expect(limiter.limit('test')).rejects.toThrow(RedisError);
	});

	it('handles Redis script loading failures for sliding window', () => {
		const limiter = new Ratelimit(
			redis,
			Ratelimit.slidingWindow({
				limit: 5,
				window: 10,
			}),
		);

		// @ts-expect-error - Accessing private property for testing (redis)
		limiter.redis.scriptLoad = () => {
			throw new Error('Script load failed');
		};

		expect(limiter.limit('test')).rejects.toThrow(RedisError);
	});
});

describe('Rate Limiter Key Prefixes', () => {
	it('uses default prefix when none provided', async () => {
		const limiter = new Ratelimit(
			redis,
			Ratelimit.fixedWindow({
				limit: 5,
				window: 10,
			}),
		);
		const result = await limiter.limit('test');
		expect(result.success).toBe(true);
	});

	it('uses custom prefix when provided', async () => {
		const prefix = `prefix-${randomUUID()}`;
		const limiter = new Ratelimit(
			redis,
			Ratelimit.fixedWindow({
				limit: 5,
				window: 10,
				prefix,
			}),
		);
		const result = await limiter.limit('test');
		expect(result.success).toBe(true);
	});
});

describe('Rate Limiter Response Structure', () => {
	it('returns correct response structure for successful request', async () => {
		const limiter = new Ratelimit(
			redis,
			Ratelimit.fixedWindow({
				limit: 5,
				window: 10,
				prefix: `test-${randomUUID()}`,
			}),
		);

		const result = await limiter.limit('test');

		expect(result).toHaveProperty('success', true);
		expect(result).toHaveProperty('limit', 5);
		expect(result.remaining).toBeGreaterThanOrEqual(0);
		expect(result.remaining).toBeLessThanOrEqual(4);
		expect(result).toHaveProperty('retry_after', 0);
		expect(typeof result.reset).toBe('number');
		expect(result.reset).toBeGreaterThan(Date.now());
	});

	it('returns correct response structure for rate limited request', async () => {
		const limiter = new Ratelimit(
			redis,
			Ratelimit.fixedWindow({
				limit: 1,
				window: 10,
				prefix: `test-${randomUUID()}`,
			}),
		);

		// Use up the limit
		await limiter.limit('test');

		// This request should be rate limited
		const result = await limiter.limit('test');

		expect(result).toHaveProperty('success', false);
		expect(result).toHaveProperty('limit', 1);
		expect(result).toHaveProperty('remaining', 0);
		expect(result.retry_after).toBeGreaterThan(0);
		expect(typeof result.reset).toBe('number');
		expect(result.reset).toBeGreaterThan(Date.now());
	});

	it('returns same reset time for same window', async () => {
		const limiter = new Ratelimit(
			redis,
			Ratelimit.fixedWindow({
				limit: 5,
				window: 10,
				prefix: `test-${randomUUID()}`,
			}),
		);

		const result1 = await limiter.limit('test');
		const result2 = await limiter.limit('test');

		expect(result1.reset).toBe(result2.reset);
	});
});
