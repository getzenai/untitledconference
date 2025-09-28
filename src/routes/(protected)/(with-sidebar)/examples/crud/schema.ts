import { z } from 'zod/v4';

// Base schema for the form fields (both create and update)
export const exampleFormSchema = z.object({
	name: z.string().min(1, 'Name is required').max(100, 'Name must be less than 100 characters'),
	description: z.string().max(500, 'Description must be less than 500 characters').optional()
});

// For update operations, we use spread syntax for better TypeScript performance
// The ID is typically not in the form itself but comes from the URL params
// So this is mainly for type safety when passing data around
export const exampleWithIdSchema = z.object({
	...exampleFormSchema.shape,
	id: z.string()
});

export type ExampleFormSchema = typeof exampleFormSchema;
export type ExampleWithIdSchema = typeof exampleWithIdSchema;
