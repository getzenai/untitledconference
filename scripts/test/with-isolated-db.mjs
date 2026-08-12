#!/usr/bin/env node

/**
 * Runs one test command against a disposable PostgreSQL database.
 *
 * TEST_DATABASE_URL is the control connection: its credentials and server are
 * reused, but its database is never touched. The child receives a unique
 * TEST_DATABASE_URL/DATABASE_URL, and the database is force-dropped when the
 * command exits or is interrupted.
 */
import 'dotenv/config';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import postgres from 'postgres';

const defaultTestDatabaseUrl = 'postgres://root:mysecretpassword@localhost:5433/test';
const signalExitCodes = { SIGINT: 130, SIGTERM: 143 };

function databaseUrl(connectionString, databaseName) {
	const url = new URL(connectionString);
	if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
		throw new Error(`TEST_DATABASE_URL must use postgres:// or postgresql://, got ${url.protocol}`);
	}
	url.pathname = `/${databaseName}`;
	return url.toString();
}

function commandFromArgs(args) {
	const command = args[0] === '--' ? args.slice(1) : args;
	if (command.length === 0) {
		throw new Error('Usage: with-isolated-db.mjs -- <command> [args...]');
	}
	return command;
}

function installSignalForwarding(state) {
	const handlers = Object.keys(signalExitCodes).map((signal) => {
		const handler = () => {
			state.requestedSignal ??= signal;
			state.child?.kill(signal);
		};
		process.on(signal, handler);
		return [signal, handler];
	});
	return () => {
		for (const [signal, handler] of handlers) process.off(signal, handler);
	};
}

async function runChild(command, args, isolatedUrl, state) {
	state.child = spawn(command, args, {
		stdio: 'inherit',
		env: {
			...process.env,
			DATABASE_URL: isolatedUrl,
			TEST_DATABASE_URL: isolatedUrl
		}
	});

	return await new Promise((resolve, reject) => {
		state.child.once('error', reject);
		state.child.once('exit', (code, signal) => resolve({ code, signal }));
	});
}

async function run() {
	const [command, ...args] = commandFromArgs(process.argv.slice(2));
	const baseUrl = process.env.TEST_DATABASE_URL || defaultTestDatabaseUrl;
	const databaseName = `uc_test_${Date.now().toString(36)}_${process.pid}_${randomBytes(5).toString('hex')}`;
	const controlUrl = databaseUrl(baseUrl, 'postgres');
	const isolatedUrl = databaseUrl(baseUrl, databaseName);
	const host = new URL(baseUrl);
	const control = postgres(controlUrl, { max: 1, prepare: false });
	const state = { child: undefined, requestedSignal: undefined };
	let exitCode = 1;
	const removeSignalHandlers = installSignalForwarding(state);

	try {
		console.log(
			`[test-db] Creating isolated database ${databaseName} on ${host.hostname}:${host.port || '5432'}`
		);
		await control.unsafe(`CREATE DATABASE ${databaseName}`);

		if (state.requestedSignal) {
			exitCode = signalExitCodes[state.requestedSignal];
		} else {
			const result = await runChild(command, args, isolatedUrl, state);
			exitCode = result.code ?? signalExitCodes[result.signal] ?? 1;
		}
	} finally {
		removeSignalHandlers();
		try {
			console.log(`[test-db] Dropping isolated database ${databaseName}`);
			await control.unsafe(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
		} catch (error) {
			exitCode = 1;
			console.error(
				`[test-db] Failed to drop ${databaseName}:`,
				error instanceof Error ? error.message : error
			);
		} finally {
			await control.end({ timeout: 5 });
		}
	}

	process.exitCode = exitCode;
}

run().catch((error) => {
	console.error('[test-db] Failed:', error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
