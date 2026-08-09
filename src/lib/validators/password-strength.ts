import { zxcvbn, zxcvbnOptions } from '@zxcvbn-ts/core';
import * as zxcvbnCommonPackage from '@zxcvbn-ts/language-common';
import * as zxcvbnEnPackage from '@zxcvbn-ts/language-en';
import {
	PASSWORD_MIN_SCORE,
	type PasswordScore,
	type PasswordStrength
} from './password-strength-config';

/**
 * The zxcvbn dictionaries are ~787 KB gzipped once bundled, so this module must
 * only ever be reached through a dynamic `import()` — see ./password.ts and
 * password-strength.svelte. Importing it statically from anything a page entry
 * pulls in puts the dictionaries back on the pre-hydration critical path.
 *
 * Thresholds, labels and messages live in ./password-strength-config, which is
 * free of zxcvbn and safe to import anywhere.
 */

let optionsInitialized = false;

/**
 * The dictionaries are large, so configure zxcvbn once, on first use, rather
 * than as an import side effect.
 */
function ensureOptions(): void {
	if (optionsInitialized) return;
	zxcvbnOptions.setOptions({
		translations: zxcvbnEnPackage.translations,
		graphs: zxcvbnCommonPackage.adjacencyGraphs,
		dictionary: {
			...zxcvbnCommonPackage.dictionary,
			...zxcvbnEnPackage.dictionary
		}
	});
	optionsInitialized = true;
}

/**
 * Score a password with zxcvbn.
 *
 * `userInputs` (email, name, …) are treated as extra dictionary words so that
 * "alice@example.com" / "alice1234" score badly for user Alice.
 * An empty password scores 0 without running the estimator.
 */
export function evaluatePasswordStrength(
	password: string,
	userInputs: string[] = []
): PasswordStrength {
	if (!password) {
		return { score: 0, warning: null, suggestions: [] };
	}

	ensureOptions();

	const sanitizedInputs = userInputs.filter((input): input is string => Boolean(input));
	const result = zxcvbn(password, sanitizedInputs);

	return {
		score: result.score as PasswordScore,
		warning: result.feedback.warning || null,
		suggestions: result.feedback.suggestions ?? []
	};
}

/**
 * Whether a password clears the configured strength bar.
 */
export function isPasswordStrongEnough(
	password: string,
	minScore: PasswordScore = PASSWORD_MIN_SCORE,
	userInputs: string[] = []
): boolean {
	if (minScore === 0) return true;
	return evaluatePasswordStrength(password, userInputs).score >= minScore;
}
