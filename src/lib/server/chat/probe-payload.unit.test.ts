import { describe, expect, it, vi } from 'vitest';

const mockEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock('$env/dynamic/private', () => ({ env: mockEnv }));

import { probePayload, probeScenarios, probeTools } from './probe-payload';

const ctx = { userId: 'user-1', organizationId: 'org-1' };

describe('probe payload', () => {
	// The generated file is what the deploy gate sends. Regenerate it with
	// `npx vitest run -u --project unit src/lib/server/chat/probe-payload.unit.test.ts`
	// after a tool is added, renamed or reworded; without this the gate keeps
	// probing a tool set the application no longer has (#696).
	it('matches the checked-in file the probe script reads', async () => {
		await expect(JSON.stringify(probePayload(ctx), null, '\t') + '\n').toMatchFileSnapshot(
			'../../../../scripts/ai/chat-tools.json'
		);
	});

	it('offers the whole registry, not a page-sized slice', () => {
		const names = probeTools(ctx).map((tool) => tool.name);
		expect(names.length).toBeGreaterThan(40);
		expect(names).toContain('list_my_review_assignments');
		expect(names).toContain('get_agenda_tray');
		expect(names).toContain('submit_review');
	});

	// A scenario whose expected tool is not on offer would report every model as
	// wrong, which reads as a model verdict and is a typo in this file.
	it('expects a tool that is actually offered', () => {
		const names = new Set(probeTools(ctx).map((tool) => tool.name));
		for (const scenario of probeScenarios()) {
			expect(names.has(scenario.expect), scenario.expect).toBe(true);
		}
	});

	// The question must not name the tool: then it measures instruction
	// following, not whether the model can find one tool among fifty.
	it('asks the way a user asks, not by naming the tool', () => {
		for (const scenario of probeScenarios()) {
			expect(scenario.question.toLowerCase()).not.toContain(scenario.expect);
			expect(scenario.systemPrompt).toContain('untitledconference');
		}
	});
});
