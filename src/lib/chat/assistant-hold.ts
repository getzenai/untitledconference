/**
 * How the launcher keeps a Chat while the sheet is closed (#728).
 *
 * `open` is the sheet. `chat`, `ledger`, `input` and `scrollTop` outlive it.
 * Closing must not create a new instance; New chat is the only replace, and it
 * empties the unsent question with the transcript (#804).
 *
 * `scrollTop` is where the reader was when they put the panel away (#729).
 * It cannot live in the sheet — the sheet is what goes away — and it belongs
 * to this conversation, so New chat drops it with everything else.
 */
import { emptyAssistantLedger, type AssistantLedger } from './assistant-ledger';

export type AssistantHold<T> = {
	chat: T | null;
	open: boolean;
	ledger: AssistantLedger;
	input: string;
	/** Viewport offset of the closed panel, or `null` for "open at the end". */
	scrollTop: number | null;
};

export function emptyAssistantHold<T>(): AssistantHold<T> {
	return { chat: null, open: false, ledger: emptyAssistantLedger(), input: '', scrollTop: null };
}

export function openAssistantHold<T>(hold: AssistantHold<T>, create: () => T): AssistantHold<T> {
	if (hold.chat) return { ...hold, open: true };
	return { chat: create(), open: true, ledger: emptyAssistantLedger(), input: '', scrollTop: null };
}

export function closeAssistantHold<T>(hold: AssistantHold<T>): AssistantHold<T> {
	return { ...hold, open: false };
}

export function clearAssistantHold<T>(create: () => T): AssistantHold<T> {
	return { chat: create(), open: true, ledger: emptyAssistantLedger(), input: '', scrollTop: null };
}

/**
 * Keeps where the reader was, for the next open (#729).
 *
 * Separate from `closeAssistantHold` because the offset arrives after it: the
 * sheet reports it while unmounting, which is a beat later than the flag that
 * closed it.
 */
export function rememberAssistantScroll<T>(
	hold: AssistantHold<T>,
	scrollTop: number | null
): AssistantHold<T> {
	return { ...hold, scrollTop };
}
