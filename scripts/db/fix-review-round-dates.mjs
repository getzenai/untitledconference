/**
 * Moves the DevFlow demo review rounds onto the clock (issue #242).
 *
 * The seeded rounds sat on absolute 2027 dates, so `roundWindowState` said
 * `not_yet_open` and the review form was locked — while the rounds held
 * reviews that could never have been filed through it. `seed-devflow.mjs`
 * now seeds relative dates, but a seed fix changes nothing on a database
 * that was seeded before it. This script shifts only the four date columns
 * (`review_round.opens_at`/`closes_at`, `review.assigned_at`/`submitted_at`)
 * of the existing rows; it never inserts, deletes, or changes a status.
 *
 * Round targets, scoped to the `org-devflow` organization only:
 *   - position 0: opened 5 days ago, closes in 7 days (the fillable window).
 *   - later positions: opens in 4 days, closes in 14 — the "Opens in N days"
 *     badge — UNLESS the round already holds submitted reviews. Data seeded
 *     before #242 filed round-2 reviews, and a future window over submitted
 *     reviews is exactly the contradiction being fixed, so such a round is
 *     opened (3 days ago) instead. The badge then waits for a reseed.
 *
 * Review dates follow their round: assigned a day after it opened,
 * submitted (where a submission exists) two days after. In a future round,
 * assignments are dated yesterday — handed out ahead of the window.
 *
 * Idempotent: targets are computed from `now`, so re-running only re-anchors
 * the same story to the new clock.
 *
 *   DATABASE_URL=postgres://… node scripts/db/fix-review-round-dates.mjs --dry-run
 *   DATABASE_URL=postgres://… node scripts/db/fix-review-round-dates.mjs
 *
 * Runs against prod via run-db-script.yaml from main, `--dry-run` first.
 */
import postgres from 'postgres';

const ORG_ID = 'org-devflow';
const DAY_MS = 24 * 60 * 60 * 1000;

const dryRun = process.argv.includes('--dry-run');
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error('[fix-review-round-dates] DATABASE_URL is required');
	process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1 });

const now = Date.now();
const days = (n) => new Date(now + n * DAY_MS);
const show = (d) => (d ? new Date(d).toISOString().slice(0, 16) : 'null');

async function main() {
	console.log(`[fix-review-round-dates] ${dryRun ? 'DRY RUN — ' : ''}org '${ORG_ID}'`);

	const rounds = await sql`
		SELECT rr.id, rr.name, rr.position, rr.opens_at, rr.closes_at,
			count(*) FILTER (WHERE r.status = 'submitted') AS submitted_reviews
		FROM review_round rr
		JOIN evaluation_plan ep ON ep.id = rr.evaluation_plan_id
		JOIN conference c ON c.id = ep.conference_id
		LEFT JOIN review r ON r.review_round_id = rr.id
		WHERE c.organization_id = ${ORG_ID}
		GROUP BY rr.id
		ORDER BY rr.position
	`;
	if (rounds.length === 0) {
		console.log('[fix-review-round-dates] no rounds found — nothing to do');
		return;
	}

	for (const round of rounds) {
		const submitted = Number(round.submitted_reviews);
		const open = round.position === 0 || submitted > 0;
		const opensAt = round.position === 0 ? days(-5) : open ? days(-3) : days(4);
		const closesAt = open ? days(round.position === 0 ? 7 : 14) : days(14);
		const window = open ? 'open' : 'not_yet_open';

		console.log(
			`[fix-review-round-dates] round #${round.id} '${round.name}' → ${window} ` +
				`(${show(round.opens_at)}..${show(round.closes_at)} → ${show(opensAt)}..${show(closesAt)}` +
				`, ${submitted} submitted review(s))`
		);
		if (!dryRun) {
			await sql`
				UPDATE review_round SET opens_at = ${opensAt}, closes_at = ${closesAt}
				WHERE id = ${round.id}
			`;
		}

		const assignedAt = open ? new Date(opensAt.getTime() + 1 * DAY_MS) : days(-1);
		const submittedAt = new Date(opensAt.getTime() + 2 * DAY_MS);
		const reviews = dryRun
			? await sql`
					SELECT count(*) AS n, count(submitted_at) AS filed
					FROM review WHERE review_round_id = ${round.id}
				`
			: await sql`
					UPDATE review
					SET assigned_at = ${assignedAt},
						submitted_at = CASE WHEN submitted_at IS NULL THEN NULL ELSE ${submittedAt} END
					WHERE review_round_id = ${round.id}
					RETURNING submitted_at
				`;
		const total = dryRun ? Number(reviews[0].n) : reviews.length;
		const filed = dryRun ? Number(reviews[0].filed) : reviews.filter((r) => r.submitted_at).length;
		console.log(
			`[fix-review-round-dates]   reviews: ${total} assigned_at → ${show(assignedAt)}, ` +
				`${filed} submitted_at → ${show(submittedAt)}`
		);
	}

	console.log(`[fix-review-round-dates] done${dryRun ? ' (dry-run, nothing changed)' : ''}`);
}

main()
	.catch((err) => {
		console.error('[fix-review-round-dates] failed:', err);
		process.exitCode = 1;
	})
	.finally(() => sql.end({ timeout: 5 }));
