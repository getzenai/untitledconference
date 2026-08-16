/**
 * The `fetch` an organization's own chat backend is called through.
 *
 * `createChatModel` hands this to `createOpenAI` when the request goes to a
 * backend the org typed in, and only then — the hosted AI Gateway is ours and
 * needs no guard. Checking the URL once at save time is not enough: the record
 * behind the name can change afterwards, and the backend can answer with a
 * redirect. So the address rules run again here, per request and per hop.
 *
 * Redirects are followed, never blindly: `redirect: 'manual'` hands the 3xx
 * back, and the target goes through the same check as the original before it
 * is called. A backend that redirects public → private is refused at the hop,
 * not after it. What this does not close is DNS rebinding — the module
 * comment in `org-ai-url.ts` says why, and it is worth reading before treating
 * this file as a boundary.
 */
import type { ResolveHostAddresses } from './org-ai-dns';
import { assertResolvedChatBackendUrl, ChatBackendAddressError } from './org-ai-url';

/**
 * Enough for a provider that normalises a path or moves a host, far short of
 * a loop. Each hop costs a DNS lookup.
 */
const MAX_REDIRECTS = 3;

const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);

export function createGuardedChatBackendFetch(
	options: {
		fetchImpl?: typeof fetch;
		resolve?: ResolveHostAddresses;
		nodeEnv?: string;
		maxRedirects?: number;
	} = {}
): typeof fetch {
	const call = options.fetchImpl ?? fetch;
	const maxRedirects = options.maxRedirects ?? MAX_REDIRECTS;

	return async (input, init) => {
		const original = new Request(input as RequestInfo, init);
		let url = original.url;
		let method = original.method;
		let headers = new Headers(original.headers);
		// Buffered once, because a redirect has to send it again and a stream
		// can only be read once. The body here is a chat completion request —
		// JSON, not an upload.
		let body: ArrayBuffer | undefined = bodylessMethod(method)
			? undefined
			: await original.arrayBuffer();

		for (let hop = 0; ; hop++) {
			await assertResolvedChatBackendUrl(url, {
				nodeEnv: options.nodeEnv,
				resolve: options.resolve
			});
			const response = await call(url, {
				method,
				headers,
				body,
				redirect: 'manual',
				signal: original.signal
			});

			const location = REDIRECT_STATUS.has(response.status)
				? response.headers.get('location')
				: null;
			if (!location) return response;
			if (hop >= maxRedirects) {
				throw new ChatBackendAddressError(
					`The backend redirected more than ${maxRedirects} times.`
				);
			}

			url = new URL(location, url).href;
			if (dropsBody(response.status, method)) {
				method = method === 'HEAD' ? 'HEAD' : 'GET';
				body = undefined;
				headers = withoutBodyHeaders(headers);
			}
		}
	};
}

function bodylessMethod(method: string): boolean {
	return method === 'GET' || method === 'HEAD';
}

/**
 * 307 and 308 exist to keep the method and the body; 303 exists to drop them;
 * 301 and 302 are specified to keep them but are universally implemented as
 * dropping them for a POST, and every provider is written against that.
 */
function dropsBody(status: number, method: string): boolean {
	if (status === 307 || status === 308) return false;
	return !bodylessMethod(method) || status === 303;
}

function withoutBodyHeaders(headers: Headers): Headers {
	const next = new Headers(headers);
	next.delete('content-type');
	next.delete('content-length');
	return next;
}
