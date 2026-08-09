/**
 * Colour maths for the design tokens — oklch to sRGB, and WCAG contrast.
 *
 * This exists so the palette can be checked instead of eyeballed: every pair in
 * `design/tokens.json` under `$extensions` is asserted by `tokens.unit.test.ts`.
 * A colour that fails is a failing test, not a discovery someone makes months
 * later with a screen reader.
 */

export type Oklch = { l: number; c: number; h: number; alpha?: number };
export type Rgb = [number, number, number];

/** oklch (L 0–1, C, H in degrees) to gamma-encoded sRGB, each channel 0–1. */
export function oklchToSrgb({ l, c, h }: Oklch): Rgb {
	const hr = (h * Math.PI) / 180;
	const a = c * Math.cos(hr);
	const b = c * Math.sin(hr);

	const lms = [
		(l + 0.3963377774 * a + 0.2158037573 * b) ** 3,
		(l - 0.1055613458 * a - 0.0638541728 * b) ** 3,
		(l - 0.0894841775 * a - 1.291485548 * b) ** 3
	] as const;

	const linear: Rgb = [
		4.0767416621 * lms[0] - 3.3077115913 * lms[1] + 0.2309699292 * lms[2],
		-1.2684380046 * lms[0] + 2.6097574011 * lms[1] - 0.3413193965 * lms[2],
		-0.0041960863 * lms[0] - 0.7034186147 * lms[1] + 1.707614701 * lms[2]
	];

	return linear.map(encodeGamma) as Rgb;
}

function encodeGamma(x: number): number {
	const v = Math.min(1, Math.max(0, x));
	return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
}

function decodeGamma(x: number): number {
	return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.x relative luminance. */
export function relativeLuminance([r, g, b]: Rgb): number {
	return 0.2126 * decodeGamma(r) + 0.7152 * decodeGamma(g) + 0.0722 * decodeGamma(b);
}

/**
 * WCAG contrast ratio, 1–21. Order does not matter.
 *
 * Colours with alpha are not supported: a translucent value has no contrast of
 * its own, only one against whatever happens to sit behind it. Composite first,
 * then call this.
 */
export function contrastRatio(a: Rgb, b: Rgb): number {
	const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

export function toHex(rgb: Rgb): string {
	return `#${rgb
		.map((v) =>
			Math.round(v * 255)
				.toString(16)
				.padStart(2, '0')
		)
		.join('')}`.toUpperCase();
}
