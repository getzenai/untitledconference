/**
 * Seeds the DevFlow Conf 2027 demo tenant.
 *
 * The fixture itself lives in `seed-data.mjs`; this file is the part that writes it.
 * The tenant it produces behaves like a real conference mid-review: thirty proposals
 * across every status, two review rounds with scores from three reviewers, a small
 * screening queue for Priya so the reviewer journey has DevFlow work (#654), answers to
 * the configurable questions, and speaker tasks in every state. A screen showing four
 * rows cannot demonstrate filtering, progress or a decision — those criteria fail on
 * emptiness alone, so seed data is part of the submission, not decoration.
 *
 * It also writes password credentials, because a demo nobody can sign into is half a
 * demo. See DEMO_PASSWORD in `seed-data.mjs`.
 *
 * Idempotent: it deletes the demo organization first and cascades everything below it,
 * so it can be re-run against a live database without accumulating duplicates.
 *
 *   node scripts/db/seed-devflow.mjs                 # uses DATABASE_URL
 *   DATABASE_URL=postgres://... node scripts/db/seed-devflow.mjs
 *
 * Deliverable rows point at R2 object keys. The bytes are put there separately by
 * `seed-uploads.mjs`, which reads the manifest this script writes — a row whose object
 * is missing serves a 410, which in a demo reads as a broken download rather than as
 * absent sample data.
 */
import { hashPassword } from 'better-auth/crypto';
import { writeFileSync } from 'node:fs';
import postgres from 'postgres';
import {
	ANSWERS,
	COMMENTS,
	CRITERIA,
	DAYS,
	DEMO_PASSWORD,
	EMAILS,
	FILE_COMMENTS,
	FORMATS,
	LOGIN_NOTES,
	NOTES,
	PEOPLE,
	PRIYA_REVIEW_KEYS,
	ROOMS,
	SPEAKERS,
	SPEAKER_TASKS,
	SUBMISSIONS,
	TRACKS,
	UPLOADS,
	fieldDefinitions
} from './seed-data.mjs';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error('DATABASE_URL is required');
	process.exit(1);
}

const ORG_ID = 'org-devflow';
const CONF_SLUG = 'devflow-conf-2027';
const UPLOAD_MANIFEST = new URL('./.seed-uploads.json', import.meta.url);
const DECIDED = ['accepted', 'rejected', 'waitlisted'];

const sql = postgres(DATABASE_URL, { max: 1 });

const at = (iso) => new Date(iso);
/**
 * Review-round time is relative to seed time, not the calendar (#242).
 *
 * The rounds used to sit on absolute 2027 dates while the seeded reviews sat
 * inside them — so `roundWindowState` said `not_yet_open`, `saveReview`
 * refused, and the demo reviewer met a locked form holding reviews that could
 * never have been filed through it. Relative dates keep the story true
 * whenever the seed runs: a 2027 conference whose screening round is running
 * *now* is the normal case, not a contradiction.
 */
const daysFromNow = (days) => new Date(Date.now() + days * 86_400_000);
/** Deterministic pick, so a re-seed produces the same tenant. */
const pick = (list, n) => list[n % list.length];

async function seedPeople() {
	for (const p of PEOPLE) {
		await sql`INSERT INTO "user" ${sql({
			id: p.id,
			name: p.name,
			email: p.email,
			email_verified: true,
			role: p.role,
			created_at: at('2026-05-01T09:00:00Z'),
			updated_at: at('2026-05-01T09:00:00Z')
		})}`;
		await sql`INSERT INTO member ${sql({
			id: `member-${p.id}`,
			organization_id: ORG_ID,
			user_id: p.id,
			role: p.role === 'admin' ? 'owner' : 'member',
			created_at: at('2026-05-01T09:00:00Z')
		})}`;

		// Better Auth keeps password hashes in `account`, one row per credential
		// provider. `hashPassword` is Better Auth's own scrypt and the app configures no
		// custom hasher, so a hash written here verifies through the ordinary login form
		// rather than through some seed-only side door.
		await sql`INSERT INTO account ${sql({
			id: `account-${p.id}`,
			account_id: p.id,
			provider_id: 'credential',
			user_id: p.id,
			password: await hashPassword(DEMO_PASSWORD),
			created_at: at('2026-05-01T09:00:00Z'),
			updated_at: at('2026-05-01T09:00:00Z')
		})}`;
	}
}

