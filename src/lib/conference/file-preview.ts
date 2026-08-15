/**
 * Which files we will render in place (#423).
 *
 * A sheet that goes blank on a .docx is worse than a download: the person
 * thinks the file is empty. So the rule is short and conservative — PDF and
 * ordinary images open, everything else stays a download with a sentence
 * saying why. SVG is out for the same reason it is out of the upload
 * allowlist: it can carry script.
 *
 * A stored content-type comes from an upload. If it is present and is not a
 * type we render, the name does not get a second vote — `slides.pdf` labelled
 * `text/html` must not become an iframe on our origin.
 */

export type FilePreviewKind = 'pdf' | 'image';

/** Types we will put in an <img> or send as Content-Disposition: inline. */
const IMAGE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']);

export function filenameFrom(value: string): string {
	try {
		const url = new URL(value);
		const last = url.pathname.split('/').filter(Boolean).pop();
		if (last) return decodeURIComponent(last);
	} catch {
		// A bare filename, not a URL.
	}
	return value.split(/[/\\]/).pop() ?? value;
}

/** Only http(s). A `javascript:` answer must not become an iframe src. */
export function isSafeFileUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return url.protocol === 'http:' || url.protocol === 'https:';
	} catch {
		return false;
	}
}

function mediaType(contentType: string | null): string {
	return (contentType ?? '').toLowerCase().split(';')[0]?.trim() ?? '';
}

export function filePreviewKind(
	nameOrUrl: string,
	contentType: string | null = null
): FilePreviewKind | null {
	const type = mediaType(contentType);
	if (type && type !== 'application/octet-stream') {
		if (type === 'application/pdf') return 'pdf';
		if (IMAGE_TYPES.has(type)) return 'image';
		return null;
	}

	const name = filenameFrom(nameOrUrl).toLowerCase();
	if (name.endsWith('.pdf')) return 'pdf';
	if (/\.(jpe?g|png|webp|gif)$/.test(name)) return 'image';
	return null;
}

/**
 * The Content-Type to send with `inline`, or null to keep `attachment`.
 *
 * The stored type is not passed through: an uploaded `text/html` named
 * `slides.pdf` would otherwise execute on our domain. When we inline, the
 * header is a type we chose, not the one the uploader claimed.
 */
export function inlineContentType(
	nameOrUrl: string,
	contentType: string | null = null
): string | null {
	const kind = filePreviewKind(nameOrUrl, contentType);
	if (!kind) return null;

	const type = mediaType(contentType);
	if (kind === 'pdf') return 'application/pdf';
	if (IMAGE_TYPES.has(type)) return type === 'image/jpg' ? 'image/jpeg' : type;

	const name = filenameFrom(nameOrUrl).toLowerCase();
	if (name.endsWith('.png')) return 'image/png';
	if (name.endsWith('.webp')) return 'image/webp';
	if (name.endsWith('.gif')) return 'image/gif';
	if (/\.jpe?g$/.test(name)) return 'image/jpeg';
	return null;
}
