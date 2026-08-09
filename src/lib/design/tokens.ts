/**
 * Reads `design/tokens.json` (DTCG) and turns it into the CSS that `src/app.css`
 * carries between its generated markers.
 *
 * The token file is the source of truth. `npm run tokens` writes app.css; the
 * unit test regenerates and compares, so a hand edit in app.css fails CI rather
 * than quietly becoming a second, contradictory palette.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { contrastRatio, oklchToSrgb, type Oklch } from './color.js';

export const START_MARKER = '/* tokens:start — generated from design/tokens.json, do not edit */';
export const END_MARKER = '/* tokens:end */';

type DtcgColor = {
	$value: { colorSpace: string; components: [number, number, number]; alpha?: number };
	$description?: string;
};
type Mode = Record<string, DtcgColor>;

export type TokenFile = {
	light: Mode;
	dark: Mode;
	$extensions: {
		'com.untitledconference.radius': string;
		'com.untitledconference.contrast': {
			pairs: { fg: string; bg: string; min: number }[];
		};
	};
};

export function tokensPath(): string {
	return fileURLToPath(new URL('../../../design/tokens.json', import.meta.url));
}

export function readTokens(path = tokensPath()): TokenFile {
	return JSON.parse(readFileSync(path, 'utf8')) as TokenFile;
}

/** Token entries of one mode, minus the DTCG bookkeeping keys. */
function entries(mode: Mode): [string, DtcgColor][] {
	return Object.entries(mode).filter(([name]) => !name.startsWith('$'));
}

function asOklch(token: DtcgColor): Oklch {
	const { colorSpace, components, alpha } = token.$value;
	if (colorSpace !== 'oklch') {
		throw new Error(`Only oklch tokens are supported, got "${colorSpace}"`);
	}
	const [l, c, h] = components;
	return { l, c, h, alpha };
}

function css(token: DtcgColor): string {
	const { l, c, h, alpha } = asOklch(token);
	const base = `oklch(${l} ${c} ${h}`;
	return alpha === undefined ? `${base})` : `${base} / ${alpha * 100}%)`;
}

/**
 * Every contrast pair the token file declares, measured.
 *
 * Translucent tokens are skipped rather than guessed at — see `contrastRatio`.
 */
export function checkContrast(tokens: TokenFile): {
	mode: 'light' | 'dark';
	fg: string;
	bg: string;
	min: number;
	ratio: number;
	ok: boolean;
}[] {
	const results = [];
	for (const mode of ['light', 'dark'] as const) {
		for (const pair of tokens.$extensions['com.untitledconference.contrast'].pairs) {
			const fg = tokens[mode][pair.fg];
			const bg = tokens[mode][pair.bg];
			if (!fg || !bg)
				throw new Error(`Contrast pair names an unknown token: ${pair.fg}/${pair.bg}`);
			if (fg.$value.alpha !== undefined || bg.$value.alpha !== undefined) continue;
			const ratio = contrastRatio(oklchToSrgb(asOklch(fg)), oklchToSrgb(asOklch(bg)));
			results.push({ mode, ...pair, ratio, ok: ratio >= pair.min });
		}
	}
	return results;
}

/** The generated region of app.css, markers included. */
export function renderCss(tokens: TokenFile): string {
	const radius = tokens.$extensions['com.untitledconference.radius'];
	const light = entries(tokens.light);
	const dark = entries(tokens.dark);

	const declarations = (mode: [string, DtcgColor][]) =>
		mode.map(([name, token]) => `\t--${name}: ${css(token)};`).join('\n');

	// Tailwind v4 reads the theme from `@theme inline`, not from a config file.
	// Every token gets a utility class here, so a new token in the JSON is
	// usable as `bg-*`/`text-*` without a second edit somewhere else.
	const theme = [
		'\t--radius-sm: calc(var(--radius) - 4px);',
		'\t--radius-md: calc(var(--radius) - 2px);',
		'\t--radius-lg: var(--radius);',
		'\t--radius-xl: calc(var(--radius) + 4px);',
		...light.map(([name]) => `\t--color-${name}: var(--${name});`)
	].join('\n');

	return [
		START_MARKER,
		':root {',
		`\t--radius: ${radius};`,
		declarations(light),
		'}',
		'',
		'.dark {',
		declarations(dark),
		'}',
		'',
		'@theme inline {',
		theme,
		'}',
		END_MARKER
	].join('\n');
}

/** Replaces the generated region in an app.css string. */
export function withGeneratedTokens(appCss: string, tokens: TokenFile): string {
	const start = appCss.indexOf(START_MARKER);
	const end = appCss.indexOf(END_MARKER);
	if (start === -1 || end === -1) {
		throw new Error('app.css is missing the tokens:start / tokens:end markers');
	}
	return appCss.slice(0, start) + renderCss(tokens) + appCss.slice(end + END_MARKER.length);
}
