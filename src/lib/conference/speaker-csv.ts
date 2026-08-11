/**
 * Reading a speaker list out of a spreadsheet (SPK-03 / CRM-05).
 *
 * A roster does not start in this product. It starts in the spreadsheet the
 * programme committee has been arguing over for months, and the first thing an
 * organizer wants is that spreadsheet in here — not forty rounds of "Add a
 * speaker". Typing them one at a time is the reason the roster stays empty and
 * everything downstream (tasks, deliverables, the agenda) has nobody to attach to.
 *
 * Everything here is text in, rows out. It knows nothing about a conference or a
 * database, so the two hard parts — what CSV actually is, and which column means
 * what — can be read and tested without one.
 */

/** Matches the `name`/`sort_name` columns these rows land in. */
export const MAX_NAME = 200;
/**
 * The most rows one paste may carry.
 *
 * A bound on the transaction that follows rather than a database limit: an import
 * is one round trip pair per row, so this is what keeps the worst case a few
 * seconds instead of a request nobody knows the end of. A refusal that names its
 * own number is also something an organizer can act on — split the file — which
 * "something went wrong" is not.
 */
export const MAX_ROWS = 500;

/**
 * A CSV file, as rows of cells (RFC 4180).
 *
 * Hand-written rather than delegated, for the same reason `csvFile` is: every
 * interesting thing about CSV is a small detail that looks like nothing. A comma
 * inside a company name, a newline inside a bio, `""` for a literal quote — each
 * one turns a correct-looking file into a wrong import somewhere in the middle,
 * silently. The rules are all here, in this file, next to their tests.
 *
 * The shape is a loop over cells: `readCell` says where one ends and what ended
 * it, and this function only has to decide when a row is finished.
 */
export function parseCsv(text: string): string[][] {
	// A BOM is what our own export writes and what Excel leaves behind. Dropping it
	// here rather than at the call site: otherwise the first header is a "name" with
	// an invisible character glued to it, and the column nobody can see is the one
	// that fails to match. Written as an escape for that same reason — a BOM in
	// source is invisible, and an invisible character is one a later edit deletes.
	const input = text.startsWith('\uFEFF') ? text.slice(1) : text;

	const rows: string[][] = [];
	let row: string[] = [];
	let i = 0;
	let ended: CellEnd = 'file';

	while (i < input.length) {
		const cell = readCell(input, i);
		row.push(cell.value);
		i = cell.next;
		ended = cell.ended;

		if (ended !== 'cell') {
			rows.push(row);
			row = [];
		}
	}

	// A trailing comma is a last field that happens to be empty; a trailing newline
	// is not a row. The two look alike at the end of a string and are not.
	if (ended === 'cell') row.push('');
	if (row.length > 0) rows.push(row);

	return rows;
}

/** What stopped a cell: a comma, a line break, or running out of file. */
type CellEnd = 'cell' | 'row' | 'file';

/** One cell from `start`, its value, and where the next one begins. */
function readCell(input: string, start: number): { value: string; next: number; ended: CellEnd } {
	// A quote only opens a quoted field at the very start of a cell, so the quoted
	// run is read first and anything after it is plain text. `Bob "Bo" Vance` is a
	// name people actually have, and the other reading — an unterminated field
	// swallowing the rest of the file — is never what was meant.
	const opened = input[start] === '"' ? readQuoted(input, start + 1) : { value: '', next: start };

	let value = opened.value;
	let i = opened.next;

	while (i < input.length) {
		const char = input[i];
		if (char === ',') return { value, next: i + 1, ended: 'cell' };
		if (char === '\r' || char === '\n') {
			// CRLF is one break, not two: counting it twice puts a blank row between
			// every pair of rows in every file Excel on Windows has ever written.
			const next = char === '\r' && input[i + 1] === '\n' ? i + 2 : i + 1;
			return { value, next, ended: 'row' };
		}
		value += char;
		i += 1;
	}

	return { value, next: i, ended: 'file' };
}

/**
 * The inside of a quoted field: from just past the opening quote to just past the
 * closing one.
 */
function readQuoted(input: string, start: number): { value: string; next: number } {
	let value = '';
	let i = start;

	while (i < input.length) {
		if (input[i] !== '"') {
			value += input[i];
			i += 1;
			continue;
		}
		// A doubled quote is one literal quote; a lone one closes the field.
		if (input[i + 1] === '"') {
			value += '"';
			i += 2;
			continue;
		}
		return { value, next: i + 1 };
	}

	// An unclosed quote takes what is there rather than throwing the rest of the
	// file away: the row still has to survive long enough to be reported on.
	return { value, next: i };
}

/** The fields an imported row can carry. */
export type SpeakerCsvRow = {
	/** 1-based line in the file, so an error points at something the reader can see. */
	line: number;
	name: string;
	email: string | null;
	jobTitle: string | null;
	company: string | null;
	bio: string | null;
	notes: string | null;
	status: string | null;
};

type Field = Exclude<keyof SpeakerCsvRow, 'line'>;

/**
 * What a header cell may say for each field.
 *
 * Deliberately generous. The file comes from someone else's tool, and rejecting
 * `Full Name` because we wanted `name` teaches an organizer to edit a spreadsheet
 * until a machine likes it. Matching is on letters and digits only, so `Job Title`,
 * `job_title` and `JOBTITLE` are one column.
 */
