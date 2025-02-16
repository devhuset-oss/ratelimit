import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from 'bun:test';
import { Valkey } from './client';

describe('Valkey Client Test Suite', () => {
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

	describe('Constructor Patterns', () => {
		it('initializes with no arguments', () => {
			expect(() => new Valkey()).not.toThrow();
		});

		it('initializes with port only', () => {
			expect(() => new Valkey(6379)).not.toThrow();
		});

		it('initializes with port and host', () => {
			expect(() => new Valkey(6379, 'localhost')).not.toThrow();
		});

		it('initializes with options object', () => {
			expect(
				() => new Valkey({ host: 'localhost', port: 6379 }),
			).not.toThrow();
		});

		it('initializes with connection string', () => {
			expect(() => new Valkey('redis://localhost:6379')).not.toThrow();
		});
	});

	describe('Sliding Window Command', () => {
		it('has slidingWindowRateLimit command defined', () => {
			expect(typeof valkey.slidingWindowRateLimit).toBe('function');
		});

		it('executes slidingWindowRateLimit command successfully', async () => {
			const now = Date.now();
			const [remaining, retryAfter] = await valkey.slidingWindowRateLimit(
				['test:current', 'test:previous'],
				'10', // limit
				now.toString(),
				'1000', // window
				'1', // increment
			);

			expect(remaining).toBe(9);
			expect(retryAfter).toBe(0);
		});

		it('handles rate limiting correctly', async () => {
			const now = Date.now();

			// Use up all tokens
			for (let i = 0; i < 10; i++) {
				await valkey.slidingWindowRateLimit(
					['test:current', 'test:previous'],
					'10',
					now.toString(),
					'1000',
					'1',
				);
			}

			// This should be rate limited
			const [remaining, retryAfter] = await valkey.slidingWindowRateLimit(
				['test:current', 'test:previous'],
				'10',
				now.toString(),
				'1000',
				'1',
			);

			expect(remaining).toBe(-1);
			expect(retryAfter).toBeGreaterThan(0);
		});
	});

	describe('Redis Commands', () => {
		it('inherits basic Redis functionality', async () => {
			await valkey.set('test', 'value');
			const result = await valkey.get('test');
			expect(result).toBe('value');
		});
	});
});
