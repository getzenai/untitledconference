/**
 * Backfills `placement.recording_url` for a hand-verified subset of the AI
 * Engineer World's Fair and Summit talks imported by
 * `scripts/db/seed-ai-engineer.mjs` (issue #20 stage 1, real data).
 *
 * The source seed JSON (`scripts/db/data/ai-engineer-seed-data.json`) carries a
 * `source_url` per session, but it turned out to be the same one schedule page for
 * every session in a conference — not a per-talk video link. Each URL below was
 * found and confirmed individually (title + speaker + conference, cross-checked
 * against the actual publish date and the talk's presence in an official AI
 * Engineer playlist) rather than guessed from a title match on YouTube search
 * results — several speakers gave the same or a similarly-titled talk at other
 * conferences, and a first-hit match would have wired some talks to the wrong
 * conference's recording. Titles that couldn't be confirmed unambiguously were
 * dropped rather than guessed. Fewer confirmed links beats more uncertain ones.
 *
 * Scoped to the `org-ai-engineer-import` organization's own conferences only —
 * touches no other placement.
 *
 * Idempotent: only rows still at recording_url IS NULL are updated, matched by
 * conference slug + exact submission title (never by placement/submission id).
 *
 *   DATABASE_URL=postgres://… node scripts/db/fix-ai-engineer-recording-urls.mjs
 *   DATABASE_URL=postgres://… node scripts/db/fix-ai-engineer-recording-urls.mjs --dry-run
 */
import postgres from 'postgres';

const BY_CONFERENCE_AND_TITLE = {
	'ai-engineer-worlds-fair-2025': {
		'What every AI engineer needs to know about GPUs':
			'https://www.youtube.com/watch?v=y-UGrYbJsJk',
		'Introduction to LLM serving with SGLang': 'https://www.youtube.com/watch?v=Ahtaha9fEM0',
		'Multi-Agent AI and Network Knowledge Graphs for Change Management and Network Testing':
			'https://www.youtube.com/watch?v=m0dxZ-NDKHo',
		'Beyond the Prototype: Using AI to Write High-Quality Code':
			'https://www.youtube.com/watch?v=x_1EumTaXeE',
		'Large Scale AI on Apple Silicon using EXO': 'https://www.youtube.com/watch?v=DNw_Vrkoohc',
		'Safety and security for code-executing agents': 'https://www.youtube.com/watch?v=f7KqwWbcFnQ',
		'Automating Escrow with USDC and AI': 'https://www.youtube.com/watch?v=AXMdSqdoGHM'
	},
	'ai-engineer-summit-2025': {
		'Why Agent Engineering': 'https://www.youtube.com/watch?v=5N33E9tC400',
		'How we scaled 500m AI agents in production with 2 engineers':
			'https://www.youtube.com/watch?v=zM9RYqCcioM',
		'Building and evaluating AI Agents That Matter': 'https://www.youtube.com/watch?v=d5EltXhbcfA'
	}
};

const dryRun = process.argv.includes('--dry-run');
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error('[fix-ai-engineer-recording-urls] DATABASE_URL is required');
	process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1 });

async function applyOne(row, url) {
	if (row.recording_url !== null) return false;
	console.log(`[fix-ai-engineer-recording-urls] placement #${row.id} → ${url}`);
	if (!dryRun) {
		await sql`
			UPDATE placement
			SET recording_url = ${url}, updated_at = now()
			WHERE id = ${row.id} AND recording_url IS NULL
		`;
	}
	return true;
}

async function applyTitle(slug, title, url) {
	const rows = await sql`
		SELECT p.id, p.recording_url
		FROM placement p
		JOIN submission s ON s.id = p.submission_id
		JOIN conference c ON c.id = p.conference_id
		WHERE c.slug = ${slug} AND s.title = ${title}
	`;
	if (rows.length === 0) {
		console.warn(`[fix-ai-engineer-recording-urls] no placement for "${title}" (${slug})`);
		return { matched: false, updated: 0 };
	}
	let updated = 0;
	for (const row of rows) {
		if (await applyOne(row, url)) updated += 1;
	}
	return { matched: true, updated };
}

async function main() {
	console.log(`[fix-ai-engineer-recording-urls] ${dryRun ? 'DRY RUN — ' : ''}starting`);
	let matched = 0;
	let updated = 0;

	for (const [slug, byTitle] of Object.entries(BY_CONFERENCE_AND_TITLE)) {
		for (const [title, url] of Object.entries(byTitle)) {
			const result = await applyTitle(slug, title, url);
			if (result.matched) matched += 1;
			updated += result.updated;
		}
	}

	console.log(
		`[fix-ai-engineer-recording-urls] done: ${matched} title(s) matched, ${updated} placement(s) updated` +
			(dryRun ? ' (dry-run)' : '')
	);
}

main()
	.catch((err) => {
		console.error('[fix-ai-engineer-recording-urls] failed:', err);
		process.exitCode = 1;
	})
	.finally(() => sql.end({ timeout: 5 }));
