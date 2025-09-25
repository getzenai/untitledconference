export interface VerificationEmailData {
	verificationUrl: string;
	userEmail: string;
}

export interface PasswordResetEmailData {
	resetUrl: string;
	userEmail: string;
}

// Inline HTML template - bundled with the build
const VERIFICATION_EMAIL_TEMPLATE = `<!doctype html>
<html>
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<title>Verify your email</title>
		<style>
			.email-container {
				font-family: Arial, sans-serif;
				line-height: 1.6;
				color: #333;
				max-width: 600px;
				margin: 0 auto;
				padding: 20px;
			}
			.email-card {
				background: #f8f9fa;
				padding: 30px;
				border-radius: 10px;
				box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
			}
			.email-title {
				color: #2d3748;
				margin-bottom: 20px;
				font-size: 24px;
				font-weight: bold;
			}
			.verify-button {
				background-color: #3182ce;
				color: #ffffff !important;
				padding: 12px 30px;
				text-decoration: none;
				border-radius: 5px;
				display: inline-block;
				font-weight: bold;
				margin: 20px 0;
			}
			.verify-button:hover {
				background-color: #2c5aa0;
			}
			.button-container {
				text-align: center;
				margin: 30px 0;
			}
			.fallback-link {
				color: #3182ce;
				word-break: break-all;
			}
			.footer-text {
				color: #666;
				font-size: 14px;
				margin-top: 30px;
			}
			.fine-print {
				color: #666;
				font-size: 12px;
				margin-top: 20px;
				padding-top: 20px;
				border-top: 1px solid #e2e8f0;
			}
		</style>
	</head>
	<body>
		<div class="email-container">
			<div class="email-card">
				<h2 class="email-title">Verify your email address</h2>

				<p>
					Thank you for signing up with SvelteKit Vibe Starter! Please click the button below to
					verify your email address and complete your registration:
				</p>

				<div class="button-container">
					<a href="{{VERIFICATION_URL}}" class="verify-button">Verify Email Address</a>
				</div>

				<p class="footer-text">
					If the button doesn't work, you can also copy and paste this link into your browser:<br />
					<a href="{{VERIFICATION_URL}}" class="fallback-link">{{VERIFICATION_URL}}</a>
				</p>

				<div class="fine-print">
					<p>
						<strong>Security note:</strong> This email was sent to {{USER_EMAIL}}. If you didn't
						create an account with us, please ignore this email.<br /><br />
						This verification link will expire in 24 hours for security reasons.
					</p>
				</div>
			</div>
		</div>
	</body>
</html>`;

function replaceTemplateVariables(template: string, variables: Record<string, string>): string {
	let result = template;
	for (const [key, value] of Object.entries(variables)) {
		const placeholder = `{{${key}}}`;
		result = result.replace(new RegExp(placeholder, 'g'), value);
	}
	return result;
}

export function generateVerificationEmailTemplate({
	verificationUrl,
	userEmail
}: VerificationEmailData): { subject: string; text: string; html: string } {
	const subject = 'Verify your email address';

	const variables = {
		VERIFICATION_URL: verificationUrl,
		USER_EMAIL: userEmail
	};

	// Use inline HTML template
	const html = replaceTemplateVariables(VERIFICATION_EMAIL_TEMPLATE, variables);

	// Generate text version programmatically
	const text = `Verify your email address

Thank you for signing up with SvelteKit Vibe Starter!

Please verify your email address by clicking the link below:

${verificationUrl}

If the link doesn't work, you can copy and paste it into your browser.

Security note: This email was sent to ${userEmail}. If you didn't create an account with us, please ignore this email.

This verification link will expire in 24 hours for security reasons.`;

	return { subject, text, html };
}

// Password Reset Email Template
const PASSWORD_RESET_EMAIL_TEMPLATE = `<!doctype html>
<html>
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<title>Reset your password</title>
		<style>
			.email-container {
				font-family: Arial, sans-serif;
				line-height: 1.6;
				color: #333;
				max-width: 600px;
				margin: 0 auto;
				padding: 20px;
			}
			.email-card {
				background: #f8f9fa;
				padding: 30px;
				border-radius: 10px;
				box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
			}
			.email-title {
				color: #2d3748;
				margin-bottom: 20px;
				font-size: 24px;
				font-weight: bold;
			}
			.reset-button {
				background-color: #3182ce;
				color: #ffffff !important;
				padding: 12px 30px;
				text-decoration: none;
				border-radius: 5px;
				display: inline-block;
				font-weight: bold;
				margin: 20px 0;
			}
			.reset-button:hover {
				background-color: #2c5aa0;
			}
			.button-container {
				text-align: center;
				margin: 30px 0;
			}
			.fallback-link {
				color: #3182ce;
				word-break: break-all;
			}
			.footer-text {
				color: #666;
				font-size: 14px;
				margin-top: 30px;
			}
			.fine-print {
				color: #666;
				font-size: 12px;
				margin-top: 20px;
				padding-top: 20px;
				border-top: 1px solid #e2e8f0;
			}
			.warning {
				background-color: #fef2e8;
				border-left: 4px solid #f59e0b;
				padding: 15px;
				margin: 20px 0;
			}
		</style>
	</head>
	<body>
		<div class="email-container">
			<div class="email-card">
				<h2 class="email-title">Reset your password</h2>

				<p>
					We received a request to reset the password for your SvelteKit Vibe Starter account.
					Click the button below to create a new password:
				</p>

				<div class="button-container">
					<a href="{{RESET_URL}}" class="reset-button">Reset Password</a>
				</div>

				<div class="warning">
					<strong>Important:</strong> This password reset link will expire in 1 hour for security reasons.
				</div>

				<p class="footer-text">
					If the button doesn't work, you can also copy and paste this link into your browser:<br />
					<a href="{{RESET_URL}}" class="fallback-link">{{RESET_URL}}</a>
				</p>

				<div class="fine-print">
					<p>
						<strong>Security note:</strong> This email was sent to {{USER_EMAIL}}. If you didn't request
						a password reset, please ignore this email. Your password will remain unchanged.<br /><br />
						If you're concerned about your account security, please contact our support team.
					</p>
				</div>
			</div>
		</div>
	</body>
</html>`;

export function generatePasswordResetEmailContent(
	resetUrl: string,
	userEmail: string
): { subject: string; text: string; html: string } {
	const subject = 'Reset your password';

	const variables = {
		RESET_URL: resetUrl,
		USER_EMAIL: userEmail
	};

	// Use inline HTML template
	const html = replaceTemplateVariables(PASSWORD_RESET_EMAIL_TEMPLATE, variables);

	// Generate text version programmatically
	const text = `Reset your password

We received a request to reset the password for your SvelteKit Vibe Starter account.

To create a new password, visit the following link:

${resetUrl}

Important: This password reset link will expire in 1 hour for security reasons.

If the link doesn't work, you can copy and paste it into your browser.

Security note: This email was sent to ${userEmail}. If you didn't request a password reset, please ignore this email. Your password will remain unchanged.

If you're concerned about your account security, please contact our support team.`;

	return { subject, text, html };
}
