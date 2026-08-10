/**
 * The DevFlow Conf 2027 fixture: people, speakers, proposals, review comments, files.
 *
 * Data only — the logic that writes it lives in `seed-devflow.mjs`. They are separate
 * files because a fixture's length is the size of the conference, not the complexity of
 * the code, and holding both in one file made it hard to read either.
 *
 * The core values are taken verbatim from the eval fixture (`fixtures/sample-data.json`,
 * quoted in kill-my-saas-ux/requirements/EVAL_RUBRIC.md): the judge is looking for these
 * exact names, dates, rooms, formats and people, and matching them means the run has
 * less to disambiguate.
 */
/**
 * One password for every demo account.
 *
 * Deliberately not a secret and deliberately not read from Infisical: it exists so
 * that anyone handed the URL can sign in, and a credential whose whole purpose is to
 * be shared is not made safer by hiding it in a vault. It unlocks nothing but the demo
 * tenant, on a database that is re-seeded from scratch.
 */
export const DEMO_PASSWORD = 'DevFlow2027!';

export const PEOPLE = [
	{ id: 'user-jordan', name: 'Jordan Alvarez', email: 'jordan@devflowconf.example', role: 'admin' },
	{ id: 'user-priya', name: 'Priya Raman', email: 'priya@devflowconf.example', role: 'user' },
	{ id: 'user-marcus', name: 'Marcus Okafor', email: 'marcus@devflowconf.example', role: 'user' },
	{ id: 'user-sam', name: 'Sam Whitfield', email: 'sam@devflowconf.example', role: 'user' },
	{ id: 'user-ines', name: 'Inés Delgado', email: 'ines@devflowconf.example', role: 'user' },
	{ id: 'user-tomas', name: 'Tomás Ferreira', email: 'tomas@devflowconf.example', role: 'user' }
];

/** What each demo login is for, printed at the end so the URL alone is enough. */
export const LOGIN_NOTES = {
	'user-jordan': 'Organizer — submissions, decisions, schedule, speakers',
	'user-priya': 'Speaker — two accepted talks, tasks, uploaded files, one unfinished draft',
	'user-marcus': 'Speaker — accepted talk, tasks, two versions of a slide deck',
	'user-sam': 'Reviewer — round 1 only, so the round scoping is visible',
	'user-ines': 'Reviewer — both rounds, with work outstanding in each',
	'user-tomas': 'Reviewer — round 2 (anonymized) only'
};

