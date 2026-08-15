/**
 * Which attachments the reviewer can read in place (#423).
 *
 * A sheet that goes blank on a .docx is worse than a download: the reviewer
 * thinks the file is empty. So the rule is short and conservative — PDF and
 * ordinary images open, everything else stays a download with a sentence
 * saying why. SVG is out for the same reason it is out of the upload
 * allowlist: it can carry script.
 */

export type FilePreviewKind = 'pdf' | 'image';

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

export function filePreviewKind(
	nameOrUrl: string,
	contentType: string | null = null
): FilePreviewKind | null {
	const type = (contentType ?? '').toLowerCase();
	if (type === 'application/pdf') return 'pdf';
	if (type.startsWith('image/') && type !== 'image/svg+xml') return 'image';

	const name = filenameFrom(nameOrUrl).toLowerCase();
	if (name.endsWith('.pdf')) return 'pdf';
	if (/\.(jpe?g|png|webp|gif)$/.test(name)) return 'image';
	return null;
}
