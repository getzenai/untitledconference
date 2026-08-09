import type { Job } from '../index';
import { cleanupExpiredSessionsJob } from './cleanup-expired-sessions';

/**
 * Every job the worker should run. Add new jobs here — this is the only list
 * `startWorker` reads.
 */
export const jobs: Job[] = [cleanupExpiredSessionsJob];
