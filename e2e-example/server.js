// e2e/server.js
import 'dotenv/config'; // ADDED: Load .env variables

import express from 'express';
import { handler } from '../build/handler.js'; // Import SvelteKit handler
import { mswServer } from './mocks/server'; // Import MSW server instance

// Create an express app
const app = express();
const port = 5173;

// Start MSW server to intercept requests made by SvelteKit backend
mswServer.listen({
	onUnhandledRequest: (req) => {
		// Log unhandled requests during tests to help debugging
		// Ignore sourcemap requests which are common noise
		if (!req.url.pathname.endsWith('.map')) {
			console.error(`[MSW] Error: Found an unhandled ${req.method} request to ${req.url}`);
		}
	}
});

console.log('[Test Server] MSW Server listening...');

// Let SvelteKit handle all requests
app.use(handler);

// Start the Express server
app.listen(port, () => {
	console.log(`[Test Server] Express server listening on http://localhost:${port}`);
});
