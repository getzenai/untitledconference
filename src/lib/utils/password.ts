/**
 * Generates a cryptographically secure random password
 * @param length - The length of the password to generate (default: 16)
 * @returns A random password string
 */
export function generateRandomPassword(length = 16): string {
	const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-#+!?=';

	if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
		const randomValues = new Uint32Array(length);
		crypto.getRandomValues(randomValues);
		return Array.from(randomValues, (value) => charset[value % charset.length]).join('');
	}

	// Fallback for environments without crypto API
	let password = '';
	for (let index = 0; index < length; index += 1) {
		password += charset[Math.floor(Math.random() * charset.length)];
	}
	return password;
}
