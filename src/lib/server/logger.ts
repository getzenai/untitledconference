import winston from 'winston';

const { combine, timestamp, json, printf, colorize, errors } = winston.format;

type LogLevel = 'error' | 'warn' | 'info' | 'debug';
type LogFormat = 'human' | 'json';

// Dynamic imports for SvelteKit modules that might not be available
let building = false;
let env: Record<string, string | undefined> = process.env;

// Try to import SvelteKit modules if available
try {
	const appModule = await import('$app/environment');
	building = appModule.building;
} catch {
	// Not in SvelteKit environment, use defaults
}

try {
	const envModule = await import('$env/dynamic/private');
	env = envModule.env;
} catch {
	// Not in SvelteKit environment, use process.env
}

function getLogLevel(): LogLevel {
	if (building) return 'warn';

	const level = (env.LOG_LEVEL || 'warn').toLowerCase();
	if (['error', 'warn', 'info', 'debug'].includes(level)) {
		return level as LogLevel;
	}
	return 'warn';
}

function getLogFormat(): LogFormat {
	const format = (env.LOG_FORMAT || 'human').toLowerCase();
	return format === 'json' ? 'json' : 'human';
}

// Human-readable format for development
const humanFormat = printf(({ level, message, timestamp, context, ...metadata }) => {
	let msg = `${timestamp} [${level}]`;
	if (context) msg += ` [${context}]`;
	msg += ` ${message}`;

	// Only add metadata if it exists and isn't empty
	const metadataKeys = Object.keys(metadata).filter((k) => k !== 'error');
	if (metadataKeys.length > 0) {
		msg += ` ${JSON.stringify(metadata)}`;
	}

	if (metadata.error) msg += `\n${metadata.error}`;
	return msg;
});

// Configure format based on environment variable
const format =
	getLogFormat() === 'json'
		? combine(timestamp(), errors({ stack: true }), json())
		: combine(
				colorize({ all: true }),
				timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
				errors({ stack: true }),
				humanFormat
			);

const logger = winston.createLogger({
	level: getLogLevel(),
	format,
	transports: building ? [] : [new winston.transports.Console()],
	silent: building
});

export class Logger {
	private context?: string;

	constructor(context?: string) {
		this.context = context;
	}

	debug(message: string, data?: unknown): void {
		logger.debug(message, { context: this.context, ...this.normalizeData(data) });
	}

	info(message: string, data?: unknown): void {
		logger.info(message, { context: this.context, ...this.normalizeData(data) });
	}

	warn(message: string, data?: unknown): void {
		logger.warn(message, { context: this.context, ...this.normalizeData(data) });
	}

	error(message: string, error?: Error | unknown, data?: unknown): void {
		const metadata: Record<string, unknown> = { context: this.context };

		if (error instanceof Error) {
			metadata.error = error.stack || error.message;
			metadata.errorName = error.name;
		} else if (error) {
			metadata.errorData = error;
		}

		if (data) {
			Object.assign(metadata, this.normalizeData(data));
		}

		logger.error(message, metadata);
	}

	private normalizeData(data: unknown): Record<string, unknown> {
		if (!data) return {};
		if (typeof data === 'object' && data !== null) {
			return data as Record<string, unknown>;
		}
		return { data };
	}
}

export function createLogger(context?: string): Logger {
	return new Logger(context);
}

export const defaultLogger = createLogger();
