/**
 * What the assistant actually sends to the model, as plain JSON.
 *
 * The deploy gate and the candidate sweep both probe the model with a request
 * built by hand in `scripts/ai/probe-chat-tools.mjs` (#660). That request
 * carried two tools while the live chat carries every tool in the registry
 * (#683) — so the gate measured a shape the application stopped sending. A
 * plain `.mjs` script cannot import this module, so the shape is written to
 * `scripts/ai/chat-tools.json` by `probe-payload.unit.test.ts`, and that test
 * fails when the registry moves and the file does not.
 */
import type { McpContext } from '$lib/server/mcp/context';
import { z } from 'zod';
import { mcpInputSchema } from './adapter';
import { assistantSystemPrompt, type AssistantPageContext } from './assistant';
import { assistantChatToolDefinitions } from './tools';

export type ProbeTool = {
	name: string;
	description: string;
	parameters: Record<string, unknown>;
};

export type ProbeScenario = {
	/** What the run is called in the probe output. */
	id: string;
	/** The page the user is on, in the shape the browser sends. */
	systemPrompt: string;
	question: string;
	/** The tool a correct answer calls. */
	expect: string;
};

export type ProbePayload = {
	tools: ProbeTool[];
	scenarios: ProbeScenario[];
};

/** The wire shape of one tool: name, description, JSON Schema of its input. */
export function probeTools(ctx: McpContext): ProbeTool[] {
	return assistantChatToolDefinitions(ctx).map((def) => ({
		name: def.name,
		description: def.description,
		parameters: z.toJSONSchema(mcpInputSchema(def), { io: 'input' }) as Record<string, unknown>
	}));
}

const REVIEWER_PAGE: AssistantPageContext = {
	routeId: '/(protected)/(with-sidebar)/review',
	url: '/review',
	title: 'Reviewing',
	params: {}
};

const ORGANIZER_PAGE: AssistantPageContext = {
	routeId: '/(protected)/manage/[slug]/agenda',
	url: '/manage/devflow-conf-2027/agenda',
	title: 'Agenda',
	params: { slug: 'devflow-conf-2027' }
};

/**
 * Two questions whose right answer is a single named tool.
 *
 * One per role, because the fence between them is the point of the full tool
 * set: a reviewer's question must not land on an organizer's tool. Neither
 * question names its tool, and both are the plainest way a user asks it.
 */
export function probeScenarios(): ProbeScenario[] {
	return [
		{
			id: 'reviewer-open-assignments',
			systemPrompt: assistantSystemPrompt(REVIEWER_PAGE),
			question: 'Which reviews do I still have open?',
			expect: 'list_my_review_assignments'
		},
		{
			id: 'organizer-unplaced-talks',
			systemPrompt: assistantSystemPrompt(ORGANIZER_PAGE),
			question: 'Which accepted talks are not on the schedule yet?',
			expect: 'get_agenda_tray'
		}
	];
}

export function probePayload(ctx: McpContext): ProbePayload {
	return { tools: probeTools(ctx), scenarios: probeScenarios() };
}
