import { db } from '$lib/server/db';
import { dummyElementsTable } from '$lib/server/db/dummy-schema';
import { fail, redirect, error as svelteKitError } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types';

const dummyUpdateFormSchema = z.object({
	id: z.string().min(1, 'ID is required.'),
	name: z.string().min(1, 'Name is required.'),
	description: z.string().min(1, 'Description is required.')
});

export const load: PageServerLoad = async ({ locals, params }) => {
	const user = locals.user;

	const dummyIdStr = params.id;
	if (!dummyIdStr) {
		throw svelteKitError(400, 'Dummy ID is required');
	}

	const parsedDummyId = parseInt(dummyIdStr, 10);
	if (isNaN(parsedDummyId)) {
		throw svelteKitError(400, 'Invalid Dummy ID format.');
	}

	try {
		const [dummyElement] = await db
			.select()
			.from(dummyElementsTable)
			.where(and(eq(dummyElementsTable.id, parsedDummyId), eq(dummyElementsTable.userId, user.id)));

		if (!dummyElement) {
			throw svelteKitError(404, 'Dummy element not found or access denied');
		}
		return {
			dummyElement
		};
	} catch (err) {
		console.error('Error loading dummy element for edit:', err);
		// Check if it's a SvelteKit HttpError-like object and re-throw if so
		if (
			typeof err === 'object' &&
			err !== null &&
			'status' in err &&
			typeof err.status === 'number'
		) {
			throw err;
		}
		throw svelteKitError(500, 'Failed to load dummy element.');
	}
};
export const actions: Actions = {
	update: async ({ request, locals, params }) => {
		const user = locals.user;

		const dummyIdStr = params.id;
		if (!dummyIdStr) {
			return fail(400, { formAction: '?/update', message: 'Dummy ID is required for update.' });
		}

		const parsedDummyId = parseInt(dummyIdStr, 10);
		if (isNaN(parsedDummyId)) {
			return fail(400, { formAction: '?/update', message: 'Invalid Dummy ID format for update.' });
		}

		const formData = await request.formData();
		const idFromForm = formData.get('id') as string;
		const name = formData.get('name') as string;
		const description = formData.get('description') as string;

		if (idFromForm !== dummyIdStr) {
			return fail(400, {
				formAction: '?/update',
				data: { id: idFromForm, name, description },
				message: 'Mismatched dummy ID.'
			});
		}

		const validationResult = dummyUpdateFormSchema.safeParse({ id: idFromForm, name, description });

		if (!validationResult.success) {
			const errors = validationResult.error.flatten().fieldErrors;
			return fail(400, {
				formAction: '?/update',
				data: { id: idFromForm, name, description },
				errors
			});
		}
		const validData = validationResult.data;

		try {
			const [updatedElement] = await db
				.update(dummyElementsTable)
				.set({
					name: validData.name,
					description: validData.description,
					updatedAt: new Date()
				})
				.where(
					and(eq(dummyElementsTable.id, parsedDummyId), eq(dummyElementsTable.userId, user.id))
				)
				.returning();
			if (!updatedElement) {
				return fail(404, {
					formAction: '?/update',
					data: { id: idFromForm, name, description },
					message: 'Dummy element not found or access denied for update.'
				});
			}
			return { formAction: '?/update', success: true, updated: updatedElement };
		} catch (dbError) {
			console.error('Database error updating dummy element:', dbError);
			return fail(500, {
				formAction: '?/update', // Also ensuring this one is correct
				data: { id: idFromForm, name, description },
				message: 'An unexpected error occurred during update.'
			});
		}
	},

	remove: async ({ locals, params }) => {
		const user = locals.user;

		const dummyIdStr = params.id;
		if (!dummyIdStr) {
			throw svelteKitError(400, 'Dummy ID is required for deletion');
		}

		const parsedDummyId = parseInt(dummyIdStr, 10);
		if (isNaN(parsedDummyId)) {
			throw svelteKitError(400, 'Invalid Dummy ID format for deletion.');
		}

		let deletedElementInfo;
		try {
			const [result] = await db
				.delete(dummyElementsTable)
				.where(
					and(eq(dummyElementsTable.id, parsedDummyId), eq(dummyElementsTable.userId, user.id))
				)
				.returning({ id: dummyElementsTable.id });
			deletedElementInfo = result;
		} catch (dbError) {
			// This catch block is for unexpected errors during the database delete operation.
			console.error('Database error deleting dummy element:', dbError);
			throw svelteKitError(
				500,
				'An unexpected error occurred during the database deletion process.'
			);
		}

		if (!deletedElementInfo) {
			throw svelteKitError(
				404,
				'Dummy element not found or access denied for deletion. No record was deleted.'
			);
		}
		throw redirect(303, '/dummies');
	}
};
