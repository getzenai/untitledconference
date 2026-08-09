// Centralized configuration for invitation expiration
export const INVITATION_EXPIRY_SECONDS = 86400; // 24 hours in seconds

// How long a session counts as "fresh" for sensitive operations (passkey
// registration, credential changes). Mirrors Better Auth's own default so the
// server config and the client-side re-auth prompt cannot drift apart.
export const SESSION_FRESH_AGE_SECONDS = 86400; // 24 hours in seconds
