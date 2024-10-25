import { RedisClientType } from 'redis';
import { Ratelimit } from '../src/ratelimit';
import { clearRedis, closeRedis, createTestClient } from './setup';

describe('Fixed Window Rate Limiting', () => {
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
			type: 'fixed',
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

	it('should reset after window expires', async () => {
		// Adjust the window to 1 second for testing
		limiter = new Ratelimit(redis, {
			type: 'fixed',
			limit: 5,
			window: 1,
		});

		// Make requests up to limit
		await Promise.all(
			Array(5)
				.fill(null)
				.map(() => limiter.limit('test-key'))
		);

		// Wait for window to expire
		await new Promise((resolve) => setTimeout(resolve, 1100));

		// Should be able to make requests again
		const result = await limiter.limit('test-key');
		expect(result.success).toBe(true);
		expect(result.remaining).toBe(4);
	});

	it('should track different keys separately', async () => {
		// Make requests for first key
		await Promise.all(
			Array(10)
				.fill(null)
				.map(() => limiter.limit('key1'))
		);

		// Should still be able to make requests with second key
		const result = await limiter.limit('key2');
		expect(result.success).toBe(true);
		expect(result.remaining).toBe(9);
	});

	it('should provide accurate remaining counts', async () => {
		const limit = 5;
		limiter = new Ratelimit(redis, {
			type: 'fixed',
			limit,
			window: 60,
		});

		for (let i = 0; i < limit; i++) {
			const result = await limiter.limit('test-key');
			expect(result.remaining).toBe(limit - (i + 1));
		}
	});
});
