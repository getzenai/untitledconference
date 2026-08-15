/**
 * Gives the demo reviewer journey DevFlow work (issue #654).
 *
 * Live, Priya's `/home` queue is three talks from `Grok Juror Conf <epoch>` —
 * a harness tenant that exists to test the MCP tools. Taking that conference
 * off the front page (#619 / #426) does not take it out of a reviewer's
 * assignments. The talks themselves are plausible; the conference around them
 * is residue, and she has no DevFlow reviews at all.
 *
 * Two writes, both scoped:
 *
 * 1. Assign Priya the three in-review DevFlow talks she does not speak on
 *    (`PRIYA_REVIEW_KEYS` in seed-data.mjs) and give her a round-1 reviewer
 *    seat. Future `seed-devflow` runs write the same rows.
 * 2. Drop every demo user's reviews and reviewer memberships on
 *    `grok-juror-*` conferences. The conference itself stays; it is not
 *    relisted.
 *
 * A talk whose title matches but that Priya speaks on, or that is missing, is
 * logged and left alone. Read, classify and every write share one transaction.
 *
 * Idempotent: a second run inserts nothing and deletes nothing.
 *
 *   DATABASE_URL=postgres://… node scripts/db/fix-priya-reviewer-queue.mjs --dry-run
 *   DATABASE_URL=postgres://… node scripts/db/fix-priya-reviewer-queue.mjs
 *
 * Runs against prod via run-db-script.yaml from main, `--dry-run` first.
 */
import postgres from 'postgres';
import { PEOPLE, PRIYA_REVIEW_KEYS, SUBMISSIONS } from './seed-data.mjs';

const CONFERENCE_SLUG = 'devflow-conf-2027';
const PRIYA_ID = 'user-priya';
const JUROR_SLUG = '^grok-juror-';
const DEMO_USER_IDS = PEOPLE.map((p) => p.id);
const PRIYA_TITLES = PRIYA_REVIEW_KEYS.map((key) => {
	const row = SUBMISSIONS.find((s) => s.key === key);
	if (!row) throw new Error(`PRIYA_REVIEW_KEYS names unknown submission '${key}'`);
	if (row.speakers.includes('priya')) {
		throw new Error(`PRIYA_REVIEW_KEYS includes Priya's own talk '${key}'`);
	}
	return row.title;
});

const dryRun = process.argv.includes('--dry-run');
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error('[fix-priya-reviewer-queue] DATABASE_URL is required');
	process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1 });
const log = (message) => console.log(`[fix-priya-reviewer-queue] ${message}`);

async function loadDevflow(tx) {
	const [conference] = await tx`
		SELECT id, name, slug FROM conference WHERE slug = ${CONFERENCE_SLUG}
	`;
	if (!conference) throw new Error(`conference '${CONFERENCE_SLUG}' is missing`);

	const [priya] = await tx`SELECT id, name FROM "user" WHERE id = ${PRIYA_ID}`;
	if (!priya) throw new Error(`user '${PRIYA_ID}' is missing`);

	const [round] = await tx`
		SELECT rr.id, rr.name
		FROM review_round rr
		JOIN evaluation_plan ep ON ep.id = rr.evaluation_plan_id
		WHERE ep.conference_id = ${conference.id}
		ORDER BY rr.position
		LIMIT 1
	`;
	if (!round) throw new Error(`no review round on '${CONFERENCE_SLUG}'`);

	const talks = await tx`
		SELECT s.id, s.title, s.status,
			coalesce(array_agg(DISTINCT sp.user_id) FILTER (WHERE sp.user_id IS NOT NULL), '{}') AS speaker_users
		FROM submission s
		LEFT JOIN submission_speaker ss ON ss.submission_id = s.id
		LEFT JOIN speaker_profile sp ON sp.id = ss.speaker_profile_id
		WHERE s.conference_id = ${conference.id} AND s.title IN ${tx(PRIYA_TITLES)}
		GROUP BY s.id, s.title, s.status
		ORDER BY s.id
	`;

	return { conference, priya, round, talks };
}

function classifyAssignments(talks) {
	const wanted = [];
	const byTitle = new Map(talks.map((row) => [row.title, row]));
	for (const title of PRIYA_TITLES) {
		const row = byTitle.get(title);
		if (!row) {
			log(`  KEEP  "${title}" — not on ${CONFERENCE_SLUG}`);
			continue;
		}
		if (row.speaker_users.includes(PRIYA_ID)) {
			log(`  KEEP  #${row.id} "${row.title}" — Priya is a speaker`);
			continue;
		}
		wanted.push(row);
		log(`  assign #${row.id} "${row.title}" [${row.status}]`);
	}
	return wanted;
}

