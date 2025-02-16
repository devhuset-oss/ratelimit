/**
 * Thrown when rate limiter configuration is invalid
 * @example
 * ```ts
 * throw new ConfigurationError('Limit must be greater than 0')
 * ```
 */
export class ConfigurationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ConfigurationError';
	}
}

/**
 * Thrown when Valkey operations fail. Includes the original Valkey error if available
 * @example
 * ```ts
 * throw new ValkeyError('Failed to check rate limit', originalError)
 * ```
 */
export class ValkeyError extends Error {
	constructor(
		message: string,
		public originalError?: Error,
	) {
		super(message);
		this.name = 'ValkeyError';
		this.stack = new Error().stack;
		this.message = message;
		this.originalError = originalError;
	}
}
