import { db } from '$lib/server/db';
import { organizationAiSettings } from '$lib/server/db/organization-ai-schema';
import { eq } from 'drizzle-orm';
import { OrgAiUnwrapError, OrgAiWrapKeyMissingError, unwrapApiKey, wrapApiKey } from './org-ai-key';
import {
	assertAllowedChatBackendUrl,
	assertResolvedChatBackendUrl,
	ChatBackendUrlError
} from './org-ai-url';

export type OrganizationAiSettingsView = {
	configured: boolean;
	baseUrl?: string;
	apiKeySuffix?: string;
	modelId?: string | null;
};

export type LoadedOrganizationBackend =
	| { status: 'none' }
	| { status: 'ok'; baseUrl: string; apiKey: string; modelId: string | null }
	| { status: 'broken' };

export async function readOrganizationAiSettings(
	organizationId: string,
	options: { revealDetails: boolean }
): Promise<OrganizationAiSettingsView> {
	const row = await loadRow(organizationId);
	if (!row) return { configured: false };
	if (!options.revealDetails) return { configured: true };
	return {
		configured: true,
		baseUrl: row.baseUrl,
		apiKeySuffix: row.apiKeySuffix ?? undefined,
		modelId: row.modelId
	};
}

export class OrgAiKeyRequiredError extends Error {
	constructor() {
		super('An API key is required.');
		this.name = 'OrgAiKeyRequiredError';
	}
}

export async function saveOrganizationAiSettings(input: {
	organizationId: string;
	baseUrl: string;
	apiKey: string | undefined;
	modelId: string | undefined;
	updatedBy: string;
}): Promise<OrganizationAiSettingsView> {
	// The save path resolves the host: this is where an admin learns that the
	// name they typed points somewhere it may not, instead of the chat failing
	// later with a configuration error.
	const baseUrl = await assertResolvedChatBackendUrl(input.baseUrl);
	const modelId = normalizeModelId(input.modelId);
	const existing = await loadRow(input.organizationId);
	const wrapped = await resolveWrappedKey(input.organizationId, input.apiKey, existing);
	await upsertOrganizationAiSettings({
		organizationId: input.organizationId,
		baseUrl,
		modelId,
		updatedBy: input.updatedBy,
		...wrapped
	});
	return {
		configured: true,
		baseUrl,
		apiKeySuffix: wrapped.suffix ?? undefined,
		modelId
	};
}

export async function clearOrganizationAiSettings(organizationId: string): Promise<void> {
	await db
		.delete(organizationAiSettings)
		.where(eq(organizationAiSettings.organizationId, organizationId));
}

export async function loadOrganizationChatBackend(
	organizationId: string
): Promise<LoadedOrganizationBackend> {
	const row = await loadRow(organizationId);
	if (!row) return { status: 'none' };
	try {
		// Shape only, and deliberately: the resolved-address check for this
		// request happens in `org-ai-fetch.ts`, at the moment the call is made.
		// Resolving here as well would pay for a second lookup and still not be
		// the lookup that matters.
		assertAllowedChatBackendUrl(row.baseUrl);
		const apiKey = await unwrapApiKey(row.apiKeyCipher, row.apiKeyIv, organizationId);
		return { status: 'ok', baseUrl: row.baseUrl, apiKey, modelId: row.modelId };
	} catch (error) {
		if (
			error instanceof OrgAiUnwrapError ||
			error instanceof OrgAiWrapKeyMissingError ||
			error instanceof ChatBackendUrlError
		) {
			return { status: 'broken' };
		}
		throw error;
	}
}

async function resolveWrappedKey(
	organizationId: string,
	apiKey: string | undefined,
	existing: Awaited<ReturnType<typeof loadRow>>
) {
	const incomingKey = apiKey?.trim() ?? '';
	if (incomingKey) {
		const wrapped = await wrapApiKey(incomingKey, organizationId);
		return { cipher: wrapped.cipher, iv: wrapped.iv, suffix: wrapped.suffix };
	}
	if (existing?.apiKeyCipher && existing.apiKeyIv) {
		return {
			cipher: existing.apiKeyCipher,
			iv: existing.apiKeyIv,
			suffix: existing.apiKeySuffix ?? null
		};
	}
	throw new OrgAiKeyRequiredError();
}

async function upsertOrganizationAiSettings(row: {
	organizationId: string;
	baseUrl: string;
	cipher: Uint8Array;
	iv: Uint8Array;
	suffix: string | null;
	modelId: string | null;
	updatedBy: string;
}) {
	await db
		.insert(organizationAiSettings)
		.values({
			organizationId: row.organizationId,
			baseUrl: row.baseUrl,
			apiKeyCipher: row.cipher,
			apiKeyIv: row.iv,
			apiKeySuffix: row.suffix,
			modelId: row.modelId,
			updatedBy: row.updatedBy
		})
		.onConflictDoUpdate({
			target: organizationAiSettings.organizationId,
			set: {
				baseUrl: row.baseUrl,
				apiKeyCipher: row.cipher,
				apiKeyIv: row.iv,
				apiKeySuffix: row.suffix,
				modelId: row.modelId,
				updatedBy: row.updatedBy,
				updatedAt: new Date()
			}
		});
}

async function loadRow(organizationId: string) {
	const [row] = await db
		.select()
		.from(organizationAiSettings)
		.where(eq(organizationAiSettings.organizationId, organizationId))
		.limit(1);
	return row ?? null;
}

function normalizeModelId(value: string | undefined): string | null {
	const trimmed = value?.trim() ?? '';
	return trimmed.length > 0 ? trimmed : null;
}
