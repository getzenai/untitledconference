import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from './context';
import { registerMcpTools, type AnyMcpToolDefinition } from './tool-helpers';
import { conferenceTools } from './tools/conference';
import { journeyTools } from './tools/journeys';
import { profileTools } from './tools/profile';

/**
 * Instructions handed to the calling agent on `initialize`. Describe what this
 * server is for and how its tools compose — it is the only guidance a model
 * gets before choosing a tool.
 *
 * Every snake_case token here must name a registered tool. The unit test holds
 * that the other way around from the list: an instruction that names a tool
 * the registry does not have is how a model reaches into the void.
 */
export const SERVER_INSTRUCTIONS =
	'MCP server for untitledconference, a conference programme manager: ' +
	'call for proposals, review rounds, decisions, and the scheduled agenda. ' +
	'Tools act as the authenticated user. ' +
	'Identity comes from the OAuth access token, so no tool takes a user or organization argument. ' +
	'Organizers start with list_my_conferences — every other organizer tool takes a slug it returns. ' +
	'To run a conference: create_conference (always a draft), update_conference for name/venue/dates, ' +
	'open_cfp then publish_conference so speakers can submit, ' +
	'create_session_format and create_track so proposals have a length and a track, ' +
	'create_review_round then list_reviewers or invite_reviewer then assign_reviews, ' +
	'remove_reviewer to take someone off the committee, ' +
	'decide_submissions, then unpublish_conference to return to draft. ' +
	'archive_conference is how a conference is removed: it disappears from every ' +
	'public surface, everything under it is kept, and restore_conference undoes it. ' +
	'Archiving a published conference takes its public page down, so that case asks ' +
	'for the slug twice. delete_conference erases an archived conference for good and ' +
	'only one that was never published. ' +
	'From a conference: list_submissions for the proposals (filter by status), ' +
	'get_submission for one proposal in full with its reviews, ' +
	'list_review_rounds, list_reviewers, list_session_formats, list_tracks, ' +
	'and get_agenda for the scheduled programme. ' +
	'Then list_rooms and create_room, get_agenda_tray for accepted talks still unplaced, ' +
	'place_talk or move_talk onto a room and start, swap_talks to exchange two slots, ' +
	'unplace_talk back to the tray. A collision is refused with the other talk named. ' +
	'create_break puts lunch, coffee or a reserved block on the grid — across every room ' +
	'unless you name one — and remove_break takes it off; a talk placed through a break is refused. ' +
	'close_cfp stops new submissions without touching existing ones. ' +
	'Speakers start with list_open_cfps, then submit_proposal (a draft), update_proposal to fill it in, ' +
	'and finalize_proposal to hand it in — a draft nobody finalizes is never submitted. Or withdraw_proposal, ' +
	'list_my_proposals for status, and update_my_speaker_profile for bio, photo and links. ' +
	'Reviewers start with list_my_review_assignments, then get_review_assignment for the rubric, then submit_review. ' +
	'A reviewer cannot read a submission they were not assigned. ' +
	'get_my_profile and list_my_organizations describe the caller.';

/** Every tool, as protocol-free definitions. MCP and later REST both loop this. */
export function allTools(ctx: McpContext): AnyMcpToolDefinition[] {
	return [...profileTools(ctx), ...conferenceTools(ctx), ...journeyTools(ctx)];
}

/**
 * Register every MCP tool on a per-request server instance. `ctx` is the
 * resolved user/organization identity all tools are scoped to.
 */
export function registerAllTools(server: McpServer, ctx: McpContext): void {
	registerMcpTools(server, ctx, allTools(ctx));
}
