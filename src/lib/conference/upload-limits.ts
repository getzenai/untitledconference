/**
 * Limits the upload form and the server both need.
 *
 * Not under `$lib/server` because the form has to state the limit before a file
 * is chosen — a rule the submitter only learns about by breaking it is a bad
 * rule. The server enforces; this module is the single place the number lives.
 */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/**
 * What a speaker may hand in: slides, documents, and the images a headshot
 * request actually needs.
 *
 * An allowlist rather than a denylist. It is short because the deliverable kinds
 * are short; anything beyond this is a product decision, not a config tweak.
 *
 * `image/svg+xml` is absent deliberately: an SVG is a document that can carry
 * script, so it is the one image type that would turn "we accept headshots"
 * into "we host arbitrary markup". The download route serves everything as an
 * attachment with `nosniff`, but the cheapest place to refuse is here.
 */
export const ALLOWED_UPLOAD_TYPES = [
	'application/pdf',
	'image/jpeg',
	'image/png',
	'image/webp',
	'application/vnd.openxmlformats-officedocument.presentationml.presentation',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'text/plain',
	'text/markdown'
] as const;

/** The `accept` attribute, so the file picker filters before the server refuses. */
export const UPLOAD_ACCEPT = ALLOWED_UPLOAD_TYPES.join(',');

/**
 * Only what a browser can paint as a face. SVG is out of the deliverable
 * list already; it stays out here for the same reason.
 *
 * Extensions sit next to the MIME types because a MIME-only `accept` greys
 * out a `.PNG` (or a file with no extension) when the OS cannot map it to a
 * UTI — that is #625, not an allow-list that forgot PNG.
 */
export const HEADSHOT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const HEADSHOT_ACCEPT = [...HEADSHOT_TYPES, '.jpg', '.jpeg', '.png', '.webp'].join(',');

/**
 * The Content-Type we will store for a headshot, or null if it is not one.
 *
 * A MIME-only check is how #625 leaked through to the server: the picker now
 * lets a `.PNG` through when the OS cannot map it to a UTI, and the browser
 * then reports `application/octet-stream` or nothing. Trusting that report
 * refuses a file we just invited, and writing it onto the object makes the
 * public page serve a broken image. The extension is the same signal the
 * picker already accepted — use it only when the MIME is missing or generic.
 * A real, wrong type (`image/heic`, a PDF) still wins: we do not convert.
 */
export function headshotContentType(file: { name: string; type: string }): string | null {
	const type = file.type.toLowerCase().split(';')[0]?.trim() ?? '';
	if ((HEADSHOT_TYPES as readonly string[]).includes(type)) return type;
	if (type && type !== 'application/octet-stream') return null;
	return headshotTypeFromName(file.name);
}

function headshotTypeFromName(name: string): string | null {
	const base = name.toLowerCase().split(/[/\\]/).pop() ?? '';
	if (base.endsWith('.png')) return 'image/png';
	if (base.endsWith('.webp')) return 'image/webp';
	if (base.endsWith('.jpg') || base.endsWith('.jpeg')) return 'image/jpeg';
	return null;
}

export type UploadRejection = 'too_large' | 'unsupported_type' | 'empty' | 'no_storage';

export const REJECTION_MESSAGES: Record<UploadRejection, string> = {
	empty: 'That file is empty.',
	too_large: `Files must be smaller than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`,
	unsupported_type: 'That file type is not accepted. Use a PDF, image, slide deck or document.',
	no_storage: 'File storage is not configured on this deployment.'
};

/**
 * Checks a file before a byte is stored.
 *
 * The type comes from what the browser reported, which is not trustworthy — but
 * this is not the sandbox boundary. Nothing uploaded is executed, and the
 * download route serves everything as an attachment. This check exists so a
 * speaker who picks the wrong file learns immediately.
 */
export function rejectUpload(file: { size: number; type: string }): UploadRejection | null {
	if (file.size === 0) return 'empty';
	if (file.size > MAX_UPLOAD_BYTES) return 'too_large';
	if (!ALLOWED_UPLOAD_TYPES.includes(file.type as (typeof ALLOWED_UPLOAD_TYPES)[number])) {
		return 'unsupported_type';
	}
	return null;
}
