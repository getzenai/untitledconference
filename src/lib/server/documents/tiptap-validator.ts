import type { Extensions, JSONContent } from '@tiptap/core';
import { getSchema } from '@tiptap/core';
import { Node } from '@tiptap/pm/model';
import StarterKit from '@tiptap/starter-kit';

/**
 * Get the TipTap extensions we use in the editor
 * This should match what's in TiptapEditor.svelte
 */
function getEditorExtensions(): Extensions {
	return [StarterKit];
}

/**
 * Validate TipTap JSON content against the schema
 * @param content The JSON content to validate
 * @returns Object with isValid flag and error message if invalid
 */
export function validateTiptapContent(content: unknown): {
	isValid: boolean;
	error?: string;
	details?: string;
} {
	try {
		// Get the schema from our extensions
		const extensions = getEditorExtensions();
		const schema = getSchema(extensions);

		// Handle both single nodes and arrays of nodes
		let nodeContent: JSONContent;
		if (Array.isArray(content)) {
			// Wrap array in a doc node for validation
			nodeContent = {
				type: 'doc',
				content: content as JSONContent[]
			};
		} else if (typeof content === 'object' && content !== null) {
			const node = content as JSONContent;
			// If it's not a doc node, wrap it
			if (node.type !== 'doc') {
				nodeContent = {
					type: 'doc',
					content: [node]
				};
			} else {
				nodeContent = node;
			}
		} else {
			return {
				isValid: false,
				error: 'Content must be an object or array',
				details: `Received type: ${typeof content}`
			};
		}

		// Try to create a ProseMirror node from the JSON
		const pmNode = Node.fromJSON(schema, nodeContent);

		// Check if the node is valid according to the schema
		pmNode.check();

		return { isValid: true };
	} catch (error) {
		// Extract useful error information
		const errorMessage = error instanceof Error ? error.message : 'Unknown validation error';

		// Parse common ProseMirror errors
		let details = errorMessage;
		if (errorMessage.includes('Invalid collection of marks')) {
			// Extract the problematic marks
			const marksMatch = errorMessage.match(/marks for node (\w+): (.+)$/);
			if (marksMatch) {
				const marks = marksMatch[2];
				// Check if code mark is combined with others
				if (marks.includes('code') && marks.includes(',')) {
					details = `The "code" mark cannot be combined with other marks (bold, italic, strike). Code must be used alone: [{"type": "code"}]`;
				} else {
					details = `Node type "${marksMatch[1]}" has invalid marks: ${marks}. Marks must be an array of objects with a "type" field, e.g., [{"type": "bold"}, {"type": "italic"}]`;
				}
			}
		} else if (errorMessage.includes('Unknown mark type')) {
			const markMatch = errorMessage.match(/Unknown mark type: (.+)$/);
			if (markMatch) {
				details = `Unknown mark type "${markMatch[1]}". Valid marks are: bold, italic, strike, code`;
			}
		} else if (errorMessage.includes('Unknown node type')) {
			const nodeMatch = errorMessage.match(/Unknown node type: (.+)$/);
			if (nodeMatch) {
				details = `Unknown node type "${nodeMatch[1]}". Valid nodes are: doc, paragraph, heading, blockquote, bulletList, orderedList, listItem, codeBlock, hardBreak, text`;
			}
		}

		return {
			isValid: false,
			error: 'Invalid TipTap content structure',
			details
		};
	}
}

/**
 * Extract the actual content from a validated doc wrapper
 * @param content The validated content (wrapped in doc node)
 * @returns The actual content to insert (unwrapped)
 */
export function extractValidatedContent(content: unknown): unknown {
	if (!content || typeof content !== 'object') {
		return content;
	}

	const node = content as JSONContent;

	// If it's a doc node we created for validation, unwrap it
	if (node.type === 'doc' && Array.isArray(node.content)) {
		// If there's only one child, return it directly
		if (node.content.length === 1) {
			return node.content[0];
		}
		// Otherwise return the array of children
		return node.content;
	}

	// Return as-is if not a doc wrapper
	return content;
}
