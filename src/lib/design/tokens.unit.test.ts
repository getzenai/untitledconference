import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contrastRatio, oklchToSrgb, toHex } from './color.js';
import { checkContrast, readTokens, withGeneratedTokens } from './tokens.js';

const appCss = () => readFileSync(fileURLToPath(new URL('../../app.css', import.meta.url)), 'utf8');

describe('colour maths', () => {
	it('converts known oklch values to sRGB', () => {
		// Pure white and pure black are the two values with no room for argument.
		expect(toHex(oklchToSrgb({ l: 1, c: 0, h: 0 }))).toBe('#FFFFFF');
		expect(toHex(oklchToSrgb({ l: 0, c: 0, h: 0 }))).toBe('#000000');
	});

	it('gives black on white the WCAG maximum', () => {
		expect(contrastRatio([0, 0, 0], [1, 1, 1])).toBeCloseTo(21, 5);
	});

	it('is symmetric', () => {
		const a = oklchToSrgb({ l: 0.55, c: 0.15, h: 55 });
		const b = oklchToSrgb({ l: 0.96, c: 0.03, h: 60 });
		expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 10);
	});
});

describe('design tokens', () => {
	it('meets every contrast pair it declares, in both modes', () => {
		const failures = checkContrast(readTokens())
			.filter((r) => !r.ok)
			.map((r) => `${r.mode}: ${r.fg} on ${r.bg} is ${r.ratio.toFixed(2)}:1, needs ${r.min}:1`);
		expect(failures).toEqual([]);
	});

	it('keeps app.css identical to what the token file generates', () => {
		// If this fails, someone edited the generated block by hand. Put the change
		// in design/tokens.json and run `npm run tokens`.
		const current = appCss();
		expect(withGeneratedTokens(current, readTokens())).toBe(current);
	});

	it('defines the same token names in light and dark', () => {
		const tokens = readTokens();
		const names = (mode: Record<string, unknown>) =>
			Object.keys(mode)
				.filter((n) => !n.startsWith('$'))
				.sort();
		expect(names(tokens.dark)).toEqual(names(tokens.light));
	});
});
