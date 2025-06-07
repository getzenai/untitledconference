# Sveltekit Vibe Starter

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```bash
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

### Database Setup

To start the PostgreSQL database using Docker Compose:

```bash
docker-compose up -d
```

After the database is running, initialize it with:

```bash
npm run db:push
```

You can also use the following database-related commands:

- `npm run db:start` - Start the database container
- `npm run db:push` - Push schema changes to the database
- `npm run db:migrate` - Create and apply migrations
- `npm run db:studio` - Open Drizzle Studio to manage your database

### drizzle

- You will need to set DATABASE_URL in your production environment
- Run npm run db:start to start the docker container
- Run npm run db:push to update your database schema

### better auth

Authentication is implemented using [Better Auth](https://www.better-auth.com). See the documentation for setup and configuration details.

### paraglide

- Edit your messages in messages/en.json
- Consider installing the Sherlock IDE Extension
- Visit /demo/paraglide route to view the demo

### shadcn components

The following shadcn components are installed and available for use:

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

For more information on how to use these components, refer to the [shadcn documentation](https://ui.shadcn.com/).

## documentation

Documentation is implemented using [VitePress](https://vitepress.dev) in the `docs` folder. To start the documentation server:

```bash
npm run docs:dev
```

## Building

To create a production version of your app:

```bash
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.
