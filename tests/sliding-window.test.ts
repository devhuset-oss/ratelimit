import { RedisClientType } from 'redis';
import { Ratelimit } from '../src/ratelimit';
import { clearRedis, closeRedis, createTestClient } from './setup';

describe('Sliding Window Rate Limiting', () => {
	let redis: RedisClientType;
	let limiter: Ratelimit;

	beforeAll(async () => {
		redis = await createTestClient();
	});

	afterAll(async () => {
		await closeRedis();
	});

	beforeEach(async () => {
		await clearRedis();
		limiter = new Ratelimit(redis, {
			type: 'sliding',
			limit: 10,
			window: 60,
		});
	});

	it('should allow requests within limit', async () => {
		const results = await Promise.all(
			Array(10)
				.fill(null)
				.map(() => limiter.limit('test-key'))
		);

		results.forEach((result) => {
			expect(result.success).toBe(true);
		});
	});

	it('should block requests over limit', async () => {
		// First make 10 requests (at the limit)
		await Promise.all(
			Array(10)
				.fill(null)
				.map(() => limiter.limit('test-key'))
		);

		// Next request should be blocked
		const result = await limiter.limit('test-key');
		expect(result.success).toBe(false);
		expect(result.remaining).toBe(0);
		expect(result.retryAfter).toBeDefined();
	});

	it('should handle first-time rate limit correctly', async () => {
		limiter = new Ratelimit(redis, {
			type: 'sliding',
			limit: 5,
			window: 60,
		});

		// Make 6 requests (one over limit)
		const results = await Promise.all(
			Array(6)
				.fill(null)
				.map(() => limiter.limit('test-key'))
		);

		const lastResult = results[5];
		expect(lastResult.success).toBe(false);
		expect(lastResult.retryAfter).toBe(60); // Should be full window on first limit
	});

	it('should calculate weighted rates correctly', async () => {
		limiter = new Ratelimit(redis, {
			type: 'sliding',
			limit: 10,
			window: 2, // 2 second window for easier testing
		});

		// Make 8 requests in first second
		await Promise.all(
			Array(8)
				.fill(null)
				.map(() => limiter.limit('test-key'))
		);

		// Wait 1 second (half the window)
		await new Promise((resolve) => setTimeout(resolve, 1000));

		// These requests should still work as the weighted rate is < 10
		const results = await Promise.all([
			limiter.limit('test-key'),
			limiter.limit('test-key'),
		]);

		results.forEach((result) => {
			expect(result.success).toBe(true);
		});

		// But one more should fail
		const lastResult = await limiter.limit('test-key');
		expect(lastResult.success).toBe(false);
	});

	it('should handle multiple windows correctly', async () => {
		limiter = new Ratelimit(redis, {
			type: 'sliding',
			limit: 5,
			window: 1, // 1 second window for testing
		});

		// Fill first window
		await Promise.all(
			Array(5)
				.fill(null)
				.map(() => limiter.limit('test-key'))
		);

		// Wait 0.5 seconds
		await new Promise((resolve) => setTimeout(resolve, 500));

		// Should be partially limited
		const midResult = await limiter.limit('test-key');
		expect(midResult.success).toBe(false);
		expect(midResult.retryAfter).toBeLessThan(1); // Should be less than window

		// Wait for full window
		await new Promise((resolve) => setTimeout(resolve, 1000));

		// Should be able to make requests again
		const result = await limiter.limit('test-key');
		expect(result.success).toBe(true);
	});

	it('should provide accurate remaining counts', async () => {
		const results: number[] = [];

		for (let i = 0; i < 10; i++) {
			const result = await limiter.limit('test-key');
			results.push(result.remaining);
		}

		// Remaining should decrease monotonically
		for (let i = 1; i < results.length; i++) {
			expect(results[i]).toBeLessThan(results[i - 1]);
		}
	});
});
