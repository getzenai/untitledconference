/**
 * Configured-but-deaf delivery for E2E (#489).
 *
 * `scripts/run-e2e.sh` unsets the real Resend key on purpose — a suite must
 * not be able to send mail. That also makes `mailDeliveryConfigured()` false,
 * so the Send queued confirm is unreachable. This transport is the other
 * half: it answers "yes, delivery is set up" and records every hand-off, and
 * it never leaves the process.
 *
 * Armed only through `/api/v1/test/mail-transport`, which itself is gated by
 * `ENABLE_TEST_ENDPOINTS`. Off by default, so the unconfigured panel stays
 * the default E2E picture. Production cannot arm it.
 */
import type { DeliverableEmail, EmailTransport } from './email-dispatcher';

function testEndpointsOn(): boolean {
	return process.env.ENABLE_TEST_ENDPOINTS === 'true';
}

let armed = false;
const delivered: DeliverableEmail[] = [];

/** Turns the recording fake on or off. A no-op (and `false`) outside the test gate. */
export function setTestMailTransport(on: boolean): boolean {
	if (!testEndpointsOn()) return false;
	armed = on;
	if (!on) delivered.length = 0;
	return true;
}

export function isTestMailTransportArmed(): boolean {
	return testEndpointsOn() && armed;
}

/** The deliveries this process has accepted since the fake was last armed. */
export function testMailDeliveries(): readonly DeliverableEmail[] {
	return delivered;
}

export function testMailTransport(): EmailTransport | null {
	if (!isTestMailTransportArmed()) return null;
	return async (email) => {
		delivered.push(email);
	};
}
