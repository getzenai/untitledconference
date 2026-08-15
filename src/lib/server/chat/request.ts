/**
 * The reviewer-chat POST: flag, reviewer seat, then stream.
 *
 * Authorization is the hard part. The model runs under the signed-in user's
 * `McpContext`, not a bearer token. Tools still call `requireReviewer`, so a
 * reviewer of conference A who asks for conference B is refused the same way
 * the MCP path refuses them.
 */
import { requireReviewer } from '$lib/server/conference/reviewer';
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
import { reviewerChatTools } from './tools';

export type ReviewerChatEvent = {
	locals: App.Locals;
	params: { slug: string };
	request: Request;
};

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
};

function systemPrompt(
	conference: { name: string; slug: string },
	focus?: ReviewerChatFocus
): string {
	const here = focus
		? `The reviewer is looking at submission ${focus.submissionId} "${focus.title}". ` +
			`"This review" and "this talk" mean that one. `
		: `The reviewer is on the queue for this conference, not a single talk. ` +
			`If they say "this review" without naming one, ask which assignment. `;
	return (
		`You are a review assistant for "${conference.name}" (${conference.slug}). ` +
		here +
		`You can list assignments, open an assigned scorecard, and file a review ` +
		`with submit_review. Filing waits for the reviewer to confirm. ` +
		`After a review is saved, name the talk and the score in one sentence. ` +
		`You cannot decide the programme. ` +
		`When you use a tool, name it in the answer. ` +
		`Use conference slug "${conference.slug}" unless the reviewer names another.`
	);
}

export function readChatFocus(body: { focus?: unknown }): ReviewerChatFocus | undefined {
	const focus = body.focus;
	if (!focus || typeof focus !== 'object') return undefined;
	const rec = focus as { submissionId?: unknown; title?: unknown };
	if (typeof rec.submissionId !== 'number' || !Number.isInteger(rec.submissionId)) {
		return undefined;
	}
	if (typeof rec.title !== 'string' || rec.title.trim() === '') return undefined;
	return { submissionId: rec.submissionId, title: rec.title.trim() };
}

export async function streamReviewerChat(opts: {
	ctx: McpContext;
	conference: { name: string; slug: string };
	messages: UIMessage[];
	model: LanguageModel;
	focus?: ReviewerChatFocus;
}): Promise<Response> {
	const tools = reviewerChatTools(opts.ctx);
	const result = streamText({
		model: opts.model,
		system: systemPrompt(opts.conference, opts.focus),
		messages: await convertToModelMessages(opts.messages, { tools }),
		tools,
		toolApproval: { submit_review: 'user-approval' },
		stopWhen: isStepCount(5)
	});

	return createUIMessageStreamResponse({
		stream: toUIMessageStream({ stream: result.stream })
	});
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

	let conference: { name: string; slug: string };
	try {
		const resolved = await requireReviewer(user.id, event.params.slug);
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
		return await streamReviewerChat({
			ctx: mcpContextFromLocals(event.locals),
			conference,
			messages: body.messages,
			model: model ?? createChatModel(),
			focus: readChatFocus(body)
		});
	} catch (err) {
		if (err instanceof ChatModelNotConfiguredError) {
			return chatError(503, err.message);
		}
		throw err;
	}
}
