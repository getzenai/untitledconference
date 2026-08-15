/**
 * The programme as a list the person at the backstage table can hold (#449).
 *
 * Pure and on its own, the same reason `csv.ts` and `ical.ts` are: the interesting
 * thing is the order, and a loader that sorts in SQL would make the unit test a
 * database test. Day, then start, then room — that is the grid read top to bottom,
 * left to right. Speakers keep `submission_speaker.position`, so the co-presenter
 * who arrived in week six is in the list, not dropped because they are not primary.
 *
 * Intro text and AV notes are not fields. A missing abstract or file stays empty
 * rather than guessed.
 */

export type ShowSpeaker = {
	name: string;
	position: number;
};

export type ShowFile = {
	id: number;
	filename: string;
};

/** One placed session, still unsorted, still with speaker positions attached. */
export type ShowTalkInput = {
	day: string;
	dayPosition: number;
	room: string | null;
	roomPosition: number;
	startsAt: Date;
	endsAt: Date | null;
	title: string;
	abstract: string | null;
	speakers: ShowSpeaker[];
	file: ShowFile | null;
};

/** One row of the export, in programme order, speakers already named. */
export type ShowTalk = {
	day: string;
	room: string | null;
	startsAt: Date;
	endsAt: Date | null;
	title: string;
	abstract: string;
	speakers: string[];
	file: ShowFile | null;
};

export function compareShowTalks(a: ShowTalkInput, b: ShowTalkInput): number {
	return (
		a.dayPosition - b.dayPosition ||
		a.day.localeCompare(b.day) ||
		a.startsAt.getTime() - b.startsAt.getTime() ||
		a.roomPosition - b.roomPosition
	);
}

function speakerNames(speakers: ShowSpeaker[]): string[] {
	return [...speakers]
		.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
		.map((s) => s.name);
}

export function showTalkFrom(input: ShowTalkInput): ShowTalk {
	return {
		day: input.day,
		room: input.room,
		startsAt: input.startsAt,
		endsAt: input.endsAt,
		title: input.title,
		abstract: input.abstract ?? '',
		speakers: speakerNames(input.speakers),
		file: input.file
	};
}

/** Programme order. Speakers of one talk keep their recorded positions. */
export function runOfShow(inputs: ShowTalkInput[]): ShowTalk[] {
	return [...inputs].sort(compareShowTalks).map(showTalkFrom);
}

export function groupShowTalksByDay(talks: ShowTalk[]): { day: string; talks: ShowTalk[] }[] {
	const groups: { day: string; talks: ShowTalk[] }[] = [];
	for (const talk of talks) {
		const last = groups.at(-1);
		if (last && last.day === talk.day) last.talks.push(talk);
		else groups.push({ day: talk.day, talks: [talk] });
	}
	return groups;
}

/** The organizer download for this file — same route the files library uses. */
export function showFileHref(slug: string, fileId: number): string {
	return `/manage/${slug}/content/files/${fileId}`;
}
