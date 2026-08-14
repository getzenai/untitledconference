/**
 * Imports the three AI Engineer conferences from `data/ai-engineer-seed-data.json`
 * as published, publicly browsable conferences — additive to whatever else is on the
 * target database, and touching nothing outside its own organization.
 *
 * Its own org and its own owner account, deliberately not the DevFlow demo tenant
 * (`scripts/db/seed-devflow.mjs`) and not an eval/demo user: this data is real
 * (World's Fair, Summit) or explicitly marked fictional in the source JSON (Kill My
 * SaaS), not a scripted demo walkthrough, and it should survive a demo-tenant reseed
 * untouched. No deliverables are written, so `seed-uploads.mjs` and its R2 manifest
 * are never touched either — nothing here has a file to upload.
 *
 * Idempotent: deletes its own organization and owner user first (cascades everything
 * under them), then rebuilds from the JSON. Re-running does not accumulate duplicate
 * conferences.
 *
 *   node scripts/db/seed-ai-engineer.mjs                 # uses DATABASE_URL
 *   DATABASE_URL=postgres://... node scripts/db/seed-ai-engineer.mjs
 */
import { hashPassword } from 'better-auth/crypto';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error('DATABASE_URL is required');
	process.exit(1);
}

const ORG_ID = 'org-ai-engineer-import';
const OWNER_ID = 'user-ai-engineer-import';
const OWNER_EMAIL = 'ai-engineer-import@devflowconf.example';
const OWNER_NAME = 'AI Engineer Import';
/** Printed at the end and in the PR description — this is not a secret account. */
const IMPORT_PASSWORD = 'ai-engineer-import-2025';

const DATA_FILE = new URL('./data/ai-engineer-seed-data.json', import.meta.url);

const sql = postgres(DATABASE_URL, { max: 1 });

const at = (iso) => new Date(iso.endsWith('Z') ? iso : `${iso}Z`);

/**
 * Some sessions are missing an end time (four on the Summit) or missing both start
 * and end entirely (all twelve on Kill My SaaS, whose source only confirms a date —
 * see the JSON's `date_status: "public_partial"`). Rather than leave those off the
 * agenda, a deterministic per-format duration fills the gap; the Kill My SaaS times
 * are themselves already the "fictional, grounded" placement the source data calls
 * for, just made concrete enough to put on a grid.
 */
const FORMAT_MINUTES = {
	Keynote: 20,
	Talk: 15,
	Workshop: 60,
	Panel: 30,
	Demo: 15,
	'Lightning Talk': 10
};
const DEFAULT_MINUTES = 15;

/** "First Middle Last" -> "Last, First Middle". A bare handle sorts as itself. */
function sortName(name) {
	const parts = name.trim().split(/\s+/);
	if (parts.length < 2) return name;
	const last = parts.at(-1);
	return `${last}, ${parts.slice(0, -1).join(' ')}`;
}

function minutesFor(format) {
	return FORMAT_MINUTES[format] ?? DEFAULT_MINUTES;
}

/**
 * Kill My SaaS has a date but no per-session times at all. Sessions land back to
 * back, in source order, on the conference's one day — deterministic, so a re-run
 * produces the same schedule.
 */
function fictionalSlot(date, priorMinutes) {
	const dayStart = at(`${date}T15:00:00`).getTime();
	return new Date(dayStart + priorMinutes * 60 * 1000);
}

