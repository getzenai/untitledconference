import { serverEnv } from '$lib/server/env';
import { takeVerificationLink } from '$lib/server/services/verification-link';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) => {
	if (!serverEnv().ENABLE_TEST_ENDPOINTS) error(404, 'Not found');
	const email = url.searchParams.get('email');
	if (!email) error(400, 'Email is required');
	const verificationUrl = takeVerificationLink(email);
	if (!verificationUrl) error(404, 'No verification link');
	return json({ url: verificationUrl });
};
