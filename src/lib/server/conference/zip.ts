/**
 * A ZIP file, written by hand, stored rather than compressed.
 *
 * Hand-written for two reasons. The bytes an organizer downloads are slide decks,
 * headshots and PDFs — already compressed, every one of them — so deflating them
 * would spend CPU on a worker to make the file very slightly larger. And the
 * format needed for that is small enough to read in one sitting: three record
 * types, one checksum, no state.
 *
 * Nothing here streams. The whole archive is built in memory, which is why the
 * caller has to bound what it hands in — `MAX_ZIP_BYTES` in the route that uses
 * it. A worker that runs out of memory does not return a partial ZIP, it returns
 * nothing, and the organizer cannot tell that from the feature being broken.
 */

/** The one checksum ZIP requires, as its own table so the loop stays a loop. */
const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n += 1) {
		let c = n;
		for (let k = 0; k < 8; k += 1) {
			c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		}
		table[n] = c >>> 0;
	}
	return table;
})();

export function crc32(bytes: Uint8Array): number {
	let c = 0xffffffff;
	for (let i = 0; i < bytes.length; i += 1) {
		c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
	}
	return (c ^ 0xffffffff) >>> 0;
}

/**
 * A timestamp in the two 16-bit words MS-DOS used in 1980, which is what ZIP
 * still carries.
 *
 * Two seconds of resolution and no year before 1980 — anything earlier is
 * clamped rather than allowed to wrap, because a negative year field produces a
 * date some readers refuse and others render as garbage.
 */
function dosDateTime(date: Date): { time: number; date: number } {
	const year = Math.max(date.getUTCFullYear(), 1980);
	return {
		time:
			(date.getUTCHours() << 11) |
			(date.getUTCMinutes() << 5) |
			(Math.floor(date.getUTCSeconds() / 2) & 0x1f),
		date: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate()
	};
}

export type ZipEntry = {
	/** The path inside the archive. Forward slashes make folders. */
	name: string;
	data: Uint8Array;
	/** What the file's date reads as once extracted. Defaults to the DOS epoch. */
	modifiedAt?: Date;
};

/** A little-endian writer, because every field in this format is little-endian. */
class Writer {
	private readonly parts: Uint8Array[] = [];
	private length = 0;

	/** How many bytes are written so far — the offset a central directory record needs. */
	get offset(): number {
		return this.length;
	}

	bytes(value: Uint8Array): void {
		this.parts.push(value);
		this.length += value.length;
	}

	u16(value: number): void {
		this.bytes(new Uint8Array([value & 0xff, (value >>> 8) & 0xff]));
	}

	u32(value: number): void {
		this.bytes(
			new Uint8Array([
				value & 0xff,
				(value >>> 8) & 0xff,
				(value >>> 16) & 0xff,
				(value >>> 24) & 0xff
			])
		);
	}

	finish(): Uint8Array {
		const out = new Uint8Array(this.length);
		let at = 0;
		for (const part of this.parts) {
			out.set(part, at);
			at += part.length;
		}
		return out;
	}
}

/**
 * Two files called `slides.pdf` are two different files.
 *
 * A ZIP happily holds both, and then every extractor resolves the collision its
 * own way — one silently overwrites, another asks, a third writes both and
 * leaves the organizer guessing which speaker's deck is which. Numbering here
 * makes that decision once, visibly, in the name.
 */
function uniqueNames(entries: ZipEntry[]): string[] {
	const seen = new Map<string, number>();

	return entries.map(({ name }) => {
		const taken = seen.get(name.toLowerCase());
		if (taken === undefined) {
			seen.set(name.toLowerCase(), 1);
			return name;
		}

		seen.set(name.toLowerCase(), taken + 1);
		const dot = name.lastIndexOf('.');
		const stem = dot > 0 ? name.slice(0, dot) : name;
		const extension = dot > 0 ? name.slice(dot) : '';
		return `${stem} (${taken + 1})${extension}`;
	});
}

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
/** Bit 11: the name is UTF-8. Without it, anything non-ASCII is read as CP437. */
const UTF8_NAMES = 0x0800;
/** Method 0: the bytes are in there as they are. */
const STORED = 0;
/** 2.0 — what "stored, no encryption, no zip64" needs. */
const VERSION = 20;

