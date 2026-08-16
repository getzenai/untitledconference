/**
 * The list is the frame (#727). Cypress reads `data-role` on the <li>;
 * the You/Assistant labels are gone because the bubble carries the role.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
	join(dirname(fileURLToPath(import.meta.url)), 'assistant-panel.svelte'),
	'utf8'
);

describe('assistant panel message list', () => {
	it('keeps data-role on the turn and drops the role labels', () => {
		expect(source).toContain('data-role={message.role}');
		expect(source).toContain('from={message.role}');
		expect(source).toContain('MessageContent');
		expect(source).not.toContain("message.role === 'user' ? 'You' : 'Assistant'");
		expect(source).not.toMatch(/tracking-wide uppercase/);
	});

	it('spaces turns further apart than the parts inside one', () => {
		expect(source).toContain('flex flex-col gap-5');
		expect(source).not.toContain('flex flex-col gap-3');
	});
});
