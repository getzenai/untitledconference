import { logs, SeverityNumber, type Logger as OtelLogger } from '@opentelemetry/api-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs';
import { hostname } from 'node:os';
import TransportStream from 'winston-transport';

// SvelteKit splits env access: $env/dynamic/private excludes PUBLIC_* vars
// (those live in $env/dynamic/public). We need both, so read each from its own
// module and fall back to process.env when the imports fail (build, scripts, tests).
let privateEnv: Record<string, string | undefined> = process.env;
let publicEnv: Record<string, string | undefined> = process.env;
let building = false;
try {
	const envModule = await import('$env/dynamic/private');
	privateEnv = envModule.env;
} catch {
	// Not in a SvelteKit environment, use process.env
}
try {
	const envModule = await import('$env/dynamic/public');
	publicEnv = envModule.env;
} catch {
	// Not in a SvelteKit environment, use process.env
}
try {
	const appModule = await import('$app/environment');
	building = appModule.building;
} catch {
	// Not in a SvelteKit environment
}

const env = { ...privateEnv, ...publicEnv };

const DEFAULT_POSTHOG_HOST = 'https://eu.i.posthog.com';

/**
 * Parses an `OTEL_EXPORTER_OTLP_*_HEADERS` value.
 * Format per the OpenTelemetry spec: `key1=value1,key2=value2`.
 */
function parseOtlpHeaders(raw: string | undefined): Record<string, string> {
	if (!raw) return {};
	const headers: Record<string, string> = {};
	for (const pair of raw.split(',')) {
		const index = pair.indexOf('=');
		if (index <= 0) continue;
		const key = pair.slice(0, index).trim();
		const value = pair.slice(index + 1).trim();
		if (key) headers[key] = value;
	}
	return headers;
}

type ExporterTarget = { url: string; headers: Record<string, string> };

/**
 * Resolves where log records should be shipped.
 *
 * Two mutually exclusive configurations, checked in order:
 *  1. A generic OTLP/HTTP collector — `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT`
 *     (+ optional `OTEL_EXPORTER_OTLP_LOGS_HEADERS`).
 *  2. PostHog's log ingestion endpoint — `POSTHOG_LOGS_TOKEN` (falling back to
 *     `PUBLIC_POSTHOG_API_KEY`), sent as a Bearer token to `POSTHOG_HOST`.
 *
 * Returns null when neither is configured, which is what keeps log export off
 * by default.
 */
function resolveExporterTarget(): ExporterTarget | null {
	const otlpEndpoint = env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT?.trim();
	if (otlpEndpoint) {
		return {
			url: otlpEndpoint,
			headers: parseOtlpHeaders(env.OTEL_EXPORTER_OTLP_LOGS_HEADERS)
		};
	}

	const posthogToken = (env.POSTHOG_LOGS_TOKEN || env.PUBLIC_POSTHOG_API_KEY)?.trim();
	if (posthogToken) {
		const host = (env.POSTHOG_HOST || DEFAULT_POSTHOG_HOST).replace(/\/+$/, '');
		return {
			url: `${host}/i/v1/logs`,
			headers: { Authorization: `Bearer ${posthogToken}` }
		};
	}

	return null;
}

function deriveServiceName(): string {
	const explicit = env.OTEL_SERVICE_NAME?.trim();
	if (explicit) return explicit;

	const origin = env.ORIGIN?.trim();
	if (origin) {
		try {
			return new URL(origin).host || origin;
		} catch {
			return origin;
		}
	}
	return 'sveltekit-vibe-starter';
}

function deriveDeploymentEnvironment(): string {
	const explicit = env.DEPLOYMENT_ENVIRONMENT?.trim();
	if (explicit) return explicit;
	return env.NODE_ENV === 'production' ? 'production' : 'development';
}

let loggerProvider: LoggerProvider | null = null;
let otelLogger: OtelLogger | null = null;

function isDisabled(): boolean {
	// Never ship logs while `vite build` runs — it executes without secrets.
	if (building) return true;
	// Tests must not emit to a real collector.
	if (process.env.VITEST || process.env.NODE_ENV === 'test') return true;
	return resolveExporterTarget() === null;
}

/**
 * Initializes OpenTelemetry log export. Safe to call unconditionally and
 * repeatedly: it is a no-op when unconfigured, during build, and in tests, and
 * it never throws — a broken exporter must not take the app down.
 */
