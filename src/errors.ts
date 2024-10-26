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
 * Thrown when Redis operations fail. Includes the original Redis error if available
 * @example
 * ```ts
 * throw new RedisError('Failed to check rate limit', originalError)
 * ```
 */
export class RedisError extends Error {
	constructor(
		message: string,
		public originalError?: Error,
	) {
		super(message);
		this.name = 'RedisError';
		this.stack = new Error().stack;
		this.message = message;
		this.originalError = originalError;
	}
}
