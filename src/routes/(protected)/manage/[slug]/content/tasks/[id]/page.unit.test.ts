import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Page from './+page.svelte';

const file = (id: number, version: number, contentType = 'application/pdf') => ({
	id,
	version,
	filename: `slides-v${version}.pdf`,
	contentType,
	sizeBytes: 1024,
	uploadedAt: new Date('2027-05-10T10:00:00Z'),
	approvalStatus: 'pending' as const,
	comments: []
});

const conference = {
	id: 1,
	organizationId: 'org-test',
	name: 'Test Conf',
	slug: 'test-conf',
	status: 'published' as const,
	venue: null,
	startsOn: null,
	endsOn: null,
	cfpIntro: null,
	statusBeforeArchive: null,
	listedPublicly: false,
	reviewVisibility: 'open' as const,
	createdAt: new Date('2027-01-01T00:00:00Z'),
	updatedAt: new Date('2027-01-01T00:00:00Z')
};

const task = {
	id: 10,
	conferenceId: 1,
	title: 'Upload headshot',
	speakerName: 'Ada Speaker',
	speakerEmail: 'ada@example.test',
	speakerHasAccount: true,
	status: 'submitted' as const,
	kind: 'file_request' as const,
	dueOn: null,
	instructions: null
};

const renderWith = (files: ReturnType<typeof file>[]) =>
	render(Page, {
		props: {
			data: {
				user: { id: 'organizer-1', name: 'Jordan' },
				speakerProfile: false,
				impersonating: null,
				analytics: { apiKey: undefined, host: undefined },
				conference,
				task,
				files
			},
			form: null
		}
	}).body;

describe('organizer headshot preview', () => {
	it('renders an inline thumbnail for an image file, downloaded from the same URL as the link', () => {
		const body = renderWith([file(201, 1, 'image/png')]);

		expect(body).toContain('<img');
		expect(body).toMatch(/<img[^>]*src="\/manage\/test-conf\/content\/files\/201"/);
		expect(body).toContain('loading="lazy"');
	});

	it('shows only the download link for a non-image file, no broken thumbnail', () => {
		const body = renderWith([file(202, 1, 'application/pdf')]);

		expect(body).not.toContain('<img');
		expect(body).toContain('/manage/test-conf/content/files/202');
	});
});

describe('organizer task file comments', () => {
	it('renders an independent comment form on a non-latest version', () => {
		const { body } = render(Page, {
			props: {
				data: {
					user: { id: 'organizer-1', name: 'Jordan' },
					speakerProfile: false,
					impersonating: null,
					analytics: { apiKey: undefined, host: undefined },
					conference: {
						id: 1,
						organizationId: 'org-test',
						name: 'Test Conf',
						slug: 'test-conf',
						status: 'published',
						venue: null,
						startsOn: null,
						endsOn: null,
						cfpIntro: null,
						statusBeforeArchive: null,
						listedPublicly: false,
						reviewVisibility: 'open',
						createdAt: new Date('2027-01-01T00:00:00Z'),
						updatedAt: new Date('2027-01-01T00:00:00Z')
					},
					task: {
						id: 10,
						conferenceId: 1,
						title: 'Upload slides',
						speakerName: 'Ada Speaker',
						speakerEmail: 'ada@example.test',
						speakerHasAccount: true,
						status: 'submitted',
						kind: 'file_request',
						dueOn: null,
						instructions: null
					},
					// The loader returns newest first. File 101 is deliberately old.
					files: [file(102, 2), file(101, 1)]
				},
				form: null
			}
		});

		const oldVersionForm = body.match(
			/<form[^>]*data-testid="organizer-comment-form-101"[^>]*>.*?<\/form>/s
		)?.[0];
		expect(oldVersionForm).toContain('action="?/comment"');
		expect(oldVersionForm).toContain('name="deliverableId" value="101"');
		expect(body.match(/action="\?\/comment"/g)).toHaveLength(2);
		expect(body.match(/action="\?\/decide"/g)).toHaveLength(1);
	});

	// #64: this page hangs off Speaker content and had the same defect — bounded,
	// but with no padding, so it sat flush against the rail and the window edge.
	it('pads its container away from the rail', () => {
		const { body } = render(Page, {
			props: {
				data: {
					user: { id: 'organizer-1', name: 'Jordan' },
					speakerProfile: false,
					impersonating: null,
					analytics: { apiKey: undefined, host: undefined },
					conference: {
						id: 1,
						organizationId: 'org-test',
						name: 'Test Conf',
						slug: 'test-conf',
						status: 'published',
						venue: null,
						startsOn: null,
						endsOn: null,
						cfpIntro: null,
						statusBeforeArchive: null,
						listedPublicly: false,
						reviewVisibility: 'open',
						createdAt: new Date('2027-01-01T00:00:00Z'),
						updatedAt: new Date('2027-01-01T00:00:00Z')
					},
					task: {
						id: 10,
						conferenceId: 1,
						title: 'Upload slides',
						speakerName: 'Ada Speaker',
						speakerEmail: 'ada@example.test',
						speakerHasAccount: true,
						status: 'open',
						kind: 'file_request',
						dueOn: null,
						instructions: null
					},
					files: []
				},
				form: null
			}
		});

		const container = body.match(/<div class="([^"]*max-w-3xl[^"]*)"/)?.[1];
		expect(container).toContain('px-6');
		expect(container).toContain('py-5');
	});
});