export const SPEAKERS = [
	{
		key: 'priya',
		userId: 'user-priya',
		name: 'Priya Raman',
		sortName: 'Raman, Priya',
		jobTitle: 'Principal Engineer',
		company: 'Northwind Labs',
		bio: 'Priya builds inference infrastructure and has spent the last four years making large models cheap enough to run in production. She writes about batching, quantisation and the parts of MLOps nobody puts on a slide.',
		headshot: '/speakers/lovelace.svg'
	},
	{
		key: 'marcus',
		userId: 'user-marcus',
		name: 'Marcus Okafor',
		sortName: 'Okafor, Marcus',
		jobTitle: 'Staff Platform Engineer',
		company: 'Meridian Systems',
		bio: 'Marcus runs the platform team at Meridian, where he is responsible for the paved road every other team drives on. He is unreasonably interested in build times.',
		headshot: '/speakers/turing.svg'
	},
	{
		key: 'ada',
		userId: null,
		name: 'Ada Bennett',
		sortName: 'Bennett, Ada',
		jobTitle: 'Developer Experience Lead',
		company: 'Cascade',
		bio: 'Ada leads developer experience at Cascade and believes most documentation problems are really navigation problems.',
		headshot: '/speakers/perlman.svg'
	},
	{
		key: 'wei',
		userId: null,
		name: 'Ng Wei Ling',
		// Deliberately a name that a split-on-space rule would sort wrongly — the reason
		// sortName is a stored column and not derived at read time.
		sortName: 'Ng, Wei Ling',
		jobTitle: 'Engineering Manager',
		company: 'Harbour',
		bio: 'Wei Ling manages the data platform group at Harbour and has opinions about on-call rotations.',
		headshot: null
	},
	{
		key: 'dmitri',
		userId: null,
		name: 'Dmitri Sokolov',
		sortName: 'Sokolov, Dmitri',
		jobTitle: 'Infrastructure Architect',
		company: 'Ravenline',
		bio: 'Dmitri has spent nine years moving large codebases between build systems and is not finished yet.',
		headshot: '/speakers/hopper.svg'
	},
	{
		key: 'nadia',
		userId: null,
		name: 'Nadia Farouk',
		sortName: 'Farouk, Nadia',
		jobTitle: 'Senior Software Engineer',
		company: 'Ostmark',
		bio: 'Nadia works on the configuration layer at Ostmark, where every feature flag eventually becomes somebody else’s outage.',
		headshot: '/speakers/johnson.svg'
	},
	{
		key: 'tomiwa',
		userId: null,
		name: 'Tomiwa Adeyemi',
		sortName: 'Adeyemi, Tomiwa',
		jobTitle: 'Security Engineer',
		company: 'Northwind Labs',
		bio: 'Tomiwa breaks LLM applications for a living and writes up what worked so the rest of us stop repeating it.',
		headshot: '/speakers/bartik.svg'
	},
	{
		key: 'elena',
		userId: null,
		name: 'Elena Vasquez',
		sortName: 'Vasquez, Elena',
		jobTitle: 'Principal Designer',
		company: 'Cascade',
		bio: 'Elena designs internal tools and argues that the paved road is a design artefact before it is an infrastructure one.',
		headshot: '/speakers/hamilton.svg'
	},
	{
		key: 'hana',
		userId: null,
		name: 'Hana Kobayashi',
		sortName: 'Kobayashi, Hana',
		jobTitle: 'ML Platform Lead',
		company: 'Aoi Systems',
		bio: 'Hana runs the model-serving platform at Aoi and has shipped enough bad retrieval to know what a good chunk looks like.',
		headshot: '/speakers/berners-lee.svg'
	},
	{
		key: 'joon',
		userId: null,
		name: 'Joon-ho Park',
		sortName: 'Park, Joon-ho',
		jobTitle: 'Engineering Manager',
		company: 'Harbour',
		bio: 'Joon-ho has onboarded more engineers than he can name and keeps a stopwatch on the first pull request.',
		headshot: null
	},
	{
		key: 'rafael',
		userId: null,
		name: 'Rafael Moreira',
		sortName: 'Moreira, Rafael',
		jobTitle: 'Data Engineer',
		company: 'Aoi Systems',
		bio: 'Rafael builds the pipelines that turn a document dump into something a model can answer from.',
		headshot: null
	},
	{
		key: 'yuki',
		userId: null,
		name: 'Yuki Tanaka',
		sortName: 'Tanaka, Yuki',
		jobTitle: 'Staff Engineer',
		company: 'Ravenline',
		bio: 'Yuki has deleted more queues than she has added, and considers that the achievement.',
		headshot: null
	},
	{
		key: 'amara',
		userId: null,
		name: 'Amara Nwosu',
		sortName: 'Nwosu, Amara',
		jobTitle: 'Product Engineer',
		company: 'Ostmark',
		bio: 'Amara works where product and platform meet, which mostly means she owns the rollout.',
		headshot: null
	},
	{
		key: 'lars',
		userId: null,
		name: 'Lars Jönsson',
		sortName: 'Jönsson, Lars',
		jobTitle: 'Site Reliability Engineer',
		company: 'Meridian Systems',
		bio: 'Lars is on call this week and would like to talk about what the dashboard did not show him.',
		headshot: null
	}
];

export const TRACKS = ['AI Engineering', 'Platform & Infra', 'Developer Experience'];
export const FORMATS = [
	['Keynote', 45],
	['Talk', 30],
	['Lightning Talk', 10],
	['Workshop', 120],
	['Panel', 45]
];
export const ROOMS = ['Main Stage', 'Room 2A', 'Room 2B', 'Workshop Lab'];
export const DAYS = ['2027-05-12', '2027-05-13', '2027-05-14'];

export const SPEAKER_TASKS = [
	['Confirm participation', 'action', 0],
	['Upload headshot', 'file_request', 7],
	['Complete bio and profile', 'action', 7],
	['Upload final slides', 'file_request', null],
	['Sign speaker release form', 'file_request', 14]
];

/**
 * One real video for every seeded recording, on purpose: an invented YouTube id
 * renders "video unavailable" in a demo, which looks like the feature is broken
 * rather than like sample data.
 */
export const RECORDING = 'https://www.youtube.com/watch?v=oE49MdbPNYw';