async function seedProgramStructure(conferenceId) {
	const ids = { tracks: {}, formats: {}, rooms: {}, days: [] };

	for (const [i, name] of TRACKS.entries()) {
		const [row] =
			await sql`INSERT INTO track ${sql({ conference_id: conferenceId, name, position: i })} RETURNING id`;
		ids.tracks[name] = row.id;
	}
	for (const [i, [name, minutes]] of FORMATS.entries()) {
		const [row] =
			await sql`INSERT INTO session_format ${sql({ conference_id: conferenceId, name, minutes, position: i })} RETURNING id`;
		ids.formats[name] = row.id;
	}
	for (const [i, name] of ROOMS.entries()) {
		const [row] =
			await sql`INSERT INTO room ${sql({ conference_id: conferenceId, name, position: i })} RETURNING id`;
		ids.rooms[name] = row.id;
	}
	for (const [i, date] of DAYS.entries()) {
		const [row] =
			await sql`INSERT INTO conference_day ${sql({ conference_id: conferenceId, date, position: i })} RETURNING id`;
		ids.days.push(row.id);
	}
	return ids;
}

async function seedSpeakers(conferenceId) {
	const speakerIds = {};
	for (const s of SPEAKERS) {
		const [row] = await sql`INSERT INTO speaker_profile ${sql({
			organization_id: ORG_ID,
			user_id: s.userId,
			name: s.name,
			sort_name: s.sortName,
			email: s.userId
				? PEOPLE.find((p) => p.id === s.userId).email
				: `${s.key}@${s.company.toLowerCase().replace(/[^a-z]/g, '')}.example`,
			headshot_url: s.headshot,
			job_title: s.jobTitle,
			company: s.company,
			bio: s.bio,
			notes: null
		})} RETURNING id`;
		speakerIds[s.key] = row.id;
		await sql`INSERT INTO conference_speaker ${sql({
			conference_id: conferenceId,
			speaker_profile_id: row.id,
			status: 'confirmed'
		})}`;
	}
	return speakerIds;
}

/** What a submitter reads before starting — the prototype's "What we are looking for". */
const CFP_INTRO = `DevFlow is a conference for engineers who ship. We want talks that show the work: the migration that failed first, the number that moved, the trade-off you would make differently today. No product pitches, no roadmap slides.\n\nFirst-time speakers are explicitly welcome — roughly a third of every DevFlow programme is someone’s first conference talk.\n\n- Submissions are read by the program committee of the track you pick.\n- Reviews are anonymous — your name is hidden from reviewers.\n- Travel and two hotel nights are covered for every accepted speaker.\n- You can edit anything until the deadline. Drafts are saved.`;

async function seedCallForPapers(conferenceId, ids) {
	// The call must be OPEN when someone looks at it. `opens_at` was 2026-11-01,
	// which is in the future — the public form correctly answered "this call has
	// not opened yet", so the whole submitter path was unreachable on the demo
	// tenant. A fixed past date keeps the story (a 2027 conference taking
	// proposals now) without making the seed depend on when it is run.
	const [cfpForm] = await sql`INSERT INTO cfp_form ${sql({
		conference_id: conferenceId,
		title: 'DevFlow Conf 2027 — Call for Papers',
		description: CFP_INTRO,
		opens_at: at('2026-06-01T09:00:00Z'),
		closes_at: at('2027-02-15T23:59:00Z'),
		status: 'published'
	})} RETURNING id`;

	const fields = [];
	for (const [i, d] of fieldDefinitions(ids).entries()) {
		const [row] = await sql`INSERT INTO form_field ${sql({
			cfp_form_id: cfpForm.id,
			label: d.label,
			kind: d.kind,
			required: d.required,
			position: i,
			options: null,
			condition_source: d.condition?.source ?? null,
			condition_field_id: null,
			condition_value: d.condition?.value ?? null
		})} RETURNING id`;
		fields.push({ ...d, id: row.id });
	}

	return { cfpFormId: cfpForm.id, fields };
}

/** Which questions a proposal was actually shown — the same rule as `visibleFields`. */
function fieldsFor(submission, fields) {
	return fields.filter((f) => {
		if (!f.condition) return true;
		if (f.condition.source === 'session_format') return submission.format === 'Workshop';
		return submission.track === 'AI Engineering';
	});
}

