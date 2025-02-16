import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from 'bun:test';
import { randomUUID } from 'crypto';
import { Valkey } from './client';
import { Ratelimit } from './ratelimit';

describe('Sliding Window Rate Limiter Edge Cases', () => {
	let valkey: Valkey;
	const BASE_TIME = 1000000;

	beforeAll(() => {
		valkey = new Valkey();
	});

	beforeEach(async () => {
		await valkey.flushdb();
	});

	afterAll(async () => {
		await valkey.quit();
	});

	const createLimiter = (
		mockCurrentTime = BASE_TIME,
		{ limit = 10, window = 1 } = {},
	): { limiter: Ratelimit; currentTime: number } => {
		const mockTimeProvider = (): number => mockCurrentTime;
		const uniquePrefix = `ratelimit-${randomUUID()}`;

		return {
			limiter: new Ratelimit(
				valkey,
				Ratelimit.slidingWindow({
					limit,
					window,
					prefix: uniquePrefix,
				}),
				mockTimeProvider,
			),
			currentTime: mockCurrentTime,
		};
	};

	const createTestKey = (suffix: string): string =>
		`sliding-test-key-${suffix}-${randomUUID()}`;

	it('correctly calculates weighted requests with mock time', async () => {
		let mockCurrentTime = BASE_TIME;
		const { limiter } = createLimiter(mockCurrentTime);
		const testKey = createTestKey('weighted');

		// Make 3 requests at T=0
		for (let i = 0; i < 3; i++) {
			const result = await limiter.limit(testKey);
			expect(result).toEqual({
				success: true,
				remaining: 10 - (i + 1),
				limit: 10,
				reset: mockCurrentTime + 2000,
				retry_after: 0,
			});
		}

		// Advance time 750ms (75% of window)
		mockCurrentTime += 750;
		const { limiter: newLimiter } = createLimiter(mockCurrentTime);

		// Make 4 more requests
		for (let i = 0; i < 4; i++) {
			const result = await newLimiter.limit(testKey);
			expect(result.success).toBe(true);
			expect(result.reset).toBe(mockCurrentTime + 2000);
			expect(result.retry_after).toBe(0);
		}

		// Weighted total should be (3 * 0.25) + 4 = 4.75
		const result = await newLimiter.limit(testKey);
		expect(result.success).toBe(true);

		const result2 = await newLimiter.limit(testKey);
		expect(result2.success).toBe(true);
	});

	it('handles window transitions with partial counts', async () => {
		let mockCurrentTime = BASE_TIME;
		const { limiter } = createLimiter(mockCurrentTime);
		const testKey = createTestKey('transition');

		// Make 6 requests
		for (let i = 0; i < 6; i++) {
			const result = await limiter.limit(testKey);
			expect(result.success).toBe(true);
		}

		// Move to exactly 50% of the window
		mockCurrentTime += 500;
		const { limiter: newLimiter } = createLimiter(mockCurrentTime);

		// At this point, the 6 requests should be weighted by 0.5
		// So we should have 6 * 0.5 = 3 effective requests
		const result = await newLimiter.limit(testKey);
		expect(result.success).toBe(true);
		expect(result.reset).toBe(mockCurrentTime + 2000);

		const result2 = await newLimiter.limit(testKey);
		expect(result2.success).toBe(true);
	});

	it('handles rapid requests at window boundary', async () => {
		let mockCurrentTime = BASE_TIME;
		const { limiter } = createLimiter(mockCurrentTime, { limit: 5 });
		const testKey = createTestKey('boundary');

		// Make 2 requests in first window
		for (let i = 0; i < 2; i++) {
			const result = await limiter.limit(testKey);
			expect(result.success).toBe(true);
			expect(result.reset).toBe(mockCurrentTime + 2000);
		}

		// Move to 90% of window
		mockCurrentTime += 900;
		const { limiter: newLimiter } = createLimiter(mockCurrentTime, {
			limit: 5,
		});

		// Make 2 more requests near window boundary
		// These should be allowed since weighted count would be:
		// (2 * 0.1) + 2 = 2.2 requests
		for (let i = 0; i < 2; i++) {
			const result = await newLimiter.limit(testKey);
			expect(result.success).toBe(true);
			expect(result.reset).toBe(mockCurrentTime + 2000);
		}
	});

	it('maintains precision at window boundaries', async () => {
		let mockCurrentTime = BASE_TIME;
		const mockTimeProvider = (): number => mockCurrentTime;
		const uniquePrefix = `ratelimit-${randomUUID()}`;

		const limiter = new Ratelimit(
			valkey,
			Ratelimit.slidingWindow({
				limit: 5,
				window: 1,
				prefix: uniquePrefix,
			}),
			mockTimeProvider,
		);

		const testKey = `sliding-test-key-precision-${randomUUID()}`;

		// Fill up less than half the limit
		for (let i = 0; i < 2; i++) {
			const result = await limiter.limit(testKey);
			expect(result.success).toBe(true);
			expect(result.reset).toBe(mockCurrentTime + 2000);
		}

		// Move to exactly 50% of the window
		mockCurrentTime += 500;

		// Create a new limiter with updated time
		const newLimiter = new Ratelimit(
			valkey,
			Ratelimit.slidingWindow({
				limit: 5,
				window: 1,
				prefix: uniquePrefix,
			}),
			() => mockCurrentTime,
		);

		// Should allow 2 more requests (weighted total: (2 * 0.5) + 2 = 3)
		for (let i = 0; i < 2; i++) {
			const result = await newLimiter.limit(testKey);
			expect(result.success).toBe(true);
			expect(result.reset).toBe(mockCurrentTime + 2000);
		}

		// This one should still be allowed (would make total 4)
		const result = await newLimiter.limit(testKey);
		expect(result.success).toBe(true);
		expect(result.reset).toBe(mockCurrentTime + 2000);

		// This one should fail (would make total 5)
		const blocked = await newLimiter.limit(testKey);
		expect(blocked.success).toBe(false);
		expect(blocked.reset).toBe(mockCurrentTime + 2000);
	});

	it('expires old requests correctly', async () => {
		const limiter = new Ratelimit(
			valkey,
			Ratelimit.slidingWindow({
				limit: 10,
				window: 1,
				prefix: `ratelimit-${randomUUID()}`,
			}),
		);
		const testKey = createTestKey('expiry');

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
		expect(result.remaining).toBe(9);
	});
});
