/**
 * The chat POSTs: flag, seat, then stream. One handler per surface — the
 * reviewer queue and the organizer's agenda board.
 *
 * Authorization is the hard part. The model runs under the signed-in user's
 * `McpContext`, not a bearer token. Tools still call `requireReviewer` /
 * `organizerConference`, so a reviewer of conference A who asks for conference
 * B is refused the same way the MCP path refuses them. The seat check at the
 * door is the cheaper half: it keeps a stranger from spending a model call.
 */
import { requireOrganizer } from '$lib/server/conference/access';
import { requireReviewer, reviewerSubmission } from '$lib/server/conference/reviewer';
import { ensureFeatureEnabled } from '$lib/server/feature-flags';
import type { McpContext } from '$lib/server/mcp/context';
import { error, isHttpError } from '@sveltejs/kit';
import {
	convertToModelMessages,
	createUIMessageStreamResponse,
	isStepCount,
	streamText,
	toUIMessageStream,
	type LanguageModel,
	type UIMessage
} from 'ai';
import { ChatModelNotConfiguredError, createChatModel } from './model';
import { ChatToolCallLeakError, guardToolCallLeak } from './tool-call-leak';
import { AGENDA_WRITE_TOOL_NAMES, agendaChatTools, reviewerChatTools } from './tools';

export type ReviewerChatEvent = {
	locals: App.Locals;
	params: { slug: string };
	request: Request;
};

/**
 * What the client is told when a part of the stream is an error.
 *
 * The default masks every message, and rightly so — a stack trace is not chat.
 * The one thing worth saying out loud is the leak (#660): the reviewer asked a
 * question, saw nothing happen, and needs to know that nothing happened rather
 * than that something did.
 */
function streamErrorMessage(error: unknown): string {
	if (error instanceof ChatToolCallLeakError) return error.message;
	return 'Something went wrong. Please try again.';
}

/** Plain text — the AI SDK surfaces `response.text()` as `chat.error`. */
function chatError(status: number, message: string): Response {
	return new Response(message, {
		status,
		headers: { 'content-type': 'text/plain; charset=utf-8' }
	});
}

function mcpContextFromLocals(locals: App.Locals): McpContext {
	const userId = locals.user?.id;
	if (!userId) {
		throw error(401, 'Unauthorized');
	}
	return {
		userId,
		organizationId: locals.organizationId ?? ''
	};
}

export type ReviewerChatFocus = {
	submissionId: number;
	title: string;
	roundId: number;
	roundName: string;
};

export type ReviewerChatFocusRef = Pick<ReviewerChatFocus, 'submissionId' | 'roundId'>;

export function reviewerSystemPrompt(
	conference: { name: string; slug: string },
	focus?: ReviewerChatFocus
): string {
	const here = focus
		? `The reviewer is looking at submission ${focus.submissionId} "${focus.title}" in ` +
			`review round ${focus.roundId} "${focus.roundName}". ` +
			`"This review" and "this talk" mean that submission in that exact round. ` +
			`Pass roundId ${focus.roundId} to get_review_assignment and submit_review. `
		: `The reviewer is on the queue for this conference, not a single talk. ` +
			`If they say "this review" without naming one, ask which assignment. `;
	return (
		`You are a review assistant for "${conference.name}" (${conference.slug}). ` +
		here +
		`You can list assignments, open an assigned scorecard, and file a review ` +
		`with submit_review. Filing waits for the reviewer to confirm. ` +
		`After a review is saved, name the talk, review round and score in one sentence. ` +
		`You cannot decide the programme. ` +
		`When you use a tool, name it in the answer. ` +
		`Use conference slug "${conference.slug}" unless the reviewer names another.`
	);
}

export function readChatFocus(body: { focus?: unknown }): ReviewerChatFocusRef | undefined {
	const focus = body.focus;
	if (!focus || typeof focus !== 'object') return undefined;
	const rec = focus as { submissionId?: unknown; roundId?: unknown };
	if (
		typeof rec.submissionId !== 'number' ||
		!Number.isInteger(rec.submissionId) ||
		rec.submissionId <= 0
	) {
		return undefined;
	}
	if (typeof rec.roundId !== 'number' || !Number.isInteger(rec.roundId) || rec.roundId <= 0) {
		return undefined;
	}
	return { submissionId: rec.submissionId, roundId: rec.roundId };
}

type ReviewerConference = Awaited<ReturnType<typeof requireReviewer>>['conference'];

async function resolveReviewerFocus(
	conference: ReviewerConference,
	userId: string,
	ref?: ReviewerChatFocusRef
): Promise<ReviewerChatFocus | null | undefined> {
	if (!ref) return undefined;
	const detail = await reviewerSubmission(conference, userId, ref.submissionId, ref.roundId);
	if (!detail) return null;
	return {
		submissionId: detail.id,
		title: detail.title,
		roundId: detail.round.id,
		roundName: detail.round.name
	};
}

export async function streamReviewerChat(opts: {
	ctx: McpContext;
	conference: { name: string; slug: string };
	messages: UIMessage[];
	model: LanguageModel;
	focus?: ReviewerChatFocus;
}): Promise<Response> {
	const tools = reviewerChatTools(opts.ctx, opts.focus);
	const result = streamText({
		model: opts.model,
		system: reviewerSystemPrompt(opts.conference, opts.focus),
		messages: await convertToModelMessages(opts.messages, { tools }),
		tools,
		toolApproval: { submit_review: 'user-approval' },
		stopWhen: isStepCount(5),
		experimental_transform: guardToolCallLeak()
	});

	return createUIMessageStreamResponse({
		stream: toUIMessageStream({ stream: result.stream, onError: streamErrorMessage })
	});
}

