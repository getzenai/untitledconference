/**
 * Takes the juror-eval mail out of the DevFlow demo's send log (issue #661).
 *
 * #619 removed the harness submissions and the speaker profiles they hung on.
 * `email_log` is a separate table with no foreign key to either, so the five
 * "We received your proposal" deliveries to `grok.juror.<epoch>@getzenai.com`
 * survived — and the Mail panel is the last thing an organizer sees on the
 * dashboard. Nothing in the product deletes a log row; the log is an audit
 * trail on purpose. Hence a script.
 *
 * Scoped three ways, because "delete" deserves it:
 *
 *  1. the DevFlow conference by slug,
 *  2. the throwaway address shape the harness minted, and
 *  3. the orphan check the issue asks for — the address must no longer belong
 *     to a speaker profile in that conference's organization.
 *
 * The address pattern is doing real work and is not redundant with the orphan
 * check. "Every logged recipient without a profile" would also match the
 * invitation that goes out *before* a profile exists, and mail to somebody who
 * was later merged into another profile (#653). Those are the demo's real
 * deliveries. A row that fails any of the three is reported and left alone.
 *
 * The first version also demanded that no *user account* carry the address, and
 * against prod that condition kept every row: #619 deleted the juror speaker
 * profiles but not the login accounts behind them, so all four rows read
 * `profiles=0 accounts=1` and the script deleted nothing (run 31908465025).
 * The check was defensive rather than load-bearing — the DoD asks about the
 * profile, and an address of the shape `grok.juror.<epoch>@getzenai.com` is a
 * harness fixture whether or not a login still exists for it. So the account
 * count is still read and still printed, because it is the fact that explains
 * the row; it no longer vetoes the delete. Those accounts outliving their
 * profiles is a separate leak and stays out of this script.
 *
 * Idempotent: a second run finds nothing and says so.
 *
 *   DATABASE_URL=postgres://… node scripts/db/remove-juror-mail-log.mjs --dry-run
 *   DATABASE_URL=postgres://… node scripts/db/remove-juror-mail-log.mjs
 *
 * Runs against prod via run-db-script.yaml from main, `--dry-run` first.
 */
import postgres from 'postgres';

const CONFERENCE_SLUG = 'devflow-conf-2027';
/** `grok.juror.1786588294037@getzenai.com` — the harness stamps the epoch in ms. */
const EMAIL_PATTERN = '^grok\\.juror\\.[0-9]+@getzenai\\.com$';

const dryRun = process.argv.includes('--dry-run');
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error('[remove-juror-mail-log] DATABASE_URL is required');
	process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1 });
const log = (message) => console.log(`[remove-juror-mail-log] ${message}`);

/**
 * Every log row in this conference addressed like a juror fixture, with the
 * profile count that decides whether it is an orphan and the account count
 * that explains it.
 *
 * Both counts are subqueries rather than joins so that a row which still has a
 * profile shows up in the log instead of being silently dropped from the
 * result set.
 */
function findCandidates(sql) {
	return sql`
		SELECT e.id, e.to_email, e.template, e.subject, e.status, e.created_at,
			(
				SELECT count(*) FROM speaker_profile sp
				WHERE sp.organization_id = c.organization_id
					AND lower(sp.email) = lower(e.to_email)
			) AS profiles,
			(SELECT count(*) FROM "user" u WHERE lower(u.email) = lower(e.to_email)) AS accounts
		FROM email_log e
		JOIN conference c ON c.id = e.conference_id
		WHERE c.slug = ${CONFERENCE_SLUG} AND e.to_email ~ ${EMAIL_PATTERN}
		ORDER BY e.id
	`;
}

/** Logs every candidate and returns the ids that are safe to remove. */
function classify(candidates) {
	const doomed = [];
	for (const row of candidates) {
		const orphan = Number(row.profiles) === 0;
		const detail =
			`#${row.id} ${row.to_email} [${row.template}/${row.status}] ` +
			`"${row.subject}" profiles=${row.profiles} accounts=${row.accounts}`;
		if (orphan) {
			doomed.push(row.id);
			log(`  remove ${detail}`);
		} else {
			log(`  KEEP   ${detail} — the recipient still exists`);
		}
	}
	return doomed;
}

async function main() {
	log(`${dryRun ? 'DRY RUN — ' : ''}conference '${CONFERENCE_SLUG}'`);

	// Read, classify and delete in one transaction: the orphan check is only
	// worth anything against the state the delete is applied to.
	await sql.begin(async (tx) => {
		const candidates = await findCandidates(tx);
		if (candidates.length === 0) {
			log('nothing to remove — no juror mail in this conference');
			return;
		}

		log(`${candidates.length} row(s) match the address pattern:`);
		const doomed = classify(candidates);
		if (doomed.length === 0) {
			log('nothing matched all three conditions; no row deleted');
			return;
		}

		if (dryRun) {
			log(`DRY RUN — would delete ${doomed.length} log row(s); nothing was written`);
			return;
		}

		const deleted = await tx`DELETE FROM email_log WHERE id IN ${tx(doomed)} RETURNING id`;
		log(`deleted ${deleted.length} log row(s)`);
	});
}

main()
	.catch((error) => {
		console.error('[remove-juror-mail-log] failed:', error);
		process.exitCode = 1;
	})
	.finally(() => sql.end());
