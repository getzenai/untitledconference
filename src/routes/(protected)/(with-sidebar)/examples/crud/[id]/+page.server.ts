import { db } from '$lib/server/db';
import { member } from '$lib/server/db/auth-schema';
import { exampleObjectsTable } from '$lib/server/db/examples/crud-example-schema';
import { fail, redirect, error as svelteKitError } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { exampleFormSchema } from '../schema';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const user = locals.user;

	const exampleIdStr = params.id;
	if (!exampleIdStr) {
		throw svelteKitError(400, { message: 'Example ID is required' });
	}

	const parsedExampleId = parseInt(exampleIdStr, 10);
	if (isNaN(parsedExampleId)) {
		throw svelteKitError(400, { message: 'Invalid Example ID format.' });
	}

	try {
		// Get user's active organization
		const userMembership = await db
			.select()
			.from(member)
			.where(eq(member.userId, user.id))
			.limit(1);

		const organizationId = userMembership[0]?.organizationId || null;

		// Build where conditions to include organizationId
		const whereConditions = organizationId
			? and(
					eq(exampleObjectsTable.id, parsedExampleId),
					eq(exampleObjectsTable.userId, user.id),
					eq(exampleObjectsTable.organizationId, organizationId)
				)
			: and(eq(exampleObjectsTable.id, parsedExampleId), eq(exampleObjectsTable.userId, user.id));

		const [exampleObject] = await db.select().from(exampleObjectsTable).where(whereConditions);

		if (!exampleObject) {
			throw svelteKitError(404, { message: 'Example object not found or access denied' });
		}

		// For the form, we only need name and description
		// The ID comes from the URL params, not from form input
		const form = await superValidate(
			{
				name: exampleObject.name,
				description: exampleObject.description || ''
			},
			zod(exampleFormSchema)
		);

		return {
			exampleObject,
			organizationId,
			form
		};
	} catch (err) {
		console.error('Error loading example object:', err);
		// Check if it's a SvelteKit HttpError-like object and re-throw if so
		if (
			typeof err === 'object' &&
			err !== null &&
			'status' in err &&
			typeof err.status === 'number'
		) {
			throw err;
		}
		throw svelteKitError(500, { message: 'Failed to load example object.' });
	}
};

export const actions: Actions = {
	update: async (event) => {
		const { locals, params } = event;
		const user = locals.user;
		const exampleIdStr = params.id;

		if (!exampleIdStr) {
			throw svelteKitError(400, { message: 'Example ID is required' });
		}

		const parsedExampleId = parseInt(exampleIdStr, 10);
		if (isNaN(parsedExampleId)) {
			throw svelteKitError(400, { message: 'Invalid Example ID format.' });
		}

		const form = await superValidate(event, zod(exampleFormSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		const { name, description } = form.data;

		try {
			// Get user's active organization
			const userMembership = await db
				.select()
				.from(member)
				.where(eq(member.userId, user.id))
				.limit(1);

			const organizationId = userMembership[0]?.organizationId || null;

			// Build where conditions to include organizationId
			const whereConditions = organizationId
				? and(
						eq(exampleObjectsTable.id, parsedExampleId),
						eq(exampleObjectsTable.userId, user.id),
						eq(exampleObjectsTable.organizationId, organizationId)
					)
				: and(eq(exampleObjectsTable.id, parsedExampleId), eq(exampleObjectsTable.userId, user.id));

			// Check if the object exists and belongs to the user first
			const [existing] = await db.select().from(exampleObjectsTable).where(whereConditions);

			if (!existing) {
				form.errors._errors = ['Example object not found or access denied'];
				return fail(404, { form });
			}

			// Update the object
			const [updatedObject] = await db
				.update(exampleObjectsTable)
				.set({
					name,
					description: description || ''
				})
				.where(whereConditions)
				.returning();

			if (!updatedObject) {
				form.errors._errors = ['Failed to update example object.'];
				return fail(500, { form });
			}

			return { form, success: true };
		} catch (dbError) {
			console.error('Database error updating example object:', dbError);
			form.errors._errors = ['An unexpected error occurred.'];
			return fail(500, { form });
		}
	},

	delete: async ({ locals, params }) => {
		const user = locals.user;
		const exampleIdStr = params.id;

		if (!exampleIdStr) {
			throw svelteKitError(400, { message: 'Example ID is required' });
		}

		const parsedExampleId = parseInt(exampleIdStr, 10);
		if (isNaN(parsedExampleId)) {
			throw svelteKitError(400, { message: 'Invalid Example ID format.' });
		}

		try {
			// Get user's active organization
			const userMembership = await db
				.select()
				.from(member)
				.where(eq(member.userId, user.id))
				.limit(1);

			const organizationId = userMembership[0]?.organizationId || null;

			// Build where conditions to include organizationId
			const whereConditions = organizationId
				? and(
						eq(exampleObjectsTable.id, parsedExampleId),
						eq(exampleObjectsTable.userId, user.id),
						eq(exampleObjectsTable.organizationId, organizationId)
					)
				: and(eq(exampleObjectsTable.id, parsedExampleId), eq(exampleObjectsTable.userId, user.id));

			// Delete the example object
			const deletedRows = await db.delete(exampleObjectsTable).where(whereConditions).returning();

			if (deletedRows.length === 0) {
				return fail(404, { message: 'Example object not found or access denied.' });
			}
		} catch (error) {
			console.error('Database error deleting example object:', error);
			return fail(500, { message: 'An unexpected error occurred.' });
		}

		// Redirect only after successful deletion
		throw redirect(303, '/examples/crud');
	}
};