async function writeAnswers(submissionId, submission, fields) {
	const answers = fieldsFor(submission, fields)
		.map((f) => ({
			submission_id: submissionId,
			form_field_id: f.id,
			value: ANSWERS[f.slug](submission)
		}))
		.filter((a) => a.value !== null);

	if (answers.length > 0) await sql`INSERT INTO submission_answer ${sql(answers)}`;
	return answers.length;
}

async function writeSlot(conferenceId, submissionId, submission, ids) {
	const [day, room, start, end] = submission.slot;
	await sql`INSERT INTO placement ${sql({
		conference_id: conferenceId,
		kind: 'session',
		status: 'confirmed',
		submission_id: submissionId,
		conference_day_id: ids.days[day],
		starts_at: at(`${DAYS[day]}T${start}:00Z`),
		ends_at: at(`${DAYS[day]}T${end}:00Z`),
		room_id: ids.rooms[room],
		recording_url: submission.recording ?? null
	})}`;
}

/** Breaks: no submission, so the one-confirmed-per-submission index does not apply. */
async function writeBreaks(conferenceId, ids) {
	for (const [i, day] of DAYS.entries()) {
		await sql`INSERT INTO placement ${sql({
			conference_id: conferenceId,
			kind: 'block',
			status: 'confirmed',
			title: 'Lunch',
			conference_day_id: ids.days[i],
			starts_at: at(`${day}T12:30:00Z`),
			ends_at: at(`${day}T13:30:00Z`),
			room_id: null
		})}`;
	}
}

/**
 * When each proposal was started.
 *
 * `created_at` was never set, so every row defaulted to `now()` and the
 * dashboard's "Submissions over time" drew thirty-four proposals on one day: a
 * flat axis with a single spike, under a caption promising a trend.
 *
 * The window is the chart's, not the call's. `TIMELINE_DAYS` in `dashboard.ts`
 * plots the last 30 days ending today, so dates spread across the fictional
 * 2026-06..2027-02 call would leave the chart emptier than the bug did — every
 * proposal would fall off the left edge. Verified in a browser before believing
 * otherwise: spreading over the call produced an axis reading "14 Jul – 12 Aug"
 * with one point on it.
 *
 * So proposals land in the 28 days before the seed runs, shaped the way a call
 * actually fills: a trickle, then most of the pile in the last few days. The
 * easing is deterministic — the same run produces the same shape — and only the
 * anchor moves with the clock, which is what keeps the chart populated whenever
 * the demo is seeded.
 */
const CFP_CLOSES_MS = Date.parse('2027-02-15T23:59:00Z');
const TIMELINE_WINDOW_DAYS = 28;
const DAY_MS = 24 * 60 * 60 * 1000;

function startedAt(index, total, now) {
	const share = total <= 1 ? 1 : index / (total - 1);
	// 1 - (1 - share)^2: a rising ramp rather than a cliff. A cubic curve put ten
	// of thirty-four on the final day, which reads as "the deadline is today" —
	// and this call closes in February 2027, so nothing in the fiction explains a
	// last-day rush.
	const eased = 1 - Math.pow(1 - share, 2);
	const span = TIMELINE_WINDOW_DAYS * DAY_MS;
	// An hour spread as well, so several proposals on one day are not all at
	// midnight — the chart counts per day, the submission list shows the time.
	const hourOffset = ((index * 7) % 11) * 60 * 60 * 1000;
	const started = now - span + eased * (span - 12 * 60 * 60 * 1000) + hourOffset;
	// Never in the future, and never after the call it was submitted under closed.
	return new Date(Math.min(started, now - 30 * 60 * 1000, CFP_CLOSES_MS));
}

