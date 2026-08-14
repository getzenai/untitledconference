// Centralized configuration for invitation expiration
export const INVITATION_EXPIRY_SECONDS = 86400; // 24 hours in seconds

// How long a session counts as "fresh" for sensitive operations (passkey
// registration, credential changes). Mirrors Better Auth's own default so the
// server config and the client-side re-auth prompt cannot drift apart.
export const SESSION_FRESH_AGE_SECONDS = 86400; // 24 hours in seconds

// How long getSession may trust the signed session_data cookie instead of
// Postgres. Better Auth's own default (5 minutes). Weighed against 60 s — an
// organizer working the submissions table would re-pay the remaining ~1.7 s
// session hitch once a minute — and against 15+ minutes — a role revoke or a
// session deleted from another device stays invisible that long. Org switch
// and same-browser sign-out rewrite or expire this cookie; maxAge bounds only
// a change written behind it. See #271.
export const SESSION_COOKIE_CACHE_MAX_AGE_SECONDS = 5 * 60;

// The one place the project's own repository is named. Both the signed-in
// shell's GitHub link and the public footer point here; two literals would
// drift the day the repository moves.
export const REPO_URL = 'https://github.com/getzenai/untitledconference';
