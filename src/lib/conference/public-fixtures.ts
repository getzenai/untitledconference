import type { PublicConference } from './public-types';

/**
 * Design fixture for the public surfaces.
 *
 * It is deliberately awkward in places, because a fixture that is uniformly tidy
 * hides the cases that actually break a layout:
 *
 *  - `jean-bartik` has neither job title nor company, `barbara-liskov` has no
 *    headshot — EMB-12 asks the gallery to degrade gracefully for exactly these.
 *  - Titles range from four characters to a full line, descriptions from two
 *    sentences to a paragraph that must truncate behind "Show more" (EMB-01).
 *  - Day 2 has a gap where day 1 has a session, so the agenda grid cannot assume
 *    a dense matrix.
 *  - Two speakers share a session, and one speaker has three, so neither the
 *    "one speaker per session" nor the "one session per speaker" shortcut holds.
 */

const DAY_1 = 'day-1';
const DAY_2 = 'day-2';

const at = (day: 1 | 2, time: string) => `2026-09-${day === 1 ? '17' : '18'}T${time}:00.000Z`;

export const FIXTURE_CONFERENCE: PublicConference = {
	id: 'conf-untitled-2026',
	slug: 'untitled-2026',
	name: 'Untitled Conference 2026',
	venue: 'Kraftwerk Berlin, Köpenicker Straße 70',
	startsOn: '2026-09-17',
	endsOn: '2026-09-18',

	days: [
		{ id: DAY_1, date: '2026-09-17', label: 'Thursday, 17 September' },
		{ id: DAY_2, date: '2026-09-18', label: 'Friday, 18 September' }
	],

	rooms: [
		{ id: 'room-hall', name: 'Main Hall' },
		{ id: 'room-studio', name: 'Studio' },
		{ id: 'room-workshop', name: 'Workshop Room' }
	],

	tracks: [
		{ id: 'track-platform', name: 'Platform' },
		{ id: 'track-product', name: 'Product' },
		{ id: 'track-craft', name: 'Craft' }
	],

	formats: [
		{ id: 'fmt-keynote', name: 'Keynote', minutes: 45 },
		{ id: 'fmt-talk', name: 'Talk', minutes: 30 },
		{ id: 'fmt-workshop', name: 'Workshop', minutes: 90 }
	],

	speakers: [
		{
			id: 'spk-bartik',
			name: 'Jean Bartik',
			sortName: 'Bartik, Jean',
			jobTitle: null,
			company: null,
			headshotUrl: '/speakers/bartik.svg',
			bio: 'One of the six original programmers of the ENIAC. Spends most of her time now on the question of how a team hands work to the next team without losing what it knew.',
			links: []
		},
		{
			id: 'spk-berners-lee',
			name: 'Tim Berners-Lee',
			sortName: 'Berners-Lee, Tim',
			jobTitle: 'Founder',
			company: 'Web Foundation',
			headshotUrl: '/speakers/berners-lee.svg',
			bio: 'Proposed a way to link documents across machines and has been arguing about the consequences ever since. Talks here about what a protocol owes the people who did not choose it.',
			links: [
				{ label: 'w3.org', url: 'https://www.w3.org/People/Berners-Lee/' },
				{ label: 'Mastodon', url: 'https://mastodon.social/@timbl' }
			]
		},
		{
			id: 'spk-hamilton',
			name: 'Margaret Hamilton',
			sortName: 'Hamilton, Margaret',
			jobTitle: 'Director of Software Engineering',
			company: 'Apollo Guidance',
			headshotUrl: '/speakers/hamilton.svg',
			bio: 'Coined the phrase "software engineering" while people were still laughing at it. Her interest is error handling under load: what a system should do when it is asked to do more than it can.',
			links: []
		},
		{
			id: 'spk-hopper',
			name: 'Grace Hopper',
			sortName: 'Hopper, Grace',
			jobTitle: 'Distinguished Engineer',
			company: 'COBOL Foundation',
			headshotUrl: '/speakers/hopper.svg',
			bio: 'Built the first compiler against the advice of everyone who mattered. Keeps a nanosecond in her pocket and hands it to anyone who says a delay is too small to care about.',
			links: []
		},
		{
			id: 'spk-johnson',
			name: 'Katherine Johnson',
			sortName: 'Johnson, Katherine',
			jobTitle: 'Flight Dynamics Lead',
			company: 'Orbital',
			headshotUrl: '/speakers/johnson.svg',
			bio: 'Computes trajectories, and checks the machine that computes trajectories. Her talk is about the difference between a number a system produced and a number somebody is willing to stake a life on.',
			links: []
		},
		{
			id: 'spk-liskov',
			name: 'Barbara Liskov',
			sortName: 'Liskov, Barbara',
			jobTitle: 'Professor of Computer Science',
			company: 'MIT',
			headshotUrl: null,
			bio: 'Works on abstraction: what a caller is allowed to assume, and what happens to a system when a substitute quietly assumes something else.',
			links: []
		},
		{
			id: 'spk-lovelace',
			name: 'Ada Lovelace',
			sortName: 'Lovelace, Ada',
			jobTitle: 'Principal Engineer',
			company: 'Analytical Systems',
			headshotUrl: '/speakers/lovelace.svg',
			bio: 'Wrote the first program for a machine that was never built, which is either the earliest software project or the earliest one to ship late. Interested in what a machine can and cannot originate.',
			links: []
		},
		{
			id: 'spk-perlman',
			name: 'Radia Perlman',
			sortName: 'Perlman, Radia',
			jobTitle: 'Fellow',
			company: 'Network Systems',
			headshotUrl: '/speakers/perlman.svg',
			bio: 'Designed the spanning tree protocol and dislikes being called the mother of the internet. Talks about designing for the case where part of the network is lying to you.',
			links: []
		},
		{
			id: 'spk-turing',
			name: 'Alan Turing',
			sortName: 'Turing, Alan',
			jobTitle: 'Head of Research',
			company: 'Bletchley Labs',
			headshotUrl: '/speakers/turing.svg',
			bio: 'Interested in what can be decided and what cannot, and in the practical version of that question: which parts of a workflow should never be automated because nobody could check the answer.',
			links: []
		}
	],

	sessions: [
		{
			id: 'ses-01',
			title: 'What a machine cannot originate',
			description:
				'The opening argument for the two days: every tool in this building will do what it is told, and the interesting engineering question is what we choose to tell it. A tour through three systems that were correct and useless, and one that was wrong in a way that turned out to matter, ending with a plain proposal for how to tell those apart before you have built the thing.',
			dayId: DAY_1,
			startsAt: at(1, '09:00'),
			endsAt: at(1, '09:45'),
			roomId: 'room-hall',
			trackId: 'track-platform',
			formatId: 'fmt-keynote',
			speakerIds: ['spk-lovelace'],
			// Public AI Engineer channel talk (issue #84) — not an unlisted challenge entry.
			recordingUrl: 'https://www.youtube.com/watch?v=ju73sWVtvU0'
		},
		{
			id: 'ses-02',
			title: 'The nanosecond in your pocket',
			description:
				'Latency is not an abstraction, it is a length of wire. What changes in a team when the delay is something you can hold.',
			dayId: DAY_1,
			startsAt: at(1, '10:00'),
			endsAt: at(1, '10:30'),
			roomId: 'room-hall',
			trackId: 'track-craft',
			formatId: 'fmt-talk',
			speakerIds: ['spk-hopper'],
			recordingUrl: null
		},
		{
			id: 'ses-03',
			title: 'Designing for a network that lies',
			description:
				'Every protocol assumes the other end is telling the truth until the day it does not. A working method for finding those assumptions in your own system before somebody else does.',
			dayId: DAY_1,
			startsAt: at(1, '10:00'),
			endsAt: at(1, '10:30'),
			roomId: 'room-studio',
			trackId: 'track-platform',
			formatId: 'fmt-talk',
			speakerIds: ['spk-perlman'],
			recordingUrl: null
		},
		{
			id: 'ses-04',
			title: 'Error handling under load',
			description:
				'What a system should do when it is asked for more than it can give. The Apollo guidance computer shed low-priority work and landed; most of our systems queue everything and stop. A walk through the decision, and how to make it explicit in code review.',
			dayId: DAY_1,
			startsAt: at(1, '11:00'),
			endsAt: at(1, '11:30'),
			roomId: 'room-hall',
			trackId: 'track-platform',
			formatId: 'fmt-talk',
			speakerIds: ['spk-hamilton'],
			recordingUrl: null
		},
		{
			id: 'ses-05',
			title: 'What a caller may assume',
			description:
				'Substitution, contracts, and the quiet breakage that follows when a replacement satisfies the type and not the promise.',
			dayId: DAY_1,
			startsAt: at(1, '11:00'),
			endsAt: at(1, '11:30'),
			roomId: 'room-studio',
			trackId: 'track-craft',
			formatId: 'fmt-talk',
			speakerIds: ['spk-liskov'],
			recordingUrl: null
		},
		{
			id: 'ses-06',
			title: 'Handing work to the next team',
			description:
				'A workshop, not a talk. Bring a real handover that went badly; leave with the two or three things that were never written down and should have been.',
			dayId: DAY_1,
			startsAt: at(1, '13:00'),
			endsAt: at(1, '14:30'),
			roomId: 'room-workshop',
			trackId: 'track-product',
			formatId: 'fmt-workshop',
			speakerIds: ['spk-bartik', 'spk-hopper'],
			recordingUrl: null
		},
		{
			id: 'ses-07',
			title: 'Numbers you would stake a life on',
			description:
				'The difference between a figure a system produced and a figure a person will sign. Where the check belongs, who performs it, and why "the model said so" is not an answer.',
			dayId: DAY_1,
			startsAt: at(1, '14:00'),
			endsAt: at(1, '14:30'),
			roomId: 'room-hall',
			trackId: 'track-product',
			formatId: 'fmt-talk',
			speakerIds: ['spk-johnson'],
			recordingUrl: null
		},
		{
			id: 'ses-08',
			title: 'Decidable, and worth deciding',
			description:
				'Not everything a computer can settle should be settled by one. A practical rule for which steps of a workflow to automate, drawn from the ones where a human could not have checked the result.',
			dayId: DAY_1,
			startsAt: at(1, '15:00'),
			endsAt: at(1, '15:30'),
			roomId: 'room-hall',
			trackId: 'track-craft',
			formatId: 'fmt-talk',
			speakerIds: ['spk-turing'],
			recordingUrl: null
		},
		{
			id: 'ses-09',
			title: 'What a protocol owes',
			description:
				'The people affected by a standard are almost never the people who wrote it. Thirty years of consequences, and what a small team can take from them before shipping an interface everyone else has to live with.',
			dayId: DAY_2,
			startsAt: at(2, '09:30'),
			endsAt: at(2, '10:15'),
			roomId: 'room-hall',
			trackId: 'track-platform',
			formatId: 'fmt-keynote',
			speakerIds: ['spk-berners-lee'],
			recordingUrl: null
		},
		{
			id: 'ses-10',
			title: 'Compilers, and being told no',
			description:
				'The first compiler was built against advice. A short account of how to tell a bad objection from a good one when the people objecting outrank you.',
			dayId: DAY_2,
			startsAt: at(2, '10:30'),
			endsAt: at(2, '11:00'),
			roomId: 'room-hall',
			trackId: 'track-craft',
			formatId: 'fmt-talk',
			speakerIds: ['spk-hopper'],
			recordingUrl: null
		},
		{
			id: 'ses-11',
			title: 'Trajectory review, in practice',
			description:
				'A worked example, on paper, of checking a computed answer without recomputing it.',
			dayId: DAY_2,
			startsAt: at(2, '10:30'),
			endsAt: at(2, '12:00'),
			roomId: 'room-workshop',
			trackId: 'track-product',
			formatId: 'fmt-workshop',
			speakerIds: ['spk-johnson', 'spk-turing'],
			recordingUrl: null
		},
		{
			id: 'ses-12',
			title: 'ENIAC',
			description:
				'Six programmers, no manual, and a machine that had to be rewired to change its mind. What the constraint taught them that the absence of it now hides from us.',
			dayId: DAY_2,
			startsAt: at(2, '11:30'),
			endsAt: at(2, '12:00'),
			roomId: 'room-hall',
			trackId: 'track-craft',
			formatId: 'fmt-talk',
			speakerIds: ['spk-bartik'],
			recordingUrl: null
		},
		{
			id: 'ses-13',
			title: 'Abstraction that survives its authors',
			description:
				'An interface outlives the team that designed it and the reasons that produced it. How to leave the reasons behind in a form the next team will actually read.',
			dayId: DAY_2,
			startsAt: at(2, '13:30'),
			endsAt: at(2, '14:00'),
			roomId: 'room-studio',
			trackId: 'track-platform',
			formatId: 'fmt-talk',
			speakerIds: ['spk-liskov', 'spk-perlman'],
			recordingUrl: null
		},
		{
			id: 'ses-14',
			title: 'Closing: what we are going to do differently',
			description:
				'Fifteen minutes of conclusions, collected from the two days and read back to the room.',
			dayId: DAY_2,
			startsAt: at(2, '14:30'),
			endsAt: at(2, '15:00'),
			roomId: 'room-hall',
			trackId: 'track-product',
			formatId: 'fmt-keynote',
			speakerIds: ['spk-hamilton', 'spk-lovelace'],
			recordingUrl: null
		}
	]
};
