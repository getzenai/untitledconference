/**
 * Asks a model the question the reviewer chat asks, in the shape the reviewer
 * chat sends, and reports whether a tool call comes back (#660).
 *
 * The deploy already proved that the gateway and the key can carry a tool call:
 * one tool, `tool_choice: required`, no streaming — and that request works. The
 * reviewer chat sends a different request. It streams, it offers several tools
 * and it leaves the choice to the model, and in production that came back as
 * `finish_reason: stop` with the tool call printed into the answer as JSON
 * (deploy run 31908823948). So the shape below is not a convenience: it is the
 * only shape whose result says anything about the live fault. It was captured
 * from the wire in front of `streamText` (src/lib/server/chat/request.ts).
 *
 * Two callers, one measurement:
 *   - the deploy probes the configured model on every ship,
 *   - `probe-chat-models.yaml` probes a list of candidates so a model is chosen
 *     against evidence instead of a datasheet.
 *
 *   AI_GATEWAY_BASE_URL=… AI_GATEWAY_API_KEY=… \
 *     node scripts/ai/probe-chat-tools.mjs workers-ai/@cf/… [more models…] [--strict]
 *
 * `--strict` turns "answered without a tool call" into exit 1. The deploy will
 * pass it once a model that passes is configured; until then the deploy only
 * reports, because a gate in front of a fault nobody has fixed yet stops every
 * unrelated deploy and fixes nothing.
 *
 * A transport failure is never reported as a model verdict. "The gateway did
 * not answer" and "the model answered badly" are different faults with
 * different owners, and the first version of this probe printed the same
 * warning for both.
 */
const STRICT_FLAG = '--strict';

const args = process.argv.slice(2);
const strict = args.includes(STRICT_FLAG);
const models = args.filter((a) => a !== STRICT_FLAG);

const baseUrl = process.env.AI_GATEWAY_BASE_URL?.replace(/\/$/, '');
const apiKey = process.env.AI_GATEWAY_API_KEY;

if (models.length === 0) {
	console.error('usage: probe-chat-tools.mjs <model> [model…] [--strict]');
	process.exit(2);
}
if (!baseUrl || !apiKey) {
	console.error('AI_GATEWAY_BASE_URL and AI_GATEWAY_API_KEY are required');
	process.exit(2);
}

/** The reviewer chat's own tools, wording and options. */
function payload(model) {
	return {
		model,
		max_tokens: 200,
		stream: true,
		tool_choice: 'auto',
		tools: [
			{
				type: 'function',
				function: {
					name: 'list_my_review_assignments',
					description: 'List the review assignments of the signed-in reviewer.',
					parameters: { type: 'object', properties: {}, additionalProperties: false }
				}
			},
			{
				type: 'function',
				function: {
					name: 'get_review_assignment',
					description: 'Open one assigned scorecard.',
					parameters: {
						type: 'object',
						properties: { submissionId: { type: 'number', description: 'Submission id.' } },
						required: ['submissionId'],
						additionalProperties: false
					}
				}
			}
		],
		messages: [
			{
				role: 'system',
				content:
					'You are a review assistant for "DevFlow Conf" (devflow-conf-2027). You can list assignments and open an assigned scorecard. When you use a tool, name it in the answer.'
			},
			{ role: 'user', content: 'Which reviews do I still have open?' }
		]
	};
}

/**
 * One probe.
 *
 * `outcome` is deliberately three-valued rather than a boolean: `tool_call`,
 * `no_tool_call` and `unreachable`. The middle one is the model's answer to the
 * question we asked; the last one means we never got an answer, and a caller
 * that folds it into a failure verdict is reporting a network hiccup as a fact
 * about a model.
 */
async function ask(model) {
	let response;
	try {
		response = await fetch(`${baseUrl}/chat/completions`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
			body: JSON.stringify(payload(model)),
			signal: AbortSignal.timeout(60_000)
		});
	} catch (error) {
		return { failure: `request failed: ${error}` };
	}
	const raw = await response.text();
	if (!response.ok) return { failure: `HTTP ${response.status}: ${raw.slice(0, 300)}` };
	return { raw };
}

/** The JSON of one `data:` line, or null for anything that is not one. */
function parseEvent(line) {
	if (!line.startsWith('data: ')) return null;
	const chunk = line.slice(6).trim();
	if (chunk === '[DONE]') return null;
	try {
		return JSON.parse(chunk);
	} catch {
		return null;
	}
}

/** Adds one streamed choice to the running tally. */
function fold(state, choice) {
	state.calls += choice.delta?.tool_calls?.length ?? 0;
	state.text += choice.delta?.content ?? '';
	state.finish = choice.finish_reason ?? state.finish;
}

/** What the stream carried: tool call deltas, the visible answer, why it stopped. */
function readStream(raw) {
	const events = raw.split('\n').map(parseEvent).filter(Boolean);
	const state = { calls: 0, text: '', finish: '(none)', sawEvent: events.length > 0 };
	for (const event of events) fold(state, event.choices?.[0] ?? {});
	return state;
}

async function probe(model) {
	const { raw, failure } = await ask(model);
	if (failure) return { model, outcome: 'unreachable', detail: failure };

	const { calls, text, finish, sawEvent } = readStream(raw);
	// 2xx with nothing parseable in it is the gateway failing, not the model
	// declining to call a tool.
	if (!sawEvent) {
		return {
			model,
			outcome: 'unreachable',
			detail: `2xx with no readable stream events: ${raw.slice(0, 300)}`
		};
	}

	return {
		model,
		outcome: calls > 0 ? 'tool_call' : 'no_tool_call',
		finish,
		calls,
		text: text.slice(0, 300)
	};
}

const results = [];
for (const model of models) {
	const result = await probe(model);
	results.push(result);

	console.log(`\n=== ${model}`);
	if (result.outcome === 'unreachable') {
		console.log(`unreachable — ${result.detail}`);
		continue;
	}
	console.log(`finish_reason: ${result.finish}`);
	console.log(`tool_call deltas: ${result.calls}`);
	console.log(`text: ${JSON.stringify(result.text)}`);
	console.log(
		result.outcome === 'tool_call'
			? 'Streaming with tool_choice auto carries a tool call.'
			: 'Answered the chat-shaped request without a tool call — this is the live fault in #660, and the text above is what a reviewer is shown.'
	);
}

const passed = results.filter((r) => r.outcome === 'tool_call').map((r) => r.model);
const failed = results.filter((r) => r.outcome === 'no_tool_call').map((r) => r.model);
const unreachable = results.filter((r) => r.outcome === 'unreachable').map((r) => r.model);

console.log('\n=== summary');
console.log(`tool call:    ${passed.join(', ') || '(none)'}`);
console.log(`no tool call: ${failed.join(', ') || '(none)'}`);
console.log(`unreachable:  ${unreachable.join(', ') || '(none)'}`);

if (failed.length > 0) {
	const message = `${failed.join(', ')} answered the chat-shaped request without a tool call.`;
	console.log(strict ? `::error::${message}` : `::warning::${message}`);
}
if (unreachable.length > 0) {
	console.log(`::warning::No verdict for ${unreachable.join(', ')} — the gateway did not answer.`);
}

// Unreachable never fails the run: it says nothing about the model, and a deploy
// that stops because a probe timed out is a false alarm with a real cost.
process.exit(strict && failed.length > 0 ? 1 : 0);
