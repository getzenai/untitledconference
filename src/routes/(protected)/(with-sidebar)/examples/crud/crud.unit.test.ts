/**
 * CRUD Schema Unit Tests
 *
 * Tests the validation schemas used in CRUD operations.
 * Imports actual schemas from server files to ensure consistency.
 */

import { describe, expect, it } from 'vitest';
import { exampleFormSchema, exampleUpdateFormSchema } from './crud.validation';

describe('CRUD Form Schemas', () => {
	describe('exampleFormSchema (Create)', () => {
		it('should validate successfully with valid data', () => {
			const result = exampleFormSchema.safeParse({
				name: 'Test Name',
				description: 'Test Description'
			});
			expect(result.success).toBe(true);
		});

		it('should validate successfully without description', () => {
			const result = exampleFormSchema.safeParse({
				name: 'Test Name'
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.description).toBeUndefined();
			}
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

		it('should fail validation if name is only whitespace', () => {
			const result = exampleFormSchema.safeParse({
				name: '   ',
				description: 'Test Description'
			});
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.flatten().fieldErrors.name).toContain('Name is required.');
			}
		});

		it('should trim name field', () => {
			const result = exampleFormSchema.safeParse({
				name: '  Test Name  ',
				description: 'Test Description'
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.name).toBe('Test Name');
			}
		});

		it('should handle missing name field', () => {
			const result = exampleFormSchema.safeParse({
				description: 'Test Description'
			});
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.flatten().fieldErrors.name).toBeDefined();
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

		it('should validate successfully without description', () => {
			const result = exampleUpdateFormSchema.safeParse({
				id: '123',
				name: 'Updated Name'
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.description).toBeUndefined();
			}
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

		it('should fail validation if name is only whitespace', () => {
			const result = exampleUpdateFormSchema.safeParse({
				id: '123',
				name: '   ',
				description: 'Updated Description'
			});
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.flatten().fieldErrors.name).toContain('Name is required.');
			}
		});

		it('should trim name field', () => {
			const result = exampleUpdateFormSchema.safeParse({
				id: '123',
				name: '  Updated Name  ',
				description: 'Updated Description'
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.name).toBe('Updated Name');
			}
		});

		it('should handle missing required fields', () => {
			const result = exampleUpdateFormSchema.safeParse({});
			expect(result.success).toBe(false);
			if (!result.success) {
				const errors = result.error.flatten().fieldErrors;
				expect(errors.id).toBeDefined();
				expect(errors.name).toBeDefined();
			}
		});
	});
});
