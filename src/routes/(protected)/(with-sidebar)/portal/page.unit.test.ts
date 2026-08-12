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

	it('gives completed task links a stable accessible name', () => {
		const body = draw([
			task(5, { status: 'done', title: 'Sign release' }),
			task(6, {
				status: 'done',
				submissionId: null,
				submissionTitle: null,
				title: 'Complete bio and profile'
			})
		]);

		expect(body).toContain(
			'aria-label="Sign release — Build systems without the wait, DevFlow Conf 2027"'
		);
		expect(body).toContain('aria-label="Complete bio and profile — DevFlow Conf 2027"');
	});
});
