// errors.test.ts
import { describe, expect, it } from 'bun:test';
import { ConfigurationError, RedisError } from './errors';

describe('Custom Errors', () => {
	describe('ConfigurationError', () => {
		it('should create an error with the correct name and message', () => {
			const message = 'Invalid configuration';
			const error = new ConfigurationError(message);

			expect(error).toBeInstanceOf(Error);
			expect(error.name).toBe('ConfigurationError');
			expect(error.message).toBe(message);
		});
	});

	describe('RedisError', () => {
		it('should create an error with the correct name and message', () => {
			const message = 'Redis operation failed';
			const originalError = new Error('Connection lost');
			const error = new RedisError(message, originalError);

			expect(error).toBeInstanceOf(Error);
			expect(error.name).toBe('RedisError');
			expect(error.message).toBe(message);
			expect(error.originalError).toBe(originalError);
		});

		it('should handle cases where originalError is undefined', () => {
			const message = 'Redis operation failed';
			const error = new RedisError(message);

			expect(error).toBeInstanceOf(Error);
			expect(error.name).toBe('RedisError');
			expect(error.message).toBe(message);
			expect(error.originalError).toBeUndefined();
		});
	});
});
