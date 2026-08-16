CREATE TABLE "organization_ai_settings" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"base_url" text NOT NULL,
	"api_key_cipher" bytea NOT NULL,
	"api_key_iv" bytea NOT NULL,
	"api_key_suffix" text,
	"model_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
ALTER TABLE "organization_ai_settings" ADD CONSTRAINT "organization_ai_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;