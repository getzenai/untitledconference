import { describe, expect, it, vi } from 'vitest';
import { deliverViaResend } from './email-dispatcher';

describe('deliverViaResend', () => {
	it('uses the email-log id as the stable provider idempotency key', async () => {
		const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'email_123' })));

		await deliverViaResend(
			{
				id: 42,
				toEmail: 'speaker@example.com',
				subject: 'Your proposal was accepted',
				body: 'See you in Portland.'
			},
			{ apiKey: 're_test', from: 'Conference <mail@example.com>' },
			fetcher
		);

		expect(fetcher).toHaveBeenCalledOnce();
		expect(fetcher).toHaveBeenCalledWith(
			'https://api.resend.com/emails',
			expect.objectContaining({
				method: 'POST',
				headers: expect.objectContaining({
					Authorization: 'Bearer re_test',
					'Idempotency-Key': 'email-log-42'
				})
			})
		);
		expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
			from: 'Conference <mail@example.com>',
			to: ['speaker@example.com'],
			subject: 'Your proposal was accepted',
			text: 'See you in Portland.'
		});
	});

	it('turns a provider rejection into a bounded useful error', async () => {
		const fetcher = vi
			.fn()
			.mockResolvedValue(
				new Response(JSON.stringify({ message: 'Sender domain is not verified' }), { status: 403 })
			);

		await expect(
			deliverViaResend(
				{ id: 7, toEmail: 'speaker@example.com', subject: 'Hello', body: 'World' },
				{ apiKey: 're_test', from: 'mail@example.com' },
				fetcher
			)
		).rejects.toThrow('Resend 403: Sender domain is not verified');
	});
});
