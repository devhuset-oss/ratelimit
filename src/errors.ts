/**
 * Custom error for configuration validation failures
 */
export class ConfigurationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ConfigurationError';
	}
}

/**
 * Custom error for Redis operation failures
 */
export class RedisError extends Error {
	constructor(
		message: string,
		public originalError?: Error
	) {
		super(message);
		this.name = 'RedisError';
		this.stack = new Error().stack;
		this.message = message;
		this.originalError = originalError;
	}
}
