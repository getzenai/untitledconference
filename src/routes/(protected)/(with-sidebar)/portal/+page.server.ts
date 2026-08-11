import { mySubmissions, myTasks } from '$lib/server/conference/speaker-portal';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// The (protected) layout has already redirected an anonymous visitor; this is
	// belt and braces so a future route move cannot silently expose the loader.
	if (!locals.user) error(401, 'Sign in to see your proposals');

	const [submissions, tasks] = await Promise.all([
		mySubmissions(locals.user.id),
		myTasks(locals.user.id)
	]);

	// Who this portal belongs to. The page carried no identity at all, which on a
	// surface reached by a link in an email is exactly where someone needs to be
	// told which of their addresses they are signed in as.
	return { submissions, tasks, account: { name: locals.user.name, email: locals.user.email } };
};
