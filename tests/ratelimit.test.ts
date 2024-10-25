import { RedisClientType } from 'redis';
import { ConfigurationError, RedisError } from '../src/errors';
import { Ratelimit } from '../src/ratelimit';
import { clearRedis, closeRedis, createTestClient } from './setup';

describe('Ratelimit', () => {
	let redis: RedisClientType;

	beforeAll(async () => {
		redis = await createTestClient();
	});

	afterAll(async () => {
		await closeRedis();
	});

	beforeEach(async () => {
		await clearRedis();
	});

	describe('Configuration', () => {
		it('should throw ConfigurationError for invalid limit', () => {
			expect(() => {
				new Ratelimit(redis, { type: 'fixed', limit: 0, window: 60 });
			}).toThrow(ConfigurationError);

			expect(() => {
				new Ratelimit(redis, { type: 'fixed', limit: -1, window: 60 });
			}).toThrow(ConfigurationError);
		});

		it('should throw ConfigurationError for invalid window', () => {
			expect(() => {
				new Ratelimit(redis, { type: 'fixed', limit: 10, window: 0 });
			}).toThrow(ConfigurationError);

			expect(() => {
				new Ratelimit(redis, { type: 'fixed', limit: 10, window: -1 });
			}).toThrow(ConfigurationError);
		});

		it('should throw ConfigurationError for invalid type', () => {
			expect(() => {
				new Ratelimit(redis, {
					type: 'invalid' as any,
					limit: 10,
					window: 60,
				});
			}).toThrow(ConfigurationError);
		});

		it('should create instance with valid configuration', () => {
			expect(() => {
				new Ratelimit(redis, { type: 'fixed', limit: 10, window: 60 });
			}).not.toThrow();
		});

		it('should throw ConfigurationError for invalid type', () => {
			expect(() => {
				new Ratelimit(redis, {
					type: 'invalid' as any,
					limit: 10,
					window: 60,
				});
			}).toThrow('Type must be either "fixed" or "sliding"');
		});

		it('should use default prefix when none provided', () => {
			const limiter = new Ratelimit(
				redis,
				Ratelimit.fixedWindow({
					limit: 10,
					window: 60,
				})
			);

			// Access the private method using type assertion
			const key = (limiter as any).getKey('test', 'suffix');
			expect(key).toBe('ratelimit:test:suffix');
		});

		it('should use provided prefix', () => {
			const limiter = new Ratelimit(
				redis,
				Ratelimit.fixedWindow({
					limit: 10,
					window: 60,
					prefix: 'custom',
				})
			);

			const key = (limiter as any).getKey('test', 'suffix');
			expect(key).toBe('custom:test:suffix');
		});
	});

	describe('Error Handling', () => {
		it('should handle Redis errors correctly', async () => {
			const mockRedis = {
				incr: jest
					.fn()
					.mockRejectedValue(new Error('Redis connection lost')),
				expire: jest.fn(),
				get: jest.fn(),
				ttl: jest.fn(),
			} as unknown as RedisClientType;

			const limiter = new Ratelimit(
				mockRedis,
				Ratelimit.fixedWindow({
					limit: 10,
					window: 60,
				})
			);

			try {
				await limiter.limit('test-key');
				fail('Should have thrown an error');
			} catch (err: unknown) {
				const error = err as RedisError;
				expect(error).toBeInstanceOf(RedisError);
				expect(error.message).toBe('Failed to check rate limit');
				expect(error.originalError).toBeInstanceOf(Error);
				expect(error.originalError?.message).toBe(
					'Redis connection lost'
				);
			}
		});

		it('should handle non-Error objects in catch block', async () => {
			const mockRedis = {
				incr: jest.fn().mockRejectedValue('string error'), // Non-Error rejection
				expire: jest.fn(),
				get: jest.fn(),
				ttl: jest.fn(),
			} as unknown as RedisClientType;

			const limiter = new Ratelimit(
				mockRedis,
				Ratelimit.fixedWindow({
					limit: 10,
					window: 60,
				})
			);

			try {
				await limiter.limit('test-key');
				fail('Should have thrown an error');
			} catch (err: unknown) {
				const error = err as RedisError;
				expect(error).toBeInstanceOf(RedisError);
				expect(error.message).toBe('Failed to check rate limit');
				expect(error.originalError).toBeInstanceOf(Error);
				expect(error.originalError?.message).toBe('string error');
			}
		});
	});

	describe('Static Factories', () => {
		it('should create fixed window configuration', () => {
			const config = Ratelimit.fixedWindow({ limit: 10, window: 60 });
			expect(config).toEqual({
				type: 'fixed',
				limit: 10,
				window: 60,
			});
		});

		it('should create sliding window configuration', () => {
			const config = Ratelimit.slidingWindow({ limit: 10, window: 60 });
			expect(config).toEqual({
				type: 'sliding',
				limit: 10,
				window: 60,
			});
		});
	});

	describe('Key Generation', () => {
		it('should use default prefix when none provided', () => {
			const limiter = new Ratelimit(redis, {
				type: 'fixed',
				limit: 10,
				window: 60,
			});
			const key = (limiter as any).getKey('test', '123');
			expect(key).toBe('ratelimit:test:123');
		});

		it('should use custom prefix when provided', () => {
			const limiter = new Ratelimit(redis, {
				type: 'fixed',
				limit: 10,
				window: 60,
				prefix: 'custom',
			});
			const key = (limiter as any).getKey('test', '123');
			expect(key).toBe('custom:test:123');
		});
	});
});
