/**
 * Data the signed-in shell needs, and only the shell (#239).
 *
 * Deliberately here and not one level up in `(protected)`: the conference chrome
 * under `/manage/<slug>` renders its own navigation, not `AppSidebar`. Loading the
 * flags in the parent would charge every organizer page a query it never reads —
 * and would put a field into every `PageData` under it, which is how a type that
 * belongs to one surface ends up owned by all of them.
 */
import { navAccess } from '$lib/server/conference/nav-access';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	// `(protected)` has already redirected anyone without a session.
	return { navAccess: await navAccess(locals.user!.id, locals.user!.email ?? null) };
};
