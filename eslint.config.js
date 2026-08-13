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
			'src/lib/components/ui/**/*' // Ignore shadcn UI components
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
			// These four are warnings, and `npm run lint` caps the total (see the
			// `--max-warnings` in package.json). The cap is a budget for the whole
			// repository, which means it is spent by history rather than by the change
			// in front of you: when it is full, the next warning anyone adds turns
			// *their* CI red for something they did not write. It sat at exactly full
			// for a while, and that is the state to stay out of — #37 tracks bringing
			// the count down properly rather than raising the number again.
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
		// `.svelte.ts` modules use runes outside a component, so they need the same
		// parser pair as components — svelte-eslint-parser with TypeScript beneath.
		files: ['**/*.svelte', '**/*.svelte.ts'],

		languageOptions: {
			parserOptions: {
				parser: ts.parser
			}
		},
		rules: {
			'svelte/require-each-key': 'off',
			'svelte/no-navigation-without-resolve': 'off'
		}
	},
	{
		// Data, not logic. A length limit is a proxy for "is this function doing too
		// much", and on a generated domain list or a seed fixture it measures
		// nothing — the file is long because the data is long, and splitting it
		// would make it worse. Same reasoning the test exemption below already
		// applies; these files were simply never named.
		//
		// Only the size rules are lifted. `complexity` and `max-depth` still apply,
		// because branching in a seed script is real branching.
		//
		// The MCP tool definitions are the same shape: a tool is a name, a paragraph
		// of prose the model reads, a schema whose every field carries its own
		// sentence, and a handler that calls one existing function. What makes those
		// functions long is the writing, and the writing is the feature — an agent
		// that cannot find a tool does not have it (#320). Splitting a definition to
		// satisfy a line count would put the description in one place and the schema
		// it describes in another. The complexity rule still applies here too, and
		// still fires on the handlers that have earned it.
		files: [
			'src/lib/validators/disposable-email-domains.ts',
			'src/lib/test/**',
			'src/lib/server/mcp/tools/**',
			'scripts/db/seed-*.mjs'
		],
		rules: {
			'max-lines': 'off',
			'max-lines-per-function': 'off'
		}
	},
	{
		files: ['cypress/**/*.ts', 'cypress.config.ts', '**/*.test.ts', '**/*.spec.ts'],
		languageOptions: {
			globals: {
				...globals.mocha,
				cy: 'readonly',
				Cypress: 'readonly',
				expect: 'readonly',
				assert: 'readonly'
			}
		},
		rules: {
			'max-lines': 'off',
			'max-lines-per-function': 'off',
			complexity: 'off',
			'max-depth': 'off'
		}
	}
);
