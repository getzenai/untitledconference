import { z } from 'zod';
import type { AIProvider } from './types';
import { TEXT_TRANSFORM_PROMPTS } from './types';

/**
 * Mock provider for testing and development
 * Returns deterministic responses based on the schema
 */
export class MockProvider implements AIProvider {
	async generateStructuredOutput<T extends z.ZodType>(
		schema: T,
		systemPrompt: string,
		userPrompt: string
	): Promise<z.infer<T>> {
		// For TipTap content, return a wrapped transformed response
		if (userPrompt.includes('TipTap')) {
			const mockTransformed = {
				content: {
					type: 'paragraph',
					content: [
						{
							type: 'text',
							text: '[MOCK TRANSFORMED] Your text has been transformed successfully!'
						}
					]
				}
			};
			return mockTransformed as z.infer<T>;
		}

		// Generate mock data based on the schema shape
		const mockData = this.generateMockData(schema, userPrompt);

		// Parse through the schema to ensure it's valid
		return schema.parse(mockData) as z.infer<T>;
	}

	/**
	 * Transform text using mock transformations (convenience method)
	 */
	async transformText(text: string, action: string): Promise<string> {
		// Define schema for text transformation
		const schema = z.object({
			transformed: z.string()
		});

		const systemPrompt =
			TEXT_TRANSFORM_PROMPTS[action as keyof typeof TEXT_TRANSFORM_PROMPTS] || 'Transform the text';
		const userPrompt = text;

		const result = await this.generateStructuredOutput(schema, systemPrompt, userPrompt);
		return result.transformed;
	}

	private generateStringContent(description: string, context: string): string {
		const lowerDesc = description.toLowerCase();

		if (lowerDesc.includes('transformed')) {
			// Return mock transformations based on context length
			if (context.length < 50) {
				return `Mock: ${context.toUpperCase()}`;
			}
			return `Mock transformed: ${context.substring(0, 100)}...`;
		}

		if (lowerDesc.includes('platzhalter') || lowerDesc.includes('placeholder')) {
			return `Mock content with [Placeholder for missing information]`;
		}

		if (lowerDesc.includes('projekt') || lowerDesc.includes('project')) {
			return `Mock content for project section based on context`;
		}

		if (lowerDesc.includes('technisch') || lowerDesc.includes('technical')) {
			return `Mock content for technical section`;
		}

		// Default mock content
		return `Mock content generated for context of ${context.length} characters`;
	}

	private generateMockData(schema: z.ZodType, context: string): unknown {
		// Check if context contains TipTap JSON content
		if (context.includes('"type"') && context.includes('"content"')) {
			try {
				// Try to parse the context as it might contain the original TipTap content
				const originalContent = JSON.parse(context.match(/\{.*\}/s)?.[0] || '{}');

				// Return a transformed version of TipTap content
				if (originalContent.type === 'text' && originalContent.text) {
					return {
						type: 'text',
						text: `[TRANSFORMED] ${originalContent.text}`,
						marks: originalContent.marks || []
					};
				} else if (originalContent.type && originalContent.content) {
					// For nodes with content (paragraph, heading, etc.)
					return {
						...originalContent,
						content: originalContent.content.map((node: unknown) => {
							const typedNode = node as Record<string, unknown>;
							if (typedNode.type === 'text') {
								return {
									...typedNode,
									text: `[TRANSFORMED] ${typedNode.text || ''}`
								};
							}
							return node;
						})
					};
				}
			} catch {
				// If parsing fails, fall through to normal mock generation
			}
		}

		if (schema instanceof z.ZodString) {
			const zodDef = schema._def as z.ZodStringDef & { description?: string };
			const description = zodDef.description || '';
			return this.generateStringContent(description, context);
		}

		if (schema instanceof z.ZodNumber) {
			return 42;
		}

		if (schema instanceof z.ZodBoolean) {
			return true;
		}

		if (schema instanceof z.ZodArray) {
			const arrayDef = schema._def as z.ZodArrayDef;
			const itemSchema = arrayDef.type;
			return [this.generateMockData(itemSchema, context)];
		}

		if (schema instanceof z.ZodObject) {
			const shape = schema.shape;
			const result: Record<string, unknown> = {};

			for (const [key, fieldSchema] of Object.entries(shape)) {
				const fieldDef = (fieldSchema as z.ZodType)._def as { description?: string };
				const fieldContext = fieldDef.description || context;
				result[key] = this.generateMockData(fieldSchema as z.ZodType, fieldContext);
			}

			return result;
		}

		if (schema instanceof z.ZodEffects) {
			const effectsDef = schema._def as z.ZodEffectsDef;
			const innerSchema = effectsDef.schema;
			return this.generateMockData(innerSchema, context);
		}

		if (schema instanceof z.ZodLazy) {
			// Handle lazy schemas (which TipTap schema uses)
			// Return a simple transformed paragraph
			return {
				type: 'paragraph',
				content: [
					{
						type: 'text',
						text: '[MOCK TRANSFORMED] Your text has been transformed by AI'
					}
				]
			};
		}

		// Default fallback
		return null;
	}
}