async function seedSubmissions(conferenceId, ids, speakerIds, call, goldTierId) {
	const submissionIds = {};

	for (const [index, s] of SUBMISSIONS.entries()) {
		const startedOn = startedAt(index, SUBMISSIONS.length, Date.now());
		const [row] = await sql`INSERT INTO submission ${sql({
			conference_id: conferenceId,
			cfp_form_id: call.cfpFormId,
			track_id: ids.tracks[s.track] ?? null,
			session_format_id: s.format ? ids.formats[s.format] : null,
			title: s.title,
			abstract: s.abstract ?? null,
			audience_level: s.status === 'draft' ? null : 'Intermediate',
			sponsor_tier_id: s.key === 'buildtimes' ? goldTierId : null,
			status: s.status,
			content_approval: s.approval,
			created_at: startedOn,
			// A proposal is sent shortly after it is started, not a fortnight before
			// it: a `submitted_at` earlier than `created_at` is a row no real call
			// could produce, and both columns are shown on the same screen.
			submitted_at:
				s.status === 'draft' ? null : new Date(startedOn.getTime() + 2 * 60 * 60 * 1000),
			decided_at: DECIDED.includes(s.status) ? at('2027-03-01T12:00:00Z') : null
		})} RETURNING id`;
		submissionIds[s.key] = row.id;

		for (const [i, key] of s.speakers.entries()) {
			await sql`INSERT INTO submission_speaker ${sql({
				submission_id: row.id,
				speaker_profile_id: speakerIds[key],
				is_primary: i === 0,
				role_label: i === 0 ? 'Speaker' : 'Co-presenter',
				position: i
			})}`;
		}

		// A draft has answered nothing yet — that is the state it is demonstrating.
		if (s.status !== 'draft') await writeAnswers(row.id, s, call.fields);
		if (s.slot) await writeSlot(conferenceId, row.id, s, ids);
	}

	await writeBreaks(conferenceId, ids);
	return submissionIds;
}

async function seedRounds(conferenceId) {
	// Two rounds, so ABS-01 is demonstrable rather than promised.
	const [plan] =
		await sql`INSERT INTO evaluation_plan ${sql({ conference_id: conferenceId, name: 'DevFlow 2027 review' })} RETURNING id`;

	const rounds = [];
	// Round 1 is open (the round the demo reviewer lands in); round 2 is
	// deliberately still `not_yet_open`, because the "Opens in N days" badge is
	// itself worth demonstrating (#242).
	for (const [i, r] of [
		['Round 1 — Screening', false, daysFromNow(-5), daysFromNow(7)],
		['Round 2 — Programme committee', true, daysFromNow(4), daysFromNow(14)]
	].entries()) {
		const [row] = await sql`INSERT INTO review_round ${sql({
			evaluation_plan_id: plan.id,
			name: r[0],
			anonymized: r[1],
			opens_at: r[2],
			closes_at: r[3],
			position: i
		})} RETURNING id`;
		rounds.push(row.id);
	}

	const criteria = { [rounds[0]]: [], [rounds[1]]: [] };
	for (const [i, c] of CRITERIA.entries()) {
		const roundId = rounds[c.round];
		const [row] = await sql`INSERT INTO scorecard_criterion ${sql({
			review_round_id: roundId,
			label: c.label,
			kind: c.kind,
			scale_max: c.scaleMax,
			options: c.options,
			weight: c.weight,
			position: i
		})} RETURNING id`;
		criteria[roundId].push({ id: row.id, kind: c.kind });
	}

	return { rounds, criteria };
}

/**
 * What a reviewer put on the scorecard, derived from where the proposal ended up.
 *
 * Derived rather than invented, because a rejected talk carrying two fives would make
 * the decision look arbitrary on exactly the screen that is meant to justify it.
 */
function scoreFor(status, n) {
	if (status === 'accepted') return { rating: n % 3 === 0 ? 4 : 5, band: 'high' };
	if (status === 'waitlisted' || status === 'in_review') return { rating: 3, band: 'middling' };
	return { rating: n % 2 === 0 ? 2 : 1, band: 'low' };
}

/**
 * Round 1 screens everything that was actually submitted.
 *
 * Sam and Inés still screen everything; Priya holds a three-talk queue on the
 * same open round so signing in as her is a reviewer journey, not a detour
 * through a harness conference (#654). A review by somebody without a
 * membership would contradict the scoping the same screens are meant to show.
 * Everything decided has been reviewed; what is still in review has one reviewer done
 * and one outstanding, which is what makes the progress dashboard (ABS-08) and the
 * reminder set (ABS-09) non-trivial.
 */
function planScreening(roundId, submission, submissionId, counter) {
	return ['user-sam', 'user-ines']
		.map((reviewer, i) => ({
			round: roundId,
			submissionId,
			reviewer,
			submitted:
				DECIDED.includes(submission.status) || (submission.status === 'in_review' && i === 0),
			status: submission.status,
			n: counter + i,
			skip: submission.status === 'withdrawn' && i === 1
		}))
		.filter((r) => !r.skip);
}

