import { AIProviderFactory } from '$lib/server/ai/factory';
import { db } from '$lib/server/db';
import { documentsTable, type NewDocument } from '$lib/server/db/documents-schema';
import { fail } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { toMarkdown } from './content-format';
import {
	MAX_PLAIN_TEXT_LENGTH,
	MAX_TITLE_LENGTH,
	VALIDATION_ERRORS,
	validateContentSize
} from './validation-constants';

/**
 * Update a document with new content
 */
export async function updateDocument(
	documentId: number,
	userId: string,
	data: {
		title?: string;
		content?: string;
		plainText?: string;
	}
) {
	if (!userId) {
		return fail(401, { error: 'Unauthorized' });
	}

	if (!documentId) {
		return fail(400, { error: 'Invalid document ID' });
	}

	try {
		// Check if document exists and belongs to user
		const [existingDocument] = await db
			.select()
			.from(documentsTable)
			.where(and(eq(documentsTable.id, documentId), eq(documentsTable.userId, userId)));

		if (!existingDocument) {
			return fail(404, { error: 'Document not found' });
		}

		// Prepare update data
		const updateData: Partial<typeof documentsTable.$inferInsert> = {
			updatedAt: new Date()
		};

		if (data.title !== undefined) {
			if (data.title.length > MAX_TITLE_LENGTH) {
				return fail(400, { error: VALIDATION_ERRORS.TITLE_TOO_LONG });
			}
			updateData.title = data.title;
		}
		if (data.content !== undefined) {
			// Validate content size
			const sizeValidation = validateContentSize(data.content);
			if (!sizeValidation.isValid) {
				return fail(413, { error: sizeValidation.error });
			}

			updateData.content = data.content;
		}
		if (data.plainText !== undefined) {
			if (data.plainText.length > MAX_PLAIN_TEXT_LENGTH) {
				return fail(400, {
					error: `Plain text exceeds maximum length of ${MAX_PLAIN_TEXT_LENGTH} characters`
				});
			}
			updateData.plainText = data.plainText;
		}

		// Update the document
		const [updatedDocument] = await db
			.update(documentsTable)
			.set(updateData)
			.where(and(eq(documentsTable.id, documentId), eq(documentsTable.userId, userId)))
			.returning();

		return { success: true, document: updatedDocument };
	} catch (error) {
		return fail(500, {
			error: 'Failed to update document',
			details: error instanceof Error ? error.message : undefined
		});
	}
}

/**
 * Delete a document
 */
export async function deleteDocument(documentId: number, userId: string) {
	if (!userId) {
		return fail(401, { error: 'Unauthorized' });
	}

	if (!documentId) {
		return fail(400, { error: 'Invalid document ID' });
	}

	try {
		// Check if document exists and belongs to user
		const [existingDocument] = await db
			.select()
			.from(documentsTable)
			.where(and(eq(documentsTable.id, documentId), eq(documentsTable.userId, userId)));

		if (!existingDocument) {
			return fail(404, { error: 'Document not found' });
		}

		// Delete the document
		await db
			.delete(documentsTable)
			.where(and(eq(documentsTable.id, documentId), eq(documentsTable.userId, userId)));

		return { success: true };
	} catch (error) {
		return fail(500, {
			error: 'Failed to delete document',
			details: error instanceof Error ? error.message : undefined
		});
	}
}

/**
 * Transform text using AI
 */
export async function transformDocumentText(text: string, action: string, userId: string) {
	if (!userId) {
		return fail(401, { error: 'Unauthorized' });
	}

	if (!text || !action) {
		return fail(400, { error: 'Text and action are required' });
	}

	try {
		// Create AI provider using factory
		const provider = AIProviderFactory.create();

		// Check if provider has the transformText method
		if (!provider.transformText) {
			return fail(501, { error: 'Text transformation not supported by current provider' });
		}

		// Transform the text
		const transformedText = await provider.transformText(text, action);

		return {
			success: true,
			transformed: transformedText,
			action,
			mock: provider.constructor.name === 'MockProvider'
		};
	} catch (error) {
		return fail(500, {
			error: 'Failed to transform text',
			details: error instanceof Error ? error.message : 'Unknown error'
		});
	}
}

/**
 * Create a new document
 */
export async function createDocument(
	userId: string,
	organizationId: string | null = null,
	initialContent?: string
) {
	if (!userId) {
		return fail(401, { error: 'Unauthorized' });
	}

	try {
		const newDocument: NewDocument = {
			title: `New Document ${new Date().toLocaleDateString()}`,
			content: initialContent ?? '',
			plainText: '',
			userId,
			organizationId
		};

		const [document] = await db.insert(documentsTable).values(newDocument).returning();
		return { success: true, document };
	} catch (error) {
		return fail(500, {
			error: 'Failed to create document',
			details: error instanceof Error ? error.message : undefined
		});
	}
}

/**
 * Load a document
 */
export async function loadDocument(documentId: number, userId: string) {
	if (!userId) {
		return null;
	}

	if (!documentId) {
		return null;
	}

	try {
		const [document] = await db
			.select()
			.from(documentsTable)
			.where(and(eq(documentsTable.id, documentId), eq(documentsTable.userId, userId)));

		if (!document) {
			return null;
		}

		// Legacy rows still hold ProseMirror JSON — hand markdown to the editor
		return { ...document, content: toMarkdown(document.content) };
	} catch {
		// Return null on error to handle gracefully in UI
		return null;
	}
}
