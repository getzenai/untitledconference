import { db } from '$lib/server/db';
import { member } from '$lib/server/db/auth-schema';
import { exampleObjectsTable } from '$lib/server/db/examples/crud-example-schema';
import { fail, error as svelteKitError } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import type { Actions, PageServerLoad } from './$types';
import { exampleFormSchema } from './schema';

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user;

	try {
		// Get user's active organization
		const userMembership = await db
			.select()
			.from(member)
			.where(eq(member.userId, user.id))
			.limit(1);

		const organizationId = userMembership[0]?.organizationId || null;

		// Filter examples by both userId and organizationId
		const whereConditions = organizationId
			? and(
					eq(exampleObjectsTable.userId, user.id),
					eq(exampleObjectsTable.organizationId, organizationId)
				)
			: eq(exampleObjectsTable.userId, user.id);

		const examples = await db
			.select()
			.from(exampleObjectsTable)
			.where(whereConditions)
			.orderBy(exampleObjectsTable.createdAt);

		const form = await superValidate(zod(exampleFormSchema));

		return {
			examples,
			organizationId,
			form
		};
	} catch (err) {
		console.error('Error loading example objects:', err);
		// Check if it's a SvelteKit HttpError-like object and re-throw if so
		if (
			typeof err === 'object' &&
			err !== null &&
			'status' in err &&
			typeof err.status === 'number'
		) {
			throw err;
		}
		throw svelteKitError(500, { message: 'Failed to load example objects.' });
	}
};

export const actions: Actions = {
	create: async (event) => {
		const user = event.locals.user;

		const form = await superValidate(event, zod(exampleFormSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		const validData = form.data;

		try {
			// Get user's active organization
			const userMembership = await db
				.select()
				.from(member)
				.where(eq(member.userId, user.id))
				.limit(1);

			const organizationId = userMembership[0]?.organizationId || null;

			const [newExampleObject] = await db
				.insert(exampleObjectsTable)
				.values({
					name: validData.name,
					description: validData.description || '',
					userId: user.id,
					organizationId
				})
				.returning();

			if (!newExampleObject) {
				form.errors._errors = ['Failed to create example object.'];
				return fail(500, { form });
			}
			return { form, success: true, created: newExampleObject };
		} catch (dbError) {
			console.error('Database error creating example object:', dbError);
			form.errors._errors = ['An unexpected error occurred.'];
			return fail(500, { form });
		}
	}
};