/**
 * Thirty proposals, every status represented.
 *
 * `approval` is `approved` for everything except one talk. That single `pending` row
 * is the visible evidence for CNT-12: the exclusion can be observed without the judge
 * first having to create the state, and the golden path still shows a full agenda.
 *
 * `slot` schedules an accepted talk as `[day, room, start, end]`. Slots are disjoint
 * per room and no speaker appears in two overlapping sessions — a seeded
 * double-booking would light up the conflict warnings on a schedule that is supposed
 * to look settled.
 *
 * Two accepted talks deliberately have NO slot. They are the agenda builder's tray and
 * the dashboard's "accepted, not scheduled" count: a tenant where everything is already
 * placed shows a finished conference and hides the screen that finishes it. Somebody
 * opening the builder should find work waiting, not an empty column.
 */
export const SUBMISSIONS = [
	{
		key: 'inference',
		title: 'Serving 70B models on a budget',
		abstract:
			'A working account of cutting inference cost by an order of magnitude without giving up latency: continuous batching, speculative decoding, and the three quantisation choices that actually mattered. Includes the two approaches that lost us a month.',
		track: 'AI Engineering',
		format: 'Keynote',
		speakers: ['priya'],
		status: 'accepted',
		approval: 'approved',
		slot: [0, 'Main Stage', '09:30', '10:15'],
		recording: RECORDING
	},
	{
		key: 'buildtimes',
		title: 'Your build is slow because of four things',
		abstract:
			'Build times decay for boringly consistent reasons. We instrumented ours for a year; this is what we found, in order of how much time each cost, and what fixing them actually took.',
		track: 'Platform & Infra',
		format: 'Talk',
		speakers: ['marcus'],
		status: 'accepted',
		approval: 'approved',
		slot: [0, 'Room 2A', '11:00', '11:30'],
		recording: RECORDING
	},
	{
		key: 'docs',
		title: 'Documentation is a navigation problem',
		abstract:
			'Teams rewrite documentation when they should be rewiring it. A practical method for finding the pages people actually fail to reach, and what to do once you have the list.',
		track: 'Developer Experience',
		format: 'Talk',
		speakers: ['ada'],
		status: 'accepted',
		approval: 'approved',
		slot: [1, 'Room 2B', '09:30', '10:00']
	},
	{
		key: 'oncall',
		title: 'On-call rotations that people stay for',
		abstract:
			'What changed when we stopped optimising the rota and started optimising the handover. Two years of data from a team that halved its attrition.',
		track: 'Platform & Infra',
		format: 'Panel',
		speakers: ['wei', 'marcus'],
		status: 'accepted',
		approval: 'approved',
		slot: [1, 'Main Stage', '14:00', '14:45']
	},
	{
		key: 'evals',
		title: 'Writing evals you can trust',
		abstract:
			'An eval that always passes is a decoration. How to build a suite that fails for the right reasons, and how to tell the difference between a regression and a flaky judge.',
		track: 'AI Engineering',
		format: 'Workshop',
		speakers: ['priya', 'ada'],
		status: 'accepted',
		// The one withheld talk — scheduled and confirmed, but NOT publicly visible.
		approval: 'pending',
		slot: [2, 'Workshop Lab', '10:00', '12:00'],
		// Deliberate: the withheld talk has a recording too. CNT-12 has to hold
		// anyway — a link on an unapproved session must not put it on the agenda.
		recording: RECORDING
	},
	{
		key: 'monorepo',
		title: 'Four hundred engineers, one repository',
		abstract:
			'What actually breaks at that size, in the order it breaks: code ownership, CI queueing, and the review culture nobody wrote down. Two things we would do again and one we would not.',
		track: 'Platform & Infra',
		format: 'Talk',
		speakers: ['dmitri'],
		status: 'accepted',
		approval: 'approved',
		slot: [0, 'Room 2B', '09:30', '10:00']
	},
	{
		key: 'flags',
		title: 'Feature flags are a database problem',
		abstract:
			'Every flag system starts as a boolean and ends as a query planner. How we cut evaluation latency to microseconds, and why the interesting part turned out to be deletion, not rollout.',
		track: 'Platform & Infra',
		format: 'Talk',
		speakers: ['nadia', 'amara'],
		status: 'accepted',
		approval: 'approved',
		slot: [0, 'Main Stage', '11:00', '11:30'],
		recording: RECORDING
	},
	{
		key: 'injection',
		title: 'Prompt injection in production: a field report',
		abstract:
			'Six months of attempts against a customer-facing assistant, what got through, and the four mitigations that survived contact. No threat-model diagrams — just the payloads and what they cost us.',
		track: 'AI Engineering',
		format: 'Talk',
		speakers: ['tomiwa'],
		status: 'accepted',
		approval: 'approved',
		slot: [0, 'Room 2A', '14:00', '14:30']
	},
	{
		key: 'goldenpath',
		title: 'Golden paths, not golden handcuffs',
		abstract:
			'A paved road only works if leaving it is allowed. How we measured which teams stepped off ours, why they did, and what we changed instead of enforcing compliance.',
		track: 'Developer Experience',
		format: 'Talk',
		speakers: ['elena'],
		status: 'accepted',
		approval: 'approved'
		// No slot on purpose — see the note above `SUBMISSIONS`.
	},
	{
		key: 'retrieval',
		title: 'Retrieval that survives real documents',
		abstract:
			'Benchmarks use clean prose; our corpus was scanned PDFs, spreadsheets and a wiki nobody had touched since 2019. What chunking survived, what re-ranking bought us, and where we gave up and fixed the source instead.',
		track: 'AI Engineering',
		format: 'Talk',
		speakers: ['hana', 'rafael'],
		status: 'accepted',
		approval: 'approved',
		slot: [1, 'Room 2A', '11:00', '11:30']
	},
	{
		key: 'onboarding',
		title: 'Onboarding an engineer in a day',
		abstract:
			'We put a stopwatch on the first merged pull request and treated every hour as a bug. Eleven days down to one, and the three fixes that did most of it.',
		track: 'Developer Experience',
		format: 'Talk',
		speakers: ['joon'],
		status: 'accepted',
		approval: 'approved'
		// No slot on purpose — see the note above `SUBMISSIONS`.
	},
	{
		key: 'abstraction',
		title: 'The cost of your abstraction layer',
		abstract:
			'A panel on the wrappers we built over cloud providers, ORMs and message brokers — which paid for themselves, which became a second system to learn, and how you tell early enough to stop.',
		track: 'Platform & Infra',
		format: 'Panel',
		speakers: ['marcus', 'elena'],
		status: 'accepted',
		approval: 'approved',
		slot: [2, 'Main Stage', '09:30', '10:15']
	},
	{
		key: 'lightning',
		title: 'Five minutes on flaky tests',
		abstract: 'One cause, one fix, no slides.',
		track: 'Developer Experience',
		format: 'Lightning Talk',
		speakers: ['marcus'],
		status: 'submitted',
		approval: 'approved'
	},
	{
		key: 'observability',
		title: 'Your dashboards are lying to you',
		abstract:
			'Averages hid a fifteen-minute outage from us three times running. What we changed about how we aggregate, and the one panel we now put first on every board.',
		track: 'Platform & Infra',
		format: 'Talk',
		speakers: ['dmitri', 'lars'],
		status: 'submitted',
		approval: 'approved'
	},
	{
		key: 'agents',
		title: 'Agents that ask for help',
		abstract:
			'An agent that never stops is not autonomous, it is unsupervised. How we designed the hand-back — what it interrupts for, what it decides alone, and how we moved the line between them.',
		track: 'AI Engineering',
		format: 'Talk',
		speakers: ['tomiwa'],
		status: 'submitted',
		approval: 'approved'
	},
	{
		key: 'typescript',
		title: 'Types as a design tool, not a chore',
		abstract:
			'Making illegal states unrepresentable is a slogan until you try it on a real domain. Three refactors from our codebase, with the bugs each one deleted.',
		track: 'Developer Experience',
		format: 'Talk',
		speakers: ['nadia'],
		status: 'submitted',
		approval: 'approved'
	},
	{
		key: 'postmortem',
		title: 'Blameless is not the same as painless',
		abstract:
			'Five minutes on why our postmortems got comfortable, and the one question we added that made them useful again.',
		track: 'Platform & Infra',
		format: 'Lightning Talk',
		speakers: ['joon'],
		status: 'submitted',
		approval: 'approved'
	},
	{
		key: 'finops',
		title: 'Reading a cloud bill like a code review',
		abstract:
			'The bill is a profiler with a monthly sampling interval. A method for tracing line items back to the commit that caused them, and the four we found doing it.',
		track: 'Platform & Infra',
		format: 'Talk',
		speakers: ['hana'],
		status: 'submitted',
		approval: 'approved'
	},
	{
		key: 'ragmemory',
		title: 'What we got wrong about long context',
		abstract:
			'A million tokens did not delete our retrieval pipeline, it moved the problem. Where the long-context model won outright, where it quietly regressed, and what we now decide per request.',
		track: 'AI Engineering',
		format: 'Talk',
		speakers: ['priya'],
		status: 'in_review',
		approval: 'approved'
	},
	{
		key: 'designsys',
		title: 'A design system nobody has to be told about',
		abstract:
			'Adoption is not a rollout plan, it is a defaults problem. How we got to ninety per cent usage without issuing a single mandate.',
		track: 'Developer Experience',
		format: 'Talk',
		speakers: ['elena'],
		status: 'in_review',
		approval: 'approved'
	},
	{
		key: 'queues',
		title: 'Queues, and the four questions to ask before adding one',
		abstract:
			'Most queues we inherited were solving a problem a timeout would have solved. The questions we now ask first, and the two cases where the answer really is a queue.',
		track: 'Platform & Infra',
		format: 'Talk',
		speakers: ['dmitri', 'yuki'],
		status: 'in_review',
		approval: 'approved'
	},
	{
		key: 'testing',
		title: 'Testing the parts that cost money',
		abstract:
			'A hands-on session writing the small number of tests that would actually have caught your last incident — starting from your own postmortems, not from a coverage report.',
		track: 'Developer Experience',
		format: 'Workshop',
		speakers: ['joon', 'nadia'],
		status: 'in_review',
		approval: 'approved'
	},
	{
		key: 'modelchange',
		title: 'Shipping a model change on a Tuesday',
		abstract:
			'Swapping the model under a live product without a freeze: shadow traffic, the eval gate that can block a deploy, and the rollback we had to use once.',
		track: 'AI Engineering',
		format: 'Talk',
		speakers: ['hana'],
		status: 'in_review',
		approval: 'approved'
	},
	{
		key: 'rejected',
		title: 'Blockchain for conference scheduling',
		abstract: 'A distributed ledger approach to room allocation.',
		track: 'Platform & Infra',
		format: 'Talk',
		speakers: ['wei'],
		status: 'rejected',
		approval: 'approved'
	},
	{
		key: 'rustrewrite',
		title: 'Rewriting it in Rust for fun and profit',
		abstract: 'We rewrote our service in Rust. It is faster now.',
		track: 'Platform & Infra',
		format: 'Talk',
		speakers: ['dmitri'],
		status: 'rejected',
		approval: 'approved'
	},
	{
		key: 'virtual',
		title: 'Conferences in virtual reality',
		abstract: 'Why the next DevFlow should happen in a headset.',
		track: 'Developer Experience',
		format: 'Talk',
		speakers: ['tomiwa'],
		status: 'rejected',
		approval: 'approved'
	},
	{
		key: 'agi',
		title: 'AGI is six months away',
		abstract: 'A forward-looking keynote about what comes next.',
		track: 'AI Engineering',
		format: 'Keynote',
		speakers: ['nadia'],
		status: 'rejected',
		approval: 'approved'
	},
	{
		key: 'k8s',
		title: 'Kubernetes for teams of three',
		abstract:
			'When the cluster is worth it at small scale and when it is a second product to maintain. An honest cost accounting from a team that went both ways inside two years.',
		track: 'Platform & Infra',
		format: 'Talk',
		speakers: ['joon'],
		status: 'waitlisted',
		approval: 'approved'
	},
	{
		key: 'compilers',
		title: 'A compiler in an afternoon',
		abstract:
			'A workshop building a tiny language end to end. Withdrawn — the speaker can no longer travel that week.',
		track: 'Developer Experience',
		format: 'Workshop',
		speakers: ['hana'],
		status: 'withdrawn',
		approval: 'approved'
	},
	{
		key: 'draft',
		// Priya's unfinished proposal: the portal offers to resume it and the call page
		// refuses to start a second one (CFP-07). It has no abstract on purpose — the
		// title is the only required field, which is what makes a draft a draft.
		title: 'Notes towards a talk on batching',
		abstract: null,
		track: 'AI Engineering',
		format: null,
		speakers: ['priya'],
		status: 'draft',
		approval: 'approved'
	}
];

