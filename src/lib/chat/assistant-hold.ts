/**
 * How the launcher keeps a Chat while the sheet is closed (#728).
 *
 * `open` is the sheet. `chat` and `ledger` outlive it. Closing must not
 * create a new instance; New chat is the only replace.
 */
import { emptyAssistantLedger, type AssistantLedger } from './assistant-ledger';

export type AssistantHold<T> = {
	chat: T | null;
	open: boolean;
	ledger: AssistantLedger;
};

export function emptyAssistantHold<T>(): AssistantHold<T> {
	return { chat: null, open: false, ledger: emptyAssistantLedger() };
}

export function openAssistantHold<T>(hold: AssistantHold<T>, create: () => T): AssistantHold<T> {
	if (hold.chat) return { ...hold, open: true };
	return { chat: create(), open: true, ledger: emptyAssistantLedger() };
}

export function closeAssistantHold<T>(hold: AssistantHold<T>): AssistantHold<T> {
	return { ...hold, open: false };
}

export function clearAssistantHold<T>(create: () => T): AssistantHold<T> {
	return { chat: create(), open: true, ledger: emptyAssistantLedger() };
}
