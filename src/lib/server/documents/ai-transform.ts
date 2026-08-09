import { AIProviderFactory } from '$lib/server/ai/factory';
import { AIServiceError } from '$lib/server/ai/types';
import { z } from 'zod/v4';
import { validateMarkdownContent } from './markdown-validator';
import { validateContentSize, validatePromptLength } from './validation-constants';

// Schema that wraps the content to satisfy Azure OpenAI's requirement for object type
const MarkdownTransformSchema = z.object({
	content: z.string()
});

// Helper function to create system prompt
function getMarkdownSystemPrompt(): string {
	return `You are an AI assistant that works with markdown content in a rich text editor.

CRITICAL: You must ONLY return valid JSON. No explanations, no "Here is your text", no code fences around the JSON, no commentary. ONLY the JSON object.

IMPORTANT: When transforming selected content:
- ONLY transform what was explicitly selected
- DO NOT add content from the context
- The output will REPLACE the selection, so it must be EXACTLY what should replace it
- Context is for understanding only - never include it in the output

Supported markdown syntax (CommonMark + GitHub Flavored Markdown):
- Headings: # H1, ## H2, ### H3 (up to ######)
- Paragraphs: plain text separated by a blank line
- Bold: **text**
- Italic: *text*
- Strikethrough: ~~text~~
- Inline code: \`code\`
- Fenced code blocks: \`\`\`language ... \`\`\`
- Blockquotes: > quoted text
- Bullet lists: - item
- Ordered lists: 1. item
- Horizontal rules: ---
- Links: [label](https://example.com)
- Images: ![alt](https://example.com/image.png)
- Tables: GitHub pipe tables

NOT SUPPORTED - never emit these:
- Raw HTML tags (<div>, <br>, <span>, ...) - the editor cannot render them
- Reference style links ([label][ref] with a separate [ref]: url definition)
- Front matter (--- yaml blocks at the top)

FORMATTING RULES:
1. If the selection is a single inline fragment (part of a sentence), return an inline
   fragment - do NOT wrap it in a heading, list or blockquote.
2. If the selection spans whole blocks, return whole blocks separated by blank lines.
3. Preserve the structure of the selection unless the instruction asks to change it.

RESPONSE RULES:
1. Return ONLY a JSON object with a "content" field holding the markdown string
2. NO explanatory text before or after the JSON
3. NO markdown code fences around the JSON object itself
4. NO "Here is..." or "Certainly..." or any other text

Example response:
{"content": "## Summary\\n\\nThis text is **clear** and *concise*."}

Your response must start with { and end with }`;
}

/**
 * Generate content with retry logic
 */
async function generateWithRetry(
	provider: ReturnType<typeof AIProviderFactory.create>,
	systemPrompt: string,
	userPrompt: string,
	maxRetries = 3
): Promise<string> {
	let lastError: string | undefined;

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		// Add error feedback to prompt on retry
		const promptWithError = lastError
			? `${userPrompt}\n\nIMPORTANT: Previous attempt failed with: ${lastError}\nPlease fix this specific issue.`
			: userPrompt;

		// Generate content
		let result;
		try {
			result = await provider.generateStructuredOutput(
				MarkdownTransformSchema,
				systemPrompt,
				promptWithError
			);
		} catch (genError) {
			// Handle schema validation errors from the AI provider
			const errorMsg = genError instanceof Error ? genError.message : 'Unknown error';

			if (errorMsg.includes('response did not match schema')) {
				lastError =
					'AI returned a malformed response. Return a JSON object with a single "content" string field.';

				// Don't retry on last attempt
				if (attempt === maxRetries) {
					throw new AIServiceError(
						`Generated content had invalid JSON structure after ${maxRetries} attempts`,
						'VALIDATION_ERROR'
					);
				}
				continue; // Try again with error feedback
			}

			// Re-throw other errors
			throw genError;
		}

		// Validate the generated markdown against what the editor can represent
		const validation = validateMarkdownContent(result.content);

		if (validation.isValid && validation.markdown) {
			return validation.markdown;
		}

		// Store error for next attempt
		lastError = validation.details || validation.error;

		// Don't retry on last attempt
		if (attempt === maxRetries) {
			throw new AIServiceError(
				`Generated content failed validation after ${maxRetries} attempts: ${lastError}`,
				'VALIDATION_ERROR'
			);
		}
	}

	throw new AIServiceError('Failed to generate valid content', 'PROVIDER_ERROR');
}

/**
 * Transform markdown content using AI
 */
export async function transformMarkdownContent(
	content: unknown,
	prompt: string,
	userId: string,
	documentContext?: unknown
): Promise<string> {
	if (!userId) {
		throw new AIServiceError('Unauthorized', 'VALIDATION_ERROR');
	}

	if (!prompt) {
		throw new AIServiceError('Prompt is required', 'VALIDATION_ERROR');
	}

	// Validate prompt length
	const promptValidation = validatePromptLength(prompt);
	if (!promptValidation.isValid) {
		throw new AIServiceError(promptValidation.error || 'Prompt too long', 'VALIDATION_ERROR');
	}

	const contentToTransform = typeof content === 'string' && content.length > 0 ? content : null;

	// Validate content size if provided
	if (contentToTransform) {
		const sizeValidation = validateContentSize(contentToTransform);
		if (!sizeValidation.isValid) {
			throw new AIServiceError(sizeValidation.error || 'Content too large', 'VALIDATION_ERROR');
		}
	}

	try {
		const provider = AIProviderFactory.create();
		const systemPrompt = getMarkdownSystemPrompt();

		// Build user prompt
		let userPrompt = `Transform the following markdown content according to this instruction: "${prompt}"

SELECTED CONTENT TO TRANSFORM (ONLY transform this - it will be replaced):
${contentToTransform ?? 'No content selected - generate new content'}`;

		// Add context if provided
		if (documentContext) {
			const ctx = documentContext as {
				surroundingContent?: unknown;
				fullDocument?: unknown;
			};
			if (typeof ctx.surroundingContent === 'string' && ctx.surroundingContent.length > 0) {
				userPrompt += `\n\nCONTEXT ONLY (DO NOT include in output - for understanding only):\n${ctx.surroundingContent}`;
			}
			if (
				typeof ctx.fullDocument === 'string' &&
				ctx.fullDocument.length > 0 &&
				ctx.fullDocument !== ctx.surroundingContent
			) {
				userPrompt += `\n\nFULL DOCUMENT CONTEXT (DO NOT include in output - for reference only):\n${ctx.fullDocument}`;
			}
		}

		userPrompt += `

CRITICAL:
- ONLY return the transformed version of the SELECTED CONTENT
- DO NOT include surrounding paragraphs, headings, or any context
- The output will REPLACE the selected content, so only include what was selected
- Context is provided to help you understand the document, but should NOT appear in output

Return a JSON object with a "content" field containing ONLY the transformed markdown.`;

		// Generate and validate with retry
		return await generateWithRetry(provider, systemPrompt, userPrompt);
	} catch (error) {
		if (error instanceof AIServiceError) {
			throw error;
		}
		throw new AIServiceError(
			`Failed to transform content: ${error instanceof Error ? error.message : 'Unknown error'}`,
			'PROVIDER_ERROR'
		);
	}
}
