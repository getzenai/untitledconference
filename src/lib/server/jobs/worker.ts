/**
 * Standalone worker process. Run with `npm run jobs:worker:dev` locally, or
 * `node build/worker.js` in production (see ./CLAUDE.md).
 */
import { createLogger } from '../logger';
import { jobs } from './definitions';
import { startWorker, stopBoss } from './index';

const logger = createLogger('JobWorker');

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
	if (shuttingDown) return;
	shuttingDown = true;
	logger.info('Shutting down job worker', { signal });
	try {
		await stopBoss();
	} finally {
		process.exit(0);
	}
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

startWorker(jobs).catch((error) => {
	logger.error('Job worker failed to start', error as Error);
	process.exit(1);
});
