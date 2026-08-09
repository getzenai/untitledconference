/**
 * What may be stored as a session's recording link.
 *
 * The value ends up in an `href` on a public page, which is the whole reason this is
 * a validator and not a trim(): `javascript:alert(1)` is a perfectly well-formed URL,
 * and a scheme allowlist is the only check that keeps it out. Blocking that at the
 * write side means every reader is safe without having to remember to be.
 */
export type RecordingUrlResult = { ok: true; url: string | null } | { ok: false; message: string };

const ALLOWED_PROTOCOLS = ['http:', 'https:'];

export function normalizeRecordingUrl(raw: string): RecordingUrlResult {
	const value = raw.trim();
	// An empty field is how the organizer takes a recording back down, so it is a
	// legal value rather than a validation error.
	if (value === '') return { ok: true, url: null };

	let parsed: URL;
	try {
		parsed = new URL(value);
	} catch {
		return {
			ok: false,
			message: 'That is not a link. Paste the full address, including https://.'
		};
	}

	if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
		return { ok: false, message: 'Only http and https links can be published.' };
	}

	return { ok: true, url: parsed.toString() };
}
