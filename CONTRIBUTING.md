# Contributing to @devhuset-oss/ratelimit

We love your input! We want to make contributing to @devhuset-oss/ratelimit as easy and transparent as possible, whether it's:

-   Reporting a bug
-   Discussing the current state of the code
-   Submitting a fix
-   Proposing new features
-   Becoming a maintainer

## We Develop with GitHub

We use GitHub to host code, to track issues and feature requests, as well as accept pull requests.

## Pull Requests

1. Fork the repo and create your branch from `main`.
2. If you've added code that should be tested, add tests.
3. If you've changed APIs, update the documentation.
4. Ensure the test suite passes.
5. Make sure your code lints.

## Any contributions you make will be under the MIT Software License

In short, when you submit code changes, your submissions are understood to be under the same [MIT License](http://choosealicense.com/licenses/mit/) that covers the project. Feel free to contact the maintainers if that's a concern.

## Report bugs using GitHub's [issue tracker](https://github.com/devhuset-oss/ratelimit/issues)

We use GitHub issues to track public bugs. Report a bug by [opening a new issue](https://github.com/devhuset-oss/ratelimit/issues/new); it's that easy!

## Development Process

1. Clone the repository
2. Install dependencies: `bun install`
3. Run tests: `bun test`
4. Build: `bun run build`

## Testing

We use Bun for testing. Run the test suite with:

```bash
bun test
```

Make sure to have Redis running locally before running tests. You can start Redis using Docker:

```bash
docker run --rm -p 6379:6379 redis
```

## Project Structure

```
src/
├── errors.ts      # Error definitions
├── types.ts       # TypeScript interfaces
├── ratelimit.ts   # Main rate limiter implementation
└── tests/
    ├── fixed.test.ts     # Fixed window tests
    ├── sliding.test.ts   # Sliding window tests
    └── errors.test.ts    # Error handling tests
```

## Code Style

-   We use TypeScript and maintain strict type checking
-   Format code using Prettier
-   Follow existing code style and structure
