# Codebase Overview: BULEX Case Management Platform

## 1. Project Overview

- **Purpose**: Case management platform (legal/professional).
- **Tech Stack**:
  - **Framework**: SvelteKit (`@sveltejs/kit`)
  - **Language**: TypeScript (`typescript`)
  - **UI Components**: shadcn/ui, Bits UI (`bits-ui`), Lucide Icons (`lucide-svelte`)
  - **Styling**: Tailwind CSS (`tailwindcss`, `tailwind-merge`, `tailwind-variants`)
  - **Database**: PostgreSQL (dialect in `drizzle.config.ts`)
  - **ORM**: Drizzle ORM (`drizzle-orm`, `drizzle-kit`)
  - **Authentication**: Better Auth (`better-auth`)
  - **Internationalization (i18n)**: ParaglideJS (`@inlang/paraglide-sveltekit`)
  - **Linting/Formatting**: ESLint (`eslint`), Prettier (`prettier`)
  - **Testing**: Cypress (`cypress`) for E2E, Vitest (`vitest`) for unit
  - **Build Tool**: Vite (`vite`)
  - **Documentation**: VitePress (`vitepress`)
- **Key Features**:
  - User authentication and session management.
  - Database interaction.
  - Internationalized UI.
  - API endpoints.
  - Testing infrastructure.

## 2. Architecture Summary

- **Overall Design**: SvelteKit architecture: file-system routing, server logic in `+page.server.ts`/`+layout.server.ts`, UI in `.svelte` files.
- **Architectural Patterns**:
  - MVC/MVVM-like separation of concerns.
  - Hook-based Middleware: `src/hooks.server.ts` for global concerns (auth, API protection, i18n).
  - Route Groups: `(protected)` (signed-in users) and `(public)` (all users) for distinct layouts/server logic. Authentication is handled via `src/hooks.server.ts` and `src/routes/(protected)/+layout.server.ts`.
- **Modularity**: `src/lib` for shared code, `src/routes` for page-specifics.

## 3. High-Level File Tree

- **`drizzle/`**: Database migration files.
- **`cypress/`**: Cypress E2E tests.
  - `cypress.config.ts`: E2E test configuration.
- **`messages/`**: ParaglideJS translation files (e.g., `en.json`, `de.json`).
- **`project.inlang/`**: ParaglideJS configuration.
- **`src/`**: Core application source.
  - `hooks.server.ts`: Server-side hooks (auth, API protection, i18n).
  - **`lib/`**: Shared libraries, components, utilities.
    - `auth.ts`: Server-side `better-auth` setup.
    - `components/ui/`: shadcn/ui components.
    - `server/db/`: Database schemas (`auth-schema.ts`) and Drizzle client (`index.ts`).
  - **`routes/`**: SvelteKit routes.
    - `+layout.svelte`: Root layout.
    - `+page.server.ts`: Root page server logic.
    - **`(protected)/`**: Authenticated routes.
      - `+layout.server.ts`: Server-side auth check.
      - `home/+page.svelte`: Main page post-login.
    - **`(public)/`**: Publicly accessible routes.
      - `login/+page.svelte`: Login form.
      - `register/+page.svelte`: Registration form.
    - **`api/v1/`**: API endpoints.
- **Configuration Files (Root)**:
  - `components.json`: shadcn/ui config.
  - `drizzle.config.ts`: Drizzle ORM config.
  - `package.json`: Dependencies and scripts.
  - `vite.config.ts`: Vite build config.

## 4. Core Components Breakdown

- **Authentication**: `better-auth` (configured in `src/lib/auth.ts`). Integrated via `src/hooks.server.ts` and `src/routes/(protected)/+layout.server.ts`.
- **Database Interaction**: Drizzle ORM. Schema in `src/lib/server/db/auth-schema.ts`. Client in `src/lib/server/db/index.ts`.
- **Routing**: SvelteKit file-system router. `(protected)` and `(public)` groups manage access.
- **Internationalization**: ParaglideJS. Config in `vite.config.ts` & `project.inlang/`. Messages in `messages/`.
- **API Endpoints**: Under `src/routes/api/v1/`. Protected by `apiProtectionHandler` in `src/hooks.server.ts`.

## 5. Dependencies Analysis

