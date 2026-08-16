import { describe, expect, it } from 'vitest';
import { emptyAssistantLedger } from './assistant-ledger';
import { pageRefreshIds } from './page-refresh-ids';

function toolPart(name: string, id: string, state: 'output-available' | 'approval-requested') {
	return {
		type: `tool-${name}`,
		toolCallId: id,
		state,
		input: {}
	};
}

function messagesWith(
	...parts: ReturnType<typeof toolPart>[]
): Parameters<typeof pageRefreshIds>[0] {
	return [{ parts }] as Parameters<typeof pageRefreshIds>[0];
}

describe('pageRefreshIds', () => {
	it('asks once for a finished auto-run write, then never again on the same ledger', () => {
		const messages = messagesWith(toolPart('place_talk', 'place-1', 'output-available'));
		const ledger = emptyAssistantLedger();

		expect(pageRefreshIds(messages, ledger)).toEqual(['place-1']);

		ledger.invalidated.add('place-1');
		expect(pageRefreshIds(messages, ledger)).toEqual([]);
	});

	it('asks again when New chat starts an empty ledger', () => {
		const messages = messagesWith(toolPart('place_talk', 'place-1', 'output-available'));
		const spent = emptyAssistantLedger();
		spent.invalidated.add('place-1');
		expect(pageRefreshIds(messages, spent)).toEqual([]);
		expect(pageRefreshIds(messages, emptyAssistantLedger())).toEqual(['place-1']);
	});

	it('does not refresh a read', () => {
		const messages = messagesWith(toolPart('get_agenda', 'read-1', 'output-available'));
		expect(pageRefreshIds(messages, emptyAssistantLedger())).toEqual([]);
	});
});
