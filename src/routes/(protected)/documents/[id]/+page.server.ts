import { transformTiptapContent } from '$lib/server/documents/ai-transform';
import {
	deleteDocument,
	loadDocument,
	transformDocumentText,
	updateDocument
} from '$lib/server/documents/operations';
import { validateContentSize, VALIDATION_ERRORS } from '$lib/server/documents/validation-constants';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const user = locals.user;
	const documentId = parseInt(params.id || '0');

	if (!user) {
		throw redirect(303, '/login');
	}

	if (!documentId) {
		throw redirect(303, '/documents');
	}

	const document = await loadDocument(documentId, user.id);

	if (!document) {
		throw redirect(303, '/documents');
	}

	return {
		document
	};
};

export const actions: Actions = {
	update: async ({ request, locals, params }) => {
		const user = locals.user;
		const documentId = parseInt(params.id || '0');

		if (!user) {
			throw redirect(303, '/login');
		}

		const formData = await request.formData();
		const title = formData.get('title') as string;
		const content = formData.get('content') as string;
		const plainText = formData.get('plainText') as string;

		return updateDocument(documentId, user.id, {
			title,
			content,
			plainText
		});
	},

	delete: async ({ locals, params }) => {
		const user = locals.user;
		const documentId = parseInt(params.id || '0');

		if (!user) {
			throw redirect(303, '/login');
		}

		await deleteDocument(documentId, user.id);

		// Redirect after successful deletion
		throw redirect(303, '/documents');
	},

	transformText: async ({ request, locals }) => {
		const user = locals.user;

		if (!user) {
			throw redirect(303, '/login');
		}

		const formData = await request.formData();
		const text = formData.get('text') as string;
		const action = formData.get('action') as string;

		return transformDocumentText(text, action, user.id);
	},

	aiTransform: async ({ request, locals }) => {
		const user = locals.user;

		if (!user) {
			throw redirect(303, '/login');
		}

		const formData = await request.formData();
		const content = formData.get('content') as string;
		const documentContext = formData.get('documentContext') as string;
		const prompt = formData.get('prompt') as string;

		if (!content || !prompt) {
			return fail(400, { error: 'Content and prompt are required' });
		}

		try {
			// Validate content size before parsing
			const contentSizeValidation = validateContentSize(content);
			if (!contentSizeValidation.isValid) {
				return fail(413, { error: contentSizeValidation.error });
			}

			// Validate context size if provided
			if (documentContext) {
				const contextSizeValidation = validateContentSize(documentContext);
				if (!contextSizeValidation.isValid) {
					return fail(413, { error: `Context ${contextSizeValidation.error}` });
				}
			}

			// Parse the content and context JSON
			const parsedContent = JSON.parse(content);
			const parsedContext = documentContext ? JSON.parse(documentContext) : null;

			// Transform the content using AI with document context
			const transformed = await transformTiptapContent(
				parsedContent,
				prompt,
				user.id,
				parsedContext
			);

			return {
				success: true,
				transformed: JSON.stringify(transformed)
			};
		} catch (error) {
			if (error instanceof SyntaxError) {
				return fail(400, { error: VALIDATION_ERRORS.INVALID_JSON });
			}
			return fail(500, {
				error: error instanceof Error ? error.message : 'Failed to transform content'
			});
		}
	}
};
