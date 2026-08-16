import { describe, expect, it } from 'vitest';
import {
	ANONYMOUS_BROWSER_DRAFT_OWNER,
	BROWSER_DRAFT_MAX_AGE_MS,
	browserDraftKey,
	clearBrowserDraft,
	clearBrowserDrafts,
	readBrowserDraft,
	writeBrowserDraft
} from './browser-draft';

function fakeStorage(initial: Record<string, string> = {}) {
	const values = new Map(Object.entries(initial));
	return {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => values.set(key, value),
		removeItem: (key: string) => values.delete(key),
		get length() {
			return values.size;
		},
		key: (index: number) => [...values.keys()][index] ?? null,
		values
	};
}

const parseText = (value: unknown) => (typeof value === 'string' ? value : null);

describe('browser form drafts', () => {
	it('restores a draft written from the current server baseline', () => {
		const storage = fakeStorage();
		writeBrowserDraft(storage, {
			scope: '/proposal/1/edit',
			owner: 'user-1',
			baseline: 'v1',
			value: 'typed',
			now: 100
		});

		expect(
			readBrowserDraft(storage, {
				scope: '/proposal/1/edit',
				owner: 'user-1',
				baseline: 'v1',
				parse: parseText,
				now: 101
			})
		).toEqual({ status: 'current', draft: { value: 'typed', baseline: 'v1', savedAt: 100 } });
	});

	it('restores a draft from a form that creates rather than edits', () => {
		// The empty baseline is the normal one for an add dialog or an invite
		// field: there is no server version it was typed from. Every other test
		// here names a baseline, which is how a falsy check survived unseen.
		const storage = fakeStorage();
		writeBrowserDraft(storage, {
			scope: '/contacts',
			owner: 'user-1',
			baseline: '',
			value: 'half-typed name',
			now: 100
		});

		expect(
			readBrowserDraft(storage, {
				scope: '/contacts',
				owner: 'user-1',
				baseline: '',
				parse: parseText,
				now: 101
			})
		).toEqual({
			status: 'current',
			draft: { value: 'half-typed name', baseline: '', savedAt: 100 }
		});
		// And the read must not have eaten it on the way out.
		expect(storage.values.has(browserDraftKey('/contacts', 'user-1'))).toBe(true);
	});

	it('surfaces a conflict instead of replacing a newer server baseline', () => {
		const storage = fakeStorage();
		writeBrowserDraft(storage, {
			scope: '/review/1',
			owner: 'reviewer-1',
			baseline: 'review-v1',
			value: 'local comment',
			now: 100
		});

		expect(
			readBrowserDraft(storage, {
				scope: '/review/1',
				owner: 'reviewer-1',
				baseline: 'review-v2',
				parse: parseText,
				now: 101
			})
		).toMatchObject({ status: 'conflict', draft: { value: 'local comment', savedAt: 100 } });
	});

	it('removes the previous account copy when identity changes on the same route', () => {
		const storage = fakeStorage();
		writeBrowserDraft(storage, {
			scope: '/review/1',
			owner: 'reviewer-1',
			baseline: 'v1',
			value: 'private comment'
		});
		readBrowserDraft(storage, {
			scope: '/review/1',
			owner: 'reviewer-2',
			baseline: 'v1',
			parse: parseText
		});

		expect(storage.values.has(browserDraftKey('/review/1', 'reviewer-1'))).toBe(false);
	});

	it('does not let an anonymous visit evict a signed-in copy', () => {
		const storage = fakeStorage();
		writeBrowserDraft(storage, {
			scope: '/cfp/devflow',
			owner: 'user-1',
			baseline: '',
			value: 'still mine after the session died'
		});

		expect(
			readBrowserDraft(storage, {
				scope: '/cfp/devflow',
				owner: ANONYMOUS_BROWSER_DRAFT_OWNER,
				baseline: '',
				parse: parseText
			})
		).toEqual({ status: 'empty' });
		writeBrowserDraft(storage, {
			scope: '/cfp/devflow',
			owner: ANONYMOUS_BROWSER_DRAFT_OWNER,
			baseline: '',
			value: 'a later visitor typed this'
		});

		expect(
			readBrowserDraft(storage, {
				scope: '/cfp/devflow',
				owner: 'user-1',
				baseline: '',
				parse: parseText
			})
		).toMatchObject({
			status: 'current',
			draft: { value: 'still mine after the session died' }
		});
	});

	it('drops malformed and expired copies and clears committed work', () => {
		const scope = '/proposal/1/edit';
		const owner = 'user-1';
		const storage = fakeStorage({ [browserDraftKey(scope, owner)]: '{nope' });
		expect(readBrowserDraft(storage, { scope, owner, baseline: 'v1', parse: parseText })).toEqual({
			status: 'empty'
		});

		writeBrowserDraft(storage, {
			scope,
			owner,
			baseline: 'v1',
			value: 'old',
			now: 0
		});
		expect(
			readBrowserDraft(storage, {
				scope,
				owner,
				baseline: 'v1',
				parse: parseText,
				now: BROWSER_DRAFT_MAX_AGE_MS + 1
			})
		).toEqual({ status: 'empty' });

		writeBrowserDraft(storage, { scope, owner, baseline: 'v1', value: 'saved' });
		clearBrowserDraft(storage, scope, owner);
		expect(storage.values.has(browserDraftKey(scope, owner))).toBe(false);
	});

	it('clears every account-owned copy and identity marker at logout', () => {
		const storage = fakeStorage({ unrelated: 'keep' });
		writeBrowserDraft(storage, {
			scope: '/proposal/1/edit',
			owner: 'user-1',
			baseline: 'v1',
			value: 'proposal'
		});
		writeBrowserDraft(storage, {
			scope: '/review/2',
			owner: 'user-1',
			baseline: 'v1',
			value: 'review'
		});

		clearBrowserDrafts(storage);

		expect([...storage.values.entries()]).toEqual([['unrelated', 'keep']]);
	});

	it('keeps the form usable when browser storage refuses writes', () => {
		const storage = {
			getItem: () => null,
			setItem: () => {
				throw new DOMException('Quota exceeded', 'QuotaExceededError');
			},
			removeItem: () => undefined
		};

		expect(() =>
			writeBrowserDraft(storage, {
				scope: '/review/1',
				owner: 'reviewer-1',
				baseline: 'v1',
				value: 'still in the textarea'
			})
		).not.toThrow();
		expect(
			readBrowserDraft(storage, {
				scope: '/review/1',
				owner: 'reviewer-1',
				baseline: 'v1',
				parse: parseText
			})
		).toEqual({ status: 'empty' });
	});

	it('does not hide values the caller failed to make serializable', () => {
		const storage = fakeStorage();

		expect(() =>
			writeBrowserDraft(storage, {
				scope: '/review/1',
				owner: 'reviewer-1',
				baseline: 'v1',
				value: 1n
			})
		).toThrow(TypeError);
	});
});
