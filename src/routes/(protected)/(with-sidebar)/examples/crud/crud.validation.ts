import { z } from 'zod/v4';

export const exampleFormSchema = z.object({
	name: z.string().trim().min(1, 'Name is required.'),
	description: z.string().optional()
});

export const exampleUpdateFormSchema = z.object({
	id: z.string().min(1, 'ID is required.'),
	name: z.string().trim().min(1, 'Name is required.'),
	description: z.string().optional()
});
