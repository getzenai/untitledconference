import { REST_ROUTES } from '$lib/server/mcp/rest';
import type { RequestHandler } from '@sveltejs/kit';

function escape(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export const GET: RequestHandler = () => {
	const rows = REST_ROUTES.map(
		(route) =>
			`<tr><td>${route.method}</td><td><code>/api/v1${escape(route.pattern)}</code></td><td><code>${escape(route.tool)}</code></td></tr>`
	).join('');

	const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>untitledconference API v1</title>
  <style>
    body { font: 16px/1.45 ui-sans-serif, system-ui, sans-serif; margin: 2rem auto; max-width: 52rem; color: #111; }
    code { font-family: ui-monospace, SFMono-Regular, menlo, monospace; font-size: 0.92em; }
    table { border-collapse: collapse; width: 100%; margin-top: 1.5rem; }
    th, td { text-align: left; padding: 0.4rem 0.6rem; border-bottom: 1px solid #ddd; vertical-align: top; }
    th { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.04em; color: #555; }
    pre { background: #f4f4f5; padding: 0.9rem 1rem; overflow: auto; }
  </style>
</head>
<body>
  <h1>untitledconference API v1</h1>
  <p>The same tools as the MCP server at <code>/api/v1/mcp</code>, as resource routes. Authenticate with the OAuth bearer token that has scope <code>mcp:tools</code>.</p>
  <pre>curl -H "Authorization: Bearer $TOKEN" /api/v1/conferences</pre>
  <p><a href="/api/v1/openapi.json">OpenAPI 3.1 spec</a></p>
  <table>
    <thead><tr><th>Method</th><th>Path</th><th>Tool</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;

	return new Response(html, {
		headers: { 'Content-Type': 'text/html; charset=utf-8' }
	});
};
