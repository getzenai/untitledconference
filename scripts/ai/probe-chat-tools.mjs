/**
 * Asks a model the questions the chat asks, in the shape the chat sends, and
 * reports which tool comes back (#660, #696).
 *
 * The chat streams, offers its tools and leaves the choice to the model, and in
 * production that came back as `finish_reason: stop` with the tool call printed
 * into the answer as JSON (deploy run 31908823948) — while the same gateway and
 * key carried a proper tool call for a one-tool, `tool_choice: required`,
 * non-streaming request. So the shape is not a convenience: it is the only shape
 * whose result says anything about the live fault.
 *
 * This is now the deploy's only gate. The narrow request it replaced asked with
 * a 64-token ceiling, which glm-4.7-flash cannot answer — it narrates a sentence
 * before it calls, the answer was cut off mid-JSON, and Workers AI returned 400
 * on a model that had been measured working (probe run 31910437582).
 *
 * The tools and the system prompts come from `chat-tools.json`, which
 * `src/lib/server/chat/probe-payload.unit.test.ts` writes from the registry the
 * assistant actually offers. Until #696 they were two hand-written tools here,
 * while the live assistant had carried all 49 since #683 — the gate measured a
 * request the application had stopped sending.
 *
 * Two callers, one measurement:
 *   - the deploy probes the configured model on every ship,
 *   - `probe-chat-models.yaml` probes a list of candidates so a model is chosen
 *     against evidence instead of a datasheet.
 *
 *   AI_GATEWAY_BASE_URL=… AI_GATEWAY_API_KEY=… \
 *     node scripts/ai/probe-chat-tools.mjs workers-ai/@cf/… [more models…] \
 *       [--strict] [--tools=N]
 *
 * `--strict` turns "answered without a tool call" into exit 1. The deploy passes
 * it now that a model measured to pass is configured; the candidate sweep does
 * not, because there the point is to hear every candidate's answer.
 *
 * `--tools=N` cuts the offer down to N tools — the expected one plus the first
 * N-1 others — so the same question can be asked with a short list and the full
 * one. That comparison is the measurement #696 asks for; it is not what the
 * deploy sends.
 *
 * The wrong tool is reported, never fatal. "Can this model call a tool at all"
 * is a fact about the configuration and blocks the ship; "did it pick the best
 * of 49" is a quality number that moves with the wording of a description, and
 * a deploy gate that swings on that would block a good ship.
 *
 * A transport failure is never reported as a model verdict. "The gateway did
 * not answer" and "the model answered badly" are different faults with
 * different owners, and the first version of this probe printed the same
 * warning for both.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const STRICT_FLAG = '--strict';
const TOOLS_FLAG = '--tools=';

const args = process.argv.slice(2);
const strict = args.includes(STRICT_FLAG);
const toolLimitArg = args.find((a) => a.startsWith(TOOLS_FLAG));
const toolLimit = toolLimitArg ? Number(toolLimitArg.slice(TOOLS_FLAG.length)) : undefined;
const models = args.filter((a) => a !== STRICT_FLAG && !a.startsWith(TOOLS_FLAG));

const baseUrl = process.env.AI_GATEWAY_BASE_URL?.replace(/\/$/, '');
const apiKey = process.env.AI_GATEWAY_API_KEY;

if (models.length === 0) {
	console.error('usage: probe-chat-tools.mjs <model> [model…] [--strict] [--tools=N]');
	process.exit(2);
}
if (toolLimitArg && (!Number.isInteger(toolLimit) || toolLimit < 1)) {
	console.error(`--tools takes a whole number of tools, at least 1`);
	process.exit(2);
}
if (!baseUrl || !apiKey) {
	console.error('AI_GATEWAY_BASE_URL and AI_GATEWAY_API_KEY are required');
	process.exit(2);
}

const payloadPath = join(dirname(fileURLToPath(import.meta.url)), 'chat-tools.json');
const { tools: allTools, scenarios } = JSON.parse(readFileSync(payloadPath, 'utf8'));

/** The tools on offer for one scenario, in the registry's own order. */
function offeredTools(scenario) {
	if (!toolLimit || toolLimit >= allTools.length) return allTools;
	const expected = allTools.find((tool) => tool.name === scenario.expect);
	const others = allTools.filter((tool) => tool.name !== scenario.expect);
	return [expected, ...others.slice(0, toolLimit - 1)];
}

/** The chat's own tools, wording and options. */
function payload(model, scenario) {
	return {
		model,
		max_tokens: 200,
		stream: true,
		tool_choice: 'auto',
		tools: offeredTools(scenario).map((tool) => ({
			type: 'function',
			function: { name: tool.name, description: tool.description, parameters: tool.parameters }
		})),
		messages: [
			{ role: 'system', content: scenario.systemPrompt },
			{ role: 'user', content: scenario.question }
		]
	};
}

