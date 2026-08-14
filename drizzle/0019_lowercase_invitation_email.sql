-- Invitation rows kept whatever the admin typed; `user.email` is lowercased by
-- Better Auth. The invitation link is now resolved by comparing the two, so a
-- mixed-case row is a dead link (#395 review). Fold the existing rows.
UPDATE "system_invitation" SET "email" = lower(trim("email")) WHERE "email" <> lower(trim("email"));