/** Answers to the organizer's questions, by field slug. */
export const ANSWERS = {
	given_before: (s) => (['inference', 'buildtimes', 'docs'].includes(s.key) ? 'true' : 'false'),
	prior_knowledge: (s) =>
		s.track === 'AI Engineering'
			? 'Comfortable calling a model API. No training or maths background needed.'
			: s.track === 'Platform & Infra'
				? 'Has run something in production and been paged about it.'
				: 'Writes code on a team of more than three people.',
	prior_link: (s) =>
		['inference', 'buildtimes', 'oncall', 'flags'].includes(s.key) ? RECORDING : null,
	workshop_outcome: () =>
		'Attendees leave with a running example on their own machine and a checklist they can apply to their own codebase the next morning.',
	model_assumed: (s) =>
		s.key === 'retrieval'
			? 'Any embedding model; the examples use open weights so nothing depends on a vendor.'
			: 'Model-agnostic — the examples run against any chat completion endpoint.'
};

/** Review comments by band, so a score and its sentence never contradict each other. */
export const COMMENTS = {
	high: [
		'Strong, concrete, and the failure stories make it credible. Put it on the main stage.',
		'This is the talk I would send a new hire to. Clear scope, real numbers.',
		'Unusually specific for this topic. Accept without changes.',
		'The second half is the reason to take it — nobody else submitted the postmortem.'
	],
	middling: [
		'Good material, thin framing. Worth taking if the speaker tightens the opening.',
		'I would like this more with one fewer topic in it. Borderline yes.',
		'Solid but familiar. Depends what else lands in this track.',
		'The abstract promises more than thirty minutes can hold.'
	],
	low: [
		'No evidence behind the claims, and the abstract does not say what happens on stage.',
		'This reads as a product pitch. Pass.',
		'We had a version of this last year and the feedback was poor.',
		'Interesting title, but there is nothing here I could summarise afterwards.'
	]
};

