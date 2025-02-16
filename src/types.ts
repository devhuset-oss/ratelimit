/**
 * Response from a rate limit check
 */
export interface RatelimitResponse {
	/** Whether the request should be allowed */
	success: boolean;
	/** Maximum number of requests allowed in the window */
	limit: number;
	/** Number of remaining requests in current window */
	remaining: number;
	/** Time in milliseconds until the next request will be allowed. 0 if under limit */
	retry_after: number;
	/** Time in milliseconds when the current window expires completely */
	reset: number;
}

/**
 * Base configuration options for both fixed and sliding window rate limiters
 */
export interface RatelimitOptionsWithoutType {
	/** Maximum number of requests allowed within the window */
	limit: number;

	/** Time window in seconds */
	window: number;

	/** Optional prefix for Valkey keys to prevent collisions */
	prefix?: string;
}

/**
 * Complete rate limiter configuration including window type
 */
export interface RatelimitOptions extends RatelimitOptionsWithoutType {
	/** Type of rate limiting window to use */
	type: 'fixed' | 'sliding';
}
