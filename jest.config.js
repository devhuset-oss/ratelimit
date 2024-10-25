module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	testMatch: ['**/tests/**/*.test.ts'],
	verbose: true,
	forceExit: true,
	detectOpenHandles: true,
	testTimeout: 10000,
	collectCoverage: true,
	collectCoverageFrom: ['src/**/*.ts', '!src/index.ts'],
	coverageThreshold: {
		global: {
			branches: 80,
			functions: 80,
			lines: 80,
			statements: 80,
		},
	},
};
