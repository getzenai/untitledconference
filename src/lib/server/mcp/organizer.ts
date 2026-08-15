import { requireOrganizer } from '$lib/server/conference/access';
import { isHttpError } from '@sveltejs/kit';
import type { McpContext } from './context';
import { McpToolError } from './tool-helpers';

/**
 * `requireOrganizer` throws a SvelteKit 404 — the right answer for a route and
 * the wrong shape for a tool, which would log it as an unexpected crash. This
 * turns it into the agent-facing refusal without widening what it permits.
 *
 * The message deliberately does not distinguish "no such conference" from "not
 * yours", exactly as the route behaviour does not: two different answers would
 * let an agent learn which slugs exist elsewhere.
 */
export async function organizerConference(slug: string, ctx: McpContext) {
	try {
		const { conference } = await requireOrganizer(ctx.userId, slug);
		return conference;
	} catch (error) {
		// Only the refusal `requireOrganizer` raises deliberately becomes a
		// refusal here. A database failure caught by the same `catch` used to
		// reach the model as "you do not organize that conference" — an answer
		// the user has no reason to doubt and every reason to act on (#684).
		if (!isHttpError(error)) throw error;
		throw new McpToolError(
			`No conference "${slug}" that you organize. ` +
				'Call list_my_conferences to see the ones you can reach.'
		);
	}
}
