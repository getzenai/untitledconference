import { describe, expect, it } from 'vitest';
import { applyHtmlCacheHeaders, HTML_CACHE_CONTROL } from './html-cache';
import { PUBLIC_CACHE_CONTROL } from './public-page-cache';

const html = (init: ResponseInit = {}) =>
	new Response('<!doctype html><html></html>', {
		headers: { 'content-type': 'text/html; charset=utf-8' },
		...init
	});

describe('applyHtmlCacheHeaders', () => {
	it('tells the browser to revalidate a document it was given no rule for', () => {
		const response = applyHtmlCacheHeaders(html());

		expect(response.headers.get('cache-control')).toBe(HTML_CACHE_CONTROL);
	});

	it('leaves the deliberate header on the cached public pages alone', () => {
		const response = applyHtmlCacheHeaders(
			html({
				headers: {
					'content-type': 'text/html; charset=utf-8',
					'cache-control': PUBLIC_CACHE_CONTROL
				}
			})
		);

		expect(response.headers.get('cache-control')).toBe(PUBLIC_CACHE_CONTROL);
	});

	it('says nothing about responses that are not documents', () => {
		const response = applyHtmlCacheHeaders(
			new Response('{}', { headers: { 'content-type': 'application/json' } })
		);

		expect(response.headers.get('cache-control')).toBeNull();
	});

	it('still stamps a response whose headers cannot be written', () => {
		const immutable = new Response('<!doctype html>', {
			headers: { 'content-type': 'text/html' }
		});
		Object.defineProperty(immutable, 'headers', {
			value: new Proxy(new Headers(immutable.headers), {
				get(target, property) {
					if (property === 'set') {
						return () => {
							throw new TypeError('immutable');
						};
					}
					const value = Reflect.get(target, property);
					return typeof value === 'function' ? value.bind(target) : value;
				}
			})
		});

		const response = applyHtmlCacheHeaders(immutable);

		expect(response.headers.get('cache-control')).toBe(HTML_CACHE_CONTROL);
	});
});
