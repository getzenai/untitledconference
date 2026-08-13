/**
 * Seeds the isolated MCP playground tenant.
 *
 * Own organisation (`MCP Harness`), own accounts on `@mcpharness.example`, own
 * conference — left as **draft**. A draft is publicly 404 and does not appear
 * on the landing grid; that is the isolation, measured rather than hoped for
 * (see `src/lib/server/mcp/harness.integration.test.ts`). No feature flag, and
 * the jury's first impression is untouched.
 *
 * It is not the DevFlow demo (`seed-devflow.mjs`) and not the AI Engineer
 * import (`seed-ai-engineer.mjs`). Re-running either of those leaves this
 * tenant alone, and this script never names their organisation ids.
 *
 * Identifiers live in `seed-mcp-harness-data.mjs` and must stay in lockstep
 * with `MCP_HARNESS` in `src/lib/server/mcp/harness.ts` — that module is what
 * the later MCP tool tests import.
 *
 * Idempotent: deletes its own organisation and its five users first, then
 * rebuilds. Cascades take the conference with the organisation.
 *
 *   node scripts/db/seed-mcp-harness.mjs                 # uses DATABASE_URL
 *   DATABASE_URL=postgres://... node scripts/db/seed-mcp-harness.mjs
 */
import { hashPassword } from 'better-auth/crypto';
import postgres from 'postgres';
import {
	MCP_HARNESS,
	MCP_HARNESS_EMAIL_DOMAIN,
	MCP_HARNESS_PASSWORD
} from './seed-mcp-harness-data.mjs';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error('DATABASE_URL is required');
	process.exit(1);
}

const {
	orgId: ORG_ID,
	orgSlug: ORG_SLUG,
	orgName: ORG_NAME,
	conferenceSlug: CONF_SLUG,
	conferenceName: CONF_NAME,
	venue: VENUE,
	startsOn: STARTS_ON,
	endsOn: ENDS_ON,
	people: PEOPLE
} = MCP_HARNESS;

const sql = postgres(DATABASE_URL, { max: 1 });

const at = (iso) => new Date(iso);

async function seedPeople() {
	for (const person of PEOPLE) {
		await sql`INSERT INTO "user" ${sql({
			id: person.id,
			name: person.name,
			email: person.email,
			email_verified: true,
			role: 'user',
			created_at: at('2026-08-13T00:00:00Z'),
			updated_at: at('2026-08-13T00:00:00Z')
		})}`;
		await sql`INSERT INTO member ${sql({
			id: `member-${person.id}`,
			organization_id: ORG_ID,
			user_id: person.id,
			role: person.role === 'organizer' ? 'owner' : 'member',
			created_at: at('2026-08-13T00:00:00Z')
		})}`;
		await sql`INSERT INTO account ${sql({
			id: `account-${person.id}`,
			account_id: person.id,
			provider_id: 'credential',
			user_id: person.id,
			password: await hashPassword(MCP_HARNESS_PASSWORD),
			created_at: at('2026-08-13T00:00:00Z'),
			updated_at: at('2026-08-13T00:00:00Z')
		})}`;
	}
}

async function report(conferenceId) {
	const [row] = await sql`
		SELECT id, slug, status
		FROM conference
		WHERE id = ${conferenceId}`;

	console.log(`Seeded organisation '${ORG_ID}' (${ORG_NAME}).`);
	console.log(`Conference ${row.slug} is '${row.status}' — public /c/${row.slug} 404s, not on /.`);
	console.log(`Accounts are on @${MCP_HARNESS_EMAIL_DOMAIN}.`);
	console.log(`\nHarness logins — the password for every one of them is: ${MCP_HARNESS_PASSWORD}`);
	for (const person of PEOPLE) {
		console.log(`  ${person.email.padEnd(32)} ${person.note}`);
	}
}

async function main() {
	if (process.argv.includes('--dry-run')) {
		console.log(
			`DRY RUN — would delete organisation '${ORG_ID}' (everything under it cascades) ` +
				`and the ${PEOPLE.length} harness users, then reseed the MCP playground as a draft. ` +
				`DevFlow and the AI Engineer import are not touched. Nothing was changed.`
		);
		return;
	}

	console.log('Seeding MCP Harness …');

	await sql`DELETE FROM organization WHERE id = ${ORG_ID}`;
	await sql`DELETE FROM "user" WHERE id IN ${sql(PEOPLE.map((person) => person.id))}`;

	await sql`INSERT INTO organization ${sql({
		id: ORG_ID,
		name: ORG_NAME,
		slug: ORG_SLUG,
		created_at: at('2026-08-13T00:00:00Z')
	})}`;
	await seedPeople();

	// Status is stated, not left to the default: a playground that accidentally
	// published would land on the jury's landing grid. The days follow the
	// range the same way `syncConferenceDays` does for a screen-created conference.
	const [conference] = await sql`INSERT INTO conference ${sql({
		organization_id: ORG_ID,
		name: CONF_NAME,
		slug: CONF_SLUG,
		venue: VENUE,
		starts_on: STARTS_ON,
		ends_on: ENDS_ON,
		status: 'draft'
	})} RETURNING id`;

	await sql`INSERT INTO conference_day ${sql({
		conference_id: conference.id,
		date: STARTS_ON,
		position: 0
	})}`;
	await sql`INSERT INTO conference_day ${sql({
		conference_id: conference.id,
		date: ENDS_ON,
		position: 1
	})}`;

	await report(conference.id);
}

main()
	.then(() => sql.end())
	.catch(async (error) => {
		console.error('Seed failed:', error.message);
		if (error.constraint_name) console.error('constraint:', error.constraint_name);
		await sql.end();
		process.exit(1);
	});
