/**
 * CRUD Schema Unit Tests
 *
 * Tests `exampleFormSchema` from ./schema.ts — the schema the CRUD route
 * actually validates against via superforms. Replaces the tests that ran
 * against the orphaned `crud.validation.ts`.
 */

import { describe, expect, it } from 'vitest';
import { exampleFormSchema } from './schema';

describe('exampleFormSchema', () => {
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
			expect(result.error.flatten().fieldErrors.name).toContain('Name is required');
		}
	});

	it('should fail validation if name is only whitespace', () => {
		const result = exampleFormSchema.safeParse({
			name: '   ',
			description: 'Test Description'
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.flatten().fieldErrors.name).toContain('Name is required');
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

	it('should accept a name of exactly 100 characters', () => {
		const result = exampleFormSchema.safeParse({
			name: 'a'.repeat(100)
		});
		expect(result.success).toBe(true);
	});

	it('should fail validation if name exceeds 100 characters', () => {
		const result = exampleFormSchema.safeParse({
			name: 'a'.repeat(101)
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.flatten().fieldErrors.name).toContain(
				'Name must be less than 100 characters'
			);
		}
	});

	it('should measure the name length after trimming', () => {
		const result = exampleFormSchema.safeParse({
			name: `  ${'a'.repeat(100)}  `
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.name).toHaveLength(100);
		}
	});

	it('should accept a description of exactly 500 characters', () => {
		const result = exampleFormSchema.safeParse({
			name: 'Test Name',
			description: 'a'.repeat(500)
		});
		expect(result.success).toBe(true);
	});

	it('should fail validation if description exceeds 500 characters', () => {
		const result = exampleFormSchema.safeParse({
			name: 'Test Name',
			description: 'a'.repeat(501)
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.flatten().fieldErrors.description).toContain(
				'Description must be less than 500 characters'
			);
		}
	});
});
