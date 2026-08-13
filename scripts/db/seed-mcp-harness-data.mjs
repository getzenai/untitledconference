/**
 * Identifiers for the isolated MCP playground tenant.
 *
 * Imported by `seed-mcp-harness.mjs` (the write) and kept in lockstep with
 * `src/lib/server/mcp/harness.ts` (the shape later tool tests import). A unit
 * test fails if the two copies drift.
 */

export const MCP_HARNESS_EMAIL_DOMAIN = 'mcpharness.example';

/** Not a secret — same reason as `DEMO_PASSWORD`. Unlocks only this draft tenant. */
export const MCP_HARNESS_PASSWORD = 'McpHarness2026!';

export const MCP_HARNESS = {
	orgId: 'org-mcp-harness',
	orgSlug: 'mcp-harness',
	orgName: 'MCP Harness',
	conferenceName: 'MCP Harness',
	conferenceSlug: 'mcp-harness',
	venue: 'Harness Lab',
	startsOn: '2027-10-06',
	endsOn: '2027-10-07',
	people: [
		{
			id: 'user-mcp-avery',
			name: 'Avery Quinn',
			email: `avery@${MCP_HARNESS_EMAIL_DOMAIN}`,
			role: 'organizer',
			note: 'Organizer — owner of MCP Harness'
		},
		{
			id: 'user-mcp-casey',
			name: 'Casey Okonkwo',
			email: `casey@${MCP_HARNESS_EMAIL_DOMAIN}`,
			role: 'speaker',
			note: 'Speaker'
		},
		{
			id: 'user-mcp-drew',
			name: 'Drew Patel',
			email: `drew@${MCP_HARNESS_EMAIL_DOMAIN}`,
			role: 'speaker',
			note: 'Speaker'
		},
		{
			id: 'user-mcp-ellis',
			name: 'Ellis Nakamura',
			email: `ellis@${MCP_HARNESS_EMAIL_DOMAIN}`,
			role: 'reviewer',
			note: 'Reviewer'
		},
		{
			id: 'user-mcp-finley',
			name: 'Finley Brooks',
			email: `finley@${MCP_HARNESS_EMAIL_DOMAIN}`,
			role: 'reviewer',
			note: 'Reviewer'
		}
	],
	/**
	 * Proposals somebody else wrote (#340).
	 *
	 * `assign_reviews` refuses a reviewer who is a speaker on the submission, so
	 * an agent holding a single account could never assign itself a review of a
	 * proposal it had just submitted: the guard fired every time and the write
	 * path behind it stayed unmeasured. These two belong to Casey and Drew, so
	 * the organizer account can be assigned one without a conflict.
	 */
	proposals: [
		{
			key: 'casey-observability',
			speakerId: 'user-mcp-casey',
			title: 'Observability for agents that call tools',
			abstract:
				'What a trace has to record when the caller is a model: the tool it picked, ' +
				'the arguments it made up, and the answer it got back.',
			keyTakeaway: 'Log the arguments, not just the tool name.'
		},
		{
			key: 'drew-migrations',
			speakerId: 'user-mcp-drew',
			title: 'Migrations nobody has to be awake for',
			abstract:
				'Expand, backfill, contract — and the three checks that tell you which of ' +
				'the three you are actually in.',
			keyTakeaway: 'A migration you cannot roll forward is a deploy you cannot ship.'
		}
	]
};
