import { describe, expect, it } from 'vitest';
import { clearAssistantHold, closeAssistantHold, openAssistantHold } from './assistant-hold';

describe('assistant hold', () => {
	it('close then open keeps the same instance; New chat is a new one', () => {
		let n = 0;
		const create = () => ({ id: ++n });

		let hold = openAssistantHold({ chat: null, open: false }, create);
		const first = hold.chat;
		expect(first).toEqual({ id: 1 });

		hold = closeAssistantHold(hold);
		expect(hold.open).toBe(false);
		expect(hold.chat).toBe(first);

		hold = openAssistantHold(hold, create);
		expect(hold.open).toBe(true);
		expect(hold.chat).toBe(first);
		expect(n).toBe(1);

		hold = clearAssistantHold(create);
		expect(hold.chat).not.toBe(first);
		expect(hold.chat).toEqual({ id: 2 });
		expect(hold.open).toBe(true);
	});
});