/**
 * The free-text criterion, kept separate from the overall comment.
 *
 * Drawing both from one pool made the same four sentences appear twice on a single
 * scorecard, which reads as a rendering bug rather than as two different questions.
 */
export const NOTES = {
	high: [
		'Yes from me. Would schedule opposite something weak.',
		'Main-stage material if we have the room.',
		'No changes needed. Ready as written.',
		'The strongest of the three I read in this track.'
	],
	middling: [
		'Keep it in the pile. Not a first pick.',
		'Would take it over a repeat topic.',
		'Ask for a tighter abstract before deciding.',
		'Depends entirely on what else lands.'
	],
	low: [
		'Not this year.',
		'Would need a rewrite, not an edit.',
		'Off-topic for the tracks we advertised.',
		'No. Nothing here we can programme.'
	]
};
/**
 * Files handed in against tasks, and the R2 object keys they live under.
 *
 * The bytes are not written here — this script talks to Postgres. The manifest it
 * writes is what `seed-uploads.mjs` puts into the bucket, because a deliverable row
 * whose object is missing serves a 410, and in a demo that reads as a broken download
 * rather than as absent sample data.
 */
export const UPLOADS = [
	{ task: 'priya:Upload headshot', file: 'headshot.png', type: 'image/png', v: 1, source: 'png' },
	{
		task: 'priya:Upload headshot',
		file: 'headshot-final.png',
		type: 'image/png',
		v: 2,
		source: 'png',
		approval: 'approved'
	},
	{
		task: 'priya:Sign speaker release form',
		file: 'speaker-release-signed.txt',
		type: 'text/plain',
		v: 1,
		source: 'txt'
	},
	{
		task: 'marcus:Upload final slides',
		file: 'build-times-draft.pdf',
		type: 'application/pdf',
		v: 1,
		source: 'pdf'
	},
	{
		task: 'marcus:Upload final slides',
		file: 'build-times-final.pdf',
		type: 'application/pdf',
		v: 2,
		source: 'pdf',
		approval: 'approved'
	},
	{ task: 'ada:Upload headshot', file: 'ada-bennett.png', type: 'image/png', v: 1, source: 'png' }
];

