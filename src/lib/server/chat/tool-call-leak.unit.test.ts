import type { TextStreamPart, Tool, ToolSet } from 'ai';
import { describe, expect, it, vi } from 'vitest';
import {
	ChatToolCallLeakError,
	guardToolCallLeak,
	HOLD_CHARS,
	looksLikeToolCallTranscript
} from './tool-call-leak';

const TOOLS = {
	list_my_review_assignments: {} as Tool,
	submit_review: {} as Tool
} satisfies ToolSet;

const usage = {
	inputTokens: { total: 0, noCache: 0, cacheRead: undefined, cacheWrite: undefined },
	outputTokens: { total: 0, text: 0, reasoning: undefined }
};

function textDeltas(text: string): TextStreamPart<typeof TOOLS>[] {
	return [
		{ type: 'start-step', request: {}, warnings: [] },
		{ type: 'text-start', id: 't1' },
		...text.split(' ').map((word, index) => ({
			type: 'text-delta' as const,
			id: 't1',
			text: index === 0 ? word : ` ${word}`
		})),
		{ type: 'text-end', id: 't1' },
		{ type: 'finish', finishReason: 'stop', rawFinishReason: 'stop', totalUsage: usage }
	] as TextStreamPart<typeof TOOLS>[];
}

async function run(parts: TextStreamPart<typeof TOOLS>[]) {
	const stopStream = vi.fn();
	const transform = guardToolCallLeak<typeof TOOLS>()({ tools: TOOLS, stopStream });
	const input = new ReadableStream<TextStreamPart<typeof TOOLS>>({
		start(controller) {
			for (const part of parts) controller.enqueue(part);
			controller.close();
		}
	});

	const out: TextStreamPart<typeof TOOLS>[] = [];
	const reader = input.pipeThrough(transform).getReader();
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		out.push(value);
	}

	const text = out
		.filter((part) => part.type === 'text-delta')
		.map((part) => (part as { text: string }).text)
		.join('');
	const errors = out.filter((part) => part.type === 'error');
	return { out, text, errors, stopStream };
}

describe('looksLikeToolCallTranscript', () => {
	const names = Object.keys(TOOLS);

	it('catches the raw call the live model printed (#660)', () => {
		expect(
			looksLikeToolCallTranscript(
				'{"type": "function", "name": "list_my_review_assignments", "parameters": {}}',
				names
			)
		).toBe(true);
	});

	it('catches it when the model wraps it in a sentence', () => {
		expect(
			looksLikeToolCallTranscript(
				'Your function call should be: {"type": "function", "name": "list_my_review_assignments", "parameters": {}}',
				names
			)
		).toBe(true);
	});

	it('leaves the answer alone when it only names the tool', () => {
		// The system prompt asks for exactly this sentence.
		expect(
			looksLikeToolCallTranscript(
				'I used list_my_review_assignments to look. You have three.',
				names
			)
		).toBe(false);
	});

	it('leaves JSON alone when no offered tool is named', () => {
		expect(looksLikeToolCallTranscript('{"type": "function", "name": "rm_rf"}', names)).toBe(false);
	});
});

describe('guardToolCallLeak', () => {
	it('replaces a printed tool call with the chat error and stops the stream', async () => {
		const { text, errors, stopStream } = await run(
			textDeltas('{"type": "function", "name": "list_my_review_assignments", "parameters": {}}')
		);

		expect(text).toBe('');
		expect(errors).toHaveLength(1);
		expect((errors[0] as { error: unknown }).error).toBeInstanceOf(ChatToolCallLeakError);
		expect(stopStream).toHaveBeenCalled();
	});

	it('lets a plain answer through once it is longer than a call', async () => {
		const answer = 'You have three reviews open. '.repeat(20);
		const { text, errors } = await run(textDeltas(answer));

		expect(text.trim()).toBe(answer.trim().replace(/\s+/g, ' '));
		expect(errors).toHaveLength(0);
		expect(answer.length).toBeGreaterThan(HOLD_CHARS);
	});

	it('lets a short answer through at the end of the step', async () => {
		const { text, errors } = await run(textDeltas('Which assignment do you mean?'));

		expect(text).toBe('Which assignment do you mean?');
		expect(errors).toHaveLength(0);
	});

	it('never holds the text of a step that called a tool', async () => {
		const parts = [
			{ type: 'start-step', request: {}, warnings: [] },
			{
				type: 'tool-call',
				toolCallId: 'c1',
				toolName: 'list_my_review_assignments',
				input: {}
			},
			{ type: 'finish-step', response: {}, usage, finishReason: 'tool-calls' },
			{ type: 'start-step', request: {}, warnings: [] },
			{ type: 'text-start', id: 't2' },
			{
				type: 'text-delta',
				id: 't2',
				// A follow-up sentence that quotes the call it just made must survive:
				// the model did the work, and this is it reporting the work.
				text: 'I used list_my_review_assignments with {"parameters": {}} and found three.'
			},
			{ type: 'text-end', id: 't2' },
			{ type: 'finish', finishReason: 'stop', rawFinishReason: 'stop', totalUsage: usage }
		] as TextStreamPart<typeof TOOLS>[];

		const { text, errors } = await run(parts);

		expect(text).toContain('found three');
		expect(errors).toHaveLength(0);
	});

	it('keeps the order of the parts it held', async () => {
		const { out } = await run(textDeltas('Which assignment do you mean?'));

		expect(out.map((part) => part.type)).toEqual([
			'start-step',
			'text-start',
			'text-delta',
			'text-delta',
			'text-delta',
			'text-delta',
			'text-delta',
			'text-end',
			'finish'
		]);
	});
});

describe('through streamText', () => {
	/**
	 * The transform is only worth anything if `experimental_transform` runs it.
	 * This drives the real pipeline with a model that does what the live one did.
	 */
	it('turns the printed call into an error part before the client sees text', async () => {
		const { simulateReadableStream, streamText, stepCountIs, tool } = await import('ai');
		const { MockLanguageModelV3 } = await import('ai/test');
		const { z } = await import('zod');

		const leak = '{"type": "function", "name": "list_my_review_assignments", "parameters": {}}';
		const model = new MockLanguageModelV3({
			doStream: async () => ({
				stream: simulateReadableStream({
					chunks: [
						{ type: 'stream-start', warnings: [] },
						{ type: 'text-start', id: 'x' },
						{ type: 'text-delta', id: 'x', delta: leak },
						{ type: 'text-end', id: 'x' },
						{ type: 'finish', finishReason: 'stop', usage }
					] as never
				})
			})
		});

		const result = streamText({
			model,
			messages: [{ role: 'user', content: 'Which reviews do I still have open?' }],
			tools: {
				list_my_review_assignments: tool({
					description: 'List assignments',
					inputSchema: z.object({})
				})
			},
			stopWhen: stepCountIs(2),
			experimental_transform: guardToolCallLeak()
		});

		let text = '';
		const errors: unknown[] = [];
		for await (const part of result.stream) {
			if (part.type === 'text-delta') text += part.text;
			if (part.type === 'error') errors.push(part.error);
		}

		expect(text).toBe('');
		expect(errors[0]).toBeInstanceOf(ChatToolCallLeakError);
	});
});
