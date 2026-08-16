import { requireReviewer } from '$lib/server/conference/reviewer';
import { isHttpError } from '@sveltejs/kit';
import type { McpContext } from './context';
import { McpToolError } from './tool-helpers';

/**
 * `requireReviewer` throws a SvelteKit 404 — right for a route, wrong for a
 * tool. Same collapse as `organizerConference`: missing and not-yours are one
 * refusal, so the agent cannot learn which slugs exist elsewhere.
 */
export async function reviewerConference(slug: string, ctx: McpContext) {
	try {
		return await requireReviewer(ctx.userId, slug);
	} catch (error) {
		// Same rule as `organizerConference` (#684): only the refusal the guard
		// raises on purpose becomes a refusal. Everything else — a lost
		// connection above all — has to stay a failure, or the model reports it
		// to the reviewer as a fact about their assignments.
		if (!isHttpError(error)) throw error;
		throw new McpToolError(
			`No conference "${slug}" that you review for. ` +
				'Call list_my_review_assignments to see the ones you can reach.'
		);
	}
}
