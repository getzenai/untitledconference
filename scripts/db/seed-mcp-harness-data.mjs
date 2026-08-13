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
	]
};
