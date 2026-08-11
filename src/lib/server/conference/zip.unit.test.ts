/**
 * The ZIP writer.
 *
 * Two kinds of check, and both are needed. The structural ones read the bytes
 * back field by field, which is what makes a failure say where it is. The last
 * one hands the archive to the system `unzip` and asks it — because a ZIP that
 * every assertion here likes and no extractor opens is exactly the failure this
 * feature can have, and no amount of reading our own bytes with our own reader
 * would catch it.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { crc32, zipPath, zipStore } from './zip';

const bytes = (text: string) => new TextEncoder().encode(text);

const u16 = (zip: Uint8Array, at: number) => zip[at] | (zip[at + 1] << 8);
const u32 = (zip: Uint8Array, at: number) =>
	(zip[at] | (zip[at + 1] << 8) | (zip[at + 2] << 16) | (zip[at + 3] << 24)) >>> 0;

/** Where the end-of-central-directory record starts, given no archive comment. */
const eocdAt = (zip: Uint8Array) => zip.length - 22;

describe('crc32', () => {
	it('matches the published check value', () => {
		// The one every CRC-32 implementation is measured against: "123456789".
		expect(crc32(bytes('123456789'))).toBe(0xcbf43926);
	});

	it('is zero for nothing', () => {
		expect(crc32(new Uint8Array())).toBe(0);
	});
});

describe('zipStore', () => {
	it('writes a local header, then the bytes, unchanged', () => {
		const zip = zipStore([{ name: 'notes.txt', data: bytes('hello') }]);

		expect(u32(zip, 0)).toBe(0x04034b50);
		expect(u16(zip, 8)).toBe(0); // stored, not deflated
		expect(u32(zip, 14)).toBe(crc32(bytes('hello')));
		expect(u32(zip, 18)).toBe(5); // compressed size
		expect(u32(zip, 22)).toBe(5); // uncompressed size — the same number, stored

		const nameLength = u16(zip, 26);
		const data = zip.slice(30 + nameLength, 30 + nameLength + 5);
		expect(new TextDecoder().decode(data)).toBe('hello');
	});

	it('flags names as UTF-8, so a name outside ASCII survives', () => {
		const zip = zipStore([{ name: 'Grüße.txt', data: bytes('x') }]);

		expect(u16(zip, 6) & 0x0800).toBe(0x0800);
		const nameLength = u16(zip, 26);
		expect(new TextDecoder().decode(zip.slice(30, 30 + nameLength))).toBe('Grüße.txt');
	});

	it('ends with a directory that counts every entry', () => {
		const zip = zipStore([
			{ name: 'a.txt', data: bytes('one') },
			{ name: 'b.txt', data: bytes('two') }
		]);

		const end = eocdAt(zip);
		expect(u32(zip, end)).toBe(0x06054b50);
		expect(u16(zip, end + 8)).toBe(2);
		expect(u16(zip, end + 10)).toBe(2);

		// The directory has to start where the record says it does, or a reader that
		// seeks (which is every reader) lands in the middle of a file.
		const start = u32(zip, end + 16);
		expect(u32(zip, start)).toBe(0x02014b50);
		expect(u32(zip, end + 12)).toBe(end - start);
	});

	it('is empty but valid with no entries at all', () => {
		const zip = zipStore([]);
		expect(zip.length).toBe(22);
		expect(u32(zip, 0)).toBe(0x06054b50);
		expect(u16(zip, 8)).toBe(0);
	});

	it('numbers a repeated name instead of writing it twice', () => {
		// Two speakers, both of whom called their deck `slides.pdf`. Whose is whose
		// is the organizer's problem the moment the archive answers it silently.
		const zip = zipStore([
			{ name: 'slides.pdf', data: bytes('first') },
			{ name: 'slides.pdf', data: bytes('second') },
			{ name: 'slides.pdf', data: bytes('third') }
		]);

		const text = new TextDecoder().decode(zip);
		expect(text).toContain('slides.pdf');
		expect(text).toContain('slides (2).pdf');
		expect(text).toContain('slides (3).pdf');
	});
});

describe('zipPath', () => {
	it('joins components with a forward slash', () => {
		expect(zipPath('Ada Bennett', 'slides.pdf')).toBe('Ada Bennett/slides.pdf');
	});

	it('refuses to let a component climb out of the archive', () => {
		expect(zipPath('../../etc', 'passwd')).toBe('-..-etc/passwd');
		expect(zipPath('..', 'x.txt')).toBe('x.txt');
	});

	it('drops empty components rather than writing an empty folder', () => {
		expect(zipPath('', 'slides.pdf')).toBe('slides.pdf');
	});
});

/**
 * The check that matters: a real extractor.
 *
 * Skipped where `unzip` is not installed, which means it proves nothing in a CI
 * image without it — said plainly rather than left to be assumed. It runs on a
 * developer machine and on any Linux runner with the package, and it is the only
 * assertion here that is not this code marking its own homework.
 */
const hasUnzip = (() => {
	try {
		execFileSync('unzip', ['-v'], { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
})();

describe.skipIf(!hasUnzip)('a real unzip', () => {
	it('opens the archive, in folders, with the bytes intact', () => {
		const zip = zipStore([
			{ name: zipPath('Ada Bennett', 'slides.pdf'), data: bytes('deck one') },
			{ name: zipPath('Priya Raman', 'headshot.jpg'), data: bytes('a picture') },
			{ name: zipPath('Priya Raman', 'slides.pdf'), data: bytes('deck two') }
		]);

		const dir = mkdtempSync(join(tmpdir(), 'ziptest-'));
		const file = join(dir, 'files.zip');
		writeFileSync(file, zip);

		// `-t` tests every entry's CRC against its bytes, which is the whole archive
		// checked by something that did not write it.
		expect(execFileSync('unzip', ['-t', file]).toString()).toContain('No errors detected');

		execFileSync('unzip', ['-q', file, '-d', dir]);
		expect(readFileSync(join(dir, 'Ada Bennett', 'slides.pdf'), 'utf8')).toBe('deck one');
		expect(readFileSync(join(dir, 'Priya Raman', 'slides.pdf'), 'utf8')).toBe('deck two');
		expect(readFileSync(join(dir, 'Priya Raman', 'headshot.jpg'), 'utf8')).toBe('a picture');
	});
});
