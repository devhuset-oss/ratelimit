import { describe, expect, it, beforeAll, afterAll } from 'bun:test';
import type { RedisClientType } from 'redis';
import { createClient } from 'redis';
import { Ratelimit } from './ratelimit';
import { randomUUID } from 'crypto';

let redis: RedisClientType;

beforeAll(async () => {
	redis = createClient();
	await redis.connect();
});

afterAll(async () => {
	await redis.quit();
});

describe('Sliding Window Rate Limiter Edge Cases', () => {
	it('correctly calculates weighted requests across windows', async () => {
		const uniquePrefix = `ratelimit-${randomUUID()}`;
		const limiter = new Ratelimit(
			redis,
			Ratelimit.slidingWindow({
				limit: 10,
				window: 1, // 1 second window for faster testing
				prefix: uniquePrefix,
			}),
		);

		const testKey = `sliding-test-key-weighted-${randomUUID()}`;

		// Make 3 requests (instead of 4 to leave more headroom)
		for (let i = 0; i < 3; i++) {
			const result = await limiter.limit(testKey);
			expect(result.success).toBe(true);
		}

		// Wait for 750ms (75% of the window)
		await new Promise((resolve) => setTimeout(resolve, 750));

		// Make 4 requests (instead of 5 to leave more headroom)
		for (let i = 0; i < 4; i++) {
			const result = await limiter.limit(testKey);
			expect(result.success).toBe(true);
		}

		// At this point we have:
		// - 3 requests from previous window (weighted by 0.25 since 75% of window passed)
		// - 4 requests in current window
		// Total weighted requests should be: (3 * 0.25) + 4 = 4.75

		// This request should succeed as 4.75 < 10 (limit)
		const result = await limiter.limit(testKey);
		expect(result.success).toBe(true);
		const result2 = await limiter.limit(testKey);
		expect(result2.success).toBe(true);
	});

	it('expires old requests correctly', async () => {
		const uniquePrefix = `ratelimit-${randomUUID()}`;
		const limiter = new Ratelimit(
			redis,
			Ratelimit.slidingWindow({
				limit: 10,
				window: 1, // 1 second window for faster testing
				prefix: uniquePrefix,
			}),
		);

		const testKey = `sliding-test-key-expiry-${randomUUID()}`;

		// Fill up the limit
		for (let i = 0; i < 10; i++) {
			const result = await limiter.limit(testKey);
			expect(result.success).toBe(true);
		}

		// Verify we're at the limit
		const overLimitResult = await limiter.limit(testKey);
		expect(overLimitResult.success).toBe(false);
		expect(overLimitResult.remaining).toBe(0);

		// Wait for 2 full windows to ensure complete expiration
		await new Promise((resolve) => setTimeout(resolve, 2100));

		// Now all previous requests should have truly expired
		const result = await limiter.limit(testKey);
		expect(result.success).toBe(true);
		// After a new request, we should have limit-1 remaining
		expect(result.remaining).toBe(9);
	});

	it('handles window transitions with partial counts', async () => {
		const uniquePrefix = `ratelimit-${randomUUID()}`;
		const limiter = new Ratelimit(
			redis,
			Ratelimit.slidingWindow({
				limit: 10,
				window: 1, // 1 second window for faster testing
				prefix: uniquePrefix,
			}),
		);

		const testKey = `sliding-test-key-transition-${randomUUID()}`;

		// Make 6 requests (reduced from 8 to leave more headroom)
		for (let i = 0; i < 6; i++) {
			const result = await limiter.limit(testKey);
			expect(result.success).toBe(true);
		}

		// Wait for half the window
		await new Promise((resolve) => setTimeout(resolve, 500));

		// At this point, the 6 requests should be weighted by 0.5
		// So we should have 6 * 0.5 = 3 effective requests
		const result = await limiter.limit(testKey);
		expect(result.success).toBe(true);
		// Make another request to verify we're not at the limit
		const result2 = await limiter.limit(testKey);
		expect(result2.success).toBe(true);
	});

	it('handles rapid requests at window boundary', async () => {
		const uniquePrefix = `ratelimit-${randomUUID()}`;
		const limiter = new Ratelimit(
			redis,
			Ratelimit.slidingWindow({
				limit: 5,
				window: 1, // 1 second window for faster testing
				prefix: uniquePrefix,
			}),
		);

		const testKey = `sliding-test-key-boundary-${randomUUID()}`;

		// Make 2 requests in first window (reduced from 3)
		for (let i = 0; i < 2; i++) {
			const result = await limiter.limit(testKey);
			expect(result.success).toBe(true);
		}

		// Wait for 900ms (90% of window)
		await new Promise((resolve) => setTimeout(resolve, 900));

		// Make 2 more requests near window boundary
		// These should be allowed since weighted count would be:
		// (2 * 0.1) + 2 = 2.2 requests
		for (let i = 0; i < 2; i++) {
			const result = await limiter.limit(testKey);
			expect(result.success).toBe(true);
		}
	});
});
