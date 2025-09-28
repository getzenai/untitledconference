import { z } from 'zod/v4';

export class AIServiceError extends Error {
	constructor(
		message: string,
		public code: 'PROVIDER_ERROR' | 'VALIDATION_ERROR'
	) {
		super(message);
		this.name = 'AIServiceError';
	}
}

/**
 * Generic interface for AI providers that can generate structured outputs
 */
export interface AIProvider {
	/**
	 * Generate structured output based on a Zod schema
	 * @param schema - Zod schema defining the expected output structure
	 * @param systemPrompt - System instructions for the AI
	 * @param userPrompt - User prompt with context and instructions
	 * @returns The generated object matching the schema
	 */
	generateStructuredOutput<T extends z.ZodType>(
		schema: T,
		systemPrompt: string,
		userPrompt: string
	): Promise<z.infer<T>>;

	/**
	 * Transform text based on the given action (convenience method)
	 * @param text The text to transform
	 * @param action The transformation action to apply
	 * @returns The transformed text
	 */
	transformText?(text: string, action: string): Promise<string>;
}

/**
 * Supported text transformation actions
 */
export type TextTransformAction =
	| 'make-concise'
	| 'fix-grammar'
	| 'improve-clarity'
	| 'simplify'
	| 'professional'
	| 'casual';

/**
 * Text transformation prompts
 */
export const TEXT_TRANSFORM_PROMPTS: Record<TextTransformAction, string> = {
	'make-concise': 'Make the following text more concise while preserving its key meaning:',
	'fix-grammar': 'Fix any grammar and spelling errors in the following text:',
	'improve-clarity': 'Improve the clarity and readability of the following text:',
	simplify: 'Simplify the following text to make it easier to understand:',
	professional: 'Rewrite the following text in a more professional tone:',
	casual: 'Rewrite the following text in a more casual, friendly tone:'
};
