import { describe, expect, it } from 'vitest';
import { TALK_TITLE_MAX } from './proposal-limits';
import {
	parkableTalkContent,
	parseTalkContentDraft,
	sameTalkContent,
	talkContentBaseline,
	talkContentDraftScope,
	type TalkContentDraft
} from './talk-content-draft';

const saved: TalkContentDraft = {
	title: 'Keeps its name',
	abstract: 'The stored abstract.',
	keyTakeaway: 'A point',
	audienceLevel: 'Beginner'
};

describe('parkableTalkContent', () => {
	it('keeps an abstract Save would accept, even when the title is empty', () => {
		expect(
			parkableTalkContent(
				{ title: '', abstract: 'Rewritten for the programme.', keyTakeaway: '', audienceLevel: '' },
				saved,
				'submitted'
			)
		).toEqual({
			title: saved.title,
			abstract: 'Rewritten for the programme.',
			keyTakeaway: '',
			audienceLevel: ''
		});
	});

	it('does not park an emptied abstract on a submitted talk', () => {
		expect(
			parkableTalkContent(
				{
					title: 'Still titled',
					abstract: '   ',
					keyTakeaway: saved.keyTakeaway,
					audienceLevel: ''
				},
				saved,
				'submitted'
			)
		).toEqual({
			title: 'Still titled',
			abstract: saved.abstract,
			keyTakeaway: saved.keyTakeaway,
			audienceLevel: ''
		});
	});

	it('does park a blank abstract on a draft', () => {
		expect(parkableTalkContent({ ...saved, abstract: '' }, saved, 'draft')).toEqual({
			...saved,
			abstract: ''
		});
	});

	it('does not park an overlong title', () => {
		const tooLong = 'T'.repeat(TALK_TITLE_MAX + 1);
		expect(parkableTalkContent({ ...saved, title: tooLong }, saved, 'accepted').title).toBe(
			saved.title
		);
	});
});

describe('talk content draft helpers', () => {
	it('names the draft by conference and talk, not by the current path', () => {
		expect(talkContentDraftScope('devflow-conf-2027', 29)).toBe(
			'talk-content:devflow-conf-2027:29'
		);
	});

	it('treats field order as identity, not as a different draft', () => {
		const a = { ...saved };
		const b = {
			audienceLevel: saved.audienceLevel,
			keyTakeaway: saved.keyTakeaway,
			abstract: saved.abstract,
			title: saved.title
		};
		expect(sameTalkContent(a, b)).toBe(true);
		expect(talkContentBaseline(a)).toBe(talkContentBaseline(b));
	});

	it('rejects a payload that is not the four strings', () => {
		expect(parseTalkContentDraft(null)).toBeNull();
		expect(parseTalkContentDraft({ title: 'only' })).toBeNull();
		expect(parseTalkContentDraft(saved)).toEqual(saved);
	});
});