- **Key Dependencies**: `@sveltejs/kit`, `svelte`, `vite`, `drizzle-orm`, `better-auth`, `@inlang/paraglide-sveltekit`, `tailwindcss`, `bits-ui`, `lucide-svelte`, `zod`.
- **Dev Dependencies**: `cypress`, `vitest`, `drizzle-kit`, `eslint`, `prettier`, `typescript`.
- **Internal Relationships**: Routes use `src/lib`. Auth logic (`src/lib/auth.ts`) used by hooks/layouts. DB schema (`src/lib/server/db/auth-schema.ts`) used by Drizzle.

## 6. Configuration Details

- **Environment Variables**: `DATABASE_URL` (for Drizzle, see `env.example`), `better-auth` credentials.
- **Build Configuration**: `vite.config.ts`.
- **TypeScript Configuration**: `tsconfig.json`.
- **Database Configuration**: `drizzle.config.ts` (schema path `src/lib/server/db/auth-schema.ts`).
- **Internationalization Configuration**: ParaglideJS project `project.inlang/settings.json`, Vite plugin in `vite.config.ts`.
- **Deployment**: Uses `@sveltejs/adapter-node`. Build: `npm run build`.

## 7. API Documentation

- **Base Path**: `/api/v1/`
- **Authentication**: Non-public API routes require auth via `apiProtectionHandler` in `src/hooks.server.ts`.
- **Public Endpoints**:
  - `GET /api/v1/public/health`: Health check.
  - `POST /api/v1/public/login`: Login.
- **Protected Endpoints**: Example: `GET /api/v1/protected`.
- **Test Endpoints**: Under `/api/v1/test/` (test environments only).
- **Data Models**: Zod for validation.

## 8. Database Schema

- **ORM**: Drizzle ORM
- **Dialect**: PostgreSQL
- **Schema File**: `src/lib/server/db/auth-schema.ts`
- **Viewing Schema**: Use Drizzle Studio: `npm run db:studio`
- **Key Tables**: `user`, `session`, `account`, `verification` (details in `auth-schema.ts`).
- **Management Scripts**:
  - `npm run db:push`: Push schema changes (fetches credentials from Infisical).
  - `npm run db:push:test`: Push schema to test database.
  - `npm run db:migrate`: Create/apply migrations.

## 9. Testing Structure

- **Unit Testing**: Vitest. Config in `vite.config.ts`. Tests in `src/`. Run: `npm run test:unit`.
- **E2E Testing**: Cypress. Config `cypress.config.ts`. Tests in `cypress/e2e/`. Run: `npm run test:e2e`.
- **Overall Test Command**: `npm run test`.
- **Linting/Formatting Checks**: `npm run check`, `npm run format:check`, `npm run lint`.

## 10. Build and Deployment Processes

- **Build Tool**: Vite.
- **Build Command**: `npm run build`.
- **Preview Production Build**: `npm run preview`.
- **SvelteKit Adapter**: `@sveltejs/adapter-node`.
- **Development Server**: `npm run dev`.
- **Docker**: `docker-compose.yml` for local PostgreSQL (optional, for Local Docker mode).

## 11. Development Workflow

- **Setup**: Clone, `npm install`, `infisical login`, `npm run dev` (Cloud DB mode) or `docker compose up -d` + `.env` (Local Docker mode).
- **Running Dev Server**: `npm run dev`.
- **Database Management**: `npm run db:push` (dev), `npm run db:migrate` (prod), `npm run db:studio`.
- **Internationalization**: Edit `messages/*.json`. ParaglideJS auto-compiles.
- **UI Components**: Use/add shadcn/ui components.
- **Coding Conventions**: TypeScript (strict), Prettier, ESLint.
- **Testing**: `npm test`, `npm run test:unit`, `npm run test:e2e`.
- **Documentation**: VitePress in `docs/`. Run dev server: `npm run docs:dev`.

## 12. Notable Code Patterns & Architectural Decisions

- Strong Typing (TypeScript strict mode).
- Server-Side Auth & Data Focus (`+layout.server.ts`, `+page.server.ts`).
- Centralized API Protection (`hooks.server.ts`).
- Layered Request Handling (`sequence` in `hooks.server.ts`).
- Drizzle ORM for DB Abstraction.
- Tailwind CSS for Styling.
- shadcn/ui for UI Components.
- Comprehensive Testing (Unit & E2E).
- Integrated ParaglideJS for i18n.
- Rich Developer Tooling (npm scripts).
