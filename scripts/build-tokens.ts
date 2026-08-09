/**
 * Writes the generated token block of src/app.css from design/tokens.json.
 *
 *   npm run tokens
 *
 * Refuses to write a palette that fails its own contrast rules — the point of
 * having the rules in the token file is that they are checked before the CSS
 * exists, not after someone ships it.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkContrast, readTokens, withGeneratedTokens } from '../src/lib/design/tokens.js';

const appCssPath = fileURLToPath(new URL('../src/app.css', import.meta.url));

const tokens = readTokens();
const failures = checkContrast(tokens).filter((r) => !r.ok);

if (failures.length > 0) {
	for (const f of failures) {
		console.error(`✗ ${f.mode}: ${f.fg} on ${f.bg} is ${f.ratio.toFixed(2)}:1, needs ${f.min}:1`);
	}
	process.exit(1);
}

const before = readFileSync(appCssPath, 'utf8');
const after = withGeneratedTokens(before, tokens);
writeFileSync(appCssPath, after);

console.log(
	after === before
		? 'src/app.css already matches design/tokens.json'
		: 'src/app.css written from design/tokens.json'
);
