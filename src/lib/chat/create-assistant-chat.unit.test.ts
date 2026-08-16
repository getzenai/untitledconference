/**
 * Closing the sheet must not drop the Chat instance (#728).
 *
 * The launcher holds one instance and hands the same object back when the
 * sheet remounts. New chat is a new instance, so the old transcript cannot
 * leak into the empty panel.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('$app/state', () => ({
	page: {
		route: { id: '/home' },
		url: new URL('https://example.test/home'),
		params: {}
	}
}));

import { createAssistantChat } from './create-assistant-chat';

describe('createAssistantChat', () => {
	it('starts empty, and a second instance does not share the first', () => {
		const kept = createAssistantChat();
		const cleared = createAssistantChat();

		expect(kept.messages).toEqual([]);
		expect(cleared.messages).toEqual([]);
		expect(cleared).not.toBe(kept);
	});
});
