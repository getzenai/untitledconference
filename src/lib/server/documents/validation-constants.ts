/**
 * Validation constants for document operations
 * These limits help prevent DoS attacks and ensure system stability
 */

/**
 * Maximum size for JSON content in bytes (10MB)
 * This prevents memory exhaustion from extremely large documents
 */
export const MAX_CONTENT_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Maximum length for AI prompts in characters
 * Prevents abuse and keeps AI requests reasonable
 */
export const MAX_PROMPT_LENGTH = 10000;

/**
 * Maximum depth for nested JSON objects
 * Prevents stack overflow from deeply nested structures
 */
export const MAX_JSON_DEPTH = 20;

/**
 * Maximum length for document title
 */
export const MAX_TITLE_LENGTH = 255;

/**
 * Maximum length for plain text extraction
 */
export const MAX_PLAIN_TEXT_LENGTH = 1000000; // 1M characters

/**
 * Validation error messages
 */
export const VALIDATION_ERRORS = {
	CONTENT_TOO_LARGE: `Content exceeds maximum size of ${MAX_CONTENT_SIZE / 1024 / 1024}MB`,
	PROMPT_TOO_LONG: `Prompt exceeds maximum length of ${MAX_PROMPT_LENGTH} characters`,
	JSON_TOO_DEEP: `JSON structure exceeds maximum depth of ${MAX_JSON_DEPTH}`,
	TITLE_TOO_LONG: `Title exceeds maximum length of ${MAX_TITLE_LENGTH} characters`,
	INVALID_JSON: 'Invalid JSON format',
	UNAUTHORIZED: 'Unauthorized access',
	DOCUMENT_NOT_FOUND: 'Document not found'
} as const;

/**
 * Helper function to check JSON depth
 */
export function getJsonDepth(obj: unknown, currentDepth = 0): number {
	if (currentDepth > MAX_JSON_DEPTH) {
		return currentDepth;
	}

	if (typeof obj !== 'object' || obj === null) {
		return currentDepth;
	}

	if (Array.isArray(obj)) {
		return Math.max(currentDepth, ...obj.map((item) => getJsonDepth(item, currentDepth + 1)));
	}

	return Math.max(
		currentDepth,
		...Object.values(obj).map((value) => getJsonDepth(value, currentDepth + 1))
	);
}

/**
 * Validate content size
 */
export function validateContentSize(content: string): { isValid: boolean; error?: string } {
	const sizeInBytes = new TextEncoder().encode(content).length;
	if (sizeInBytes > MAX_CONTENT_SIZE) {
		return {
			isValid: false,
			error: VALIDATION_ERRORS.CONTENT_TOO_LARGE
		};
	}
	return { isValid: true };
}

/**
 * Validate prompt length
 */
export function validatePromptLength(prompt: string): { isValid: boolean; error?: string } {
	if (prompt.length > MAX_PROMPT_LENGTH) {
		return {
			isValid: false,
			error: VALIDATION_ERRORS.PROMPT_TOO_LONG
		};
	}
	return { isValid: true };
}

/**
 * Validate JSON depth
 */
export function validateJsonDepth(obj: unknown): { isValid: boolean; error?: string } {
	const depth = getJsonDepth(obj);
	if (depth > MAX_JSON_DEPTH) {
		return {
			isValid: false,
			error: VALIDATION_ERRORS.JSON_TOO_DEEP
		};
	}
	return { isValid: true };
}
