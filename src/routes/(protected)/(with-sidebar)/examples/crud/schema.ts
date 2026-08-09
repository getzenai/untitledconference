import { z } from 'zod/v4';

// Base schema for the form fields (both create and update)
export const exampleFormSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1, 'Name is required')
		.max(100, 'Name must be less than 100 characters'),
	description: z.string().max(500, 'Description must be less than 500 characters').optional()
});

export type ExampleFormSchema = typeof exampleFormSchema;
