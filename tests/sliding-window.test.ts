import { Ratelimit } from '../src/ratelimit';
import { createTestClient, clearRedis, closeRedis } from './setup';
import { RedisClientType } from 'redis';

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
	});

	it('should allow requests within limit', async () => {
		limiter = new Ratelimit(
			redis,
			Ratelimit.slidingWindow({
				limit: 5,
				window: 60,
			})
		);

		// Make requests sequentially instead of in parallel
		for (let i = 0; i < 5; i++) {
			const result = await limiter.limit('test-key');
			expect(result.success).toBe(true);
			expect(result.remaining).toBe(4 - i);
		}
	});

	it('should block requests over limit', async () => {
		limiter = new Ratelimit(
			redis,
			Ratelimit.slidingWindow({
				limit: 5,
				window: 60,
			})
		);

		// Fill up to the limit
		for (let i = 0; i < 5; i++) {
			await limiter.limit('test-key');
		}

		// This one should be blocked
		const result = await limiter.limit('test-key');
		expect(result.success).toBe(false);
		expect(result.remaining).toBe(0);
		expect(result.retryAfter).toBeDefined();
	});

	it('should handle first-time rate limit correctly', async () => {
		limiter = new Ratelimit(
			redis,
			Ratelimit.slidingWindow({
				limit: 3, // Small limit for predictable testing
				window: 10, // Shorter window for faster tests
			})
		);

		// Make exactly limit requests
		for (let i = 0; i < 3; i++) {
			const result = await limiter.limit('test-key');
			expect(result.success).toBe(true);
		}

		// This should be blocked
		const result = await limiter.limit('test-key');
		expect(result.success).toBe(false);
		expect(result.retryAfter).toBeGreaterThan(0);
	});

	it('should calculate weighted rates correctly', async () => {
		limiter = new Ratelimit(
			redis,
			Ratelimit.slidingWindow({
				limit: 4, // Small limit for predictable testing
				window: 2, // 2 second window
			})
		);

		// Make 3 requests (leaving room for 1 more)
		for (let i = 0; i < 3; i++) {
			const result = await limiter.limit('test-key');
			expect(result.success).toBe(true);
		}

		// Wait 1 second (half the window)
		await new Promise((resolve) => setTimeout(resolve, 1000));

		// Should allow one more request due to weighted calculation
		const result = await limiter.limit('test-key');
		expect(result.success).toBe(true);

		// But one more should fail
		const blocked = await limiter.limit('test-key');
		expect(blocked.success).toBe(false);
	});

	// Back to the original timing-based test that was working
	it('should handle window transitions', async () => {
		limiter = new Ratelimit(
			redis,
			Ratelimit.slidingWindow({
				limit: 2, // Very small limit for clear testing
				window: 1, // 1 second window
			})
		);

		// Fill the limit
		await limiter.limit('test-key');
		await limiter.limit('test-key');

		// Immediate request should fail
		const blocked = await limiter.limit('test-key');
		expect(blocked.success).toBe(false);

		// Wait for window + buffer
		await new Promise((resolve) => setTimeout(resolve, 1500));

		// Should work again
		const renewed = await limiter.limit('test-key');
		expect(renewed.success).toBe(true);
	});

	it('should maintain accurate counts across windows', async () => {
		limiter = new Ratelimit(
			redis,
			Ratelimit.slidingWindow({
				limit: 3,
				window: 1,
			})
		);

		// Fill window
		for (let i = 0; i < 3; i++) {
			await limiter.limit('test-key');
		}

		// This should be blocked
		const blocked = await limiter.limit('test-key');
		expect(blocked.success).toBe(false);

		// Wait 2 full windows to ensure complete reset
		await new Promise((resolve) => setTimeout(resolve, 2100));

		// Should now have full limit again
		const result = await limiter.limit('test-key');
		expect(result.success).toBe(true);
		expect(result.remaining).toBe(2);
	});
});
