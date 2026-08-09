import { describe, expect, it } from 'vitest';
import {
	OtelLogsTransport,
	initOtelLogs,
	isOtelLogsEnabled,
	shutdownOtelLogs,
	toAttributes
} from './otel-logs';

describe('otel-logs', () => {
	describe('enablement', () => {
		it('stays disabled in the test environment even after init', () => {
			initOtelLogs();
			expect(isOtelLogsEnabled()).toBe(false);
		});

		it('shuts down cleanly when it was never initialized', async () => {
			await expect(shutdownOtelLogs()).resolves.toBeUndefined();
		});
	});

	describe('toAttributes redaction', () => {
		it('redacts values whose key names a credential', () => {
			const attrs = toAttributes({
				password: 'hunter2',
				apiKey: 'k-123',
				api_key: 'k-456',
				userApiKey: 'k-789',
				authorization: 'Bearer abc',
				sessionId: 'sess-1',
				refreshToken: 't-1',
				privateKey: 'pk-1',
				cookie: 'a=b'
			});

			for (const value of Object.values(attrs)) {
				expect(value).toBe('[REDACTED]');
			}
		});

		it('does not redact innocuous keys that merely contain a substring', () => {
			const attrs = toAttributes({ author: 'ada', authorName: 'ada lovelace' });

			expect(attrs.author).toBe('ada');
			expect(attrs.authorName).toBe('ada lovelace');
		});

		it('passes primitives through unchanged', () => {
			const attrs = toAttributes({ userId: 'u1', count: 3, enabled: true });

			expect(attrs).toEqual({ userId: 'u1', count: 3, enabled: true });
		});

		it('drops the fields the log record already carries', () => {
			const attrs = toAttributes({
				level: 'error',
				message: 'boom',
				timestamp: '2026-01-01',
				context: 'Svc'
			});

			expect(attrs).toEqual({ context: 'Svc' });
		});

		it('drops null and undefined values', () => {
			const attrs = toAttributes({ a: null, b: undefined, c: 'kept' });

			expect(attrs).toEqual({ c: 'kept' });
		});

		it('serializes errors with their stack', () => {
			const attrs = toAttributes({ failure: new Error('boom') });

			expect(String(attrs.failure)).toContain('boom');
			expect(String(attrs.failure)).toContain('stack');
		});

		it('survives circular structures', () => {
			const circular: Record<string, unknown> = { name: 'loop' };
			circular.self = circular;

			expect(() => toAttributes({ circular })).not.toThrow();
		});
	});

	describe('OtelLogsTransport', () => {
		it('calls next() and does not throw when export is disabled', () => {
			const transport = new OtelLogsTransport();
			let called = false;

			expect(() =>
				transport.log({ level: 'info', message: 'hello' }, () => {
					called = true;
				})
			).not.toThrow();
			expect(called).toBe(true);
		});
	});
});
