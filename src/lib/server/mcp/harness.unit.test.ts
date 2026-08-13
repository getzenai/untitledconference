/**
 * The playground identifiers — and the promise that the seed script writes
 * the same ones the later tool tests import.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	FOREIGN_ORG_IDS,
	MCP_HARNESS,
	MCP_HARNESS_EMAIL_DOMAIN,
	MCP_HARNESS_PASSWORD,
	harnessIds
} from './harness';

const here = dirname(fileURLToPath(import.meta.url));
const seedDataPath = join(here, '../../../../scripts/db/seed-mcp-harness-data.mjs');

describe('harnessIds', () => {
	it('is a no-op without a suffix — the stable tenant the seed script writes', () => {
		expect(harnessIds()).toEqual({
			orgId: MCP_HARNESS.orgId,
			orgSlug: MCP_HARNESS.orgSlug,
			conferenceSlug: MCP_HARNESS.conferenceSlug,
			people: MCP_HARNESS.people.map((person) => ({
				id: person.id,
				name: person.name,
				email: person.email,
				role: person.role
			})),
			proposals: MCP_HARNESS.proposals.map((proposal) => ({ ...proposal }))
		});
	});

	it('tags a proposal author with the same tag as the account it points at', () => {
		const ids = harnessIds('abc');
		for (const proposal of ids.proposals) {
			expect(ids.people.some((person) => person.id === proposal.speakerId)).toBe(true);
		}
		// Nobody may propose their own review target: an author who is also the
		// organizer would put the conflict guard back in the way.
		const organizer = ids.people.find((person) => person.role === 'organizer')!;
		expect(ids.proposals.some((proposal) => proposal.speakerId === organizer.id)).toBe(false);
	});

	it('tags every identifier so two parallel tenants can share a database', () => {
		const ids = harnessIds('abc');
		expect(ids.orgId).toBe('org-mcp-harness-abc');
		expect(ids.orgSlug).toBe('mcp-harness-abc');
		expect(ids.conferenceSlug).toBe('mcp-harness-abc');
		expect(ids.people.map((person) => person.email)).toEqual([
			'avery+abc@mcpharness.example',
			'casey+abc@mcpharness.example',
			'drew+abc@mcpharness.example',
			'ellis+abc@mcpharness.example',
			'finley+abc@mcpharness.example'
		]);
		for (const person of ids.people) {
			expect(person.email.endsWith(`@${MCP_HARNESS_EMAIL_DOMAIN}`)).toBe(true);
		}
	});
});

describe('the seed script identifiers', () => {
	it('stay in lockstep with MCP_HARNESS — a drifted copy would seed a tenant the tests cannot find', async () => {
		const seed = await import(pathToFileURL(seedDataPath).href);
		expect(seed.MCP_HARNESS_EMAIL_DOMAIN).toBe(MCP_HARNESS_EMAIL_DOMAIN);
		expect(seed.MCP_HARNESS_PASSWORD).toBe(MCP_HARNESS_PASSWORD);
		expect(seed.MCP_HARNESS.orgId).toBe(MCP_HARNESS.orgId);
		expect(seed.MCP_HARNESS.orgSlug).toBe(MCP_HARNESS.orgSlug);
		expect(seed.MCP_HARNESS.orgName).toBe(MCP_HARNESS.orgName);
		expect(seed.MCP_HARNESS.conferenceName).toBe(MCP_HARNESS.conferenceName);
		expect(seed.MCP_HARNESS.conferenceSlug).toBe(MCP_HARNESS.conferenceSlug);
		expect(seed.MCP_HARNESS.venue).toBe(MCP_HARNESS.venue);
		expect(seed.MCP_HARNESS.startsOn).toBe(MCP_HARNESS.startsOn);
		expect(seed.MCP_HARNESS.endsOn).toBe(MCP_HARNESS.endsOn);
		expect(seed.MCP_HARNESS.people.map((person: { id: string }) => person.id)).toEqual(
			MCP_HARNESS.people.map((person) => person.id)
		);
		expect(seed.MCP_HARNESS.people.map((person: { email: string }) => person.email)).toEqual(
			MCP_HARNESS.people.map((person) => person.email)
		);
		expect(seed.MCP_HARNESS.people.map((person: { role: string }) => person.role)).toEqual(
			MCP_HARNESS.people.map((person) => person.role)
		);
		expect(seed.MCP_HARNESS.proposals).toEqual(
			MCP_HARNESS.proposals.map((proposal) => ({ ...proposal }))
		);
	});

	it('never names the demo or import organisations', () => {
		const source = readFileSync(join(here, '../../../../scripts/db/seed-mcp-harness.mjs'), 'utf8');
		for (const id of FOREIGN_ORG_IDS) {
			expect(source).not.toContain(id);
		}
	});
});
