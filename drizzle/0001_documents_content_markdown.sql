-- Milkdown replaces TipTap, so `documents.content` holds markdown instead of
-- ProseMirror JSON.
--
-- Guarded on purpose: this starter provisions databases with `drizzle-kit push`
-- and the `documents` table is not part of 0000_merged_initial_schema, so the
-- column may not exist yet — or may already be text — when migrations run.
--
-- Existing rows keep their ProseMirror JSON, now stored as text. `toMarkdown()`
-- in src/lib/server/documents/content-format.ts converts them on read, so no
-- data rewrite is needed.
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = 'public'
			AND table_name = 'documents'
			AND column_name = 'content'
			AND data_type IN ('json', 'jsonb')
	) THEN
		ALTER TABLE "documents" ALTER COLUMN "content" SET DATA TYPE text USING "content" #>> '{}';
	END IF;
END $$;
