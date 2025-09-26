import { env } from '$env/dynamic/private';
import sgMail from '@sendgrid/mail';
import {
	generatePasswordResetEmailContent,
	generateVerificationEmailTemplate
} from '../email-templates';
import { createLogger } from '../logger';

const logger = createLogger('EmailService');

interface EmailData {
	to: string;
	subject: string;
	text: string;
	html?: string;
}

export async function sendEmail({ to, subject, text, html }: EmailData): Promise<void> {
	const shouldSendEmail = env.SEND_EMAILS_INSTEAD_OF_CONSOLE_LOG === 'true';

	if (!shouldSendEmail) {
		logger.info('Email (console mode)', {
			to,
			subject,
			text,
			html: html ? '(HTML content provided)' : undefined
		});
		return;
	}

	const apiKey = env.SENDGRID_API_KEY;
	const fromAddress = env.SENDGRID_FROM;

	if (!apiKey) {
		throw new Error('SENDGRID_API_KEY is not set.');
	}

	if (!fromAddress) {
		throw new Error('SENDGRID_FROM is not set.');
	}

	sgMail.setApiKey(apiKey);

	try {
		await sgMail.send({
			to,
			from: fromAddress,
			subject,
			text,
			html
		});
		logger.info('Email sent successfully', { to, subject });
	} catch (error) {
		logger.error('Failed to send email', error as Error, { to, subject });
		throw error;
	}
}

export function generateVerificationEmailContent(
	verificationUrl: string,
	userEmail: string
): { subject: string; text: string; html: string } {
	return generateVerificationEmailTemplate({
		verificationUrl,
		userEmail
	});
}

export { generatePasswordResetEmailContent };
