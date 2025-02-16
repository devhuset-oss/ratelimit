import { describe, expect, it } from 'bun:test';
import { ConfigurationError, ValkeyError } from './errors';

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

	describe('ValkeyError', () => {
		const defaultMessage = 'Valkey operation failed';

		it('should create an error with the correct name and message', () => {
			const originalError = new Error('Connection lost');
			const error = new ValkeyError(defaultMessage, originalError);

			expect(error).toBeInstanceOf(Error);
			expect(error.name).toBe('ValkeyError');
			expect(error.message).toBe(defaultMessage);
			expect(error.originalError).toBe(originalError);
		});

		it('should handle cases where originalError is undefined', () => {
			const error = new ValkeyError(defaultMessage);

			expect(error).toBeInstanceOf(Error);
			expect(error.name).toBe('ValkeyError');
			expect(error.message).toBe(defaultMessage);
			expect(error.originalError).toBeUndefined();
		});
	});
});