async function importConference(conf) {
	const dates = [...conf.dates].sort();
	const startsOn = dates[0];
	const endsOn = dates.at(-1);
	const venue = [conf.venue, conf.city].filter(Boolean).join(', ') || conf.venue || null;

	const [conference] = await sql`INSERT INTO conference ${sql({
		organization_id: ORG_ID,
		name: conf.name,
		slug: conf.id,
		venue,
		starts_on: startsOn,
		ends_on: endsOn,
		status: 'published',
		// The showcase conferences are what the front page is for (#402): published
		// says the site exists, listed says the directory names it.
		listed_publicly: true
	})} RETURNING id`;
	const conferenceId = conference.id;

	// Conference days, one row per date the JSON gives.
	const dayIds = {};
	for (const [i, date] of dates.entries()) {
		const [row] =
			await sql`INSERT INTO conference_day ${sql({ conference_id: conferenceId, date, position: i })} RETURNING id`;
		dayIds[date] = row.id;
	}

	// Tracks: the declared list, plus `Unassigned` if any session uses a track the
	// list itself never names (the World's Fair keynotes; #189-adjacent data gotcha).
	const trackNames = [...conf.tracks];
	if (
		conf.sessions.some((s) => s.track && !trackNames.includes(s.track)) ||
		conf.sessions.some((s) => !s.track)
	) {
		trackNames.push('Unassigned');
	}
	const trackIds = {};
	for (const [i, name] of trackNames.entries()) {
		const [row] =
			await sql`INSERT INTO track ${sql({ conference_id: conferenceId, name, position: i })} RETURNING id`;
		trackIds[name] = row.id;
	}

	// Session formats and rooms: whatever the sessions actually use, first-seen order.
	const formatIds = {};
	const roomIds = {};
	for (const s of conf.sessions) {
		if (!(s.format in formatIds)) {
			const [row] = await sql`INSERT INTO session_format ${sql({
				conference_id: conferenceId,
				name: s.format,
				minutes: minutesFor(s.format),
				position: Object.keys(formatIds).length
			})} RETURNING id`;
			formatIds[s.format] = row.id;
		}
		if (s.room && !(s.room in roomIds)) {
			const [row] = await sql`INSERT INTO room ${sql({
				conference_id: conferenceId,
				name: s.room,
				position: Object.keys(roomIds).length
			})} RETURNING id`;
			roomIds[s.room] = row.id;
		}
	}

	// Speakers: dedupe by name across the whole ORGANIZATION, not just this
	// conference.
	//
	// `speaker_profile` is org-global and `conference_speaker` attaches it to one
	// event, so a person who spoke at both the World's Fair and the Summit must be
	// one row appearing twice — that join is what the public profile page's talk
	// history and the `/contacts` directory are built on. Deduping per conference
	// instead gave three people (Beyang Liu, Kevin Hou, Kyle Corbitt) two profiles
	// each: their history looked empty and the directory listed them twice.
	const speakerIds = {};
	for (const sp of conf.speakers) {
		if (sp.name in speakerIds) continue;

		const [existing] = await sql`
			SELECT id FROM speaker_profile
			WHERE organization_id = ${ORG_ID} AND name = ${sp.name}
			ORDER BY id
			LIMIT 1
		`;
		if (existing) {
			speakerIds[sp.name] = existing.id;
			// The profile is shared; the participation row is per event and is not.
			await sql`INSERT INTO conference_speaker ${sql({
				conference_id: conferenceId,
				speaker_profile_id: existing.id,
				status: 'confirmed'
			})}`;
			continue;
		}

		const [row] = await sql`INSERT INTO speaker_profile ${sql({
			organization_id: ORG_ID,
			name: sp.name,
			sort_name: sortName(sp.name),
			email: null,
			headshot_url: null,
			job_title: sp.role || null,
			company: sp.company || null,
			bio: sp.bio || null
		})} RETURNING id`;
		speakerIds[sp.name] = row.id;
		await sql`INSERT INTO conference_speaker ${sql({
			conference_id: conferenceId,
			speaker_profile_id: row.id,
			status: 'confirmed'
		})}`;
	}

	// Sessions -> submission (already "accepted", already "approved" for public
	// output) + placement (confirmed, on the grid) + the speakers who gave it.
	let fictionalMinutesUsed = 0;
	for (const s of conf.sessions) {
		const [submission] = await sql`INSERT INTO submission ${sql({
			conference_id: conferenceId,
			track_id: trackIds[s.track ?? 'Unassigned'],
			session_format_id: formatIds[s.format],
			title: s.title,
			abstract: s.abstract || null,
			status: 'accepted',
			content_approval: 'approved',
			submitted_at: at(`${dates[0]}T08:00:00`),
			decided_at: at(`${dates[0]}T08:00:00`)
		})} RETURNING id`;

		// Dedupe: the World's Fair lists "Chau Tran" twice on one session.
		const speakerNames = [...new Set(s.speakers)];
		for (const [i, name] of speakerNames.entries()) {
			const speakerId = speakerIds[name];
			if (!speakerId) continue; // Defensive: every name in the source is declared.
			await sql`INSERT INTO submission_speaker ${sql({
				submission_id: submission.id,
				speaker_profile_id: speakerId,
				is_primary: i === 0,
				role_label: i === 0 ? 'Speaker' : 'Co-presenter',
				position: i
			})}`;
		}

		let startsAt, endsAt;
		if (s.starts_at_local) {
			startsAt = at(s.starts_at_local);
			endsAt = s.ends_at_local
				? at(s.ends_at_local)
				: new Date(startsAt.getTime() + minutesFor(s.format) * 60 * 1000);
		} else {
			startsAt = fictionalSlot(dates[0], fictionalMinutesUsed);
			const minutes = minutesFor(s.format);
			endsAt = new Date(startsAt.getTime() + minutes * 60 * 1000);
			fictionalMinutesUsed += minutes + 5; // A five-minute gap between back-to-back slots.
		}
		const dayKey = s.starts_at_local ? s.starts_at_local.slice(0, 10) : dates[0];

		await sql`INSERT INTO placement ${sql({
			conference_id: conferenceId,
			kind: 'session',
			status: 'confirmed',
			submission_id: submission.id,
			conference_day_id: dayIds[dayKey],
			starts_at: startsAt,
			ends_at: endsAt,
			room_id: s.room ? (roomIds[s.room] ?? null) : null
		})}`;
	}

	return {
		name: conf.name,
		slug: conf.id,
		tracks: trackNames.length,
		sessions: conf.sessions.length,
		speakers: Object.keys(speakerIds).length
	};
}

