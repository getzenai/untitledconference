import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import { fileURLToPath } from 'node:url';
import ts from 'typescript-eslint';
const gitignorePath = fileURLToPath(new URL('./.gitignore', import.meta.url));

export default ts.config(
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs['flat/recommended'],
	prettier,
	...svelte.configs['flat/prettier'],
	{
		ignores: [
			'src/lib/components/ui/**/*', // Ignore shadcn UI components
			'./docs/.vitepress/' // Ignore VitePress configuration
		]
	},
	{
		rules: {
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_'
				}
			],
			'max-lines': ['warn', { max: 500, skipBlankLines: true, skipComments: true }],
			'max-lines-per-function': ['warn', { max: 50, skipBlankLines: true, skipComments: true }],
			complexity: ['warn', 10],
			'max-depth': ['warn', 3]
		}
	},
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node
			}
		}
	},
	{
		files: ['**/*.svelte'],

		languageOptions: {
			parserOptions: {
				parser: ts.parser
			}
		}
	},
	{
		files: ['e2e/**/*.ts', '**/*.test.ts', '**/*.spec.ts'],
		rules: {
			'max-lines-per-function': ['warn', { max: 200, skipBlankLines: true, skipComments: true }]
		}
	}
);
