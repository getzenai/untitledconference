import { env } from '$env/dynamic/private';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as authSchema from './auth-schema';
import * as exampleSchema from './examples/crud-example-schema';

if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
const client = postgres(env.DATABASE_URL);
export const db = drizzle(client, { schema: { ...authSchema, ...exampleSchema } });
