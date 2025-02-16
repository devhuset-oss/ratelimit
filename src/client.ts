import Redis, { type RedisOptions } from 'iovalkey';

export class Valkey extends Redis {
	public slidingWindowRateLimit!: (
		keys: string[],
		limit: string,
		now: string,
		window: string,
		increment: string,
	) => Promise<[number, number]>;

	constructor(port: number, host: string, options: RedisOptions);
	constructor(path: string, options: RedisOptions);
	constructor(port: number, options: RedisOptions);
	constructor(port: number, host: string);
	constructor(options: RedisOptions);
	constructor(port: number);
	constructor(path: string);
	constructor();
	constructor(
		arg1?: string | number | RedisOptions,
		arg2?: string | RedisOptions,
		arg3?: RedisOptions,
	) {
		if (typeof arg1 === 'number' && typeof arg2 === 'string' && arg3) {
			super(arg1, arg2, arg3);
		} else if (typeof arg1 === 'string' && typeof arg2 === 'object') {
			super(arg1, arg2);
		} else if (typeof arg1 === 'number' && typeof arg2 === 'object') {
			super(arg1, arg2);
		} else if (typeof arg1 === 'number' && typeof arg2 === 'string') {
			super(arg1, arg2);
		} else if (typeof arg1 === 'object') {
			super(arg1);
		} else if (typeof arg1 === 'number') {
			super(arg1);
		} else if (typeof arg1 === 'string') {
			super(arg1);
		} else {
			super();
		}

		this.defineCommand('slidingWindowRateLimit', {
			numberOfKeys: 2,
			lua: SLIDING_WINDOW_SCRIPT,
		});
	}
}

/**
 * Sliding window rate limiting using weighted scoring from current and previous windows.
 * Calculates retry_after based on how many requests need to expire from the previous window.
 */
export const SLIDING_WINDOW_SCRIPT = `
local current_key = KEYS[1]
local previous_key = KEYS[2]
local tokens = tonumber(ARGV[1])
local now = tonumber(ARGV[2])
local window = tonumber(ARGV[3])
local increment_by = tonumber(ARGV[4])

local current_count = tonumber(redis.call("GET", current_key) or "0")
local previous_count = tonumber(redis.call("GET", previous_key) or "0")

local time_in_current = now % window
local time_remaining_previous = window - time_in_current
local weighted_previous = (previous_count * time_remaining_previous) / window
local cumulative_count = math.floor(weighted_previous) + current_count + increment_by

if cumulative_count > tokens then
    local needed = cumulative_count - tokens + increment_by
    local retry_after = window - time_in_current
    
    if previous_count > 0 then
        local time_needed = (needed * window) / previous_count
        retry_after = math.ceil(time_needed)
        
        if retry_after > time_remaining_previous then
            retry_after = time_remaining_previous
        end
    end
    
    return { -1, retry_after }
end

current_count = current_count + increment_by
redis.call("SET", current_key, current_count)
redis.call("PEXPIRE", current_key, window * 2 + 1000)

return { tokens - (math.floor(weighted_previous) + current_count), 0 }
`;
