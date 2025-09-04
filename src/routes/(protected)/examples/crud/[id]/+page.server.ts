import { db } from '$lib/server/db';
import { member } from '$lib/server/db/auth-schema';
import { exampleObjectsTable } from '$lib/server/db/examples/crud-example-schema';
import { fail, redirect, error as svelteKitError, type ActionFailure } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types';

const exampleUpdateFormSchema = z.object({
	id: z.string().min(1, 'ID is required.'),
	name: z.string().min(1, 'Name is required.'),
	description: z.string().min(1, 'Description is required.')
});

export const load: PageServerLoad = async ({ locals, params }) => {
	const user = locals.user;

	const exampleIdStr = params.id;
	if (!exampleIdStr) {
		throw svelteKitError(400, 'Example ID is required');
	}

	const parsedExampleId = parseInt(exampleIdStr, 10);
	if (isNaN(parsedExampleId)) {
		throw svelteKitError(400, 'Invalid Example ID format.');
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
			throw svelteKitError(404, 'Example object not found or access denied');
		}
		return {
			exampleObject,
			organizationId
		};
	} catch (err) {
		console.error('Error loading example object for edit:', err);
		if (
			typeof err === 'object' &&
			err !== null &&
			'status' in err &&
			typeof err.status === 'number'
		) {
			throw err;
		}
		throw svelteKitError(500, 'Failed to load example object.');
	}
};

// Define a simpler return type for the validation helper
type ValidatedInput = {
	validData: { id: string; name: string; description: string };
	parsedExampleId: number;
	rawFormData: { id: string; name: string; description: string };
};
type ValidationInputError = {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	error: ActionFailure<any>;
};
type ValidateUpdateInputResult = ValidatedInput | ValidationInputError;

async function validateUpdateInput(
	request: Request,
	exampleIdStrFromParams: string | undefined,
	schema: typeof exampleUpdateFormSchema
): Promise<ValidateUpdateInputResult> {
	const formData = await request.formData();
	const idFromForm = formData.get('id') as string;
	const name = formData.get('name') as string;
	const description = formData.get('description') as string;
	const currentFormData = { id: idFromForm, name, description };

	if (!exampleIdStrFromParams) {
		return {
			error: fail(400, {
				formAction: '?/update',
				message: 'Example ID is required for update.',
				data: currentFormData
			})
		};
	}

	const parsedExampleId = parseInt(exampleIdStrFromParams, 10);
	if (isNaN(parsedExampleId)) {
		return {
			error: fail(400, {
				formAction: '?/update',
				message: 'Invalid Example ID format for update.',
				data: currentFormData
			})
		};
	}

	if (idFromForm !== exampleIdStrFromParams) {
		return {
			error: fail(400, {
				formAction: '?/update',
				message: 'Mismatched example ID.',
				data: currentFormData
			})
		};
	}

	const validationResult = schema.safeParse(currentFormData);

	if (!validationResult.success) {
		const errors = validationResult.error.flatten().fieldErrors;
		return { error: fail(400, { formAction: '?/update', errors, data: currentFormData }) };
	}
	return { validData: validationResult.data, parsedExampleId, rawFormData: currentFormData };
}

export const actions: Actions = {
	update: async ({ request, locals, params }) => {
		const user = locals.user;
		const exampleIdStr = params.id;

		const validation = await validateUpdateInput(request, exampleIdStr, exampleUpdateFormSchema);

		if ('error' in validation) {
			return validation.error;
		}

		const { validData, parsedExampleId, rawFormData } = validation;

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

			const [updatedElement] = await db
				.update(exampleObjectsTable)
				.set({
					name: validData.name,
					description: validData.description,
					updatedAt: new Date()
				})
				.where(whereConditions)
				.returning();

			if (!updatedElement) {
				return fail(404, {
					formAction: '?/update',
					data: rawFormData,
					message: 'Example object not found or access denied for update.'
				});
			}
			return { formAction: '?/update', success: true, updated: updatedElement };
		} catch (dbError) {
			console.error('Database error updating example object:', dbError);
			return fail(500, {
				formAction: '?/update',
				data: rawFormData,
				message: 'An unexpected error occurred during update.'
			});
		}
	},

	remove: async ({ locals, params }) => {
		const user = locals.user;

		const exampleIdStr = params.id;
		if (!exampleIdStr) {
			throw svelteKitError(400, 'Example ID is required for deletion');
		}

		const parsedExampleId = parseInt(exampleIdStr, 10);
		if (isNaN(parsedExampleId)) {
			throw svelteKitError(400, 'Invalid Example ID format for deletion.');
		}

		let deletedElementInfo;
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

			const [result] = await db
				.delete(exampleObjectsTable)
				.where(whereConditions)
				.returning({ id: exampleObjectsTable.id });
			deletedElementInfo = result;
		} catch (dbError) {
			console.error('Database error deleting example object:', dbError);
			throw svelteKitError(
				500,
				'An unexpected error occurred during the database deletion process.'
			);
		}

		if (!deletedElementInfo) {
			throw svelteKitError(
				404,
				'Example object not found or access denied for deletion. No record was deleted.'
			);
		}
		throw redirect(303, '/examples/crud');
	}
};