const HEADER_ALIASES: Record<Field, string[]> = {
	name: ['name', 'fullname', 'speaker', 'speakername'],
	email: ['email', 'emailaddress', 'mail'],
	jobTitle: ['jobtitle', 'title', 'role', 'position'],
	company: ['company', 'organization', 'organisation', 'employer', 'affiliation'],
	bio: ['bio', 'biography', 'about'],
	notes: ['notes', 'note', 'comment', 'comments'],
	status: ['status', 'state']
};

function headerKey(cell: string): string {
	return cell.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Which column in this file holds which field. A field nobody wrote a header for is absent. */
function mapColumns(header: string[]): Map<Field, number> {
	const columns = new Map<Field, number>();
	for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [Field, string[]][]) {
		const index = header.findIndex((cell) => aliases.includes(headerKey(cell)));
		if (index !== -1) columns.set(field, index);
	}
	return columns;
}

function trimOrNull(value: string | undefined): string | null {
	const trimmed = value?.trim() ?? '';
	return trimmed === '' ? null : trimmed;
}

export type SpeakerCsvResult = { ok: true; rows: SpeakerCsvRow[] } | { ok: false; problem: string };

/**
 * A pasted or uploaded file as speaker rows, or one sentence saying why not.
 *
 * All-or-nothing on purpose, and the reason is retry rather than tidiness: an
 * import that lands rows 1–36 and dies on 37 leaves the organizer with no safe
 * move. Re-running the fixed file would add the first 36 a second time — rows
 * without an email have nothing to be recognised by — and picking through the
 * file by hand is the work they were trying to avoid. Refusing whole means the
 * fixed file can simply be sent again.
 */
export function readSpeakerCsv(text: string): SpeakerCsvResult {
	const rows = parseCsv(text);
	const blank = (cells: string[]) => cells.every((cell) => cell.trim() === '');
	if (rows.length === 0 || rows.every(blank)) return { ok: false, problem: 'That file is empty.' };

	const columns = mapColumns(rows[0]);

	// Without a name column there is nothing to create, and the likeliest cause is a
	// file whose first line is data rather than headers — worth saying, because the
	// fix ("add a header row") is not obvious from "no name column".
	if (!columns.has('name')) {
		return {
			ok: false,
			problem:
				'No “name” column. The first line has to be a header row — name, email, job title, company, bio, notes, status.'
		};
	}

	// Blank rows are dropped rather than rejected — a trailing newline is what every
	// editor leaves behind — but the line NUMBER still counts them, so "row 14" means
	// row 14 of the file the organizer is looking at.
	const body = rows
		.slice(1)
		.map((cells, offset) => ({ cells, line: offset + 2 }))
		.filter(({ cells }) => !blank(cells));

	if (body.length === 0) {
		return { ok: false, problem: 'That file has a header row and nothing else.' };
	}
	if (body.length > MAX_ROWS) {
		return {
			ok: false,
			problem: `That is ${body.length} rows; one import takes at most ${MAX_ROWS}. Split the file and send it in parts.`
		};
	}

	return readRows(body, columns);
}

/** One line of the body as a row, or the sentence that stops the whole import. */
function readRow(
	cells: string[],
	line: number,
	columns: Map<Field, number>
): SpeakerCsvRow | { problem: string } {
	const read = (field: Field): string | null => {
		const index = columns.get(field);
		return index === undefined ? null : trimOrNull(cells[index]);
	};

	const name = read('name');
	if (!name) return { problem: `Row ${line} has no name. Every speaker needs one.` };

	// The one thing checked about an email is that it is one. Not validation for its
	// own sake: the realistic way an import goes wrong is a column mapped to the wrong
	// thing, and a company name landing in `email` is silent — it becomes the key
	// every later import dedupes against. A missing `@` is the cheapest way to notice.
	const email = read('email');
	if (email !== null && !email.includes('@')) {
		return {
			problem: `Row ${line} has "${email}" as an email address. Check that the columns line up with the header.`
		};
	}

	return {
		line,
		name: name.slice(0, MAX_NAME),
		email,
		jobTitle: read('jobTitle'),
		company: read('company'),
		bio: read('bio'),
		notes: read('notes'),
		status: read('status')
	};
}

/** Every body line, or the first one that stops the import. */
function readRows(
	body: { cells: string[]; line: number }[],
	columns: Map<Field, number>
): SpeakerCsvResult {
	const rows: SpeakerCsvRow[] = [];
	for (const { cells, line } of body) {
		const row = readRow(cells, line, columns);
		if ('problem' in row) return { ok: false, problem: row.problem };
		rows.push(row);
	}
	return { ok: true, rows };
}

/**
 * What one import did, in the words the organizer reads back.
 *
 * The skipped names are spelled out rather than counted, the same rule the
 * structure lists follow: "3 were already there" out of a sixty-row file sends
 * somebody comparing lists by eye. Naming them is also what makes a second send
 * safe — a re-import adds nothing and says so, which is the difference between a
 * retry and a duplicate roster.
 */
export function importedMessage(added: number, skipped: string[]): string {
	const parts: string[] = [];
	parts.push(added === 1 ? 'Imported 1 speaker.' : `Imported ${added} speakers.`);
	if (skipped.length > 0) {
		parts.push(
			`${skipped.length === 1 ? 'This one was' : 'These were'} already on the roster, so nothing changed: ${skipped.join(', ')}.`
		);
	}
	return parts.join(' ');
}
