/**
 * #280: SSR used to resolve every request to `en` because the default URL
 * pattern matches any path and returns the base locale, so `preferredLanguage`
 * never ran. These tests go through the same middleware the handle uses.
 */
import { paraglideMiddleware } from '$lib/paraglide/server';
import { describe, expect, it } from 'vitest';

function request(path: string, acceptLanguage?: string) {
	const url = new URL(`http://localhost${path}`);
	const headers = new Headers();
	if (acceptLanguage !== undefined) headers.set('accept-language', acceptLanguage);
	return new Request(url, { headers });
}

async function renderedHtml(path: string, acceptLanguage?: string) {
	const response = await paraglideMiddleware(request(path, acceptLanguage), ({ locale }) => {
		return new Response(`<!doctype html><html lang="${locale}"></html>`);
	});
	return {
		status: response.status,
		location: response.headers.get('location'),
		html: await response.text()
	};
}

describe('SSR locale negotiation (#280)', () => {
	it('renders German HTML when Accept-Language prefers de and the path has no locale', async () => {
		const { status, html } = await renderedHtml('/', 'de-DE,de;q=0.9');
		expect(status).toBe(200);
		expect(html).toContain('lang="de"');
	});

	it('renders English HTML when no Accept-Language header is sent', async () => {
		const { status, html } = await renderedHtml('/');
		expect(status).toBe(200);
		expect(html).toContain('lang="en"');
	});

	it('lets the URL win when the locale is in the path, even against an English header', async () => {
		const { status, html } = await renderedHtml('/de/c/example', 'en-US,en;q=0.9');
		expect(status).toBe(200);
		expect(html).toContain('lang="de"');
	});

	it('does not redirect an unprefixed path onto /de/ just because the header is German', async () => {
		const { status, location } = await renderedHtml('/c/example', 'de-DE,de;q=0.9');
		expect(status).toBe(200);
		expect(location).toBeNull();
	});
});
