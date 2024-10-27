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
import { randomUUID } from 'crypto';
import { Ratelimit } from './ratelimit';

describe('Fixed Window Rate Limiter', () => {
	let redis: RedisClientType;
	const BASE_TIME = 1000000;
	const DEFAULT_WINDOW = 10; // seconds
	const DEFAULT_LIMIT = 5;

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

	const createLimiter = (mockCurrentTime = BASE_TIME): Ratelimit => {
		const mockTimeProvider = (): number => mockCurrentTime;
		const uniquePrefix = `ratelimit-${randomUUID()}`;

		return new Ratelimit(
			redis,
			Ratelimit.fixedWindow({
				limit: DEFAULT_LIMIT,
				window: DEFAULT_WINDOW,
				prefix: uniquePrefix,
			}),
			mockTimeProvider,
		);
	};

	it('allows requests within the limit', async (): Promise<void> => {
		const limiter = createLimiter();
		const testKey = `fixed-test-key-${randomUUID()}`;

		for (let i = 0; i < DEFAULT_LIMIT; i++) {
			const result = await limiter.limit(testKey);

			expect(result).toEqual({
				success: true,
				remaining: DEFAULT_LIMIT - 1 - i,
				limit: DEFAULT_LIMIT,
				reset: BASE_TIME + DEFAULT_WINDOW * 1000,
				retry_after: 0,
			});
		}
	});

	it('blocks requests exceeding the limit with accurate retry_after', async () => {
		const limiter = createLimiter();
		const testKey = `fixed-test-key-over-${randomUUID()}`;

		// Consume the limit
		for (let i = 0; i < DEFAULT_LIMIT; i++) {
			const result = await limiter.limit(testKey);
			expect(result.success).toBe(true);
		}

		// This request should be blocked
		const blocked = await limiter.limit(testKey);
		expect(blocked).toEqual({
			success: false,
			remaining: 0,
			limit: DEFAULT_LIMIT,
			reset: BASE_TIME + DEFAULT_WINDOW * 1000,
			retry_after: DEFAULT_WINDOW * 1000,
		});
	});

	it('resets counts after window expires', async () => {
		let mockCurrentTime = BASE_TIME;
		const mockTimeProvider = (): number => mockCurrentTime;
		const uniquePrefix = `ratelimit-${randomUUID()}`;
		const limiter = new Ratelimit(
			redis,
			Ratelimit.fixedWindow({
				limit: DEFAULT_LIMIT,
				window: DEFAULT_WINDOW,
				prefix: uniquePrefix,
			}),
			mockTimeProvider,
		);
		const testKey = `fixed-test-key-reset-${randomUUID()}`;

		// Fill up the limit
		for (let i = 0; i < DEFAULT_LIMIT; i++) {
			await limiter.limit(testKey);
		}

		// Advance time past window
		mockCurrentTime += 11000; // window + 1 second

		// Should be allowed again
		const result = await limiter.limit(testKey);
		expect(result).toEqual({
			success: true,
			remaining: 4,
			limit: DEFAULT_LIMIT,
			reset: 1020000,
			retry_after: 0,
		});
	});

	it('handles concurrent requests correctly', async () => {
		const limiter = createLimiter();
		const testKey = `fixed-test-key-concurrent-${randomUUID()}`;

		// Make 6 concurrent requests
		const results = await Promise.all(
			Array(6)
				.fill(0)
				.map(() => limiter.limit(testKey)),
		);

		// First 5 should succeed
		expect(results.filter((r) => r.success).length).toBe(5);
		// Last one should fail
		expect(results[5].success).toBe(false);
	});
});