/**
 * One probe.
 *
 * `outcome` is deliberately five-valued rather than a boolean: `tool_call`,
 * `wrong_tool`, `no_tool_call`, `rejected` and `unreachable`. The first three
 * are the model's answer to the question we asked. `unreachable` means we never
 * got an answer, and a caller that folds it into a failure verdict is reporting
 * a network hiccup as a fact about a model.
 *
 * `rejected` is separate because a 401, 403 or 404 is neither: the gateway
 * answered, and what it said is that this key and this model do not fit. That
 * is the fault the deploy gate exists to catch, so it fails the run on its own
 * — with or without `--strict`, which only governs how strictly a model's
 * *answer* is judged.
 */
async function ask(model, scenario) {
	let response;
	try {
		response = await fetch(`${baseUrl}/chat/completions`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
			body: JSON.stringify(payload(model, scenario)),
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

/**
 * Adds one streamed choice to the running tally.
 *
 * A tool call arrives in pieces and only the first piece carries the name, so
 * the names are collected rather than counted: which tool was called is the
 * measurement, and an empty name is a delta that only carried arguments.
 */
function fold(state, choice) {
	for (const call of choice.delta?.tool_calls ?? []) {
		state.calls += 1;
		const name = call.function?.name;
		if (name && !state.names.includes(name)) state.names.push(name);
	}
	state.text += choice.delta?.content ?? '';
	state.finish = choice.finish_reason ?? state.finish;
}

/** What the stream carried: tool calls and their names, the answer, why it stopped. */
function readStream(raw) {
	const events = raw.split('\n').map(parseEvent).filter(Boolean);
	const state = { calls: 0, names: [], text: '', finish: '(none)', sawEvent: events.length > 0 };
	for (const event of events) fold(state, event.choices?.[0] ?? {});
	return state;
}

async function probe(model, scenario) {
	const offered = offeredTools(scenario).length;
	const { raw, failure, rejected } = await ask(model, scenario);
	if (failure) {
		return {
			model,
			scenario: scenario.id,
			offered,
			outcome: rejected ? 'rejected' : 'unreachable',
			detail: failure
		};
	}

	const { calls, names, text, finish, sawEvent } = readStream(raw);
	// 2xx with nothing parseable in it is the gateway failing, not the model
	// declining to call a tool.
	if (!sawEvent) {
		return {
			model,
			scenario: scenario.id,
			offered,
			outcome: 'unreachable',
			detail: `2xx with no readable stream events: ${raw.slice(0, 300)}`
		};
	}

	const called =
		calls === 0 ? 'no_tool_call' : names.includes(scenario.expect) ? 'tool_call' : 'wrong_tool';
	return {
		model,
		scenario: scenario.id,
		offered,
		outcome: called,
		expect: scenario.expect,
		finish,
		calls,
		names,
		text: text.slice(0, 300)
	};
}

const results = [];
for (const model of models) {
	console.log(`\n=== ${model}`);
	for (const scenario of scenarios) {
		const result = await probe(model, scenario);
		results.push(result);

		console.log(`\n--- ${scenario.id} (${result.offered} tools offered)`);
		if (result.outcome === 'rejected') {
			console.log(`rejected — ${result.detail}`);
			continue;
		}
		if (result.outcome === 'unreachable') {
			console.log(`unreachable — ${result.detail}`);
			continue;
		}
		console.log(`finish_reason: ${result.finish}`);
		console.log(`tool call deltas: ${result.calls}, named: ${JSON.stringify(result.names)}`);
		console.log(`expected: ${result.expect}`);
		console.log(`text: ${JSON.stringify(result.text)}`);
		if (result.outcome === 'tool_call') console.log('Called the tool the question asks for.');
		if (result.outcome === 'wrong_tool')
			console.log('Called a tool, but not the one the question asks for.');
		if (result.outcome === 'no_tool_call')
			console.log(
				'Answered the chat-shaped request without a tool call — this is the live fault in #660, and the text above is what a user is shown.'
			);
	}
}

const of = (outcome) =>
	results.filter((r) => r.outcome === outcome).map((r) => `${r.model}/${r.scenario}`);
const passed = of('tool_call');
const wrong = of('wrong_tool');
const failed = of('no_tool_call');
const rejected = of('rejected');
const unreachable = of('unreachable');

console.log('\n=== summary');
console.log(`expected tool: ${passed.join(', ') || '(none)'}`);
console.log(`wrong tool:    ${wrong.join(', ') || '(none)'}`);
console.log(`no tool call:  ${failed.join(', ') || '(none)'}`);
console.log(`rejected:      ${rejected.join(', ') || '(none)'}`);
console.log(`unreachable:   ${unreachable.join(', ') || '(none)'}`);

if (wrong.length > 0) {
	console.log(
		`::warning::${wrong.join(', ')} called a tool, but not the expected one — see #696 before changing a tool description.`
	);
}
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
