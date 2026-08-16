import { db } from '$lib/server/db';
import { organization } from '$lib/server/db/auth-schema';
import { organizationAiSettings } from '$lib/server/db/organization-ai-schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	ChatBackendMisconfiguredError,
	ChatModelNotConfiguredError,
	createChatModel
} from './model';
import { OrgAiWrapKeyMissingError } from './org-ai-key';
import {
	clearOrganizationAiSettings,
	loadOrganizationChatBackend,
	readOrganizationAiSettings,
	saveOrganizationAiSettings
} from './org-ai-settings';
import { ChatBackendUrlError } from './org-ai-url';

const WRAP_KEY = 'ab'.repeat(32);
const suffix = `orgai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function insertOrg(label: string) {
	const [row] = await db
		.insert(organization)
		.values({
			id: `${suffix}-${label}`,
			name: `Org ${label}`,
			slug: `${suffix}-${label}`,
			createdAt: new Date()
		})
		.returning();
	return row;
}

describe('organization AI settings', () => {
	const createdIds: string[] = [];
	const previousWrap = process.env.ORG_AI_WRAP_KEY;
	const previousModel = process.env.AI_CHAT_MODEL;

	beforeAll(() => {
		process.env.ORG_AI_WRAP_KEY = WRAP_KEY;
		process.env.AI_CHAT_MODEL = 'openai/gpt-4o-mini';
	});

	afterAll(async () => {
		if (previousWrap === undefined) delete process.env.ORG_AI_WRAP_KEY;
		else process.env.ORG_AI_WRAP_KEY = previousWrap;
		if (previousModel === undefined) delete process.env.AI_CHAT_MODEL;
		else process.env.AI_CHAT_MODEL = previousModel;
		for (const id of createdIds) {
			await db.delete(organization).where(eq(organization.id, id));
		}
	});

	it('wraps a key on save, never returns it, and unwraps for the chat', async () => {
		const org = await insertOrg('save');
		createdIds.push(org.id);

		const view = await saveOrganizationAiSettings({
			organizationId: org.id,
			baseUrl: 'https://api.openai.com/v1',
			apiKey: 'sk-org-secret-7f3a',
			modelId: 'openai/gpt-4o',
			updatedBy: 'user-1'
		});

		expect(view).toEqual({
			configured: true,
			baseUrl: 'https://api.openai.com/v1',
			apiKeySuffix: '7f3a',
			modelId: 'openai/gpt-4o'
		});
		expect(JSON.stringify(view)).not.toContain('sk-org-secret-7f3a');

		const publicView = await readOrganizationAiSettings(org.id, { revealDetails: false });
		expect(publicView).toEqual({ configured: true });
		expect(publicView).not.toHaveProperty('apiKeySuffix');

		const adminView = await readOrganizationAiSettings(org.id, { revealDetails: true });
		expect(adminView.apiKeySuffix).toBe('7f3a');
		expect(JSON.stringify(adminView)).not.toContain('sk-org-secret-7f3a');

		const [row] = await db
			.select()
			.from(organizationAiSettings)
			.where(eq(organizationAiSettings.organizationId, org.id));
		expect(row.apiKeyCipher.length).toBeGreaterThan(16);
		expect(Buffer.from(row.apiKeyCipher).toString('utf8')).not.toContain('sk-org-secret');

		await expect(loadOrganizationChatBackend(org.id)).resolves.toEqual({
			status: 'ok',
			baseUrl: 'https://api.openai.com/v1',
			apiKey: 'sk-org-secret-7f3a',
			modelId: 'openai/gpt-4o'
		});
	});

	it('createChatModel uses the org backend, the hosted pair, or fails closed', async () => {
		const withBackend = await insertOrg('own');
		const withoutBackend = await insertOrg('none');
		const broken = await insertOrg('broken');
		createdIds.push(withBackend.id, withoutBackend.id, broken.id);

		await saveOrganizationAiSettings({
			organizationId: withBackend.id,
			baseUrl: 'https://api.openai.com/v1',
			apiKey: 'sk-org-secret-7f3a',
			modelId: 'openai/gpt-4o',
			updatedBy: 'user-1'
		});

		await db.insert(organizationAiSettings).values({
			organizationId: broken.id,
			baseUrl: 'https://api.openai.com/v1',
			apiKeyCipher: new Uint8Array(32).fill(1),
			apiKeyIv: new Uint8Array(12).fill(2),
			apiKeySuffix: 'dead',
			updatedBy: 'user-1'
		});

		await expect(loadOrganizationChatBackend(withBackend.id)).resolves.toMatchObject({
			status: 'ok',
			modelId: 'openai/gpt-4o'
		});
		const orgModel = await createChatModel(withBackend.id);
		expect(orgModel).toEqual(expect.objectContaining({ modelId: 'openai/gpt-4o' }));

		await expect(loadOrganizationChatBackend(withoutBackend.id)).resolves.toEqual({
			status: 'none'
		});
		try {
			const hosted = await createChatModel(withoutBackend.id);
			expect(hosted).toEqual(expect.objectContaining({ modelId: 'openai/gpt-4o-mini' }));
		} catch (error) {
			expect(error).toBeInstanceOf(ChatModelNotConfiguredError);
			expect(error).not.toBeInstanceOf(ChatBackendMisconfiguredError);
		}

		await expect(loadOrganizationChatBackend(broken.id)).resolves.toEqual({ status: 'broken' });
		await expect(createChatModel(broken.id)).rejects.toBeInstanceOf(ChatBackendMisconfiguredError);
		await expect(createChatModel(broken.id)).rejects.not.toBeInstanceOf(
			ChatModelNotConfiguredError
		);
	});

	it('refuses to save when the wrap key is missing or the URL is private', async () => {
		const org = await insertOrg('reject');
		createdIds.push(org.id);

		await expect(
			saveOrganizationAiSettings({
				organizationId: org.id,
				baseUrl: 'https://10.0.0.4/v1',
				apiKey: 'sk-org-secret-7f3a',
				modelId: undefined,
				updatedBy: 'user-1'
			})
		).rejects.toBeInstanceOf(ChatBackendUrlError);

		const previous = process.env.ORG_AI_WRAP_KEY;
		delete process.env.ORG_AI_WRAP_KEY;
		try {
			await expect(
				saveOrganizationAiSettings({
					organizationId: org.id,
					baseUrl: 'https://api.openai.com/v1',
					apiKey: 'sk-org-secret-7f3a',
					modelId: undefined,
					updatedBy: 'user-1'
				})
			).rejects.toBeInstanceOf(OrgAiWrapKeyMissingError);
		} finally {
			process.env.ORG_AI_WRAP_KEY = previous;
		}
	});

	it('clears the row so the hosted pair is used again', async () => {
		const org = await insertOrg('clear');
		createdIds.push(org.id);
		await saveOrganizationAiSettings({
			organizationId: org.id,
			baseUrl: 'https://api.openai.com/v1',
			apiKey: 'sk-org-secret-7f3a',
			modelId: undefined,
			updatedBy: 'user-1'
		});

		await clearOrganizationAiSettings(org.id);
		await expect(loadOrganizationChatBackend(org.id)).resolves.toEqual({ status: 'none' });
		await expect(readOrganizationAiSettings(org.id, { revealDetails: true })).resolves.toEqual({
			configured: false
		});
	});
});
