import { asSchema } from 'ai';
import { describe, expect, it, vi } from 'vitest';

const mockEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock('$env/dynamic/private', () => ({ env: mockEnv }));

import { toLanguageModelTool } from './adapter';
import { probePayload, probeScenarios, probeTools } from './probe-payload';
import { assistantChatToolDefinitions } from './tools';

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

	// The probe used to convert with `z.toJSONSchema` (draft-2020-12, no
	// additionalProperties). The chat lets `tool()` convert (draft-07 plus
	// additionalProperties: false). Same names, different wire form — #698.
	it('sends the argument schema tool() holds on the live path', async () => {
		const def = assistantChatToolDefinitions(ctx).find((tool) => tool.name === 'list_submissions');
		expect(def, 'list_submissions').toBeDefined();
		const probe = probeTools(ctx).find((tool) => tool.name === 'list_submissions');
		expect(probe, 'probe list_submissions').toBeDefined();

		const liveSchema = await asSchema(toLanguageModelTool(def!).inputSchema).jsonSchema;
		expect(probe!.parameters).toEqual(liveSchema);
		expect(Object.keys(probe!.parameters).sort()).toEqual(Object.keys(liveSchema).sort());
		for (const key of Object.keys(liveSchema)) {
			expect(probe!.parameters[key], key).toEqual((liveSchema as Record<string, unknown>)[key]);
		}
		expect(probe!.parameters.$schema).toBe('http://json-schema.org/draft-07/schema#');
		expect(probe!.parameters.additionalProperties).toBe(false);
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
