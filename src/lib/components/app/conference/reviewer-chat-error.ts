/**
 * The AI SDK puts `response.text()` on `chat.error.message`. Our endpoint
 * answers errors as plain text; older or foreign bodies may still be JSON.
 */
export function chatErrorMessage(error: Error): string {
	const raw = error.message.trim();
	try {
		const parsed = JSON.parse(raw) as { error?: unknown };
		if (typeof parsed.error === 'string' && parsed.error.length > 0) return parsed.error;
	} catch {
		// already the body text
	}
	return raw || 'The assistant could not answer.';
}
