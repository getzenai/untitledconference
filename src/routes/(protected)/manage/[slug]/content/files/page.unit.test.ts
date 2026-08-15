/**
 * The files library surface (CNT-13 / CNT-14).
 */
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Page from './+page.svelte';

const conference = {
	id: 1,
	organizationId: 'org-test',
	name: 'DevFlow Conf',
	slug: 'devflow-conf-2027',
	status: 'published' as const,
	venue: null,
	startsOn: null,
	endsOn: null,
	cfpIntro: null,
	reviewVisibility: 'open' as const,
	createdAt: new Date('2027-01-01T00:00:00Z'),
	updatedAt: new Date('2027-01-01T00:00:00Z')
};

const file = (over: Partial<Record<string, unknown>> = {}) => ({
	id: 7,
	filename: 'slides.pdf',
	contentType: 'application/pdf',
	sizeBytes: 2048,
	version: 2,
	isLatest: true,
	approvalStatus: 'pending',
	uploadedAt: new Date('2027-04-02T10:00:00Z'),
	taskId: 3,
	taskTitle: 'Upload final slides',
	speakerProfileId: 5,
	speakerName: 'Priya Raman',
	sessionTitle: 'Shipping on Fridays',
	...over
});

const props = (files: unknown[]) => ({
	data: {
		user: { id: 'organizer-1', name: 'Jordan' },
		impersonating: null,
		analytics: { apiKey: undefined, host: undefined },
		conference,
		files
	} as never
});

describe('files library page', () => {
	it('lists a file with the speaker and task it is filed under, and a way to select it', () => {
		const { body } = render(Page, { props: props([file()]) });

		expect(body).toContain('slides.pdf');
		expect(body).toContain('Priya Raman');
		expect(body).toContain('Upload final slides');
		expect(body).toContain('Shipping on Fridays');
		expect(body).toContain('name="id"');
		expect(body).toContain('action="/manage/devflow-conf-2027/content/files/download"');
		expect(body).toContain('data-testid="file-open"');
		expect(body).toContain('/manage/devflow-conf-2027/content/files/7');
		expect(body).toContain('Back to speaker materials');
		expect(body).not.toContain('speaker content');
	});

	it('leaves a type we cannot render as a download, with the sentence saying why', () => {
		const { body } = render(Page, {
			props: props([
				file({
					id: 9,
					filename: 'notes.docx',
					contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
				})
			])
		});

		expect(body).toContain('notes.docx');
		expect(body).not.toContain('data-testid="file-open"');
		expect(body).toContain('We cannot show this type here — download it instead.');
	});

	// The second option lives in the popover the shadcn select opens, so it is not
	// in the server's HTML at all. What a server render can still prove is the
	// part the download action depends on: the hidden input that carries `group`,
	// and the choice it starts on.
	it('offers the grouping choice the archive is built from', () => {
		const { body } = render(Page, { props: props([file()]) });

		expect(body).toContain('name="group"');
		expect(body).toContain('One folder per speaker');
		expect(body).toContain('data-testid="app-select-group"');
	});

	it('hides superseded versions until asked, rather than dropping them', () => {
		const { body } = render(Page, {
			props: props([file(), file({ id: 8, version: 1, isLatest: false, filename: 'old.pdf' })])
		});

		// Default is latest-only, so the superseded row is not in the table — but the
		// switch that brings it back is, which is the difference between a filter and
		// a feature that lost the history.
		expect(body).toContain('slides.pdf');
		expect(body).not.toContain('old.pdf');
		expect(body).toContain('Latest version of each task only');
	});

	it('says which of the two empties it is', () => {
		expect(render(Page, { props: props([]) }).body).toContain('Nothing has been handed in yet');
	});
});
