/** The portal task list should make repeated work scannable and accessible. */
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Page from './+page.svelte';

const task = (id: number, over: Partial<Record<string, unknown>> = {}) => ({
	id,
	submissionId: 75,
	title: 'Confirm participation',
	instructions: null,
	status: 'open',
	dueOn: null,
	conference: { slug: 'devflow-conf-2027', name: 'DevFlow Conf 2027' },
	submissionTitle: 'Build systems without the wait',
	...over
});

const draw = (tasks: ReturnType<typeof task>[]) =>
	render(Page, {
		props: {
			data: {
				tasks,
				submissions: [],
				account: { name: 'Priya Raman', email: 'priya@devflowconf.example' }
			}
		} as never
	}).body;

describe('speaker portal task list', () => {
	it('groups open tasks under their session instead of repeating its title on every row', () => {
		const body = draw([
			task(1),
			task(2, { title: 'Sign release' }),
			task(3, {
				submissionId: 93,
				title: 'Upload slides',
				submissionTitle: 'Practical event streaming'
			})
		]);

		expect(body.match(/Build systems without the wait/g)).toHaveLength(1);
		expect(body.match(/Practical event streaming/g)).toHaveLength(1);
		expect(body).toContain('href="/portal/tasks/1"');
		expect(body).toContain('href="/portal/tasks/2"');
		expect(body).toContain('href="/portal/tasks/3"');
	});

	it('groups tasks without a session as event-wide work', () => {
		const body = draw([
			task(4, { submissionId: null, submissionTitle: null, title: 'Complete bio and profile' })
		]);

		expect(body).toContain('Event-wide tasks');
		expect(body).toContain('Complete bio and profile');
	});

	it('keeps a finished task under its talk instead of in a separate list', () => {
		const body = draw([
			task(5, { status: 'done', title: 'Sign release' }),
			task(6, {
				status: 'done',
				submissionId: null,
				submissionTitle: null,
				title: 'Complete bio and profile'
			})
		]);

		// The talk title is on the screen, not only in an `aria-label` — that split
		// was the bug: a screen reader heard which talk, a sighted reader did not.
		expect(body).toContain('Build systems without the wait');
		expect(body).toContain('Event-wide tasks');
		expect(body).toContain('Sign release');
		expect(body).not.toContain('already done');
	});

	it('marks a finished task as done and drops its deadline', () => {
		const body = draw([
			task(7, { status: 'done', title: 'Sign release', dueOn: '2027-01-04' }),
			task(8, { title: 'Upload slides', dueOn: '2027-02-11' })
		]);

		expect(body).toContain('Done —');
		expect(body).toContain('1 of 2 done');
		// A finished task has no deadline left to meet; the open one keeps its own.
		expect(body).not.toContain('Mon, 4 Jan');
		expect(body).toContain('Thu, 11 Feb');
	});

	it('says nothing is waiting when every task is finished', () => {
		const body = draw([task(9, { status: 'done' })]);

		expect(body).toContain('Nothing is waiting on you — everything here is done.');
		// Still the talk's own list, so the tick is visible under the talk.
		expect(body).toContain('Build systems without the wait');
	});
});
