import { z } from 'zod/v4';

export const formSchema = z.object({
	username: z.string().min(2).max(50)
});
