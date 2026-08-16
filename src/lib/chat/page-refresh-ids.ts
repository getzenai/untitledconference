/**
 * Which finished tool calls still need a page refresh (#728).
 *
 * The panel walks this on every mount. Already-invalidated ids must not
 * fire again — that is the reopen storm from #802.
 */
import { getToolName, isToolUIPart, type UIMessage } from 'ai';
import type { AssistantLedger } from './assistant-ledger';
import { assistantWriteRefreshesPage } from './auto-run-writes';

export function pageRefreshIds(
	messages: Iterable<Pick<UIMessage, 'parts'>>,
	ledger: Pick<AssistantLedger, 'approved' | 'invalidated'>
): string[] {
	const ids: string[] = [];
	for (const message of messages) {
		for (const part of message.parts) {
			if (!isToolUIPart(part)) continue;
			if (part.state === 'approval-requested') ledger.approved.add(part.toolCallId);
			if (part.state !== 'output-available') continue;
			if (ledger.invalidated.has(part.toolCallId)) continue;
			if (!assistantWriteRefreshesPage(getToolName(part), ledger.approved.has(part.toolCallId))) {
				continue;
			}
			ids.push(part.toolCallId);
		}
	}
	return ids;
}
