import { db } from '$lib/server/db';
import { dummyElementsTable } from '$lib/server/db/dummy-schema';
import { fail, error as svelteKitError } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types';

const dummyFormSchema = z.object({
	name: z.string().min(1, 'Name is required.'),
	description: z.string().min(1, 'Description is required.')
});

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user;

	try {
		const dummies = await db
			.select()
			.from(dummyElementsTable)
			.where(eq(dummyElementsTable.userId, user.id))
			.orderBy(dummyElementsTable.createdAt);

		return {
			dummies
		};
	} catch (err) {
		console.error('Error loading dummy elements:', err);
		// Check if it's a SvelteKit HttpError-like object and re-throw if so
		if (
			typeof err === 'object' &&
			err !== null &&
			'status' in err &&
			typeof err.status === 'number'
		) {
			throw err;
		}
		throw svelteKitError(500, 'Failed to load dummy elements.');
	}
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const user = locals.user;

		const formData = await request.formData();
		const name = formData.get('name') as string;
		const description = formData.get('description') as string;

		const validationResult = dummyFormSchema.safeParse({ name, description });

		if (!validationResult.success) {
			const errors = validationResult.error.flatten().fieldErrors;
			return fail(400, {
				data: { name, description },
				errors
			});
		}

		const validData = validationResult.data;

		try {
			const [newDummyElement] = await db
				.insert(dummyElementsTable)
				.values({
					name: validData.name,
					description: validData.description,
					userId: user.id
				})
				.returning();

			if (!newDummyElement) {
				return fail(500, {
					data: { name, description },
					message: 'Failed to create dummy element.'
				});
			}
			return { success: true, created: newDummyElement };
		} catch (dbError) {
			console.error('Database error creating dummy element:', dbError);
			return fail(500, {
				data: { name, description },
				message: 'An unexpected error occurred.'
			});
		}
	}
};
