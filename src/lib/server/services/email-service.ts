import sgMail from '@sendgrid/mail';
import { config } from '../config';
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
	if (!config.sendEmails) {
		logger.info('Email (console mode)', {
			to,
			subject,
			text,
			html: html ? '(HTML content provided)' : undefined
		});
		return;
	}

	if (!config.sendgridApiKey) {
		throw new Error('SENDGRID_API_KEY is not set.');
	}

	if (!config.sendgridFrom) {
		throw new Error('SENDGRID_FROM is not set.');
	}

	sgMail.setApiKey(config.sendgridApiKey);

	try {
		await sgMail.send({
			to,
			from: config.sendgridFrom,
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
