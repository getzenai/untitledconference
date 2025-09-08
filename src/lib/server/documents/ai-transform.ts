import { AIProviderFactory } from '$lib/server/ai/factory';
import { AIServiceError } from '$lib/server/ai/types';
import { z } from 'zod';
import { extractValidatedContent, validateTiptapContent } from './tiptap-validator';
import { validateJsonDepth, validatePromptLength } from './validation-constants';

// Schema that wraps the content to satisfy Azure OpenAI's requirement for object type
const TiptapTransformSchema = z.object({
	content: z.union([
		z.object({}).passthrough(), // Single node
		z.array(z.object({}).passthrough()) // Array of nodes
	])
});

// Helper function to create system prompt
function getTiptapSystemPrompt(): string {
	return `You are an AI assistant that works with TipTap editor JSON format.

CRITICAL: You must ONLY return valid JSON. No explanations, no "Here is your text", no code fences, no markdown. ONLY the JSON object.

IMPORTANT: When transforming selected content:
- ONLY transform what was explicitly selected
- DO NOT add content from the context
- The output will REPLACE the selection, so it must be EXACTLY what should replace it
- Context is for understanding only - never include it in the output

TipTap JSON Structure:
- paragraph: Text paragraph with content array
- heading: Heading with attrs.level (1-6)
- text: Text node with optional marks array
- blockquote: Quote block
- bulletList/orderedList: List containers with listItem children
- codeBlock: Code block with optional attrs.language

CRITICAL MARK FORMAT - THIS IS WHERE ERRORS HAPPEN:
Marks MUST be an array of objects. Each mark is an object with a "type" field.

CORRECT mark format:
"marks": [{"type": "bold"}, {"type": "italic"}]

INCORRECT formats that will fail:
"marks": ["bold", "italic"]  ❌ WRONG - strings not allowed
"marks": "bold"  ❌ WRONG - must be array
"marks": [{"bold": true}]  ❌ WRONG - must have "type" field

Valid mark types:
- {"type": "bold"} - Makes text bold
- {"type": "italic"} - Makes text italic  
- {"type": "strike"} - Strikethrough text
- {"type": "code"} - Inline code formatting (CANNOT combine with other marks!)

IMPORTANT LIMITATION: The "code" mark CANNOT be combined with bold, italic, or strike!
- ✅ VALID: [{"type": "bold"}, {"type": "italic"}]
- ✅ VALID: [{"type": "bold"}, {"type": "italic"}, {"type": "strike"}]
- ✅ VALID: [{"type": "code"}] (code alone)
- ❌ INVALID: [{"type": "code"}, {"type": "bold"}]
- ❌ INVALID: [{"type": "code"}, {"type": "italic"}]

Example with multiple marks (NO code):
{
  "type": "text",
  "text": "bold and italic",
  "marks": [{"type": "bold"}, {"type": "italic"}]
}

Example with code mark (MUST be alone):
{
  "type": "text",
  "text": "console.log()",
  "marks": [{"type": "code"}]
}

Example paragraph:
{
  "type": "paragraph",
  "content": [
    {"type": "text", "text": "Normal "},
    {"type": "text", "text": "bold", "marks": [{"type": "bold"}]},
    {"type": "text", "text": " and "},
    {"type": "text", "text": "code", "marks": [{"type": "code"}]}
  ]
}

RESPONSE RULES:
1. Return ONLY a JSON object with a 'content' field
2. NO explanatory text before or after the JSON
3. NO markdown code fences (triple backticks)
4. NO "Here is..." or "Certainly..." or any other text
5. Marks are ALWAYS an array of objects with "type" field
6. Each mark object MUST have format: {"type": "markname"}
7. Arrays must contain ONLY objects, NEVER strings like ["paragraph", {...}]
8. Every item in content arrays MUST be a complete object with "type" field

COMMON MISTAKES TO AVOID:
- ❌ WRONG: "content": [{"type":"paragraph",...}, "paragraph", {...}]
- ✅ RIGHT: "content": [{"type":"paragraph",...}, {"type":"paragraph",...}]

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
): Promise<unknown> {
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
				TiptapTransformSchema,
				systemPrompt,
				promptWithError
			);
		} catch (genError) {
			// Handle schema validation errors from the AI provider
			const errorMsg = genError instanceof Error ? genError.message : 'Unknown error';

			// Extract the malformed JSON if available for debugging
			if (errorMsg.includes('response did not match schema')) {
				// Log error for debugging without exposing to console in production
				lastError =
					'AI returned malformed JSON structure. Ensure all array items are objects, not strings.';

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

		// Validate the generated content
		const validation = validateTiptapContent(result.content);

		if (validation.isValid) {
			// Return the validated and extracted content
			return extractValidatedContent(result.content);
		}

		// Store error for next attempt
		lastError = validation.details || validation.error;
		// Log validation failure for debugging without exposing details to console

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
 * Transform TipTap content using AI
 */
export async function transformTiptapContent(
	content: unknown,
	prompt: string,
	userId: string,
	documentContext?: unknown
): Promise<unknown> {
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

	const contentToTransform = content || null;

	// Validate content depth if provided
	if (contentToTransform) {
		const depthValidation = validateJsonDepth(contentToTransform);
		if (!depthValidation.isValid) {
			throw new AIServiceError(depthValidation.error || 'Content too deep', 'VALIDATION_ERROR');
		}
	}

	try {
		const provider = AIProviderFactory.create();
		const systemPrompt = getTiptapSystemPrompt();

		// Build user prompt
		let userPrompt = `Transform the following TipTap content according to this instruction: "${prompt}"

SELECTED CONTENT TO TRANSFORM (ONLY transform this - it will be replaced):
${contentToTransform ? JSON.stringify(contentToTransform, null, 2) : 'No content selected - generate new content'}`;

		// Add context if provided
		if (documentContext) {
			const ctx = documentContext as {
				surroundingContent?: unknown;
				fullDocument?: unknown;
				selectionInfo?: unknown;
			};
			if (ctx.surroundingContent) {
				userPrompt += `\n\nCONTEXT ONLY (DO NOT include in output - for understanding only):\n${JSON.stringify(ctx.surroundingContent, null, 2)}`;
			}
			if (ctx.fullDocument && ctx.fullDocument !== ctx.surroundingContent) {
				userPrompt += `\n\nFULL DOCUMENT CONTEXT (DO NOT include in output - for reference only):\n${JSON.stringify(ctx.fullDocument, null, 2)}`;
			}
		}

		userPrompt += `

CRITICAL: 
- ONLY return the transformed version of the SELECTED CONTENT
- DO NOT include surrounding paragraphs, headings, or any context
- The output will REPLACE the selected content, so only include what was selected
- Context is provided to help you understand the document, but should NOT appear in output

Return a JSON object with a "content" field containing ONLY the transformed selected content.`;

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
