This file documents recurring patterns and standards used in the project.
It is optional, but recommended to be updated as the project evolves.

## Coding Patterns

- **Language:** TypeScript
- **Framework:** SvelteKit
- **UI Components:** Shadcn UI (see UI Components)
- **Styling:** Tailwind CSS
- **Linting/Formatting:** ESLint, Prettier (using project's config files: `eslint.config.js`, `.prettierrc`)
- **API Interaction:** Use standard `fetch` API for backend calls.
- **Error Handling:** Implement consistent error handling for API calls and backend logic.
- **Modularity:** Break down UI and logic into reusable Svelte components.
- **HTML Rendering:** When rendering HTML from external sources (like Markdown conversion), sanitize using `DOMPurify.sanitize()` before using `{@html}`.

### UI Components

- accordion - `src/lib/components/ui/accordion`
- alert - `src/lib/components/ui/alert`
- alert-dialog - `src/lib/components/ui/alert-dialog`
- avatar - `src/lib/components/ui/avatar`
- badge - `src/lib/components/ui/badge`
- breadcrumb - `src/lib/components/ui/breadcrumb`
- button - `src/lib/components/ui/button`
- card - `src/lib/components/ui/card`
- checkbox - `src/lib/components/ui/checkbox`
- dialog - `src/lib/components/ui/dialog`
- drawer - `src/lib/components/ui/drawer`
- dropdown-menu - `src/lib/components/ui/dropdown-menu`
- form - `src/lib/components/ui/form`
- input - `src/lib/components/ui/input`
- label - `src/lib/components/ui/label`
- menubar - `src/lib/components/ui/menubar`
- pagination - `src/lib/components/ui/pagination`
- progress - `src/lib/components/ui/progress`
- radio-group - `src/lib/components/ui/radio-group`
- resizable - `src/lib/components/ui/resizable`
- scroll-area - `src/lib/components/ui/scroll-area`
- select - `src/lib/components/ui/select`
- separator - `src/lib/components/ui/separator`
- sheet - `src/lib/components/ui/sheet`
- skeleton - `src/lib/components/ui/skeleton`
- slider - `src/lib/components/ui/slider`
- sonner - `src/lib/components/ui/sonner`
- switch - `src/lib/components/ui/switch`
- table - `src/lib/components/ui/table`
- tabs - `src/lib/components/ui/tabs`
- textarea - `src/lib/components/ui/textarea`
- tooltip - `src/lib/components/ui/tooltip`

## Architectural Patterns

- **API Routes:** Use SvelteKit API routes (`src/routes/api/...`) for backend logic
- **Server-Side Logic:** Keep external API calls and sensitive logic within server-side code (`+page.server.ts`, API routes) rather than the client-side.