/**
 * The entries as one archive.
 *
 * No zip64, so this holds up to 65535 files and 4 GB. Both are far above what the
 * route allows and far below where the format would need a second shape; a
 * caller that ever approaches either has a different problem than encoding.
 */
type Central = { name: Uint8Array; crc: number; size: number; offset: number; at: Date };

/** One file: its header, then its bytes. Returns what the directory will need later. */
function writeEntry(out: Writer, name: Uint8Array, entry: ZipEntry): Central {
	const at = entry.modifiedAt ?? new Date(Date.UTC(1980, 0, 1));
	const { time, date } = dosDateTime(at);
	const crc = crc32(entry.data);
	const offset = out.offset;

	out.u32(LOCAL_HEADER);
	out.u16(VERSION);
	out.u16(UTF8_NAMES);
	out.u16(STORED);
	out.u16(time);
	out.u16(date);
	out.u32(crc);
	// Stored: the two sizes are the same number, said twice.
	out.u32(entry.data.length);
	out.u32(entry.data.length);
	out.u16(name.length);
	out.u16(0);
	out.bytes(name);
	out.bytes(entry.data);

	return { name, crc, size: entry.data.length, offset, at };
}

/** One directory record — the copy a reader seeks to rather than scanning for. */
function writeDirectoryEntry(out: Writer, item: Central): void {
	const { time, date } = dosDateTime(item.at);

	out.u32(CENTRAL_HEADER);
	out.u16(VERSION);
	out.u16(VERSION);
	out.u16(UTF8_NAMES);
	out.u16(STORED);
	out.u16(time);
	out.u16(date);
	out.u32(item.crc);
	out.u32(item.size);
	out.u32(item.size);
	out.u16(item.name.length);
	out.u16(0);
	out.u16(0);
	out.u16(0);
	out.u16(0);
	out.u32(0);
	out.u32(item.offset);
	out.bytes(item.name);
}

/**
 * The entries as one archive.
 *
 * No zip64, so this holds up to 65535 files and 4 GB. Both are far above what the
 * route allows and far below where the format would need a second shape; a caller
 * that ever approaches either has a different problem than encoding.
 */
export function zipStore(entries: ZipEntry[]): Uint8Array {
	const names = uniqueNames(entries);
	const encoder = new TextEncoder();
	const out = new Writer();

	const central = entries.map((entry, index) =>
		writeEntry(out, encoder.encode(names[index]), entry)
	);

	const directoryStart = out.offset;
	for (const item of central) writeDirectoryEntry(out, item);
	const directorySize = out.offset - directoryStart;

	out.u32(END_OF_CENTRAL_DIRECTORY);
	out.u16(0);
	out.u16(0);
	out.u16(central.length);
	out.u16(central.length);
	out.u32(directorySize);
	out.u32(directoryStart);
	out.u16(0);

	return out.finish();
}

/**
 * A path inside the archive, safe to extract.
 *
 * Every component is a filename, never a traversal: an entry called
 * `../../etc/passwd` is a real attack on the person unzipping, and the names
 * here are assembled from stored data — a speaker's own display name among it.
 * Trusting that every past writer was careful is exactly the assumption that
 * makes this class of bug.
 */
export function zipPath(...parts: string[]): string {
	return parts
		.map((part) =>
			part
				// A separator inside a component would invent a folder nobody asked for.
				.replace(/[/\\]+/g, '-')
				// Control characters render as nothing and hide the rest of the name.
				// eslint-disable-next-line no-control-regex
				.replace(/[\u0000-\u001f]/g, '')
				// Leading dots are how `..` and dotfiles start; neither is a name.
				.replace(/^\.+/, '')
				.trim()
				.slice(0, 120)
		)
		.filter(Boolean)
		.join('/');
}
