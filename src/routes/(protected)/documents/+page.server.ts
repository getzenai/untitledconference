import { db } from '$lib/server/db';
import { documentsTable, type NewDocument } from '$lib/server/db/documents-schema';
import { fail, redirect } from '@sveltejs/kit';
import type { JSONContent } from '@tiptap/core';
import { and, desc, eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user;
	const activeOrganization = locals.session?.activeOrganizationId;

	if (!user) {
		throw redirect(303, '/login');
	}

	try {
		// Get documents for the user, optionally filtered by organization
		const conditions = activeOrganization
			? and(
					eq(documentsTable.userId, user.id),
					eq(documentsTable.organizationId, activeOrganization)
				)
			: eq(documentsTable.userId, user.id);

		const documents = await db
			.select()
			.from(documentsTable)
			.where(conditions)
			.orderBy(desc(documentsTable.updatedAt));

		return {
			documents
		};
	} catch (error) {
		console.error('Error fetching documents:', error);
		return {
			documents: []
		};
	}
};

export const actions: Actions = {
	create: async ({ locals }) => {
		const user = locals.user;
		const activeOrganization = locals.session?.activeOrganizationId;

		if (!user) {
			return fail(401, { error: 'Unauthorized' });
		}

		// Sample content for new documents showcasing all formatting features
		const sampleContent: JSONContent = {
			type: 'doc',
			content: [
				{
					type: 'heading',
					attrs: { level: 1 },
					content: [{ type: 'text', text: 'Document Editor Features' }]
				},
				{
					type: 'paragraph',
					content: [
						{
							type: 'text',
							text: 'This document showcases all the formatting capabilities available in the editor.'
						}
					]
				},
				{
					type: 'heading',
					attrs: { level: 2 },
					content: [{ type: 'text', text: 'Text Formatting' }]
				},
				{
					type: 'paragraph',
					content: [
						{ type: 'text', text: 'You can make text ' },
						{ type: 'text', marks: [{ type: 'bold' }], text: 'bold' },
						{ type: 'text', text: ', ' },
						{ type: 'text', marks: [{ type: 'italic' }], text: 'italic' },
						{ type: 'text', text: ', ' },
						{ type: 'text', marks: [{ type: 'strike' }], text: 'strikethrough' },
						{ type: 'text', text: ', ' },
						{ type: 'text', marks: [{ type: 'code' }], text: 'inline code' },
						{ type: 'text', text: ', or ' },
						{
							type: 'text',
							marks: [{ type: 'bold' }, { type: 'italic' }],
							text: 'combine multiple styles'
						},
						{ type: 'text', text: '.' }
					]
				},
				{
					type: 'heading',
					attrs: { level: 2 },
					content: [{ type: 'text', text: 'Lists' }]
				},
				{
					type: 'heading',
					attrs: { level: 3 },
					content: [{ type: 'text', text: 'Bullet List' }]
				},
				{
					type: 'bulletList',
					content: [
						{
							type: 'listItem',
							content: [
								{ type: 'paragraph', content: [{ type: 'text', text: 'First bullet point' }] }
							]
						},
						{
							type: 'listItem',
							content: [
								{ type: 'paragraph', content: [{ type: 'text', text: 'Second bullet point' }] },
								{
									type: 'bulletList',
									content: [
										{
											type: 'listItem',
											content: [
												{ type: 'paragraph', content: [{ type: 'text', text: 'Nested bullet' }] }
											]
										},
										{
											type: 'listItem',
											content: [
												{
													type: 'paragraph',
													content: [{ type: 'text', text: 'Another nested bullet' }]
												}
											]
										}
									]
								}
							]
						},
						{
							type: 'listItem',
							content: [
								{ type: 'paragraph', content: [{ type: 'text', text: 'Third bullet point' }] }
							]
						}
					]
				},
				{
					type: 'heading',
					attrs: { level: 3 },
					content: [{ type: 'text', text: 'Numbered List' }]
				},
				{
					type: 'orderedList',
					attrs: { start: 1 },
					content: [
						{
							type: 'listItem',
							content: [
								{ type: 'paragraph', content: [{ type: 'text', text: 'First numbered item' }] }
							]
						},
						{
							type: 'listItem',
							content: [
								{ type: 'paragraph', content: [{ type: 'text', text: 'Second numbered item' }] }
							]
						},
						{
							type: 'listItem',
							content: [
								{ type: 'paragraph', content: [{ type: 'text', text: 'Third numbered item' }] }
							]
						}
					]
				},
				{
					type: 'heading',
					attrs: { level: 2 },
					content: [{ type: 'text', text: 'Code Blocks' }]
				},
				{
					type: 'codeBlock',
					attrs: { language: 'javascript' },
					content: [
						{
							type: 'text',
							text: '// JavaScript code example\nfunction greet(name) {\n  return `Hello, ${name}!`;\n}\n\nconsole.log(greet("World"));'
						}
					]
				},
				{
					type: 'heading',
					attrs: { level: 2 },
					content: [{ type: 'text', text: 'Blockquotes' }]
				},
				{
					type: 'blockquote',
					content: [
						{
							type: 'paragraph',
							content: [
								{
									type: 'text',
									text: '"The best way to predict the future is to invent it." - Alan Kay'
								}
							]
						},
						{
							type: 'paragraph',
							content: [
								{ type: 'text', text: 'Blockquotes can contain ' },
								{ type: 'text', marks: [{ type: 'bold' }], text: 'formatted text' },
								{ type: 'text', text: ' and multiple paragraphs.' }
							]
						}
					]
				},
				{
					type: 'heading',
					attrs: { level: 2 },
					content: [{ type: 'text', text: 'Horizontal Rule' }]
				},
				{
					type: 'paragraph',
					content: [{ type: 'text', text: 'Use horizontal rules to separate content sections:' }]
				},
				{
					type: 'horizontalRule'
				},
				{
					type: 'paragraph',
					content: [{ type: 'text', text: 'Start editing to explore all features!' }]
				}
			]
		};

		let document;
		try {
			const newDocument: NewDocument = {
				title: `New Document ${new Date().toLocaleDateString()}`,
				content: sampleContent,
				plainText:
					'Document Editor Features. This document showcases all the formatting capabilities available in the editor. Text Formatting, Lists, Code Blocks, Blockquotes, and more!',
				userId: user.id,
				organizationId: activeOrganization || null
			};

			[document] = await db.insert(documentsTable).values(newDocument).returning();
		} catch (error) {
			console.error('Error creating document:', error);
			return fail(500, { error: 'Failed to create document' });
		}

		// Redirect to the new document
		throw redirect(303, `/documents/${document.id}`);
	},

	delete: async ({ request, locals }) => {
		const user = locals.user;

		if (!user) {
			return fail(401, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const documentId = parseInt(formData.get('id') as string);

		if (!documentId) {
			return fail(400, { error: 'Invalid document ID' });
		}

		try {
			// Check if document exists and belongs to user
			const [existingDocument] = await db
				.select()
				.from(documentsTable)
				.where(and(eq(documentsTable.id, documentId), eq(documentsTable.userId, user.id)));

			if (!existingDocument) {
				return fail(404, { error: 'Document not found' });
			}

			// Delete the document
			await db
				.delete(documentsTable)
				.where(and(eq(documentsTable.id, documentId), eq(documentsTable.userId, user.id)));

			return { success: true };
		} catch (error) {
			console.error('Error deleting document:', error);
			return fail(500, { error: 'Failed to delete document' });
		}
	}
};
