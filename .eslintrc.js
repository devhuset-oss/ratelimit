module.exports = {
	env: {
		node: true,
		es2021: true,
	},
	extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
	parser: '@typescript-eslint/parser',
	parserOptions: {
		ecmaVersion: 12,
		sourceType: 'module',
		project: ['./tsconfig.json'], // Link to your tsconfig file
	},
	plugins: ['@typescript-eslint'],
	rules: {
		semi: ['error', 'always'],
		'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
		'@typescript-eslint/explicit-module-boundary-types': 'off',
	},
	ignorePatterns: ['node_modules/', 'dist/'],
};
