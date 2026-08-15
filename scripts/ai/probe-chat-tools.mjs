/**
 * Asks a model the question the reviewer chat asks, in the shape the reviewer
 * chat sends, and reports whether a tool call comes back (#660).
 *
 * The reviewer chat streams, offers several tools and leaves the choice to the
 * model, and in production that came back as `finish_reason: stop` with the tool
 * call printed into the answer as JSON (deploy run 31908823948) — while the same
 * gateway and key carried a proper tool call for a one-tool, `tool_choice:
 * required`, non-streaming request. So the shape below is not a convenience: it
 * is the only shape whose result says anything about the live fault. It was
 * captured from the wire in front of `streamText`
 * (src/lib/server/chat/request.ts).
 *
 * This is now the deploy's only gate. The narrow request it replaced asked with
 * a 64-token ceiling, which glm-4.7-flash cannot answer — it narrates a sentence
 * before it calls, the answer was cut off mid-JSON, and Workers AI returned 400
 * on a model that had been measured working (probe run 31910437582).
 *
 * Two callers, one measurement:
 *   - the deploy probes the configured model on every ship,
 *   - `probe-chat-models.yaml` probes a list of candidates so a model is chosen
 *     against evidence instead of a datasheet.
 *
 *   AI_GATEWAY_BASE_URL=… AI_GATEWAY_API_KEY=… \
 *     node scripts/ai/probe-chat-tools.mjs workers-ai/@cf/… [more models…] [--strict]
 *
 * `--strict` turns "answered without a tool call" into exit 1. The deploy passes
 * it now that a model measured to pass is configured; the candidate sweep does
 * not, because there the point is to hear every candidate's answer.
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
 * `outcome` is deliberately four-valued rather than a boolean: `tool_call`,
 * `no_tool_call`, `rejected` and `unreachable`. The first two are the model's
 * answer to the question we asked. `unreachable` means we never got an answer,
 * and a caller that folds it into a failure verdict is reporting a network
 * hiccup as a fact about a model.
 *
 * `rejected` is the fourth because a 401, 403 or 404 is neither: the gateway
 * answered, and what it said is that this key and this model do not fit. That
 * is the fault the deploy gate exists to catch, so it fails the run on its own
 * — with or without `--strict`, which only governs how strictly a model's
 * *answer* is judged.
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
	if (!response.ok) {
		// 408, 429 and 5xx are the gateway having a bad minute; everything else it
		// answered on purpose, and it is telling us the configuration is wrong.
		const transient = response.status === 408 || response.status === 429 || response.status >= 500;
		return {
			failure: `HTTP ${response.status}: ${raw.slice(0, 300)}`,
			rejected: !transient
		};
	}
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
	const { raw, failure, rejected } = await ask(model);
	if (failure) return { model, outcome: rejected ? 'rejected' : 'unreachable', detail: failure };

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
	if (result.outcome === 'rejected') {
		console.log(`rejected — ${result.detail}`);
		continue;
	}
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
const rejected = results.filter((r) => r.outcome === 'rejected').map((r) => r.model);
const unreachable = results.filter((r) => r.outcome === 'unreachable').map((r) => r.model);

console.log('\n=== summary');
console.log(`tool call:    ${passed.join(', ') || '(none)'}`);
console.log(`no tool call: ${failed.join(', ') || '(none)'}`);
console.log(`rejected:     ${rejected.join(', ') || '(none)'}`);
console.log(`unreachable:  ${unreachable.join(', ') || '(none)'}`);

if (failed.length > 0) {
	const message = `${failed.join(', ')} answered the chat-shaped request without a tool call.`;
	console.log(strict ? `::error::${message}` : `::warning::${message}`);
}
if (rejected.length > 0) {
	console.log(
		`::error::The gateway refused ${rejected.join(', ')} — AI_GATEWAY_API_KEY does not fit the model, or AI_GATEWAY_BASE_URL is wrong.`
	);
}
if (unreachable.length > 0) {
	console.log(`::warning::No verdict for ${unreachable.join(', ')} — the gateway did not answer.`);
}

// Unreachable never fails the run: it says nothing about the model, and a deploy
// that stops because a probe timed out is a false alarm with a real cost. A
// refusal does fail it even without `--strict`: the gateway answered, and the
// answer was that the configuration is wrong.
process.exit(rejected.length > 0 || (strict && failed.length > 0) ? 1 : 0);
