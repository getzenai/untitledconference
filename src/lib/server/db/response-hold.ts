/**
 * Keeps a request's database connection alive for as long as its response body
 * is still being produced.
 *
 * A streamed response hands back its headers immediately and fills its body
 * afterwards. The request scope closes on the headers, so anything that queries
 * while the body streams — the chat calling tools — lost its connection halfway
 * through (#684). Wrapping the body turns "the response object exists" into
 * "the response is finished", which is the moment the connection is actually
 * free.
 *
 * The wrapper reads the source rather than piping through a transform because
 * it has to settle on all three endings: the body ran out, it errored, or the
 * client hung up. A hold that never settles would keep the socket until the
 * isolate dies.
 */
import { holdRequestScopedDb } from './index';

export function holdUntilResponseComplete(response: Response): Response {
	const source = response.body;
	if (!source) return response;

	let settle: () => void = () => {};
	holdRequestScopedDb(
		new Promise<void>((resolve) => {
			settle = resolve;
		})
	);

	const reader = source.getReader();
	const tracked = new ReadableStream({
		async pull(controller) {
			try {
				const { done, value } = await reader.read();
				if (done) {
					controller.close();
					settle();
					return;
				}
				controller.enqueue(value);
			} catch (error) {
				settle();
				controller.error(error);
			}
		},
		cancel(reason) {
			settle();
			return reader.cancel(reason);
		}
	});

	// `new Response(body, response)` copies status and headers; the body is the
	// only thing replaced.
	return new Response(tracked, response);
}
