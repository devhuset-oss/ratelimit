import { randomUUID } from 'crypto';
import { Ratelimit } from './ratelimit';
import type { RedisClientType } from 'redis';
import { createClient } from 'redis';
import { describe, expect, it, beforeAll, afterAll } from 'bun:test';

let redis: RedisClientType;

beforeAll(async () => {
	redis = createClient();
	await redis.connect();
});

afterAll(async () => {
	await redis.quit();
});

describe('Rate Limiter Retry After', () => {
	it('allows requests after retry_after time has passed (fixed window)', async () => {
		const uniquePrefix = `ratelimit-${randomUUID()}`;
		const limiter = new Ratelimit(
			redis,
			Ratelimit.fixedWindow({
				limit: 1,
				window: 2,
				prefix: uniquePrefix,
			}),
		);

		const testKey = `retry-test-key-${randomUUID()}`;

		// First request should succeed
		const first = await limiter.limit(testKey);
		expect(first.success).toBe(true);

		// Second request should fail with retry_after
		const second = await limiter.limit(testKey);
		expect(second.success).toBe(false);
		expect(second.retry_after).toBeGreaterThan(0);

		// Wait for retry_after duration
		await new Promise((resolve) =>
			setTimeout(resolve, second.retry_after + 100),
		); // Add 100ms buffer

		// Should succeed after waiting
		const third = await limiter.limit(testKey);
		expect(third.success).toBe(true);
	});

	it('allows requests after retry_after time has passed (sliding window)', async () => {
		const uniquePrefix = `ratelimit-${randomUUID()}`;
		const limiter = new Ratelimit(
			redis,
			Ratelimit.slidingWindow({
				limit: 1,
				window: 2,
				prefix: uniquePrefix,
			}),
		);

		const testKey = `retry-test-key-${randomUUID()}`;

		// First request should succeed
		const first = await limiter.limit(testKey);
		expect(first.success).toBe(true);

		// Second request should fail with retry_after
		const second = await limiter.limit(testKey);
		expect(second.success).toBe(false);
		expect(second.retry_after).toBeGreaterThan(0);

		// Wait for retry_after duration
		await new Promise((resolve) =>
			setTimeout(resolve, second.retry_after + 100),
		); // Add 100ms buffer

		// Should succeed after waiting
		const third = await limiter.limit(testKey);
		expect(third.success).toBe(true);
	});

	it('handles multiple requests with sliding expiration', async () => {
		const uniquePrefix = `ratelimit-${randomUUID()}`;
		const limiter = new Ratelimit(
			redis,
			Ratelimit.slidingWindow({
				limit: 2,
				window: 4, // 4 second window
				prefix: uniquePrefix,
			}),
		);

		const testKey = `retry-test-key-${randomUUID()}`;

		// Make first request
		const first = await limiter.limit(testKey);
		expect(first.success).toBe(true);

		// Wait 1 second
		await new Promise((resolve) => setTimeout(resolve, 1000));

		// Make second request
		const second = await limiter.limit(testKey);
		expect(second.success).toBe(true);

		// Third request should be blocked
		const third = await limiter.limit(testKey);
		expect(third.success).toBe(false);
		expect(third.retry_after).toBeGreaterThan(0);

		// Wait for first request to expire (2 seconds more)
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// Should be able to make one more request
		const fourth = await limiter.limit(testKey);
		expect(fourth.success).toBe(true);

		// But next one should be blocked again
		const fifth = await limiter.limit(testKey);
		expect(fifth.success).toBe(false);
		// This retry_after should be less than the first one
		expect(fifth.retry_after).toBeLessThan(third.retry_after);
	});
});
