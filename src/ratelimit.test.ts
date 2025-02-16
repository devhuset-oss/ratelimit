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
import { ConfigurationError } from './errors';
import { Ratelimit } from './ratelimit';
import type { RatelimitResponse } from './types';

describe('Rate Limiter Test Suite', () => {
	let valkey: Valkey;

	beforeAll(() => {
		valkey = new Valkey();
	});

	beforeEach(async () => {
		await valkey.flushdb();
	});

	afterAll(async () => {
		await valkey.quit();
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
		return new Ratelimit(valkey, config);
	};

	describe('Configuration Validation', () => {
		it('throws on invalid limit values', () => {
			const invalidLimits = [0, -1];

			invalidLimits.forEach((limit) => {
				expect(
					() =>
						new Ratelimit(
							valkey,
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
							valkey,
							Ratelimit.fixedWindow({ limit: 10, window }),
						),
				).toThrow(ConfigurationError);
			});
		});

		it('throws on invalid limiter type', () => {
			expect(
				() =>
					new Ratelimit(valkey, {
						type: 'invalid' as unknown as 'fixed' | 'sliding',
						limit: 10,
						window: 10,
					}),
			).toThrow(ConfigurationError);
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
