import { describe, expect, it } from 'vitest';
import {
	autosavedProposalKey,
	clearAutosavedProposal,
	clearProposalDrafts,
	consumePendingProposal,
	DRAFT_MAX_AGE_MS,
	draftFromFormData,
	isTypedProposal,
	parsePendingProposal,
	pendingProposalKey,
	readAutosavedProposal,
	writeAutosavedProposal,
	writePendingProposal
} from './pending-proposal';
import { emptyProposal } from './proposal-draft';

function fakeStorage(initial: Record<string, string> = {}) {
	const store = new Map(Object.entries(initial));
	return {
		getItem: (key: string) => store.get(key) ?? null,
		setItem: (key: string, value: string) => {
			store.set(key, value);
		},
		removeItem: (key: string) => {
			store.delete(key);
		},
		get length() {
			return store.size;
		},
		key: (index: number) => [...store.keys()][index] ?? null
	};
}

describe('draftFromFormData', () => {
	it('reads the same names the form posts', () => {
		const data = new FormData();
		data.set('title', ' Batching without tears ');
		data.set('abstract', 'How we stopped copying the queue.');
		data.set('speakerName', 'Ada Bennett');
		data.set('speakerEmail', 'ada@example.test');
		data.set('answer:7', 'Because Monday.');
		data.append('co-name', 'Priya Raman');
		data.append('co-email', 'priya@example.test');
		data.append('co-role', 'Co-presenter');

		const draft = draftFromFormData(data);

		expect(draft.title).toBe(' Batching without tears ');
		expect(draft.abstract).toBe('How we stopped copying the queue.');
		expect(draft.speaker.name).toBe('Ada Bennett');
		expect(draft.speaker.email).toBe('ada@example.test');
		expect(draft.answers[7]).toBe('Because Monday.');
		expect(draft.coSpeakers).toEqual([
			{ name: 'Priya Raman', email: 'priya@example.test', roleLabel: 'Co-presenter' }
		]);
	});
});

describe('parsePendingProposal', () => {
	it('round-trips a real draft', () => {
		const draft = {
			...emptyProposal(),
			title: 'Batching without tears',
			abstract: 'How we stopped copying the queue.',
			speaker: { ...emptyProposal().speaker, name: 'Ada', email: 'ada@example.test' }
		};

		expect(parsePendingProposal(JSON.stringify(draft))).toEqual({ draft, intent: 'submit' });
		expect(parsePendingProposal(JSON.stringify({ draft, intent: 'draft' }))).toEqual({
			draft,
			intent: 'draft'
		});
	});

	it('rejects junk so it cannot become an auto-submit', () => {
		expect(parsePendingProposal('not-json')).toBeNull();
		expect(parsePendingProposal('[]')).toBeNull();
		expect(parsePendingProposal('{}')).toBeNull();
		expect(parsePendingProposal('{"title":1}')).toBeNull();
	});
});

describe('pending proposal storage', () => {
	it('is consumed exactly once, and only for that call', () => {
		const storage = fakeStorage();
		const draft = {
			...emptyProposal(),
			title: 'Batching without tears',
			speaker: { ...emptyProposal().speaker, name: 'Ada' }
		};

		writePendingProposal(storage, 'devflow', draft, 'draft');

		expect(storage.getItem(pendingProposalKey('other'))).toBeNull();
		expect(consumePendingProposal(storage, 'devflow')).toEqual({ draft, intent: 'draft' });
		expect(consumePendingProposal(storage, 'devflow')).toBeNull();
	});
});

describe('autosaved proposal storage', () => {
	const draft = {
		...emptyProposal(),
		title: 'Batching without tears',
		abstract: 'How we stopped copying the queue.'
	};

	it('is still there after a read — coming back twice must not empty the form', () => {
		const storage = fakeStorage();
		writeAutosavedProposal(storage, 'devflow', null, draft);

		expect(storage.getItem(autosavedProposalKey('other', null))).toBeNull();
		expect(readAutosavedProposal(storage, 'devflow', null)?.draft).toEqual(draft);
		expect(readAutosavedProposal(storage, 'devflow', null)?.draft).toEqual(draft);
	});

	it('is gone after a real save, and an empty form is not a draft', () => {
		const storage = fakeStorage();
		writeAutosavedProposal(storage, 'devflow', null, draft);
		clearAutosavedProposal(storage, 'devflow', null);

		expect(readAutosavedProposal(storage, 'devflow', null)).toBeNull();
		expect(isTypedProposal(emptyProposal())).toBe(false);
		expect(isTypedProposal(draft)).toBe(true);
	});

	it('does not hand one person the next one their name and email (#505)', () => {
		const storage = fakeStorage();
		writeAutosavedProposal(storage, 'devflow', 'ada', draft);

		// The next account on the same browser, and the signed-out visitor:
		// same call, same machine, and neither of them typed this.
		expect(readAutosavedProposal(storage, 'devflow', 'bo')).toBeNull();
		expect(readAutosavedProposal(storage, 'devflow', null)).toBeNull();
		expect(readAutosavedProposal(storage, 'devflow', 'ada')?.draft).toEqual(draft);
	});

	it('expires, and refuses a copy whose age nobody can vouch for', () => {
		const storage = fakeStorage();
		const wroteAt = 1_700_000_000_000;
		writeAutosavedProposal(storage, 'devflow', 'ada', draft, wroteAt);

		expect(
			readAutosavedProposal(storage, 'devflow', 'ada', wroteAt + DRAFT_MAX_AGE_MS)
		).not.toBeNull();
		expect(
			readAutosavedProposal(storage, 'devflow', 'ada', wroteAt + DRAFT_MAX_AGE_MS + 1)
		).toBeNull();
		// And the stale copy is deleted on the way out, not left to be found.
		expect(storage.getItem(autosavedProposalKey('devflow', 'ada'))).toBeNull();

		// A pre-#505 bare draft: no timestamp, so no claim about its age.
		const legacy = fakeStorage({ [autosavedProposalKey('devflow', null)]: JSON.stringify(draft) });
		expect(readAutosavedProposal(legacy, 'devflow', null)).toBeNull();
		expect(legacy.getItem(autosavedProposalKey('devflow', null))).toBeNull();
	});

	it('is swept wholesale on sign-out, every call and every owner', () => {
		const storage = fakeStorage();
		writeAutosavedProposal(storage, 'devflow', 'ada', draft);
		writeAutosavedProposal(storage, 'other', null, draft);
		writePendingProposal(storage, 'devflow', draft, 'submit');
		storage.setItem('unrelated', 'keep me');

		clearProposalDrafts(storage);

		expect(readAutosavedProposal(storage, 'devflow', 'ada')).toBeNull();
		expect(readAutosavedProposal(storage, 'other', null)).toBeNull();
		expect(consumePendingProposal(storage, 'devflow')).toBeNull();
		expect(storage.getItem('unrelated')).toBe('keep me');
	});
});
