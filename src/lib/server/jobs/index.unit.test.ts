import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { jobs } from './definitions';
import { defineJob, startWorker } from './index';

describe('defineJob', () => {
	it('keeps the definition fields on the returned job', () => {
		const schema = z.object({ foo: z.string() });
		const job = defineJob({ name: 'a-job', schema, cron: '* * * * *', handler: async () => {} });

		expect(job.name).toBe('a-job');
		expect(job.schema).toBe(schema);
		expect(job.cron).toBe('* * * * *');
	});

	it('rejects an invalid payload before touching the queue', async () => {
		const job = defineJob({
			name: 'validating-job',
			schema: z.object({ count: z.number() }),
			handler: async () => {}
		});

		// No database is available in unit tests, so this only passes if the Zod
		// parse fails before enqueue() ever tries to connect to pg-boss.
		await expect(
			job.enqueue({ count: 'not-a-number' } as unknown as { count: number })
		).rejects.toThrow();
	});
});

describe('startWorker', () => {
	it('rejects duplicate job names', async () => {
		const duplicate = defineJob({
			name: 'same-name',
			schema: z.object({}),
			handler: async () => {}
		});

		await expect(startWorker([duplicate, duplicate])).rejects.toThrow(
			'Duplicate job name: same-name'
		);
	});
});

describe('registered jobs', () => {
	it('have unique names and schemas that accept an empty payload when scheduled', () => {
		expect(jobs.length).toBeGreaterThan(0);
		expect(new Set(jobs.map((job) => job.name)).size).toBe(jobs.length);

		for (const job of jobs.filter((job) => job.cron)) {
			expect(() => job.schema.parse({})).not.toThrow();
		}
	});
});
