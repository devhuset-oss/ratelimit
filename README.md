# @devhuset-oss/ratelimit

[![npm version](https://badge.fury.io/js/@devhuset-oss%2Fratelimit.svg)](https://badge.fury.io/js/@devhuset-oss%2Fratelimit)
[![Test](https://github.com/devhuset-oss/ratelimit/actions/workflows/test.yml/badge.svg)](https://github.com/devhuset-oss/ratelimit/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A flexible Valkey-based rate limiting library supporting both fixed and sliding window algorithms. Perfect for API rate limiting, request throttling, and protecting your services from abuse.

## Features

- 🚦 Fixed window rate limiting
- 📊 Sliding window rate limiting
- 🔄 Valkey-backed for distributed systems
- 🎯 TypeScript support
- ⚡️ High performance
- 🛡️ Protection against race conditions
- 💪 Zero dependencies (except Valkey)

## Installation

```bash
npm install @devhuset-oss/ratelimit
# or
yarn add @devhuset-oss/ratelimit
# or
pnpm add @devhuset-oss/ratelimit
# or
bun add @devhuset-oss/ratelimit
```

## Quick Start

```typescript
import { Ratelimit, Valkey } from '@devhuset-oss/ratelimit';

// Create Valkey client
const valkey = new Valkey('redis://localhost:6379');

// Create rate limiter (10 requests per 60 seconds)
const limiter = new Ratelimit(
	valkey,
	Ratelimit.slidingWindow({
		limit: 10, // requests
		window: 60, // seconds
		prefix: 'my-api', // optional
	}),
);

// Check rate limit
const result = await limiter.limit('user-123');
if (result.success) {
	// Process request
	console.log(`${result.remaining} requests remaining`);
} else {
	// Rate limit exceeded
	console.log(`Try again in ${result.retry_after}ms`);
}
```

## Rate Limiting Algorithms

### Fixed Window

Fixed window rate limiting divides time into fixed intervals (e.g., 60-second windows) and tracks requests within each window.

```typescript
const limiter = new Ratelimit(
	valkey,
	Ratelimit.fixedWindow({
		limit: 100,
		window: 60,
		prefix: 'api', // optional
	}),
);
```

### Sliding Window

Sliding window rate limiting provides smoother rate limiting by considering both the current and previous windows with weighted rates.

```typescript
const limiter = new Ratelimit(
	valkey,
	Ratelimit.slidingWindow({
		limit: 100,
		window: 60,
		prefix: 'api', // optional
	}),
);
```

## API Reference

### Configuration

```typescript
interface RatelimitOptionsWithoutType {
    /** Maximum requests per window */
    limit: number;
    /** Window duration in seconds */
    window: number;
    /** Optional Valkey key prefix */
    prefix?: string;
}

// Create with static methods
Ratelimit.fixedWindow(options: RatelimitOptionsWithoutType)
Ratelimit.slidingWindow(options: RatelimitOptionsWithoutType)
```

### Response

```typescript
interface RatelimitResponse {
	/** Whether the request is allowed */
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
```

## Framework Integration Examples

### Next.js Route Handler

```typescript
import { NextResponse } from 'next/server';
import { Ratelimit, Valkey } from '@devhuset-oss/ratelimit';
import { headers } from 'next/headers';

const valkey = new Valkey(process.env.VALKEY_URL);

const ratelimit = new Ratelimit(
	valkey,
	Ratelimit.slidingWindow({
		limit: 10,
		window: 60,
		prefix: 'api',
	}),
);

export async function GET() {
	const headersList = await headers();
	const ip = headersList.get('x-forwarded-for') || '127.0.0.1';

	const { success, remaining, reset, retry_after } =
		await ratelimit.limit(ip);

	if (!success) {
		return new Response(JSON.stringify({ error: 'Too many requests' }), {
			status: 429,
			headers: {
				'X-RateLimit-Limit': '10',
				'X-RateLimit-Remaining': remaining.toString(),
				'X-RateLimit-Reset': reset.toString(),
				'Retry-After': Math.ceil(retry_after / 1000).toString(),
			},
		});
	}

	// Process request
}
```

### Express Middleware

```typescript
import { Ratelimit, Valkey } from '@devhuset-oss/ratelimit';
import express from 'express';

const app = express();

const valkey = new Valkey(process.env.VALKEY_URL);

const ratelimit = new Ratelimit(
	valkey,
	Ratelimit.slidingWindow({
		limit: 10,
		window: 60,
		prefix: 'api',
	}),
);

app.use(async (req, res, next) => {
	const ip = req.ip;
	const { success, remaining, reset, retry_after } =
		await ratelimit.limit(ip);

	res.setHeader('X-RateLimit-Limit', '10');
	res.setHeader('X-RateLimit-Remaining', remaining.toString());
	res.setHeader('X-RateLimit-Reset', reset.toString());

	if (!success) {
		res.setHeader('Retry-After', Math.ceil(retry_after / 1000).toString());
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
