import { describe, expect, it } from 'vitest';
import {
	autosavedProposalKey,
	clearAutosavedProposal,
	consumePendingProposal,
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
		}
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

		expect(parsePendingProposal(JSON.stringify(draft))).toEqual(draft);
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

		writePendingProposal(storage, 'devflow', draft);

		expect(storage.getItem(pendingProposalKey('other'))).toBeNull();
		expect(consumePendingProposal(storage, 'devflow')).toEqual(draft);
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
		writeAutosavedProposal(storage, 'devflow', draft);

		expect(storage.getItem(autosavedProposalKey('other'))).toBeNull();
		expect(readAutosavedProposal(storage, 'devflow')).toEqual(draft);
		expect(readAutosavedProposal(storage, 'devflow')).toEqual(draft);
	});

	it('is gone after a real save, and an empty form is not a draft', () => {
		const storage = fakeStorage();
		writeAutosavedProposal(storage, 'devflow', draft);
		clearAutosavedProposal(storage, 'devflow');

		expect(readAutosavedProposal(storage, 'devflow')).toBeNull();
		expect(isTypedProposal(emptyProposal())).toBe(false);
		expect(isTypedProposal(draft)).toBe(true);
	});
});
