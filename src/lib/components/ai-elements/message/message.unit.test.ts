/**
 * The frame that makes a three-turn chat scannable (#727).
 *
 * The bubble is a class on the user group, not a label. Removing
 * `bg-muted` or `max-w-[80%]` is what this file is for — a render
 * that only checks for a div would stay green on the old wall.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import MessageContent from './message-content.svelte';
import Message from './message.svelte';

const here = dirname(fileURLToPath(import.meta.url));
const contentSource = readFileSync(join(here, 'message-content.svelte'), 'utf8');
const tokens = readFileSync(join(here, '../../../../../src/app.css'), 'utf8');

function oklchLightness(block: string, name: string): number {
	const match = block.match(new RegExp(`--${name}:\\s*oklch\\(([0-9.]+)`));
	if (!match) throw new Error(`missing --${name} in token block`);
	return Number(match[1]);
}

describe('Message', () => {
	it('puts the user on the right and the answer on the row', () => {
		const user = render(Message, { props: { from: 'user' } }).body;
		const answer = render(Message, { props: { from: 'assistant' } }).body;

		expect(user).toContain('is-user');
		expect(user).toContain('justify-end');
		expect(user).not.toContain('is-assistant');

		expect(answer).toContain('is-assistant');
		expect(answer).toContain('justify-start');
		expect(answer).not.toContain('is-user');
	});
});

describe('MessageContent', () => {
	it('is a muted 80% bubble for the user and bare prose for the answer', () => {
		const body = render(MessageContent, { props: {} }).body;

		expect(body).toContain('group-[.is-user]:bg-muted');
		expect(body).toContain('group-[.is-user]:max-w-[80%]');
		expect(body).toContain('group-[.is-user]:rounded-lg');
		expect(body).toContain('group-[.is-assistant]:w-full');
		expect(body).not.toMatch(/group-\[\.is-assistant\]:bg-/);
		expect(contentSource).not.toContain('bg-primary');
	});

	it('spaces parts inside a turn tighter than the list spaces turns', () => {
		expect(contentSource).toMatch(/flex-col gap-2/);
		expect(contentSource).not.toMatch(/flex-col gap-[5-8]/);
	});
});

describe('the muted bubble against the sheet', () => {
	it('stays a step above the sheet in both themes', () => {
		const root = tokens.slice(tokens.indexOf(':root {'), tokens.indexOf('.dark {'));
		const dark = tokens.slice(tokens.indexOf('.dark {'), tokens.indexOf('--color-background'));

		const lightGap = oklchLightness(root, 'background') - oklchLightness(root, 'muted');
		const darkGap = oklchLightness(dark, 'muted') - oklchLightness(dark, 'background');

		// Light: white sheet, muted just below it. Dark: muted is the next
		// grey up from the sheet. Either gap collapsing is the pairing
		// that makes the bubble vanish once the You/Assistant labels go.
		expect(lightGap).toBeGreaterThan(0.02);
		expect(darkGap).toBeGreaterThan(0.05);
	});
});
