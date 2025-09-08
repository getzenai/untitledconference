import { env } from '$env/dynamic/private';
import { createAzure } from '@ai-sdk/azure';
import { generateObject, generateText } from 'ai';
import { z } from 'zod';
import { AIServiceError, TEXT_TRANSFORM_PROMPTS, type AIProvider } from './types';

/**
 * Azure OpenAI provider for generating structured outputs
 * This is a pure API interface that knows nothing about business logic
 */
export class AzureOpenAIProvider implements AIProvider {
	private client;
	private model;

	constructor() {
		const apiKey = env.AZURE_OPENAI_API_KEY;
		const resourceName = env.AZURE_RESOURCE_NAME;
		const deploymentName = env.AZURE_OPENAI_DEPLOYMENT_NAME;

		if (!apiKey || !resourceName || !deploymentName) {
			throw new AIServiceError(
				'Azure OpenAI configuration missing. Please set AZURE_OPENAI_API_KEY, AZURE_RESOURCE_NAME, and AZURE_OPENAI_DEPLOYMENT_NAME',
				'PROVIDER_ERROR'
			);
		}

		this.client = createAzure({
			resourceName,
			apiKey
		});

		this.model = this.client(deploymentName);
	}

	async generateStructuredOutput<T extends z.ZodType>(
		schema: T,
		systemPrompt: string,
		userPrompt: string
	): Promise<z.infer<T>> {
		try {
			// Add sanitization transform to string fields in the schema
			const sanitizedSchema = this.addSanitizationToSchema(schema);

			const result = await generateObject({
				model: this.model,
				schema: sanitizedSchema as z.ZodType<z.infer<T>>,
				mode: 'json',
				system: systemPrompt,
				prompt: userPrompt,
				maxRetries: 3
			});

			return result.object as z.infer<T>;
		} catch (error) {
			throw new AIServiceError(
				`Failed to generate structured output: ${error instanceof Error ? error.message : 'Unknown error'}`,
				'PROVIDER_ERROR'
			);
		}
	}

	/**
	 * Transform text using Azure OpenAI (convenience method)
	 */
	async transformText(text: string, action: string): Promise<string> {
		// Check if action is valid
		if (!(action in TEXT_TRANSFORM_PROMPTS)) {
			throw new AIServiceError(`Invalid transformation action: ${action}`, 'VALIDATION_ERROR');
		}

		const prompt = TEXT_TRANSFORM_PROMPTS[action as keyof typeof TEXT_TRANSFORM_PROMPTS];

		try {
			const { text: transformedText } = await generateText({
				model: this.model,
				system:
					'You are a helpful text transformation assistant. Transform the text according to the instruction.',
				prompt: `${prompt}\n\n${text}`
			});

			return transformedText;
		} catch (error) {
			throw new AIServiceError(
				`Failed to transform text: ${error instanceof Error ? error.message : 'Unknown error'}`,
				'PROVIDER_ERROR'
			);
		}
	}

	/**
	 * Recursively add sanitization to string fields in the schema
	 * to remove null characters and invalid Unicode that PostgreSQL doesn't support
	 */
	private addSanitizationToSchema(schema: z.ZodType): z.ZodType {
		if (schema instanceof z.ZodString) {
			return schema.transform((content: string) => {
				return (
					content
						// eslint-disable-next-line no-control-regex
						.replace(/\u0000/g, '') // Remove null characters
						// eslint-disable-next-line no-control-regex
						.replace(/[\x00-\x1F\x7F-\x9F]/g, (char: string) => {
							// Keep newlines and tabs, remove other control characters
							if (char === '\n' || char === '\r' || char === '\t') {
								return char;
							}
							return '';
						})
				);
			});
		}

		if (schema instanceof z.ZodObject) {
			const shape = schema.shape;
			const newShape: Record<string, z.ZodType> = {};

			for (const [key, value] of Object.entries(shape)) {
				newShape[key] = this.addSanitizationToSchema(value as z.ZodType);
			}

			return z.object(newShape);
		}

		// For other types, return as-is
		return schema;
	}
}
