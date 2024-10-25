# @devhuset-oss/ratelimit

[![npm version](https://badge.fury.io/js/@devhuset-oss%2Fratelimit.svg)](https://badge.fury.io/js/@devhuset-oss%2Fratelimit)
[![Test](https://github.com/devhuset-oss/ratelimit/actions/workflows/test.yml/badge.svg)](https://github.com/devhuset-oss/ratelimit/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A flexible Redis-based rate limiting library supporting both fixed and sliding window algorithms. Perfect for API rate limiting, request throttling, and protecting your services from abuse.

## Features

-   🚦 Fixed window rate limiting
-   📊 Sliding window rate limiting
-   🔄 Redis-backed for distributed systems
-   🎯 TypeScript support
-   ⚡️ High performance
-   🛡️ Protection against race conditions
-   💪 Zero dependencies (except Redis)

## Installation

```bash
npm install @devhuset-oss/ratelimit redis
# or
yarn add @devhuset-oss/ratelimit redis
# or
pnpm add @devhuset-oss/ratelimit redis
```

## Quick Start

```typescript
import { createClient } from 'redis';
import { Ratelimit } from '@devhuset-oss/ratelimit';

// Create Redis client
const redis = createClient({
	url: 'redis://localhost:6379',
});
await redis.connect();

// Create rate limiter (10 requests per 60 seconds)
const limiter = new Ratelimit(
	redis,
	Ratelimit.slidingWindow({
		limit: 10, // requests
		window: 60, // seconds
		prefix: 'my-api', // optional
	})
);

// Check rate limit
const result = await limiter.limit('user-123');
if (result.success) {
	// Process request
	console.log(`${result.remaining} requests remaining`);
} else {
	// Rate limit exceeded
	console.log(`Try again in ${result.retryAfter} seconds`);
}
```

## Rate Limiting Algorithms

### Fixed Window

Fixed window rate limiting divides time into fixed intervals (e.g., 60-second windows) and tracks requests within each window.

```typescript
const limiter = new Ratelimit(
	redis,
	Ratelimit.fixedWindow({
		limit: 100,
		window: 60,
		prefix: 'api', // optional
	})
);
```

### Sliding Window

Sliding window rate limiting provides smoother rate limiting by considering both the current and previous windows with weighted rates.

```typescript
const limiter = new Ratelimit(
	redis,
	Ratelimit.slidingWindow({
		limit: 100,
		window: 60,
		prefix: 'api', // optional
	})
);
```

## API Reference

### Configuration

```typescript
interface LimiterOptions {
  limit: number;     // Maximum requests per window
  window: number;    // Window duration in seconds
  prefix?: string;   // Optional Redis key prefix
}

// Create with static methods
Ratelimit.fixedWindow(options: LimiterOptions)
Ratelimit.slidingWindow(options: LimiterOptions)
```

### Response

```typescript
interface RatelimitResponse {
	success: boolean; // Whether the request is allowed
	reset: number; // Unix timestamp when the window resets
	remaining: number; // Remaining requests in current window
	retryAfter?: number; // Seconds until next request is allowed (when rate limited)
}
```

## Framework Integration Examples

### Next.js Route Handler

```typescript
import { NextResponse } from 'next/server';
import { createClient } from 'redis';
import { Ratelimit } from '@devhuset-oss/ratelimit';
import { headers } from 'next/headers';

const redis = createClient({
	url: process.env.REDIS_URL,
});
await redis.connect();

const ratelimit = new Ratelimit(
	redis,
	Ratelimit.slidingWindow({
		limit: 10,
		window: 60,
		prefix: 'api',
	})
);

export async function GET() {
	const headersList = headers();
	const ip = headersList.get('x-forwarded-for') || '127.0.0.1';

	const { success, remaining, reset, retryAfter } = await ratelimit.limit(ip);

	if (!success) {
		return NextResponse.json(
			{ error: 'Too many requests' },
			{
				status: 429,
				headers: {
					'X-RateLimit-Limit': '10',
					'X-RateLimit-Remaining': remaining.toString(),
					'X-RateLimit-Reset': reset.toString(),
					'Retry-After': retryAfter?.toString() || '60',
				},
			}
		);
	}

	// Process request
}
```

### Express Middleware

```typescript
import { createClient } from 'redis';
import { Ratelimit } from '@devhuset-oss/ratelimit';
import express from 'express';

const app = express();

const redis = createClient({
	url: process.env.REDIS_URL,
});
await redis.connect();

const ratelimit = new Ratelimit(
	redis,
	Ratelimit.slidingWindow({
		limit: 10,
		window: 60,
		prefix: 'api',
	})
);

app.use(async (req, res, next) => {
	const ip = req.ip;
	const { success, remaining, reset, retryAfter } = await ratelimit.limit(ip);

	res.setHeader('X-RateLimit-Limit', '10');
	res.setHeader('X-RateLimit-Remaining', remaining.toString());
	res.setHeader('X-RateLimit-Reset', reset.toString());

	if (!success) {
		res.setHeader('Retry-After', retryAfter?.toString() || '60');
		return res.status(429).json({ error: 'Too many requests' });
	}

	next();
});
```

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

Please make sure to update tests as appropriate.

## License

[MIT](https://choosealicense.com/licenses/mit/)
