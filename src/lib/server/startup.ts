import { building } from '$app/environment';
import { env } from '$env/dynamic/public';
import { createLogger } from '$lib/server/logger';
import { isOtelLogsEnabled, shutdownOtelLogs } from '$lib/server/otel-logs';
import { shutdownPostHog } from '$lib/server/posthog';

const logger = createLogger('Startup');

const isTestEnvironment = Boolean(process.env.VITEST) || process.env.NODE_ENV === 'test';

/**
 * Telemetry buffers events in memory, so a container that is SIGTERM'd mid-batch
 * loses them. Register shutdown flushing only when something is actually
 * buffering — otherwise these handlers would interfere with the dev server's own
 * signal handling for no benefit.
 */
function needsGracefulShutdown(): boolean {
	if (building || isTestEnvironment) return false;
	return isOtelLogsEnabled() || Boolean(env.PUBLIC_POSTHOG_API_KEY);
}

let registered = false;

function registerShutdownHandlers(): void {
	if (registered || !needsGracefulShutdown()) return;
	registered = true;

	const shutdown = async (signal: NodeJS.Signals) => {
		logger.info('Shutting down, flushing telemetry', { signal });
		await Promise.allSettled([shutdownPostHog(), shutdownOtelLogs()]);
		process.exit(0);
	};

	process.once('SIGTERM', shutdown);
	process.once('SIGINT', shutdown);
}

registerShutdownHandlers();
