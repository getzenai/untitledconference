import { env } from '$env/dynamic/private';

function required(name: string): string {
	const value = env[name];
	if (!value) throw new Error(`Missing required env var: ${name}`);
	return value;
}

function optional(name: string, fallback?: string): string | undefined {
	return env[name] || fallback;
}

type Config = {
	databaseUrl: string;
	betterAuthSecret: string;
	betterAuthUrl: string;
	betterAuthTrustedOrigins: string | undefined;
	requireEmailVerification: boolean;
	sendEmails: boolean;
	sendgridApiKey: string | undefined;
	sendgridFrom: string | undefined;
	aiProvider: string | undefined;
	azureOpenaiApiKey: string | undefined;
	azureResourceName: string | undefined;
	azureOpenaiDeploymentName: string | undefined;
	githubClientId: string | undefined;
	githubClientSecret: string | undefined;
};

function resolve(): Config {
	return {
		databaseUrl: required('DATABASE_URL'),
		betterAuthSecret: required('BETTER_AUTH_SECRET'),
		betterAuthUrl: optional('BETTER_AUTH_URL', 'http://localhost:5173')!,
		betterAuthTrustedOrigins: optional('BETTER_AUTH_TRUSTED_ORIGINS'),
		requireEmailVerification:
			env.REQUIRE_EMAIL_VERIFICATION === undefined
				? true
				: env.REQUIRE_EMAIL_VERIFICATION === 'true',
		sendEmails: optional('SEND_EMAILS_INSTEAD_OF_CONSOLE_LOG') === 'true',
		sendgridApiKey: optional('SENDGRID_API_KEY'),
		sendgridFrom: optional('SENDGRID_FROM'),
		aiProvider: optional('AI_PROVIDER'),
		azureOpenaiApiKey: optional('AZURE_OPENAI_API_KEY'),
		azureResourceName: optional('AZURE_RESOURCE_NAME'),
		azureOpenaiDeploymentName: optional('AZURE_OPENAI_DEPLOYMENT_NAME'),
		githubClientId: optional('GITHUB_CLIENT_ID'),
		githubClientSecret: optional('GITHUB_CLIENT_SECRET')
	};
}

let _config: Config | undefined;

export const config: Config = new Proxy({} as Config, {
	get(_, prop: string) {
		if (!_config) _config = resolve();
		return _config[prop as keyof Config];
	}
});
