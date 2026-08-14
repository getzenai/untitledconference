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
import { reviewerReadTools } from './tools';

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

function systemPrompt(conference: { name: string; slug: string }): string {
	return (
		`You are a review assistant for "${conference.name}" (${conference.slug}). ` +
		`You can list this reviewer's assignments and open one assigned scorecard. ` +
		`You cannot file, edit or decide reviews. ` +
		`When you use a tool, name it in the answer. ` +
		`Use conference slug "${conference.slug}" unless the reviewer names another.`
	);
}

export async function streamReviewerChat(opts: {
	ctx: McpContext;
	conference: { name: string; slug: string };
	messages: UIMessage[];
	model: LanguageModel;
}): Promise<Response> {
	const result = streamText({
		model: opts.model,
		system: systemPrompt(opts.conference),
		messages: await convertToModelMessages(opts.messages),
		tools: reviewerReadTools(opts.ctx),
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

	let body: { messages?: UIMessage[] };
	try {
		body = (await event.request.json()) as { messages?: UIMessage[] };
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
			model: model ?? createChatModel()
		});
	} catch (err) {
		if (err instanceof ChatModelNotConfiguredError) {
			return chatError(503, err.message);
		}
		throw err;
	}
}
