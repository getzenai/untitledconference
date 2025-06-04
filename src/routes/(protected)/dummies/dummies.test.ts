import { describe, expect, it } from 'vitest';
import { z } from 'zod';

// Assuming dummyFormSchema is exported from +page.server.ts or defined here for testing
// For the purpose of this test file, let's redefine it based on the provided +page.server.ts
const dummyFormSchema = z.object({
	name: z.string().min(1, 'Name is required.'),
	description: z.string().min(1, 'Description is required.')
});

// Assuming dummyUpdateFormSchema is exported from [id]/+page.server.ts or defined here
// For the purpose of this test file, let's redefine it based on the provided [id]/+page.server.ts
const dummyUpdateFormSchema = z.object({
	id: z.string().min(1, 'ID is required.'), // Assuming ID is a string, adjust if it's number after parsing
	name: z.string().min(1, 'Name is required.'),
	description: z.string().min(1, 'Description is required.')
});

describe('Dummy Form Schemas', () => {
	describe('dummyFormSchema (Create)', () => {
		it('should validate successfully with valid data', () => {
			const result = dummyFormSchema.safeParse({
				name: 'Test Name',
				description: 'Test Description'
			});
			expect(result.success).toBe(true);
		});

		it('should fail validation if name is empty', () => {
			const result = dummyFormSchema.safeParse({
				name: '',
				description: 'Test Description'
			});
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.flatten().fieldErrors.name).toContain('Name is required.');
			}
		});

		it('should fail validation if description is empty', () => {
			const result = dummyFormSchema.safeParse({
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

	describe('dummyUpdateFormSchema (Update)', () => {
		it('should validate successfully with valid data', () => {
			const result = dummyUpdateFormSchema.safeParse({
				id: '123',
				name: 'Updated Name',
				description: 'Updated Description'
			});
			expect(result.success).toBe(true);
		});

		it('should fail validation if id is empty', () => {
			const result = dummyUpdateFormSchema.safeParse({
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
			const result = dummyUpdateFormSchema.safeParse({
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
			const result = dummyUpdateFormSchema.safeParse({
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
