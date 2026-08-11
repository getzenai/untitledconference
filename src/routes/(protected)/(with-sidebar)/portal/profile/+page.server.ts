/**
 * The speaker's own profile page (SPK-08).
 *
 * The portal's other pages are read-mostly views of what an organizer decided.
 * This one is the speaker's side of the record: the bio, title and company that
 * end up on the public speaker page, and the headshot that goes with them.
 */
import { collectSpeakerLinks, SPEAKER_LINK_ROWS } from '$lib/conference/speaker-links';
import { REJECTION_MESSAGES, rejectUpload } from '$lib/conference/upload-limits';
import { uploadsBucket } from '$lib/server/conference/deliverable-storage';
import {
	headshotHref,
	headshotObjectKey,
	myProfiles,
	ownsProfile,
	setOwnHeadshot,
	updateOwnProfile,
	type ProfileEdit
} from '$lib/server/conference/speaker-profile';
import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

/** Only what a browser can actually paint as a face. */
const HEADSHOT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) error(401, 'Sign in to edit your profile');

	return {
		profiles: await myProfiles(locals.user.id),
		account: { name: locals.user.name, email: locals.user.email }
	};
};

function profileId(form: FormData): number | null {
	const id = Number(form.get('profileId'));
	return Number.isInteger(id) && id > 0 ? id : null;
}

/** Everything the save action needs out of the form, or the reason it cannot. */
function readProfileEdit(
	form: FormData
): { ok: true; edit: ProfileEdit } | { ok: false; error: string } {
	const name = String(form.get('name') ?? '');
	if (!name.trim()) return { ok: false, error: 'Your name cannot be empty.' };

	const links = collectSpeakerLinks(
		Array.from({ length: SPEAKER_LINK_ROWS }, (_, i) => ({
			label: String(form.get(`linkLabel${i}`) ?? ''),
			url: String(form.get(`linkUrl${i}`) ?? '')
		}))
	);
	if (!links.ok) {
		return {
			ok: false,
			error: `That is not a link we can publish — use a full http:// or https:// address (row ${links.index + 1}).`
		};
	}

	return {
		ok: true,
		edit: {
			name,
			sortName: String(form.get('sortName') ?? ''),
			jobTitle: String(form.get('jobTitle') ?? ''),
			company: String(form.get('company') ?? ''),
			bio: String(form.get('bio') ?? ''),
			links: links.links
		}
	};
}

export const actions: Actions = {
	save: async ({ request, locals }) => {
		if (!locals.user) error(401, 'Sign in to edit your profile');

		const form = await request.formData();
		const id = profileId(form);
		if (id === null) return fail(400, { error: 'Unknown profile.' });

		const edit = readProfileEdit(form);
		if (!edit.ok) return fail(400, { profileId: id, error: edit.error });

		const saved = await updateOwnProfile(locals.user.id, id, edit.edit);

		// One answer for "no such profile" and "not yours": a 403 would confirm
		// which profile ids exist.
		if (!saved) error(404, 'No such profile');

		return { profileId: id, message: 'Profile saved.' };
	},

	/**
	 * Stores the bytes, then points the profile at them.
	 *
	 * The opposite order from the deliverable upload, and for the mirror-image
	 * reason: there a row without an object is a broken download, here a
	 * `headshotUrl` pointing at an object that was never written is a broken
	 * image on a public page. Bytes first, column second, in both cases.
	 */
	headshot: async ({ request, locals, platform }) => {
		if (!locals.user) error(401, 'Sign in to edit your profile');

		const form = await request.formData();
		const id = profileId(form);
		if (id === null) return fail(400, { error: 'Unknown profile.' });

		const file = form.get('headshot');
		if (!(file instanceof File)) return fail(400, { profileId: id, error: 'Choose a file first.' });

		const rejection = rejectUpload(file);
		if (rejection) return fail(400, { profileId: id, error: REJECTION_MESSAGES[rejection] });

		// `rejectUpload` accepts every deliverable kind, PDFs and slide decks
		// included. This is the narrower question: a headshot has to render as an
		// image or the public page shows a broken one.
		if (!HEADSHOT_TYPES.includes(file.type)) {
			return fail(400, { profileId: id, error: 'A headshot must be a JPEG, PNG or WebP image.' });
		}

		const bucket = uploadsBucket(platform);
		if (!bucket) return fail(503, { profileId: id, error: REJECTION_MESSAGES.no_storage });

		// Ownership is checked before a byte is written, not after: the object key
		// is derived from the profile id, so an unchecked id would let anyone who
		// can count overwrite somebody else's face. The later `setOwnHeadshot`
		// re-checks it in its own `where` — this is the check that has to happen
		// first, not the only one.
		if (!(await ownsProfile(locals.user.id, id))) error(404, 'No such profile');

		await bucket.put(headshotObjectKey(id), await file.arrayBuffer(), {
			httpMetadata: { contentType: file.type }
		});

		const claimed = await setOwnHeadshot(locals.user.id, id, headshotHref(id, Date.now()));
		if (!claimed) error(404, 'No such profile');

		return { profileId: id, message: 'Headshot updated.' };
	},

	removeHeadshot: async ({ request, locals }) => {
		if (!locals.user) error(401, 'Sign in to edit your profile');

		const form = await request.formData();
		const id = profileId(form);
		if (id === null) return fail(400, { error: 'Unknown profile.' });

		const cleared = await setOwnHeadshot(locals.user.id, id, null);
		if (!cleared) error(404, 'No such profile');

		// The object is left in the bucket. Nothing serves it once the column is
		// null, and a delete that races a re-upload would take the new photo.
		return { profileId: id, message: 'Headshot removed.' };
	}
};