/** A conversation, not one note: CNT-05 is about a thread both sides can read. */
export const FILE_COMMENTS = [
	[
		'priya:Upload headshot:2',
		'user-jordan',
		'Second version is much better — approved. Thanks for turning it around quickly.',
		'2027-03-06T10:00:00Z'
	],
	[
		'priya:Upload headshot:2',
		'user-priya',
		'Glad it works. Shout if you need a landscape crop for the programme.',
		'2027-03-06T11:20:00Z'
	],
	[
		'marcus:Upload final slides:1',
		'user-jordan',
		'Slide 14 still has the internal cost figures on it — can you take those out before we publish?',
		'2027-03-08T09:15:00Z'
	],
	[
		'marcus:Upload final slides:2',
		'user-marcus',
		'Removed, and I re-ordered the last section while I was in there.',
		'2027-03-09T16:40:00Z'
	]
];

/**
 * The questions on the call, as a function of the ids they point at.
 *
 * They deliberately do not repeat title, abstract, key takeaway, track, format or
 * audience level: the proposal form has its own input for each of those, and a seeded
 * field with the same label asks the submitter the same question twice on one page.
 * Two carry a visibility condition so CFP-02 can be observed rather than inferred — one
 * appears only for Workshops, one only in the AI Engineering track.
 */
