/**
 * Replaces the unlisted Gene Kim challenge video (`oE49MdbPNYw`) on live rows
 * with public AI Engineer channel talks (issue #84).
 *
 * Targets `placement.recording_url` and `submission_answer.value`. Idempotent:
 * only rows still containing the old video id are touched.
 *
 *   DATABASE_URL=postgres://… node scripts/db/fix-recording-urls.mjs
 *   DATABASE_URL=postgres://… node scripts/db/fix-recording-urls.mjs --dry-run
 *
 * Hank runs this against prod from main (team rule 1), ideally before the #78 dump.
 */
import postgres from 'postgres';

const OLD_ID = 'oE49MdbPNYw';
const OLD_URL = `https://www.youtube.com/watch?v=${OLD_ID}`;

/** Same set as seed-data.mjs RECORDINGS, keyed by DevFlow talk title. */
const BY_TITLE = {
	'Serving 70B models on a budget': 'https://www.youtube.com/watch?v=ju73sWVtvU0',
	'Your build is slow because of four things': 'https://www.youtube.com/watch?v=0ML7ZLMdcl4',
	'On-call rotations that people stay for': 'https://www.youtube.com/watch?v=5N33E9tC400',
	'Feature flags are a database problem': 'https://www.youtube.com/watch?v=D7_ipDqhtwk',
	'Writing evals you can trust': 'https://www.youtube.com/watch?v=PAy_GHUAICw'
};
const DEFAULT_URL = 'https://www.youtube.com/watch?v=ju73sWVtvU0';

const dryRun = process.argv.includes('--dry-run');
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error('[fix-recording-urls] DATABASE_URL is required');
	process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1 });
const likeOld = `%${OLD_ID}%`;

const nextUrl = (title, current) => {
	if (!current?.includes(OLD_ID)) return null;
	return (title && BY_TITLE[title]) || DEFAULT_URL;
};

const rewriteAnswer = (value) => {
	if (!value?.includes(OLD_ID)) return null;
	return value.split(OLD_URL).join(DEFAULT_URL).split(OLD_ID).join('ju73sWVtvU0');
};

async function fixPlacements() {
	const rows = await sql`
		SELECT p.id, p.recording_url, s.title
		FROM placement p
		LEFT JOIN submission s ON s.id = p.submission_id
		WHERE p.recording_url LIKE ${likeOld}
	`;
	let n = 0;
	for (const row of rows) {
		const next = nextUrl(row.title, row.recording_url);
		if (!next || next === row.recording_url) continue;
		console.log(`[fix-recording-urls] placement #${row.id} → ${next}`);
		if (!dryRun) {
			await sql`
				UPDATE placement
				SET recording_url = ${next}, updated_at = now()
				WHERE id = ${row.id} AND recording_url LIKE ${likeOld}
			`;
		}
		n += 1;
	}
	return n;
}

async function fixAnswers() {
	const rows = await sql`
		SELECT id, value FROM submission_answer WHERE value LIKE ${likeOld}
	`;
	let n = 0;
	for (const row of rows) {
		const next = rewriteAnswer(row.value);
		if (!next || next === row.value) continue;
		console.log(`[fix-recording-urls] submission_answer #${row.id} → ${next}`);
		if (!dryRun) {
			await sql`
				UPDATE submission_answer SET value = ${next}
				WHERE id = ${row.id} AND value LIKE ${likeOld}
			`;
		}
		n += 1;
	}
	return n;
}

async function main() {
	console.log(`[fix-recording-urls] ${dryRun ? 'DRY RUN — ' : ''}replacing ${OLD_ID}`);
	const placements = await fixPlacements();
	const answers = await fixAnswers();
	console.log(
		`[fix-recording-urls] done: ${placements} placement(s), ${answers} answer(s)` +
			(dryRun ? ' (dry-run)' : '')
	);
	if (!dryRun && placements === 0 && answers === 0) {
		console.log('[fix-recording-urls] nothing left to fix');
	}
}

main()
	.catch((err) => {
		console.error('[fix-recording-urls] failed:', err);
		process.exitCode = 1;
	})
	.finally(() => sql.end({ timeout: 5 }));
