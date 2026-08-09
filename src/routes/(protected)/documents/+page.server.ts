import { db } from '$lib/server/db';
import { documentsTable, type NewDocument } from '$lib/server/db/documents-schema';
import { fail, redirect } from '@sveltejs/kit';
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
		const sampleContent = `# Document Editor Features

This document showcases all the formatting capabilities available in the editor.

## Text Formatting

You can make text **bold**, *italic*, ~~strikethrough~~, \`inline code\`, or ***combine multiple styles***.

## Lists

### Bullet List

- First bullet point
- Second bullet point
  - Nested bullet
  - Another nested bullet
- Third bullet point

### Numbered List

1. First numbered item
2. Second numbered item
3. Third numbered item

## Code Blocks

\`\`\`javascript
// JavaScript code example
function greet(name) {
  return \`Hello, \${name}!\`;
}

console.log(greet("World"));
\`\`\`

## Blockquotes

> "The best way to predict the future is to invent it." - Alan Kay
>
> Blockquotes can contain **formatted text** and multiple paragraphs.

## Horizontal Rule

Use horizontal rules to separate content sections:

---

Start editing to explore all features!
`;

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
