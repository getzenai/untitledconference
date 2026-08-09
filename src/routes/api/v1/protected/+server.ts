import { json, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ locals }) => {
	// The user is already verified by hooks.server.ts and available in locals
	const user = locals.user;

	if (!user) {
		return json({ message: 'Unauthorized. Please login.' }, { status: 401 });
	}

	return json({
		message: 'You have accessed a protected route!',
		user: {
			id: user.id,
			email: user.email
		}
	});
};
