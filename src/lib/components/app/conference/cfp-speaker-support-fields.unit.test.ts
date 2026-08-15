/**
 * Dependent speaker-expense controls stay out of the DOM until the parent
 * answer makes them meaningful (#557). A hidden input would still post, so
 * absence — not `hidden` — is the test.
 */
import type { SpeakerSupport } from '$lib/conference/speaker-support';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Fields from './cfp-speaker-support-fields.svelte';

const bodyOf = (support: SpeakerSupport) => render(Fields, { props: { support } }).body;

describe('speaker-expense dependents stay out of the way (#557)', () => {
	it('does not put travel amounts, the split, nights or conditions in the DOM when nothing is covered', () => {
		const body = bodyOf({ travel: { kind: 'none' }, accommodation: { kind: 'none' } });

		expect(body).toContain('name="travelKind"');
		expect(body).toContain('name="accommodationKind"');
		expect(body).not.toContain('name="travelAmount"');
		expect(body).not.toContain('name="travelDomesticKind"');
		expect(body).not.toContain('name="travelDomesticAmount"');
		expect(body).not.toContain('name="travelInternationalKind"');
		expect(body).not.toContain('name="travelInternationalAmount"');
		expect(body).not.toContain('name="accommodationAmount"');
		expect(body).not.toContain('name="accommodationNights"');
		expect(body).not.toContain('name="accommodationDomesticNights"');
		expect(body).not.toContain('name="accommodationInternationalNights"');
		expect(body).not.toContain('name="supportConditions"');
	});

	it('asks for the travel amount only once travel is up_to', () => {
		const none = bodyOf({ travel: { kind: 'none' } });
		const upTo = bodyOf({ travel: { kind: 'up_to', amount: '€500' } });
		const caseByCase = bodyOf({ travel: { kind: 'case_by_case' } });

		expect(none).not.toContain('name="travelAmount"');
		expect(upTo).toContain('name="travelAmount"');
		expect(caseByCase).not.toContain('name="travelAmount"');
		expect(caseByCase).toContain('name="travelDomesticKind"');
	});

	it('asks for nights once accommodation is covered, and the amount only for up_to', () => {
		const covered = bodyOf({ accommodation: { kind: 'case_by_case' } });
		const upTo = bodyOf({ accommodation: { kind: 'up_to', amount: '€200' } });

		expect(covered).toContain('name="accommodationNights"');
		expect(covered).not.toContain('name="accommodationAmount"');
		expect(upTo).toContain('name="accommodationAmount"');
		expect(upTo).toContain('name="accommodationNights"');
	});
});
