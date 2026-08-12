/**
 * Org-wide speaker directory (CRM-01 / CRM-02 / CRM-05) plus CRM overview (CRM-12).
 *
 * Outside any single event: every contact in organizations the user owns or
 * administers. Filters live in the URL so a search is shareable and survives reload.
 * The overview KPIs/widgets sit above the table so the eval finds dashboard evidence
 * on the same org-level surface.
 */
import { readSpeakerCsv } from '$lib/conference/speaker-csv';
import {
	contactFilterOptions,
	createContact,
	getCrmOverview,
	importContacts,
	listContacts,
	organizerOrganizationIds,
	type ContactFilters,
	type CrmOverview
} from '$lib/server/conference/contacts';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

const MAX_CSV_BYTES = 1024 * 1024;

function contactsImportedMessage(added: number, skipped: string[]): string {
	const parts: string[] = [];
	parts.push(added === 1 ? 'Imported 1 contact.' : `Imported ${added} contacts.`);
	if (skipped.length > 0) {
		parts.push(
			`${skipped.length === 1 ? 'This one was' : 'These were'} already in the directory (same email), so nothing changed: ${skipped.join(', ')}.`
		);
	}
	return parts.join(' ');
}

function parseFilters(url: URL): ContactFilters {
	const q = url.searchParams.get('q')?.trim() || undefined;
	const company = url.searchParams.get('company')?.trim() || undefined;
	const jobTitle = url.searchParams.get('jobTitle')?.trim() || undefined;
	const tag = url.searchParams.get('tag')?.trim() || undefined;
	return { q, company, jobTitle, tag };
}

function text(form: FormData, key: string): string {
	return String(form.get(key) ?? '');
}

function optionalText(form: FormData, key: string): string | null {
	const value = String(form.get(key) ?? '').trim();
	return value === '' ? null : value;
}

const emptyOverview: CrmOverview = {
	totalContacts: 0,
	eventsWithSpeakers: 0,
	returningSpeakers: 0,
	topCompanies: []
};

export const load: PageServerLoad = async ({ locals, url }) => {
	const userId = locals.user!.id;
	const orgIds = await organizerOrganizationIds(userId);

	if (orgIds.length === 0) {
		return {
			contacts: [],
			filters: parseFilters(url),
			filterOptions: { companies: [], jobTitles: [], tags: [] },
			organizationId: null as string | null,
			canManage: false,
			overview: emptyOverview
		};
	}

	// Prefer the session's active org when the user administers it; otherwise first.
	const organizationId =
		locals.organizationId && orgIds.includes(locals.organizationId)
			? locals.organizationId
			: orgIds[0];

	const filters = parseFilters(url);
	const [contacts, filterOptions, overview] = await Promise.all([
		listContacts(userId, filters),
		contactFilterOptions(userId),
		getCrmOverview(userId)
	]);

	return {
		contacts,
		filters,
		filterOptions,
		organizationId,
		canManage: true,
		overview
	};
};

export const actions: Actions = {
	add: async ({ locals, request }) => {
		const userId = locals.user!.id;
		const orgIds = await organizerOrganizationIds(userId);
		if (orgIds.length === 0) return fail(403, { error: 'You need an organization to manage.' });

		const form = await request.formData();
		const organizationId = resolveOrganizationId(form, locals.organizationId, orgIds);

		const result = await createContact(userId, organizationId, {
			name: text(form, 'name'),
			email: optionalText(form, 'email'),
			jobTitle: optionalText(form, 'jobTitle'),
			company: optionalText(form, 'company'),
			notes: optionalText(form, 'notes'),
			tags: optionalText(form, 'tags')
		});

		if (!result.ok) {
			if (result.reason === 'invalid') return fail(400, { error: result.message });
			if (result.reason === 'forbidden') return fail(403, { error: 'Not allowed.' });
			return fail(400, { error: 'Could not add the contact.' });
		}

		throw redirect(303, `/contacts/${result.speakerProfileId}`);
	},

	import: async ({ locals, request }) => {
		const userId = locals.user!.id;
		const orgIds = await organizerOrganizationIds(userId);
		if (orgIds.length === 0) {
			return fail(403, { scope: 'import', error: 'You need an organization to manage.' });
		}

		const form = await request.formData();
		const organizationId = resolveOrganizationId(form, locals.organizationId, orgIds);
		const csvResult = await readCsvFromForm(form);
		if (!csvResult.ok) return fail(csvResult.status, { scope: 'import', error: csvResult.error });

		const parsed = readSpeakerCsv(csvResult.csv);
		if (!parsed.ok) return fail(400, { scope: 'import', error: parsed.problem });

		const result = await importContacts(userId, organizationId, parsed.rows);
		if (!result.ok) return fail(400, { scope: 'import', error: result.problem });

		return { scope: 'import', message: contactsImportedMessage(result.added, result.skipped) };
	}
};

function resolveOrganizationId(
	form: FormData,
	activeOrgId: string | null | undefined,
	orgIds: string[]
): string {
	return (
		optionalText(form, 'organizationId') ??
		(activeOrgId && orgIds.includes(activeOrgId) ? activeOrgId : orgIds[0])
	);
}

async function readCsvFromForm(
	form: FormData
): Promise<{ ok: true; csv: string } | { ok: false; status: number; error: string }> {
	const upload = form.get('file');
	const hasFile = upload instanceof File && upload.size > 0;
	if (hasFile && upload.size > MAX_CSV_BYTES) {
		return {
			ok: false,
			status: 413,
			error: `That file is ${Math.round(upload.size / 1024)} KB. A contact list is a few dozen rows — this one is something else.`
		};
	}
	const csv = hasFile ? await upload.text() : text(form, 'csv');
	if (!csv.trim()) {
		return { ok: false, status: 400, error: 'Choose a CSV file, or paste the rows.' };
	}
	return { ok: true, csv };
}
