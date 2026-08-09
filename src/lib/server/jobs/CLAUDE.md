# Background Jobs (pg-boss)

Job queue on [pg-boss](https://github.com/timgit/pg-boss). Queues and jobs live in
Postgres (pg-boss manages its own `pgboss` schema inside `DATABASE_URL`) — no extra
infrastructure, no extra env vars.

## Files

- `index.ts` — the whole job layer: the pg-boss singleton, `defineJob()`,
  `startWorker()`, `stopBoss()`.
- `definitions/` — one file per job, plus `definitions/index.ts` which exports the
  `jobs` array the worker runs.
- `worker.ts` — the standalone worker process entrypoint.

Job handlers use the app's normal `$lib/server/db` connection and read configuration
through `serverEnv()` in `$lib/server/env`. There is no jobs-specific database module.

## This layer runs in Node, not on the Worker

`boss` is a process-wide singleton holding its own connection pool. That is correct
for `worker.ts`, which is a long-lived Node process — and it is exactly the shape
that fails on Cloudflare Workers, where a socket opened by one request may not be
touched by another. `$lib/server/db` hit this and now scopes its connection per
request; pg-boss has the same pattern and no such guard.

Nothing calls `enqueue()` from a route today (checked across `src`, outside this
directory). **Before the first one does**, decide how the job is queued from the
Worker — through a request-scoped connection, or by not queueing from the Worker at
all. Calling `enqueue()` from a route as things stand will work on the first request
an isolate serves and fail on the ones after it, which is the hardest version of
this bug to recognise.

## Adding a job

1. Create `definitions/my-job.ts`:

   ```ts
   import { z } from 'zod/v4';
   import { defineJob } from '../index';

   export const myJob = defineJob({
   	name: 'my-job',
   	schema: z.object({ userId: z.string() }),
   	handler: async ({ userId }) => {
   		// do the work; throw to trigger a pg-boss retry
   	}
   });
   ```

2. Add it to the `jobs` array in `definitions/index.ts`:

   ```ts
   export const jobs: Job[] = [cleanupExpiredSessionsJob, myJob];
   ```

3. Enqueue it from any server code — a form action, an API route, a service:

   ```ts
   // src/routes/api/v1/things/+server.ts
   import { myJob } from '$lib/server/jobs/definitions/my-job';

   export const POST: RequestHandler = async ({ locals }) => {
   	await myJob.enqueue({ userId: locals.user.id });
   	return json({ queued: true }, { status: 202 });
   };
   ```

   `enqueue()` validates the payload against the job's Zod schema before sending, and
   the worker validates it again before calling the handler. The request handler does
   not need the worker to be running — the job waits in Postgres until one is.

To run a job on a schedule, add a `cron` field (UTC) to the definition:

```ts
export const myJob = defineJob({ name: 'my-job', schema, cron: '*/15 * * * *', handler });
```

`startWorker` registers cron jobs with an empty payload, so a scheduled job's schema
must accept `{}` (give every field a default). This is asserted in `index.unit.test.ts`.

## Running the worker

```bash
npm run jobs:worker:dev   # local: secrets via the Infisical wrapper, restarts on change
```

It is a long-running process, separate from `npm run dev` — you need both running for
enqueued jobs to actually be processed. `Ctrl+C` stops pg-boss gracefully.

In production the worker is a second container built from the same image, started with
`node build/worker.js` (`npm run jobs:worker`). `npm run build` emits `build/worker.js`
next to the SvelteKit server bundle via esbuild, and the Dockerfile already copies all
of `build/` into the runtime stage, so no image changes are needed. See the `worker`
service in `scripts/hetzner-deploy/docker-compose.prod.yml`. It needs every variable
`serverEnvSchema` marks required — `DATABASE_URL` and `BETTER_AUTH_SECRET` — because
`serverEnv()` validates the whole schema at once.

## Why a separate process

Running the worker outside the web server lets it be restarted and scaled
independently, and keeps a polling loop out of the request pipeline. Because it runs
as plain Node rather than through SvelteKit, `env.ts` and `logger.ts` fall back to
`process.env` when `$env/dynamic/private` isn't resolvable — that fallback is what
lets the worker reuse the app's own config and database modules.

## Testing

- `index.unit.test.ts` — payload validation, duplicate-name guard, and that every
  scheduled job's schema accepts an empty payload. No database needed.
- `definitions/cleanup-expired-sessions.integration.test.ts` — starts a real worker
  against `TEST_DATABASE_URL`, enqueues the job, and polls until the expired session
  row is gone. Needs the test database (`docker compose up -d`).
