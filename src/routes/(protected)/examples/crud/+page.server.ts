import { db } from '$lib/server/db';
import { exampleObjectsTable } from '$lib/server/db/examples/crud-example-schema';
import { fail, error as svelteKitError } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types';

const exampleFormSchema = z.object({
	name: z.string().min(1, 'Name is required.'),
	description: z.string().optional()
});

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user;

	try {
		const examples = await db
			.select()
			.from(exampleObjectsTable)
			.where(eq(exampleObjectsTable.userId, user.id))
			.orderBy(exampleObjectsTable.createdAt);

		return {
			examples
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
		throw svelteKitError(500, 'Failed to load example objects.');
	}
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const user = locals.user;

		const formData = await request.formData();
		const name = formData.get('name') as string;
		const description = formData.get('description') as string;

		const validationResult = exampleFormSchema.safeParse({ name, description });

		if (!validationResult.success) {
			const errors = validationResult.error.flatten().fieldErrors;
			return fail(400, {
				data: { name, description },
				errors
			});
		}

		const validData = validationResult.data;

		try {
			const [newExampleObject] = await db
				.insert(exampleObjectsTable)
				.values({
					name: validData.name,
					description: validData.description || '',
					userId: user.id
				})
				.returning();

			if (!newExampleObject) {
				return fail(500, {
					data: { name, description },
					message: 'Failed to create example object.'
				});
			}
			return { success: true, created: newExampleObject };
		} catch (dbError) {
			console.error('Database error creating example object:', dbError);
			return fail(500, {
				data: { name, description },
				message: 'An unexpected error occurred.'
			});
		}
	}
};
