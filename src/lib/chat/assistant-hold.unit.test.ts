import { describe, expect, it } from 'vitest';
import {
	clearAssistantHold,
	closeAssistantHold,
	emptyAssistantHold,
	openAssistantHold
} from './assistant-hold';

describe('assistant hold', () => {
	it('close then open keeps the same instance; New chat is a new one', () => {
		let n = 0;
		const create = () => ({ id: ++n });

		let hold = openAssistantHold(emptyAssistantHold(), create);
		const first = hold.chat;
		const firstLedger = hold.ledger;
		expect(first).toEqual({ id: 1 });

		hold.ledger.invalidated.add('place-1');

		hold = closeAssistantHold(hold);
		expect(hold.open).toBe(false);
		expect(hold.chat).toBe(first);
		expect(hold.ledger).toBe(firstLedger);
		expect(hold.ledger.invalidated.has('place-1')).toBe(true);

		hold = openAssistantHold(hold, create);
		expect(hold.open).toBe(true);
		expect(hold.chat).toBe(first);
		expect(hold.ledger).toBe(firstLedger);
		expect(hold.ledger.invalidated.has('place-1')).toBe(true);
		expect(n).toBe(1);

		hold = clearAssistantHold(create);
		expect(hold.chat).not.toBe(first);
		expect(hold.ledger).not.toBe(firstLedger);
		expect(hold.ledger.invalidated.size).toBe(0);
		expect(hold.chat).toEqual({ id: 2 });
		expect(hold.open).toBe(true);
		expect(hold.input).toBe('');
	});

	it('close keeps a typed question; New chat empties it (#804)', () => {
		const create = () => ({ id: 1 });
		let hold = openAssistantHold(emptyAssistantHold(), create);
		hold = { ...hold, input: 'half typed' };

		hold = closeAssistantHold(hold);
		expect(hold.open).toBe(false);
		expect(hold.input).toBe('half typed');

		hold = openAssistantHold(hold, create);
		expect(hold.open).toBe(true);
		expect(hold.input).toBe('half typed');

		hold = clearAssistantHold(create);
		expect(hold.input).toBe('');
	});
});
