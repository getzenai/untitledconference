/**
 * The three coverage shapes, and the one that must stay silent (#512).
 *
 * Unset is the whole point of the field: a call that has never answered
 * "do you cover my flight?" must not start saying "not covered" just because
 * we added a column. The public page and the portal both render from
 * `speakerSupportLines`, so the wording is pinned here, once.
 */
import { describe, expect, it } from 'vitest';
import {
	hasSpeakerSupport,
	parseSpeakerSupport,
	serializeSpeakerSupport,
	speakerSupportFromForm,
	speakerSupportLines,
	type SpeakerSupport
} from './speaker-support';

describe('an unset call', () => {
	it('reads nothing from null, empty or garbage, and serializes back to null', () => {
		expect(parseSpeakerSupport(null)).toEqual({});
		expect(parseSpeakerSupport(undefined)).toEqual({});
		expect(parseSpeakerSupport('')).toEqual({});
		expect(parseSpeakerSupport('not-json')).toEqual({});
		expect(parseSpeakerSupport('[]')).toEqual({});
		expect(parseSpeakerSupport('{"admission":"maybe"}')).toEqual({});
		expect(serializeSpeakerSupport({})).toBeNull();
		expect(hasSpeakerSupport({})).toBe(false);
		expect(speakerSupportLines({})).toEqual([]);
	});
});

describe('the three coverage shapes', () => {
	it('names free, discounted and not-covered admission', () => {
		expect(speakerSupportLines({ admission: 'free' })).toEqual([
			{ key: 'admission', label: 'Admission', text: 'Free for speakers' }
		]);
		expect(speakerSupportLines({ admission: 'discounted' })).toEqual([
			{ key: 'admission', label: 'Admission', text: 'Discounted for speakers' }
		]);
		expect(speakerSupportLines({ admission: 'none' })).toEqual([
			{ key: 'admission', label: 'Admission', text: 'Not covered' }
		]);
	});

	it('names travel as not covered, up to an amount, or case by case', () => {
		expect(speakerSupportLines({ travel: { kind: 'none' } })).toEqual([
			{ key: 'travel', label: 'Travel', text: 'Not covered' }
		]);
		expect(speakerSupportLines({ travel: { kind: 'up_to', amount: '€500' } })).toEqual([
			{ key: 'travel', label: 'Travel', text: 'Covered up to €500' }
		]);
		expect(speakerSupportLines({ travel: { kind: 'case_by_case' } })).toEqual([
			{ key: 'travel', label: 'Travel', text: 'Covered case by case' }
		]);
	});

	it('splits travel into domestic and international when both are set', () => {
		const lines = speakerSupportLines({
			travel: {
				domestic: { kind: 'up_to', amount: '€300' },
				international: { kind: 'case_by_case' }
			}
		});
		expect(lines).toEqual([
			{
				key: 'travel',
				label: 'Travel',
				text: 'Domestic: covered up to €300. International: covered case by case'
			}
		]);
	});

	it('names accommodation nights and the same three coverage forms', () => {
		expect(speakerSupportLines({ accommodation: { kind: 'none' } })).toEqual([
			{ key: 'accommodation', label: 'Accommodation', text: 'Not covered' }
		]);
		expect(
			speakerSupportLines({ accommodation: { kind: 'up_to', amount: '€200', nights: 2 } })
		).toEqual([
			{
				key: 'accommodation',
				label: 'Accommodation',
				text: '2 nights, covered up to €200'
			}
		]);
		expect(
			speakerSupportLines({
				accommodation: { kind: 'case_by_case', domesticNights: 2, internationalNights: 3 }
			})
		).toEqual([
			{
				key: 'accommodation',
				label: 'Accommodation',
				text: '2 nights domestic, 3 nights international, covered case by case'
			}
		]);
	});
});

describe('round-trip', () => {
	const full: SpeakerSupport = {
		admission: 'free',
		travel: {
			kind: 'up_to',
			amount: 'economy',
			domestic: { kind: 'up_to', amount: '€400' },
			international: { kind: 'case_by_case' }
		},
		accommodation: { kind: 'case_by_case', domesticNights: 2, internationalNights: 3 },
		conditions: 'for selected speakers'
	};

	it('keeps a fully stated policy and drops blank extras', () => {
		const stored = serializeSpeakerSupport(full);
		expect(stored).toBeTruthy();
		expect(parseSpeakerSupport(stored)).toEqual(full);
		expect(hasSpeakerSupport(full)).toBe(true);
	});

	it('reads the same names the settings form posts', () => {
		const form = new FormData();
		form.set('admission', 'free');
		form.set('travelKind', 'up_to');
		form.set('travelAmount', 'economy');
		form.set('travelDomesticKind', 'up_to');
		form.set('travelDomesticAmount', '€400');
		form.set('travelInternationalKind', 'case_by_case');
		form.set('accommodationKind', 'case_by_case');
		form.set('accommodationDomesticNights', '2');
		form.set('accommodationInternationalNights', '3');
		form.set('supportConditions', '  for selected speakers  ');
		expect(speakerSupportFromForm(form)).toEqual(full);
	});

	it('treats an emptied form as unset, not as not-covered', () => {
		const form = new FormData();
		form.set('admission', 'unset');
		form.set('travelKind', '');
		form.set('accommodationKind', 'unset');
		form.set('supportConditions', '   ');
		expect(speakerSupportFromForm(form)).toEqual({});
		expect(serializeSpeakerSupport(speakerSupportFromForm(form))).toBeNull();
	});
});

describe('a withdrawn coverage must not keep its amount (#557)', () => {
	it('drops a travel amount when the organizer sets travel to none', () => {
		const form = new FormData();
		form.set('travelKind', 'none');
		form.set('travelAmount', '€500');
		form.set('travelDomesticKind', 'up_to');
		form.set('travelDomesticAmount', '€200');
		form.set('travelInternationalKind', 'case_by_case');

		expect(speakerSupportFromForm(form)).toEqual({ travel: { kind: 'none' } });
	});

	it('keeps the amount only while the kind is still up_to', () => {
		const form = new FormData();
		form.set('travelKind', 'up_to');
		form.set('travelAmount', '€500');

		expect(speakerSupportFromForm(form)).toEqual({
			travel: { kind: 'up_to', amount: '€500' }
		});
	});

	it('drops nights and conditions when nothing is covered', () => {
		const form = new FormData();
		form.set('admission', 'none');
		form.set('accommodationKind', 'none');
		form.set('accommodationAmount', '€200');
		form.set('accommodationNights', '2');
		form.set('supportConditions', 'for selected speakers');

		expect(speakerSupportFromForm(form)).toEqual({
			admission: 'none',
			accommodation: { kind: 'none' }
		});
	});
});
