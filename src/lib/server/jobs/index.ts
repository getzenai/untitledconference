import { PgBoss, type Job as PgBossJob, type SendOptions } from 'pg-boss';
import type { z } from 'zod/v4';
import { serverEnv } from '../env';
import { createLogger } from '../logger';

const logger = createLogger('Jobs');

export interface JobDefinition<Schema extends z.ZodType<object>> {
	/** Unique pg-boss queue name, e.g. `cleanup-expired-sessions`. */
	name: string;
	/** Payload schema, validated on enqueue and again before the handler runs. */
	schema: Schema;
	/** Processes one job. Throw to fail it (pg-boss retries per queue policy). */
	handler: (payload: z.infer<Schema>) => Promise<void>;
	/**
	 * Optional cron expression (UTC), registered by `startWorker`. Scheduled runs
	 * pass an empty payload, so `schema` must accept `{}`.
	 */
	cron?: string;
}

export interface Job<
	Schema extends z.ZodType<object> = z.ZodType<object>
> extends JobDefinition<Schema> {
	enqueue(payload: z.input<Schema>, options?: SendOptions): Promise<string | null>;
}

let boss: PgBoss | undefined;
let starting: Promise<PgBoss> | undefined;
const ensuredQueues = new Set<string>();

async function createBoss(): Promise<PgBoss> {
	const instance = new PgBoss({ connectionString: serverEnv().DATABASE_URL });
	instance.on('error', (error) => logger.error('pg-boss error', error));
	await instance.start();
	logger.info('pg-boss started');
	boss = instance;
	return instance;
}

/**
 * Returns the shared pg-boss instance, starting it (and running its internal
 * migrations) on first use. Concurrent callers await the same startup promise.
 */
async function getBoss(): Promise<PgBoss> {
	if (boss) return boss;
	if (!starting) starting = createBoss();
	return starting;
}

async function ensureQueue(instance: PgBoss, name: string): Promise<void> {
	if (ensuredQueues.has(name)) return;
	await instance.createQueue(name);
	ensuredQueues.add(name);
}

/**
 * Declares a background job. Call at module scope in `./definitions/` and add
 * the result to the `jobs` array in `./definitions/index.ts`.
 */
export function defineJob<Schema extends z.ZodType<object>>(
	definition: JobDefinition<Schema>
): Job<Schema> {
	return {
		...definition,
		async enqueue(payload, options) {
			const data = definition.schema.parse(payload);
			const instance = await getBoss();
			await ensureQueue(instance, definition.name);
			return instance.send(definition.name, data, options);
		}
	};
}

/**
 * Starts pg-boss, attaches a handler for every job, and registers cron
 * schedules. Call once per worker process — see `./worker.ts`.
 */
export async function startWorker(jobs: Job[]): Promise<void> {
	const seen = new Set<string>();
	for (const job of jobs) {
		if (seen.has(job.name)) throw new Error(`Duplicate job name: ${job.name}`);
		seen.add(job.name);
	}

	const instance = await getBoss();

	for (const job of jobs) {
		await ensureQueue(instance, job.name);
		await instance.work(job.name, async (tasks: PgBossJob[]) => {
			for (const task of tasks) {
				logger.info('Job started', { name: job.name, id: task.id });
				try {
					await job.handler(job.schema.parse(task.data));
					logger.info('Job completed', { name: job.name, id: task.id });
				} catch (error) {
					logger.error('Job failed', error as Error, { name: job.name, id: task.id });
					throw error;
				}
			}
		});

		if (job.cron) {
			await instance.schedule(job.name, job.cron, job.schema.parse({}));
		}
	}

	logger.info('Job worker started', { jobs: [...seen] });
}

/** Stops the shared pg-boss instance and closes its pool. Call on shutdown. */
export async function stopBoss(): Promise<void> {
	if (!boss) return;
	const instance = boss;
	boss = undefined;
	starting = undefined;
	ensuredQueues.clear();
	await instance.stop({ graceful: true, close: true, timeout: 5000 });
	logger.info('pg-boss stopped');
}
