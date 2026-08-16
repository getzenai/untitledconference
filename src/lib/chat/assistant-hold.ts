/**
 * How the launcher keeps a Chat while the sheet is closed (#728).
 *
 * `open` is the sheet. `chat` outlives it. Closing must not create a new
 * instance; New chat is the only replace.
 */
export type AssistantHold<T> = { chat: T | null; open: boolean };

export function openAssistantHold<T>(hold: AssistantHold<T>, create: () => T): AssistantHold<T> {
	return { chat: hold.chat ?? create(), open: true };
}

export function closeAssistantHold<T>(hold: AssistantHold<T>): AssistantHold<T> {
	return { ...hold, open: false };
}

export function clearAssistantHold<T>(create: () => T): AssistantHold<T> {
	return { chat: create(), open: true };
}
