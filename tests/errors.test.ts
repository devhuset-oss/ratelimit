import { ConfigurationError, RedisError } from '../src/errors';

describe('Custom Errors', () => {
	describe('ConfigurationError', () => {
		it('should create error with correct name and message', () => {
			const error = new ConfigurationError('Invalid config');
			expect(error.name).toBe('ConfigurationError');
			expect(error.message).toBe('Invalid config');
		});
	});

	describe('RedisError', () => {
		it('should create error with correct name and message', () => {
			const error = new RedisError('Redis connection failed');
			expect(error.name).toBe('RedisError');
			expect(error.message).toBe('Redis connection failed');
		});

		it('should handle original error', () => {
			const originalError = new Error('Original error');
			const error = new RedisError('Redis failed', originalError);
			expect(error.originalError).toBe(originalError);
		});
	});
});