async function loadJurorResidue(tx) {
	const conferences = await tx`
		SELECT id, slug, name, listed_publicly FROM conference WHERE slug ~ ${JUROR_SLUG}
		ORDER BY id
	`;
	if (conferences.length === 0) return { conferences, reviews: [], seats: [] };

	const ids = conferences.map((c) => c.id);
	const reviews = await tx`
		SELECT r.id, r.reviewer_user_id, r.status, s.title, c.slug
		FROM review r
		JOIN submission s ON s.id = r.submission_id
		JOIN conference c ON c.id = s.conference_id
		WHERE c.id IN ${tx(ids)} AND r.reviewer_user_id IN ${tx(DEMO_USER_IDS)}
		ORDER BY r.id
	`;
	const seats = await tx`
		SELECT m.id, m.user_id, m.scope_type, m.scope_id
		FROM membership m
		WHERE m.user_id IN ${tx(DEMO_USER_IDS)}
			AND m.role = 'reviewer'
			AND (
				(m.scope_type = 'conference' AND m.scope_id IN ${tx(ids)})
				OR (
					m.scope_type = 'round' AND m.scope_id IN (
						SELECT rr.id
						FROM review_round rr
						JOIN evaluation_plan ep ON ep.id = rr.evaluation_plan_id
						WHERE ep.conference_id IN ${tx(ids)}
					)
				)
			)
		ORDER BY m.id
	`;
	return { conferences, reviews, seats };
}

function logResidue(residue) {
	for (const row of residue.conferences) {
		log(
			`  juror ${row.slug} listed_publicly=${row.listed_publicly} — conference stays, not relisted`
		);
	}
	for (const row of residue.reviews) {
		log(
			`  drop review #${row.id} ${row.reviewer_user_id} [${row.status}] "${row.title}" on ${row.slug}`
		);
	}
	for (const row of residue.seats) {
		log(`  drop seat #${row.id} ${row.user_id} ${row.scope_type}:${row.scope_id}`);
	}
}

async function ensurePriyaSeat(tx, roundId) {
	const [existing] = await tx`
		SELECT id FROM membership
		WHERE user_id = ${PRIYA_ID}
			AND role = 'reviewer'
			AND scope_type = 'round'
			AND scope_id = ${roundId}
	`;
	if (existing) {
		log(`  seat: already on round #${roundId}`);
		return;
	}
	await tx`
		INSERT INTO membership ${tx({
			user_id: PRIYA_ID,
			role: 'reviewer',
			scope_type: 'round',
			scope_id: roundId
		})}
	`;
	log(`  seat: reviewer on round #${roundId}`);
}

async function assignPriyaReviews(tx, roundId, wanted) {
	let assigned = 0;
	for (const talk of wanted) {
		const [existing] = await tx`
			SELECT id FROM review
			WHERE review_round_id = ${roundId}
				AND submission_id = ${talk.id}
				AND reviewer_user_id = ${PRIYA_ID}
		`;
		if (existing) continue;
		await tx`
			INSERT INTO review ${tx({
				review_round_id: roundId,
				submission_id: talk.id,
				reviewer_user_id: PRIYA_ID,
				status: 'assigned'
			})}
		`;
		assigned += 1;
	}
	return assigned;
}

async function dropResidue(tx, residue) {
	const droppedReviews =
		residue.reviews.length === 0
			? []
			: await tx`
				DELETE FROM review
				WHERE id IN ${tx(residue.reviews.map((r) => r.id))}
				RETURNING id
			`;
	const droppedSeats =
		residue.seats.length === 0
			? []
			: await tx`
				DELETE FROM membership
				WHERE id IN ${tx(residue.seats.map((s) => s.id))}
				RETURNING id
			`;
	return { droppedReviews: droppedReviews.length, droppedSeats: droppedSeats.length };
}

async function apply(tx) {
	const { conference, priya, round, talks } = await loadDevflow(tx);
	log(`conference #${conference.id} '${conference.name}', round #${round.id} '${round.name}'`);
	log(`reviewer ${priya.id} (${priya.name})`);

	const wanted = classifyAssignments(talks);
	const residue = await loadJurorResidue(tx);
	logResidue(residue);

	if (dryRun) {
		log(
			`done (dry-run): would assign up to ${wanted.length} DevFlow review(s), ` +
				`drop ${residue.reviews.length} juror review(s) and ${residue.seats.length} juror seat(s)`
		);
		return;
	}

	await ensurePriyaSeat(tx, round.id);
	const assigned = await assignPriyaReviews(tx, round.id, wanted);
	const dropped = await dropResidue(tx, residue);
	log(
		`done: ${assigned} DevFlow review(s) assigned, ` +
			`${dropped.droppedReviews} juror review(s) and ${dropped.droppedSeats} juror seat(s) removed`
	);
}

async function main() {
	log(`${dryRun ? 'DRY RUN — ' : ''}Priya's queue onto '${CONFERENCE_SLUG}'`);
	await sql.begin(apply);
}

main()
	.catch((err) => {
		console.error('[fix-priya-reviewer-queue] failed:', err);
		process.exitCode = 1;
	})
	.finally(() => sql.end({ timeout: 5 }));
