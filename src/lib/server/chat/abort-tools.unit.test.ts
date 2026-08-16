import { tool } from 'ai';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { refuseNewToolsAfterAbort } from './abort-tools';

describe('refuseNewToolsAfterAbort', () => {
	it('lets a tool run while the request is still live', async () => {
		const execute = vi.fn(async () => ({ ok: true }));
		const tools = refuseNewToolsAfterAbort(
			{
				look: tool({
					description: 'look',
					inputSchema: z.object({}),
					execute
				})
			},
			new AbortController().signal
		);

		await expect(tools.look.execute?.({} as never, {} as never)).resolves.toEqual({ ok: true });
		expect(execute).toHaveBeenCalledOnce();
	});

	it('does not start a tool after the request is aborted', async () => {
		const execute = vi.fn(async () => ({ ok: true }));
		const controller = new AbortController();
		const tools = refuseNewToolsAfterAbort(
			{
				look: tool({
					description: 'look',
					inputSchema: z.object({}),
					execute
				})
			},
			controller.signal
		);

		controller.abort();
		await expect(tools.look.execute?.({} as never, {} as never)).resolves.toEqual({
			error: 'Stopped before this tool started.'
		});
		expect(execute).not.toHaveBeenCalled();
	});

	it('leaves a tool without execute untouched', () => {
		const definition = tool({
			description: 'ask first',
			inputSchema: z.object({})
		});
		const tools = refuseNewToolsAfterAbort({ ask: definition }, new AbortController().signal);
		expect(tools.ask).toBe(definition);
		expect(tools.ask.execute).toBeUndefined();
	});
});
