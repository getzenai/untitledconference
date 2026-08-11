/**
 * Delivers the durable `email_log` outbox through Resend.
 *
 * Each row is claimed under `FOR UPDATE SKIP LOCKED`, then sent and marked in
 * one transaction. The provider key is stable for the lifetime of the row, so
 * a crash after Resend accepted a message but before Postgres committed can be
 * retried without producing a second email.
 */
import { db } from '$lib/server/db';
import { emailLogTable } from '$lib/server/db/conference/email-schema';
import { serverEnv } from '$lib/server/env';
import { and, asc, count, eq, type SQL } from 'drizzle-orm';

export type DeliverableEmail = {
	id: number;
	toEmail: string;
	subject: string;
	body: string;
};

export type EmailTransport = (email: DeliverableEmail) => Promise<void>;

type ResendConfig = { apiKey: string; from: string };
type Fetcher = typeof fetch;

export type DispatchResult = {
	sent: number;
	failed: number;
	remaining: number;
	disabled: boolean;
};

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

function providerError(status: number, value: unknown): Error {
	let detail = '';
	if (value && typeof value === 'object' && 'message' in value) {
		detail = String(value.message);
	} else if (typeof value === 'string') {
		detail = value;
	}
	return new Error(`Resend ${status}${detail ? `: ${detail}` : ''}`.slice(0, 1000));
}

/** Sends one row. Exported so the provider boundary can be tested without Postgres. */
export async function deliverViaResend(
	email: DeliverableEmail,
	config: ResendConfig,
	fetcher: Fetcher = fetch
): Promise<void> {
	const response = await fetcher('https://api.resend.com/emails', {
		method: 'POST',
		signal: AbortSignal.timeout(15_000),
		headers: {
			Authorization: `Bearer ${config.apiKey}`,
			'Content-Type': 'application/json',
			'Idempotency-Key': `email-log-${email.id}`
		},
		body: JSON.stringify({
			from: config.from,
			to: [email.toEmail],
			subject: email.subject,
			text: email.body
		})
	});

	if (response.ok) return;
	const rawError = await response.text();
	let error: unknown = rawError;
	try {
		error = JSON.parse(rawError);
	} catch {
		// Plain-text provider response; keep it as-is.
	}
	throw providerError(response.status, error);
}

function configuredTransport(): EmailTransport | null {
	const env = serverEnv();
	if (!env.RESEND_API_KEY || !env.RESEND_FROM) return null;
	const config = { apiKey: env.RESEND_API_KEY, from: env.RESEND_FROM };
	return (email) => deliverViaResend(email, config);
}

function errorMessage(error: unknown): string {
	return (error instanceof Error ? error.message : String(error)).slice(0, 1000);
}

async function dispatchNext(scope: SQL[], transport: EmailTransport) {
	return db.transaction(async (tx) => {
		const [row] = await tx
			.select({
				id: emailLogTable.id,
				toEmail: emailLogTable.toEmail,
				subject: emailLogTable.subject,
				body: emailLogTable.bodyPreview
			})
			.from(emailLogTable)
			.where(and(...scope))
			.orderBy(asc(emailLogTable.id))
			.limit(1)
			.for('update', { skipLocked: true });

		if (!row) return null;
		if (!row.body) {
			await tx
				.update(emailLogTable)
				.set({ status: 'failed', error: 'Email body is empty.', sentAt: null })
				.where(eq(emailLogTable.id, row.id));
			return 'failed' as const;
		}

		try {
			await transport({ ...row, body: row.body });
			await tx
				.update(emailLogTable)
				.set({ status: 'sent', error: null, sentAt: new Date() })
				.where(eq(emailLogTable.id, row.id));
			return 'sent' as const;
		} catch (error) {
			await tx
				.update(emailLogTable)
				.set({ status: 'failed', error: errorMessage(error), sentAt: null })
				.where(eq(emailLogTable.id, row.id));
			return 'failed' as const;
		}
	});
}

/**
 * Delivers at most `limit` queued rows. Concurrent dispatchers claim different
 * rows; sent and failed rows are never selected again.
 */
async function dispatchConfigured(
	options: {
		conferenceId?: number;
		limit?: number;
	},
	transport: EmailTransport
): Promise<DispatchResult> {
	const limit = Math.max(1, Math.min(MAX_LIMIT, Math.trunc(options.limit ?? DEFAULT_LIMIT)));
	const scope: SQL[] = [eq(emailLogTable.status, 'queued')];
	if (options.conferenceId !== undefined) {
		scope.push(eq(emailLogTable.conferenceId, options.conferenceId));
	}

	let sent = 0;
	let failed = 0;
	for (let index = 0; index < limit; index += 1) {
		const handled = await dispatchNext(scope, transport);

		if (handled === null) break;
		if (handled === 'sent') sent += 1;
		else failed += 1;
	}

	const [{ count: remaining = 0 } = {}] = await db
		.select({ count: count() })
		.from(emailLogTable)
		.where(and(...scope));
	return { sent, failed, remaining: Number(remaining), disabled: false };
}

export function dispatchQueuedEmails(
	options: {
		conferenceId?: number;
		limit?: number;
		transport?: EmailTransport;
	} = {}
): Promise<DispatchResult> {
	const transport = options.transport ?? configuredTransport();
	if (!transport) return Promise.resolve({ sent: 0, failed: 0, remaining: 0, disabled: true });
	return dispatchConfigured(options, transport);
}

/** Best-effort request-path flush: missing Resend configuration intentionally leaves the outbox queued. */
export async function dispatchConferenceEmails(conferenceId: number): Promise<DispatchResult> {
	return dispatchQueuedEmails({ conferenceId });
}