/** Round 2 only ever sees what got through screening. */
function planCommittee(roundId, submission, submissionId, counter) {
	if (!['accepted', 'waitlisted', 'in_review'].includes(submission.status)) return [];
	// Assigned, never submitted: round 2 has not opened (#242), and a filed
	// review inside an unopened window is exactly the contradiction this seed
	// used to create. The decisions stay backed by the round-1 screening
	// scores; what round 2 demonstrates is assignments waiting on a window.
	return ['user-ines', 'user-tomas'].map((reviewer, i) => ({
		round: roundId,
		submissionId,
		reviewer,
		submitted: false,
		status: submission.status,
		n: counter + i
	}));
}

/** Three outstanding screening reviews, none of them her own talks. */
function planPriyaReviews(roundId, submissionIds) {
	return PRIYA_REVIEW_KEYS.map((key, i) => {
		const submission = SUBMISSIONS.find((s) => s.key === key);
		if (!submission) throw new Error(`PRIYA_REVIEW_KEYS names unknown submission '${key}'`);
		if (submission.speakers.includes('priya')) {
			throw new Error(`Priya cannot review her own talk '${key}'`);
		}
		return {
			round: roundId,
			submissionId: submissionIds[key],
			reviewer: 'user-priya',
			submitted: false,
			status: submission.status,
			n: 1000 + i
		};
	});
}

function planReviews(rounds, submissionIds) {
	const planned = [];
	for (const s of SUBMISSIONS) {
		if (s.status === 'draft') continue;
		const id = submissionIds[s.key];
		planned.push(...planScreening(rounds[0], s, id, planned.length));
		planned.push(...planCommittee(rounds[1], s, id, planned.length));
	}
	planned.push(...planPriyaReviews(rounds[0], submissionIds));
	return planned;
}

function scoreRows(reviewId, criteria, review) {
	const { rating, band } = scoreFor(review.status, review.n);
	return criteria.map((c) => ({
		review_id: reviewId,
		scorecard_criterion_id: c.id,
		value_number: c.kind === 'rating' ? String(rating) : null,
		value_text:
			c.kind === 'select'
				? pick(['First time', 'Some', 'Seasoned'], review.n)
				: c.kind === 'text'
					? pick(NOTES[band], review.n)
					: null
	}));
}

async function seedReviews(rounds, criteria, submissionIds) {
	const planned = planReviews(rounds, submissionIds);
	const scores = [];

	for (const r of planned) {
		const { band } = scoreFor(r.status, r.n);
		// Screening assignments went out just after round 1 opened; the filed
		// ones were filed inside the open window. Committee assignments are
		// recent — handed out ahead of a round that opens in a few days, which
		// is how a real committee prepares.
		const screening = r.round === rounds[0];
		const [row] = await sql`INSERT INTO review ${sql({
			review_round_id: r.round,
			submission_id: r.submissionId,
			reviewer_user_id: r.reviewer,
			status: r.submitted ? 'submitted' : 'assigned',
			comment: r.submitted ? pick(COMMENTS[band], r.n) : null,
			assigned_at: screening ? daysFromNow(-4) : daysFromNow(-1),
			submitted_at: r.submitted ? daysFromNow(-2) : null
		})} RETURNING id`;

		if (r.submitted) scores.push(...scoreRows(row.id, criteria[r.round], r));
	}

	if (scores.length > 0) await sql`INSERT INTO review_score ${sql(scores)}`;
	return { reviews: planned.length, scores: scores.length };
}

/** Which speaker profiles have an accepted talk, and therefore onboarding tasks. */
function speakersWithAcceptedTalks() {
	const keys = new Set();
	for (const s of SUBMISSIONS) {
		if (s.status !== 'accepted') continue;
		for (const key of s.speakers) keys.add(key);
	}
	return [...keys];
}

async function seedTaskTemplates(conferenceId) {
	const templates = [];
	for (const [i, [title, kind, offset]] of SPEAKER_TASKS.entries()) {
		const [row] = await sql`INSERT INTO task_template ${sql({
			conference_id: conferenceId,
			title,
			kind,
			instructions: kind === 'file_request' ? 'Upload the file here once it is ready.' : null,
			due_offset_days: offset,
			due_on: title === 'Upload final slides' ? at('2027-05-01T23:59:00Z') : null,
			position: i
		})} RETURNING id`;
		templates.push({ id: row.id, title, kind });
	}
	return templates;
}

