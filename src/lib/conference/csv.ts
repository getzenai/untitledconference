/**
 * Writing CSV that a spreadsheet reads back as what we wrote.
 *
 * Pure and on its own, because every interesting thing about CSV is a detail that
 * looks like nothing: a comma inside a talk title, a newline inside an abstract, a
 * title that begins with `=`. Each of them turns a correct-looking export into a
 * wrong one somewhere else, on somebody else's machine, hours later.
 */

/**
 * The characters that make Excel and Sheets treat a cell as a formula rather than
 * as text.
 *
 * A submission titled `=cmd|' /c calc'!A1` is a legitimate thing for a submitter to
 * type and a remote-code-execution attempt by the time the organizer opens the file.
 * The standing mitigation is to prefix the cell so the spreadsheet parses it as text;
 * the value survives, the formula does not. A leading tab would work too and is
 * invisible, which is exactly why it is worse: it changes the value without saying so.
 */
const FORMULA_LEAD = /^[=+\-@\t\r]/;

/** One cell: quoted when it has to be, defused when it would otherwise execute. */
export function csvCell(value: string | number | null | undefined): string {
	if (value === null || value === undefined) return '';

	const raw = String(value);
	const defused = FORMULA_LEAD.test(raw) ? `'${raw}` : raw;

	// Quote on any of the three characters that end a field or a record, and double
	// the quotes inside — the one escaping rule RFC 4180 actually has.
	return /[",\r\n]/.test(defused) ? `"${defused.replace(/"/g, '""')}"` : defused;
}

/**
 * A whole file, header included.
 *
 * CRLF line endings and a UTF-8 BOM, both for the same reader: Excel on Windows
 * opens a BOM-less UTF-8 file as the local codepage, which turns every non-ASCII
 * speaker name into mojibake. The BOM costs three bytes and every other tool
 * ignores it.
 */
export function csvFile(header: string[], rows: (string | number | null | undefined)[][]): string {
	const lines = [header, ...rows].map((cells) => cells.map(csvCell).join(','));
	// `\uFEFF` as an escape rather than the character itself: a BOM in source is
	// invisible, and an invisible character is one a later edit silently deletes.
	return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/**
 * A filename for `Content-Disposition`.
 *
 * Built from a slug that is user-supplied in principle (see issue #44), and a header
 * assembled from stored data must not depend on every earlier writer having been
 * careful: a carriage return in a header is a second header. Anything that is not a
 * plain filename character is dropped rather than replaced, and the result can never
 * be empty.
 *
 * Takes the extension because the hazard has nothing to do with CSV — the bulk file
 * download reuses it for `.zip`, and a second copy of this rule is a second place
 * for it to be got wrong.
 */
export function attachmentFilename(extension: string, ...parts: string[]): string {
	const stem = parts
		.map((part) => part.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, ''))
		.filter(Boolean)
		.join('-');

	return `${stem || 'export'}.${extension}`;
}

/** The same, for the exports that are CSV. */
export function csvFilename(...parts: string[]): string {
	return attachmentFilename('csv', ...parts);
}
