import { env } from '$env/dynamic/private';
import sgMail from '@sendgrid/mail';
import { generateVerificationEmailTemplate } from '../email-templates';

interface EmailData {
	to: string;
	subject: string;
	text: string;
	html?: string;
}

export async function sendEmail({ to, subject, text, html }: EmailData): Promise<void> {
	const shouldSendEmail = env.SEND_EMAILS_INSTEAD_OF_CONSOLE_LOG === 'true';

	if (!shouldSendEmail) {
		console.log('📧 EMAIL (Console Mode)');
		console.log('======================');
		console.log(`To: ${to}`);
		console.log(`Subject: ${subject}`);
		console.log(`Text: ${text}`);
		if (html) {
			console.log(`HTML: ${html}`);
		}
		console.log('======================');
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
		console.log(`📧 Email sent successfully to ${to}`);
	} catch (error) {
		console.error('❌ Failed to send email:', error);
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