async function seedTasks(conferenceId, speakerIds) {
	const templates = await seedTaskTemplates(conferenceId);

	// Completion is spread across the roster rather than giving everybody the same two
	// ticked boxes: the organizer's overview exists to show who is behind, and an
	// evenly-finished cohort shows nothing.
	const taskIds = {};
	for (const [i, key] of speakersWithAcceptedTalks().entries()) {
		for (const [j, t] of templates.entries()) {
			const done = t.kind === 'action' && (j === 0 || (j + i) % 3 === 0);
			const [row] = await sql`INSERT INTO task ${sql({
				conference_id: conferenceId,
				speaker_profile_id: speakerIds[key],
				template_id: t.id,
				title: t.title,
				kind: t.kind,
				instructions: t.kind === 'file_request' ? 'Upload the file here once it is ready.' : null,
				due_on: t.title === 'Upload final slides' ? at('2027-05-01T23:59:00Z') : null,
				status: done ? 'done' : 'open',
				completed_at: done ? at('2027-03-05T09:00:00Z') : null
			})} RETURNING id`;
			taskIds[`${key}:${t.title}`] = row.id;
		}
	}
	return taskIds;
}

async function seedDeliverables(conferenceId, taskIds) {
	const manifest = [];
	const ids = {};

	for (const [i, u] of UPLOADS.entries()) {
		const taskId = taskIds[u.task];
		if (!taskId) continue;
		const key = `conference/${conferenceId}/task/${taskId}/v${u.v}/${u.file}`;
		const [row] = await sql`INSERT INTO deliverable ${sql({
			task_id: taskId,
			file_url: key,
			filename: u.file,
			content_type: u.type,
			size_bytes: 184320,
			version: u.v,
			approval_status: u.approval ?? 'pending',
			uploaded_by: u.task.startsWith('marcus') ? 'user-marcus' : 'user-priya',
			uploaded_at: at(`2027-03-0${(i % 5) + 4}T09:00:00Z`)
		})} RETURNING id`;
		ids[`${u.task}:${u.v}`] = row.id;
		manifest.push({ key, source: u.source, contentType: u.type });
		await sql`UPDATE task SET status = 'submitted' WHERE id = ${taskId} AND status = 'open'`;
	}

	for (const [ref, author, body, when] of FILE_COMMENTS) {
		if (!ids[ref]) continue;
		await sql`INSERT INTO file_comment ${sql({
			deliverable_id: ids[ref],
			author_user_id: author,
			body,
			created_at: at(when)
		})}`;
	}

	writeFileSync(UPLOAD_MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
	return manifest.length;
}

async function seedEmailLog(conferenceId, submissionIds) {
	for (const e of EMAILS) {
		await sql`INSERT INTO email_log ${sql({
			conference_id: conferenceId,
			to_email: e.to,
			template: e.template,
			subject: e.subject,
			body_preview: e.preview,
			status: 'sent',
			sent_at: at('2027-03-01T12:05:00Z'),
			related_type: e.submission ? 'submission' : null,
			related_id: e.submission ? submissionIds[e.submission] : null
		})}`;
	}
}

/** Scoped roles (ABS-02): each reviewer sees the rounds they work on, not everything. */
async function seedRoles(conferenceId, rounds) {
	await sql`INSERT INTO membership ${sql({ user_id: 'user-jordan', role: 'organizer', scope_type: 'conference', scope_id: conferenceId })}`;
	await sql`INSERT INTO membership ${sql([
		{ user_id: 'user-sam', role: 'reviewer', scope_type: 'round', scope_id: rounds[0] },
		{ user_id: 'user-ines', role: 'reviewer', scope_type: 'round', scope_id: rounds[0] },
		{ user_id: 'user-ines', role: 'reviewer', scope_type: 'round', scope_id: rounds[1] },
		{ user_id: 'user-tomas', role: 'reviewer', scope_type: 'round', scope_id: rounds[1] },
		{ user_id: 'user-priya', role: 'reviewer', scope_type: 'round', scope_id: rounds[0] }
	])}`;
}

async function report(conferenceId, reviewCounts, fileCount) {
	const [counts] = await sql`
		SELECT
			(SELECT count(*) FROM submission WHERE conference_id = ${conferenceId}) AS submissions,
			(SELECT count(*) FROM submission WHERE conference_id = ${conferenceId} AND status = 'accepted') AS accepted,
			(SELECT count(*) FROM submission WHERE conference_id = ${conferenceId} AND content_approval = 'pending') AS withheld,
			(SELECT count(*) FROM submission_answer a JOIN submission s ON s.id = a.submission_id
				WHERE s.conference_id = ${conferenceId}) AS answers,
			(SELECT count(*) FROM placement WHERE conference_id = ${conferenceId} AND status = 'confirmed') AS confirmed,
			(SELECT count(*) FROM speaker_profile WHERE organization_id = ${ORG_ID}) AS speakers,
			(SELECT count(*) FROM review r JOIN submission s ON s.id = r.submission_id
				WHERE s.conference_id = ${conferenceId} AND r.status = 'assigned') AS reviews_open,
			(SELECT count(*) FROM task WHERE conference_id = ${conferenceId}) AS tasks`;

	console.log('Seeded:', counts);
	console.log(`Reviews: ${reviewCounts.reviews}, with ${reviewCounts.scores} scores`);
	console.log(`Public URL path: /c/${CONF_SLUG}`);

	console.log(`\nDemo logins — the password for every one of them is: ${DEMO_PASSWORD}`);
	for (const p of PEOPLE) console.log(`  ${p.email.padEnd(30)} ${LOGIN_NOTES[p.id]}`);

	console.log(
		`\n${fileCount} deliverable rows written; their bytes are not in storage yet:\n` +
			`  node scripts/db/seed-uploads.mjs            # local storage\n` +
			`  node scripts/db/seed-uploads.mjs --remote   # the real bucket — only for a production seed`
	);
}

async function main() {
	// `run-db-script.yaml` passes `--dry-run` by default. This script used to
	// ignore the flag silently — a "dry run" that reseeds for real is the worst
	// possible reading of that default, so honor it before touching anything.
	if (process.argv.includes('--dry-run')) {
		console.log(
			`DRY RUN — would delete organization '${ORG_ID}' (everything under it cascades) ` +
				`and the ${PEOPLE.length} demo users, then reseed the DevFlow demo tenant from scratch. ` +
				`No other organization is touched. Nothing was changed.`
		);
		return;
	}

	console.log('Seeding DevFlow Conf 2027 …');

	// Idempotency: everything below the demo org cascades away.
	await sql`DELETE FROM organization WHERE id = ${ORG_ID}`;
	await sql`DELETE FROM "user" WHERE id IN ${sql(PEOPLE.map((p) => p.id))}`;

	await sql`INSERT INTO organization ${sql({ id: ORG_ID, name: 'DevFlow Conf', slug: 'devflow', created_at: at('2026-05-01T09:00:00Z') })}`;
	await seedPeople();

	const [conference] = await sql`INSERT INTO conference ${sql({
		organization_id: ORG_ID,
		name: 'DevFlow Conf 2027',
		slug: CONF_SLUG,
		venue: 'Moscone West, San Francisco',
		starts_on: '2027-05-12',
		ends_on: '2027-05-14',
		cfp_intro:
			'DevFlow Conf brings together the people who build and run developer platforms. We are looking for practical talks with something at stake — what you tried, what broke, and what you would do differently.',
		status: 'published',
		// See #402: the directory is a separate decision from publishing.
		listed_publicly: true
	})} RETURNING id`;
	const conferenceId = conference.id;

	const ids = await seedProgramStructure(conferenceId);

	// Internal axis — must never surface publicly or to reviewers.
	const [goldTier] =
		await sql`INSERT INTO sponsor_tier ${sql({ conference_id: conferenceId, name: 'Gold', note: 'Includes one 30-minute slot', position: 0 })} RETURNING id`;

	const speakerIds = await seedSpeakers(conferenceId);
	const call = await seedCallForPapers(conferenceId, ids);
	const submissionIds = await seedSubmissions(conferenceId, ids, speakerIds, call, goldTier.id);

	const { rounds, criteria } = await seedRounds(conferenceId);
	const reviewCounts = await seedReviews(rounds, criteria, submissionIds);
	await seedRoles(conferenceId, rounds);

	const taskIds = await seedTasks(conferenceId, speakerIds);
	const fileCount = await seedDeliverables(conferenceId, taskIds);
	await seedEmailLog(conferenceId, submissionIds);

	await report(conferenceId, reviewCounts, fileCount);
}

main()
	.then(() => sql.end())
	.catch(async (error) => {
		console.error('Seed failed:', error.message);
		if (error.constraint_name) console.error('constraint:', error.constraint_name);
		await sql.end();
		process.exit(1);
	});
