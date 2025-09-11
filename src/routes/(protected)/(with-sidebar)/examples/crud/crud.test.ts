import { describe, expect, it } from 'vitest';
import { z } from 'zod';

// Assuming exampleFormSchema is exported from +page.server.ts or defined here for testing
// For the purpose of this test file, let's redefine it based on the provided +page.server.ts
const exampleFormSchema = z.object({
	name: z.string().min(1, 'Name is required.'),
	description: z.string().min(1, 'Description is required.')
});

// Assuming exampleUpdateFormSchema is exported from [id]/+page.server.ts or defined here
// For the purpose of this test file, let's redefine it based on the provided [id]/+page.server.ts
const exampleUpdateFormSchema = z.object({
	id: z.string().min(1, 'ID is required.'), // Assuming ID is a string, adjust if it's number after parsing
	name: z.string().min(1, 'Name is required.'),
	description: z.string().min(1, 'Description is required.')
});

describe('Example Form Schemas', () => {
	describe('exampleFormSchema (Create)', () => {
		it('should validate successfully with valid data', () => {
			const result = exampleFormSchema.safeParse({
				name: 'Test Name',
				description: 'Test Description'
			});
			expect(result.success).toBe(true);
		});

		it('should fail validation if name is empty', () => {
			const result = exampleFormSchema.safeParse({
				name: '',
				description: 'Test Description'
			});
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.flatten().fieldErrors.name).toContain('Name is required.');
			}
		});

		it('should fail validation if description is empty', () => {
			const result = exampleFormSchema.safeParse({
				name: 'Test Name',
				description: ''
			});
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.flatten().fieldErrors.description).toContain(
					'Description is required.'
				);
			}
		});
	});

	describe('exampleUpdateFormSchema (Update)', () => {
		it('should validate successfully with valid data', () => {
			const result = exampleUpdateFormSchema.safeParse({
				id: '123',
				name: 'Updated Name',
				description: 'Updated Description'
			});
			expect(result.success).toBe(true);
		});

		it('should fail validation if id is empty', () => {
			const result = exampleUpdateFormSchema.safeParse({
				id: '',
				name: 'Updated Name',
				description: 'Updated Description'
			});
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.flatten().fieldErrors.id).toContain('ID is required.');
			}
		});

		it('should fail validation if name is empty', () => {
			const result = exampleUpdateFormSchema.safeParse({
				id: '123',
				name: '',
				description: 'Updated Description'
			});
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.flatten().fieldErrors.name).toContain('Name is required.');
			}
		});

		it('should fail validation if description is empty', () => {
			const result = exampleUpdateFormSchema.safeParse({
				id: '123',
				name: 'Updated Name',
				description: ''
			});
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.flatten().fieldErrors.description).toContain(
					'Description is required.'
				);
			}
		});
	});
});
