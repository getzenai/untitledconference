import { allTools } from '$lib/server/mcp/server';
import { describe, expect, it } from 'vitest';
import {
	ALL_SUGGESTIONS,
	assistantDescription,
	assistantRole,
	assistantSuggestions
} from './assistant-suggestions';

const registry = new Set(
	allTools({ userId: 'user-1', organizationId: 'org-1' }).map((t) => t.name)
);

const AGENDA = '/(protected)/manage/[slug]/agenda';
const SETTINGS = '/(protected)/manage/[slug]/settings';
const PEOPLE = '/(protected)/manage/[slug]/people';
const ROUNDS = '/(protected)/manage/[slug]/rounds';
const SCORECARD = '/(protected)/(with-sidebar)/review/[slug]/[submissionId]';
const PORTAL = '/(protected)/(with-sidebar)/portal';
const HOME = '/(protected)/(with-sidebar)/home';
const ORG_SETTINGS = '/(protected)/(with-sidebar)/settings/organization/[slug]';
const UNKNOWN = '/(public)/c/[slug]/gallery';
const MANAGE_HOME = '/(protected)/manage/[slug]';
const SPEAKERS = '/(protected)/manage/[slug]/speakers';
const CONTENT = '/(protected)/manage/[slug]/content';
const CONTENT_FILES = '/(protected)/manage/[slug]/content/files';
const CONTENT_TASKS = '/(protected)/manage/[slug]/content/tasks';
const EMBED = '/(protected)/manage/[slug]/embed';
const CARRY_FORWARD = '/(protected)/manage/[slug]/carry-forward';

describe('assistantSuggestions', () => {
	it('maps every chip in the table to a tool the assistant actually has', () => {
		for (const chip of ALL_SUGGESTIONS) {
			expect(registry.has(chip.tool), chip.tool).toBe(true);
			expect(chip.text.trim().length).toBeGreaterThan(0);
		}
	});

	it('uses the fallback on an unknown route', () => {
		const chips = assistantSuggestions({ routeId: UNKNOWN });
		expect(chips.map((c) => c.tool)).toEqual([
			'list_my_conferences',
			'list_my_review_assignments',
			'list_my_proposals'
		]);
		expect(assistantSuggestions({ routeId: HOME })).toEqual(chips);
		expect(assistantSuggestions({ routeId: null })).toEqual(chips);
		expect(assistantSuggestions(undefined)).toEqual(chips);
	});

	it('names things that page can do, not a neighbour page', () => {
		expect(assistantSuggestions({ routeId: AGENDA }).map((c) => c.tool)).toEqual([
			'get_agenda_tray',
			'fill_schedule',
			'move_talk'
		]);
		expect(assistantSuggestions({ routeId: SETTINGS }).map((c) => c.tool)).toEqual([
			'create_room',
			'create_track',
			'create_session_format'
		]);
		expect(assistantSuggestions({ routeId: PEOPLE }).map((c) => c.tool)).toEqual([
			'list_reviewers',
			'invite_reviewer',
			'assign_reviews'
		]);
		expect(assistantSuggestions({ routeId: ROUNDS }).map((c) => c.tool)).toEqual([
			'list_review_rounds',
			'create_review_round',
			'assign_reviews'
		]);
		expect(assistantSuggestions({ routeId: SCORECARD }).map((c) => c.tool)).toContain(
			'submit_review'
		);
		expect(assistantSuggestions({ routeId: PORTAL }).map((c) => c.tool)).toContain(
			'list_my_proposals'
		);
		expect(assistantSuggestions({ routeId: ORG_SETTINGS }).map((c) => c.tool)).toEqual(
			assistantSuggestions({ routeId: HOME }).map((c) => c.tool)
		);
	});

	it('offers organizer work on manage pages that have no own row', () => {
		const expected = ['fill_schedule', 'decide_submissions', 'notify_speakers'];
		for (const routeId of [
			MANAGE_HOME,
			SPEAKERS,
			CONTENT,
			CONTENT_FILES,
			CONTENT_TASKS,
			EMBED,
			CARRY_FORWARD
		]) {
			expect(
				assistantSuggestions({ routeId }).map((c) => c.tool),
				routeId
			).toEqual(expected);
			expect(assistantRole(routeId)).toBe('organizer');
		}
	});
});

describe('assistantDescription', () => {
	it('names capabilities, not a page fence or a yes-card', () => {
		for (const routeId of [AGENDA, SCORECARD, PORTAL, HOME, null]) {
			const line = assistantDescription(routeId);
			expect(line).not.toMatch(/this page/i);
			expect(line).not.toMatch(/say yes/i);
			expect(line).not.toMatch(/once you/i);
			expect(line).not.toMatch(/ask about/i);
			expect(line.endsWith('.')).toBe(true);
			expect(line.split('.').filter(Boolean)).toHaveLength(1);
		}
	});

	it('differs by role', () => {
		expect(assistantRole(AGENDA)).toBe('organizer');
		expect(assistantRole(SCORECARD)).toBe('reviewer');
		expect(assistantRole(PORTAL)).toBe('speaker');
		expect(assistantRole(HOME)).toBe('anyone');
		expect(assistantDescription(AGENDA)).not.toBe(assistantDescription(SCORECARD));
		expect(assistantDescription(AGENDA)).toMatch(/schedule|submissions|mail/i);
		expect(assistantDescription(SCORECARD)).toMatch(/review/i);
		expect(assistantDescription(PORTAL)).toMatch(/proposal/i);
	});
});
