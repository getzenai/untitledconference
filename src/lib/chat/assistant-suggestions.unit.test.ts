import { allTools } from '$lib/server/mcp/server';
import { describe, expect, it } from 'vitest';
import { assistantDescription, assistantRole, assistantSuggestions } from './assistant-suggestions';

const registry = new Set(
	allTools({ userId: 'user-1', organizationId: 'org-1' }).map((t) => t.name)
);

const AGENDA = '/(protected)/manage/[slug]/agenda';
const SETTINGS = '/(protected)/manage/[slug]/settings';
const CFP = '/(protected)/manage/[slug]/cfp';
const DECISIONS = '/(protected)/manage/[slug]/decisions';
const PEOPLE = '/(protected)/manage/[slug]/people';
const ROUNDS = '/(protected)/manage/[slug]/rounds';
const SUBMISSIONS = '/(protected)/manage/[slug]/submissions';
const DASHBOARD = '/(protected)/manage/[slug]/dashboard';
const NEW_CONF = '/(protected)/(with-sidebar)/manage/new';
const MANAGE_LIST = '/(protected)/(with-sidebar)/manage';
const SCORECARD = '/(protected)/(with-sidebar)/review/[slug]/[submissionId]';
const REVIEW_QUEUE = '/(protected)/(with-sidebar)/review';
const PORTAL = '/(protected)/(with-sidebar)/portal';
const HOME = '/(protected)/(with-sidebar)/home';
const CONTACTS = '/(protected)/(with-sidebar)/contacts';
const ORG_SETTINGS = '/(protected)/(with-sidebar)/settings/organization/[slug]';
const UNKNOWN = '/(public)/c/[slug]/gallery';

describe('assistantSuggestions', () => {
	it('maps every chip to a tool the assistant actually has', () => {
		const routes = [
			AGENDA,
			SETTINGS,
			CFP,
			DECISIONS,
			PEOPLE,
			ROUNDS,
			SUBMISSIONS,
			DASHBOARD,
			NEW_CONF,
			MANAGE_LIST,
			SCORECARD,
			REVIEW_QUEUE,
			PORTAL,
			HOME,
			CONTACTS,
			ORG_SETTINGS,
			UNKNOWN,
			'',
			null
		];
		for (const routeId of routes) {
			for (const chip of assistantSuggestions({ routeId })) {
				expect(registry.has(chip.tool), `${routeId ?? 'empty'} → ${chip.tool}`).toBe(true);
				expect(chip.text.trim().length).toBeGreaterThan(0);
			}
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
