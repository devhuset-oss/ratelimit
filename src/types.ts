/**
 * Rate limiter configuration options
 */
export interface LimiterOptions {
	/** The type of rate limiting algorithm to use */
	type: 'fixed' | 'sliding';
	/** Maximum number of requests allowed within the window */
	limit: number;
	/** Time window in seconds */
	window: number;
	/** Optional prefix for Redis keys */
	prefix?: string;
}

/**
 * Response from a rate limit check
 */
export interface RatelimitResponse {
	/** Whether the request should be allowed */
	success: boolean;
	/** Unix timestamp when the current window expires */
	reset: number;
	/** Number of requests remaining in the current window */
	remaining: number;
	/** Seconds until the client should retry if rate limited */
	retryAfter?: number;
}

/**
 * Configuration object without the type field
 */
export type LimiterOptionsWithoutType = Omit<LimiterOptions, 'type'>;