export function initOtelLogs(): void {
	if (loggerProvider) return;
	if (isDisabled()) return;

	const target = resolveExporterTarget();
	if (!target) return;

	try {
		const attributes: Record<string, string> = {
			'service.name': deriveServiceName(),
			'service.version': env.OTEL_SERVICE_VERSION || env.GIT_COMMIT_SHA || 'unknown',
			'service.instance.id': hostname(),
			'deployment.environment': deriveDeploymentEnvironment()
		};

		const exporter = new OTLPLogExporter({ url: target.url, headers: target.headers });

		loggerProvider = new LoggerProvider({
			resource: resourceFromAttributes(attributes),
			processors: [new BatchLogRecordProcessor({ exporter })]
		});

		logs.setGlobalLoggerProvider(loggerProvider);
		otelLogger = logs.getLogger(attributes['service.name']);
	} catch {
		// Leave export disabled rather than breaking startup.
		loggerProvider = null;
		otelLogger = null;
	}
}

/** Flushes and tears down the exporter. Idempotent. */
export async function shutdownOtelLogs(): Promise<void> {
	if (!loggerProvider) return;
	try {
		await loggerProvider.shutdown();
	} catch {
		// Shutdown is best-effort; never block process exit on it.
	} finally {
		loggerProvider = null;
		otelLogger = null;
	}
}

export function isOtelLogsEnabled(): boolean {
	return otelLogger !== null;
}

const SEVERITY_MAP: Record<string, { text: string; number: SeverityNumber }> = {
	debug: { text: 'debug', number: SeverityNumber.DEBUG },
	info: { text: 'info', number: SeverityNumber.INFO },
	warn: { text: 'warn', number: SeverityNumber.WARN },
	error: { text: 'error', number: SeverityNumber.ERROR }
};

const PRIMITIVE_TYPES = new Set(['string', 'number', 'boolean']);

// Keys whose values must never leave the process, regardless of context.
// Matching is case-insensitive and substring-based (so `apiKey`, `api_key` and
// `userApiKey` all match). Intentionally conservative: this transport sees
// every server log line, so one forgotten field would ship secrets to a third
// party. The `auth(?!or)` branch avoids redacting `author`.
const REDACTED_KEY_PATTERN =
	/password|passwd|secret|token|api[_-]?key|authorization|auth(?!or)|cookie|session|credential|bearer|private[_-]?key/i;
const REDACTED_VALUE = '[REDACTED]';

function stringifyLogValue(value: unknown): string {
	if (value instanceof Error) {
		return JSON.stringify({ name: value.name, message: value.message, stack: value.stack });
	}
	try {
		return JSON.stringify(value) ?? String(value);
	} catch {
		// Circular structures and BigInt values land here.
		return String(value);
	}
}

export function toAttributes(
	info: Record<string, unknown>
): Record<string, string | number | boolean> {
	const attrs: Record<string, string | number | boolean> = {};
	for (const [key, value] of Object.entries(info)) {
		if (value === null || value === undefined) continue;
		// Already carried by the log record itself.
		if (key === 'level' || key === 'message' || key === 'timestamp') continue;
		if (REDACTED_KEY_PATTERN.test(key)) {
			attrs[key] = REDACTED_VALUE;
			continue;
		}
		if (PRIMITIVE_TYPES.has(typeof value)) {
			attrs[key] = value as string | number | boolean;
		} else {
			attrs[key] = stringifyLogValue(value);
		}
	}
	return attrs;
}

/**
 * Winston transport forwarding every log record to an OTLP collector.
 * A no-op when export is not configured, so it is always safe to attach.
 */
export class OtelLogsTransport extends TransportStream {
	log(info: Record<string, unknown>, next: () => void): void {
		setImmediate(() => this.emit('logged', info));

		if (!otelLogger) {
			next();
			return;
		}

		try {
			const level = typeof info.level === 'string' ? info.level : 'info';
			const severity = SEVERITY_MAP[level] ?? SEVERITY_MAP.info;
			const body =
				typeof info.message === 'string' ? info.message : stringifyLogValue(info.message);

			otelLogger.emit({
				severityNumber: severity.number,
				severityText: severity.text,
				body,
				attributes: toAttributes(info)
			});
		} catch {
			// Never let log shipping break the request that produced the log.
		}

		next();
	}
}
