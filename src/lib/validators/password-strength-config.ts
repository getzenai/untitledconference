/**
 * Constants for the zxcvbn password-strength check.
 *
 * Deliberately kept free of any zxcvbn import. The dictionaries are ~787 KB
 * gzipped once bundled, so anything that only needs the thresholds or labels
 * must import them from here — importing them from `./password-strength`
 * instead would pull the dictionaries into that module's bundle graph and
 * defeat the lazy loading.
 */

/** zxcvbn score: 0 = too guessable, 4 = very unguessable. */
export type PasswordScore = 0 | 1 | 2 | 3 | 4;

/**
 * Minimum score a new password must reach. 2 ("fair") is the same bar the
 * password forms enforce, so the meter and the schema validation cannot drift.
 */
export const PASSWORD_MIN_SCORE: PasswordScore = 2;

export const PASSWORD_STRENGTH_LABELS: Record<PasswordScore, string> = {
	0: 'Very weak',
	1: 'Weak',
	2: 'Fair',
	3: 'Strong',
	4: 'Very strong'
};

export const PASSWORD_TOO_WEAK_MESSAGE = 'Password is too weak — try a longer, less common phrase';

export interface PasswordStrength {
	score: PasswordScore;
	/** Short explanation of the biggest problem, if zxcvbn found one. */
	warning: string | null;
	/** Actionable hints for a stronger password. */
	suggestions: string[];
}
