import { describe, expect, it, beforeAll, afterAll } from 'bun:test';
import { createClient, RedisClientType } from 'redis';
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

describe('Fixed Window Rate Limiter', () => {
	it('allows requests within the limit', async () => {
		const uniquePrefix = `ratelimit-${randomUUID()}`;
		const limiter = new Ratelimit(
			redis,
			Ratelimit.fixedWindow({
				limit: 5,
				window: 10, // 10 seconds
				prefix: uniquePrefix,
			})
		);

		const testKey = `fixed-test-key-${randomUUID()}`;

		let successCount = 0;
		for (let i = 0; i < 5; i++) {
			const result = await limiter.limit(testKey);
			expect(result.success).toBe(true);
			successCount++;
		}
		expect(successCount).toBe(5);
	});

	it('blocks requests exceeding the limit', async () => {
		const uniquePrefix = `ratelimit-${randomUUID()}`;
		const limiter = new Ratelimit(
			redis,
			Ratelimit.fixedWindow({
				limit: 5,
				window: 10, // 10 seconds
				prefix: uniquePrefix,
			})
		);

		const testKey = `fixed-test-key-over-${randomUUID()}`;

		// Consume the limit
		for (let i = 0; i < 5; i++) {
			await limiter.limit(testKey);
		}

		// This request should be blocked
		const result = await limiter.limit(testKey);
		expect(result.success).toBe(false);
		expect(result.remaining).toBe(0);
	});
});

describe('Sliding Window Rate Limiter', () => {
	it('allows requests within the limit', async () => {
		const uniquePrefix = `ratelimit-${randomUUID()}`;
		const limiter = new Ratelimit(
			redis,
			Ratelimit.slidingWindow({
				limit: 5,
				window: 10, // 10 seconds
				prefix: uniquePrefix,
			})
		);

		const testKey = `sliding-test-key-${randomUUID()}`;

		let successCount = 0;
		for (let i = 0; i < 5; i++) {
			const result = await limiter.limit(testKey);
			expect(result.success).toBe(true);
			successCount++;
		}
		expect(successCount).toBe(5);
	});

	it('blocks requests exceeding the limit', async () => {
		const uniquePrefix = `ratelimit-${randomUUID()}`;
		const limiter = new Ratelimit(
			redis,
			Ratelimit.slidingWindow({
				limit: 5,
				window: 10, // 10 seconds
				prefix: uniquePrefix,
			})
		);

		const testKey = `sliding-test-key-over-${randomUUID()}`;

		// Consume the limit
		for (let i = 0; i < 5; i++) {
			await limiter.limit(testKey);
		}

		// This request should be blocked
		const result = await limiter.limit(testKey);
		expect(result.success).toBe(false);
		expect(result.remaining).toBe(0);
	});
});