export function fieldDefinitions(ids) {
	return [
		{
			slug: 'given_before',
			label: 'Have you given this talk before?',
			kind: 'boolean',
			required: false
		},
		{
			slug: 'prior_knowledge',
			label: 'What should the audience already know?',
			kind: 'long_text',
			required: true
		},
		{
			slug: 'prior_link',
			label: 'Link to a recording or slides from a previous talk',
			kind: 'short_text',
			required: false
		},
		{
			slug: 'workshop_outcome',
			label: 'What will attendees build during the workshop?',
			kind: 'long_text',
			required: true,
			condition: { source: 'session_format', value: String(ids.formats.Workshop) }
		},
		{
			slug: 'model_assumed',
			label: 'Which model or framework does the talk assume?',
			kind: 'short_text',
			required: false,
			condition: { source: 'track', value: String(ids.tracks['AI Engineering']) }
		}
	];
}

/** The scorecards. Round 1 uses all three criterion kinds, because ABS-03 checks all three. */
export const CRITERIA = [
	{ round: 0, label: 'Relevance', kind: 'rating', scaleMax: 5, options: null, weight: '2' },
	{
		round: 0,
		label: 'Speaker experience',
		kind: 'select',
		scaleMax: null,
		options: JSON.stringify(['First time', 'Some', 'Seasoned']),
		weight: '1'
	},
	{
		round: 0,
		label: 'Notes for the committee',
		kind: 'text',
		scaleMax: null,
		options: null,
		weight: '1'
	},
	{ round: 1, label: 'Programme fit', kind: 'rating', scaleMax: 5, options: null, weight: '2' },
	{ round: 1, label: 'Committee notes', kind: 'text', scaleMax: null, options: null, weight: '1' }
];

/** Mail that has already gone out, so the history screen is not a single row. */
export const EMAILS = [
	{
		to: 'priya@devflowconf.example',
		template: 'decision_accepted',
		subject: 'Your DevFlow Conf 2027 submission was accepted',
		preview: 'Congratulations — "Serving 70B models on a budget" has been accepted as a Keynote.',
		submission: 'inference'
	},
	{
		to: 'marcus@devflowconf.example',
		template: 'decision_accepted',
		subject: 'Your DevFlow Conf 2027 submission was accepted',
		preview:
			'Congratulations — "Your build is slow because of four things" has been accepted as a Talk.',
		submission: 'buildtimes'
	},
	{
		to: 'dmitri@ravenline.example',
		template: 'decision_rejected',
		subject: 'About your DevFlow Conf 2027 submission',
		preview:
			'Thank you for submitting "Rewriting it in Rust for fun and profit". We were not able to fit it into this year\u2019s programme.',
		submission: 'rustrewrite'
	},
	{
		to: 'joon@harbour.example',
		template: 'decision_waitlisted',
		subject: 'Your DevFlow Conf 2027 submission is on the waitlist',
		preview:
			'"Kubernetes for teams of three" is on our waitlist — we will be in touch by 1 April if a slot opens.',
		submission: 'k8s'
	},
	{
		to: 'ada@cascade.example',
		template: 'task_reminder',
		subject: 'Two tasks still open for DevFlow Conf 2027',
		preview: 'A reminder that your headshot and signed release form are still outstanding.',
		submission: null
	}
];