/**
 * Which day the organizer has open. The board shows one day at a time, so
 * "move it to 14:00" is a complete sentence on screen and an ambiguous one in
 * a tool call — this is what closes the gap.
 */
export type AgendaChatFocus = {
	/** Conference day as YYYY-MM-DD, the same shape `place_talk` takes. */
	day: string;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function readAgendaFocus(body: { focus?: unknown }): AgendaChatFocus | undefined {
	const focus = body.focus;
	if (!focus || typeof focus !== 'object') return undefined;
	const day = (focus as { day?: unknown }).day;
	if (typeof day !== 'string' || !DAY.test(day.trim())) return undefined;
	return { day: day.trim() };
}

function agendaSystemPrompt(
	conference: { name: string; slug: string },
	focus?: AgendaChatFocus
): string {
	const here = focus
		? `The organizer is looking at ${focus.day}. A time without a date means that day. `
		: `The organizer has no single day open. If a time could fall on several days, ask which. `;
	return (
		`You are a programme assistant for "${conference.name}" (${conference.slug}). ` +
		here +
		`Read the board with get_agenda, the unplaced talks with get_agenda_tray, and the ` +
		`columns with list_rooms before you place anything: ids come from those calls, never ` +
		`from memory. You can place, move, swap and unplace talks; each write waits for the ` +
		`organizer to confirm. A refused write is an answer — say what the server said instead ` +
		`of trying a neighbouring slot. ` +
		`You cannot accept or reject talks, invite reviewers, or publish the conference. ` +
		`When a write goes through, name the talk, the room and the time in one sentence. ` +
		`When you use a tool, name it in the answer. ` +
		`Use conference slug "${conference.slug}" unless the organizer names another.`
	);
}

/** Every agenda write is a change to what an audience will be told; none happens unasked. */
const AGENDA_APPROVAL = Object.fromEntries(
	AGENDA_WRITE_TOOL_NAMES.map((name) => [name, 'user-approval' as const])
);

export async function streamAgendaChat(opts: {
	ctx: McpContext;
	conference: { name: string; slug: string };
	messages: UIMessage[];
	model: LanguageModel;
	focus?: AgendaChatFocus;
}): Promise<Response> {
	const tools = agendaChatTools(opts.ctx);
	const result = streamText({
		model: opts.model,
		system: agendaSystemPrompt(opts.conference, opts.focus),
		messages: await convertToModelMessages(opts.messages, { tools }),
		tools,
		toolApproval: AGENDA_APPROVAL,
		// Reading the board, then the tray, then writing is three steps before a
		// sentence comes back; a replan that touches two talks is more.
		stopWhen: isStepCount(8),
		experimental_transform: guardToolCallLeak()
	});

	return createUIMessageStreamResponse({
		stream: toUIMessageStream({ stream: result.stream, onError: streamErrorMessage })
	});
}

export async function handleAgendaChatRequest(
	event: ReviewerChatEvent,
	model?: LanguageModel
): Promise<Response> {
	ensureFeatureEnabled('inAppChat');

	const user = event.locals.user;
	if (!user) {
		return chatError(401, 'Unauthorized');
	}

	let conference: { name: string; slug: string };
	try {
		const resolved = await requireOrganizer(user.id, event.params.slug);
		conference = { name: resolved.conference.name, slug: resolved.conference.slug };
	} catch (err) {
		if (isHttpError(err)) {
			return chatError(err.status, String(err.body.message));
		}
		throw err;
	}

	let body: { messages?: UIMessage[]; focus?: unknown };
	try {
		body = (await event.request.json()) as { messages?: UIMessage[]; focus?: unknown };
	} catch {
		return chatError(400, 'Expected a JSON body with messages.');
	}
	if (!Array.isArray(body.messages)) {
		return chatError(400, 'Expected a JSON body with messages.');
	}

	try {
		return await streamAgendaChat({
			ctx: mcpContextFromLocals(event.locals),
			conference,
			messages: body.messages,
			model:
				model ??
				createChatModel({ toolName: 'get_agenda', input: { conferenceSlug: conference.slug } }),
			focus: readAgendaFocus(body)
		});
	} catch (err) {
		if (err instanceof ChatModelNotConfiguredError) {
			return chatError(503, err.message);
		}
		throw err;
	}
}

export async function handleReviewerChatRequest(
	event: ReviewerChatEvent,
	model?: LanguageModel
): Promise<Response> {
	ensureFeatureEnabled('inAppChat');

	const user = event.locals.user;
	if (!user) {
		return chatError(401, 'Unauthorized');
	}

	let reviewerAccess: Awaited<ReturnType<typeof requireReviewer>>;
	try {
		reviewerAccess = await requireReviewer(user.id, event.params.slug);
	} catch (err) {
		if (isHttpError(err)) {
			return chatError(err.status, String(err.body.message));
		}
		throw err;
	}

	let body: { messages?: UIMessage[]; focus?: unknown };
	try {
		body = (await event.request.json()) as { messages?: UIMessage[]; focus?: unknown };
	} catch {
		return chatError(400, 'Expected a JSON body with messages.');
	}
	if (!Array.isArray(body.messages)) {
		return chatError(400, 'Expected a JSON body with messages.');
	}

	const focus = await resolveReviewerFocus(reviewerAccess.conference, user.id, readChatFocus(body));
	if (focus === null) return chatError(404, 'Talk not found');

	const conference = {
		name: reviewerAccess.conference.name,
		slug: reviewerAccess.conference.slug
	};

	try {
		return await streamReviewerChat({
			ctx: mcpContextFromLocals(event.locals),
			conference,
			messages: body.messages,
			model: model ?? createChatModel(),
			focus
		});
	} catch (err) {
		if (err instanceof ChatModelNotConfiguredError) {
			return chatError(503, err.message);
		}
		throw err;
	}
}
