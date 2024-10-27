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
		const defaultMessage = 'Redis operation failed';

		it('should create an error with the correct name and message', () => {
			const originalError = new Error('Connection lost');
			const error = new RedisError(defaultMessage, originalError);

			expect(error).toBeInstanceOf(Error);
			expect(error.name).toBe('RedisError');
			expect(error.message).toBe(defaultMessage);
			expect(error.originalError).toBe(originalError);
		});

		it('should handle cases where originalError is undefined', () => {
			const error = new RedisError(defaultMessage);

			expect(error).toBeInstanceOf(Error);
			expect(error.name).toBe('RedisError');
			expect(error.message).toBe(defaultMessage);
			expect(error.originalError).toBeUndefined();
		});
	});
});
