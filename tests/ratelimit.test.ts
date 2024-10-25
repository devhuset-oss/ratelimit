import { RedisClientType } from 'redis';
import { ConfigurationError } from '../src/errors';
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