async function main() {
	console.log('Importing the AI Engineer conferences …');

	// Idempotency, scoped strictly to this org and its one owner account — the
	// DevFlow demo tenant, eval users and every other organization are untouched.
	await sql`DELETE FROM organization WHERE id = ${ORG_ID}`;
	await sql`DELETE FROM "user" WHERE id = ${OWNER_ID}`;

	await sql`INSERT INTO organization ${sql({
		id: ORG_ID,
		name: 'AI Engineer Archive',
		slug: 'ai-engineer-import',
		created_at: new Date()
	})}`;

	await sql`INSERT INTO "user" ${sql({
		id: OWNER_ID,
		name: OWNER_NAME,
		email: OWNER_EMAIL,
		email_verified: true,
		role: 'user',
		created_at: new Date(),
		updated_at: new Date()
	})}`;
	await sql`INSERT INTO member ${sql({
		id: `member-${OWNER_ID}`,
		organization_id: ORG_ID,
		user_id: OWNER_ID,
		role: 'owner',
		created_at: new Date()
	})}`;
	await sql`INSERT INTO account ${sql({
		id: `account-${OWNER_ID}`,
		account_id: OWNER_ID,
		provider_id: 'credential',
		user_id: OWNER_ID,
		password: await hashPassword(IMPORT_PASSWORD),
		created_at: new Date(),
		updated_at: new Date()
	})}`;

	const data = JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
	const results = [];
	for (const conf of data.conferences) {
		results.push(await importConference(conf));
	}

	console.log('\nImported:');
	for (const r of results) {
		console.log(
			`  ${r.name} (/${r.slug}) — ${r.tracks} tracks, ${r.sessions} sessions, ${r.speakers} speakers`
		);
	}
	console.log(`\nOwner login: ${OWNER_EMAIL} / ${IMPORT_PASSWORD}`);
}

main()
	.then(() => sql.end())
	.catch(async (error) => {
		console.error('Import failed:', error.message);
		if (error.constraint_name) console.error('constraint:', error.constraint_name);
		await sql.end();
		process.exit(1);
	});
