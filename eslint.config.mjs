import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/**
 * ESLint 9 flat config.
 *
 * Formatting is Prettier's job (`pnpm format`), so every stylistic rule is
 * switched off via eslint-config-prettier and only correctness rules remain.
 * Nuxt auto-imports (ref, computed, defineEventHandler, …) are resolved by
 * TypeScript, not ESLint, so `no-undef` is off for TS and Vue files.
 */
export default tseslint.config(
	{
		ignores: ['.nuxt/**', '.output/**', '.nitro/**', 'node_modules/**', '.data/**', 'dist/**', 'public/**', '*.log'],
	},

	js.configs.recommended,
	...tseslint.configs.recommended,
	...pluginVue.configs['flat/recommended'],

	{
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: 'module',
			globals: { ...globals.browser, ...globals.node },
		},
		rules: {
			'no-console': 'error',
			'no-debugger': 'error',
			'no-nested-ternary': 'error',
			curly: ['error', 'multi-line'],
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/ban-ts-comment': 'off',
			'@typescript-eslint/no-non-null-assertion': 'off',
			'@typescript-eslint/no-unused-vars': [
				'warn',
				{ argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
			],
		},
	},

	{
		files: ['**/*.vue'],
		languageOptions: {
			parserOptions: { parser: tseslint.parser, extraFileExtensions: ['.vue'], sourceType: 'module' },
		},
		rules: {
			'no-undef': 'off',
			'vue/multi-word-component-names': 'off',
			'vue/require-default-prop': 'off',
			'vue/no-v-html': 'off',
		},
	},

	{
		files: ['**/*.ts'],
		rules: { 'no-undef': 'off' },
	},

	// CLI scripts and seeds print by design.
	{
		files: ['scripts/**', 'prisma/**'],
		rules: { 'no-console': 'off' },
	},

	prettier,
);
