import { afterEach, describe, expect, it } from 'vitest';
import { mailDeliveryConfigured } from './email-dispatcher';
import {
	isTestMailTransportArmed,
	setTestMailTransport,
	testMailDeliveries,
	testMailTransport
} from './test-mail-transport';

describe('the E2E recording mail transport (#489)', () => {
	const previous = process.env.ENABLE_TEST_ENDPOINTS;

	afterEach(() => {
		process.env.ENABLE_TEST_ENDPOINTS = 'true';
		setTestMailTransport(false);
		if (previous === undefined) delete process.env.ENABLE_TEST_ENDPOINTS;
		else process.env.ENABLE_TEST_ENDPOINTS = previous;
	});

	it('cannot be armed when the test gate is off', () => {
		delete process.env.ENABLE_TEST_ENDPOINTS;

		expect(setTestMailTransport(true)).toBe(false);
		expect(isTestMailTransportArmed()).toBe(false);
		expect(testMailTransport()).toBeNull();
	});

	it('is inert until a spec arms it, even with the test gate on', () => {
		process.env.ENABLE_TEST_ENDPOINTS = 'true';

		expect(isTestMailTransportArmed()).toBe(false);
		expect(testMailTransport()).toBeNull();
	});

	it('records a delivery and never calls out', async () => {
		process.env.ENABLE_TEST_ENDPOINTS = 'true';
		expect(setTestMailTransport(true)).toBe(true);

		const transport = testMailTransport();
		expect(transport).not.toBeNull();
		expect(mailDeliveryConfigured()).toBe(true);

		await transport!({
			id: 9,
			toEmail: 'speaker@example.test',
			subject: 'You are on the programme',
			body: 'See you in May.'
		});

		expect(testMailDeliveries()).toEqual([
			{
				id: 9,
				toEmail: 'speaker@example.test',
				subject: 'You are on the programme',
				body: 'See you in May.'
			}
		]);
	});

	it('forgets what it recorded when it is disarmed', async () => {
		process.env.ENABLE_TEST_ENDPOINTS = 'true';
		setTestMailTransport(true);
		await testMailTransport()!({
			id: 1,
			toEmail: 'a@example.test',
			subject: 'A',
			body: 'A'
		});

		setTestMailTransport(false);

		expect(isTestMailTransportArmed()).toBe(false);
		expect(testMailDeliveries()).toEqual([]);
		expect(testMailTransport()).toBeNull();
	});
});
