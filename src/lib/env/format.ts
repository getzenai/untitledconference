/**
 * Pure formatter for environment validation errors. Kept free of any
 * `$env`/runtime imports so it can be unit-tested directly.
 */

/** A minimal shape compatible with Zod's issue objects. */
export interface EnvIssue {
	path: ReadonlyArray<PropertyKey>;
	message: string;
}

/**
 * Render validation issues into a single aggregated, human-readable message.
 * Each issue becomes a `  - KEY: message` line; an empty path renders as
 * `(root)`. `context` names what was validated (e.g. "server environment").
 */
export function formatEnvIssues(issues: ReadonlyArray<EnvIssue>, context: string): string {
	const lines = issues.map((issue) => {
		const key = issue.path.map(String).join('.') || '(root)';
		return `  - ${key}: ${issue.message}`;
	});
	return `Invalid ${context}. Fix the following ${lines.length} problem(s):\n${lines.join('\n')}`;
}
