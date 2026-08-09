/**
 * AI crawler / bot detection from the request User-Agent.
 *
 * Client-side analytics only sees traffic that executes JavaScript, so non-JS
 * crawlers (LLM training/indexing bots, search engines) are invisible to it.
 * This module classifies known crawlers from the server, so they can be logged,
 * counted or turned away explicitly.
 *
 * Classification is derived entirely from the User-Agent, which each operator
 * publishes per crawler. It is therefore spoofable: treat the signal as
 * directional. To verify a match, cross-check the request IP against the
 * operator's published ranges or use forward-confirmed reverse DNS.
 */

/**
 * What a crawler is fetching for.
 * - `ai_answer`: live, user-triggered fetch (a user asked an AI assistant and
 *   it fetched the page to answer)
 * - `indexing`: building/refreshing a search or answer index
 * - `training`: bulk collection of content for model training
 */
export type CrawlerCategory = 'ai_answer' | 'indexing' | 'training';

export interface CrawlerInfo {
	/** Crawler name as published by the operator (e.g. "GPTBot") */
	name: string;
	/** Company operating the crawler (e.g. "OpenAI") */
	operator: string;
	/** What the crawler is fetching for */
	category: CrawlerCategory;
}

/**
 * Known AI/search crawlers, matched against the User-Agent.
 *
 * Order matters: more specific patterns must precede generic ones (e.g.
 * `Claude-SearchBot` before `ClaudeBot`, `Applebot-Extended` before
 * `Applebot`). The first match wins.
 *
 * Note: `Google-Extended` and `Applebot-Extended` are robots.txt tokens that
 * control training opt-out, not User-Agents you will observe in requests.
 * Google training crawls are observed via `GoogleOther` instead.
 */
const CRAWLERS: { pattern: RegExp; info: CrawlerInfo }[] = [
	// OpenAI — three distinct bots, three purposes
	{ pattern: /GPTBot/i, info: { name: 'GPTBot', operator: 'OpenAI', category: 'training' } },
	{
		pattern: /OAI-SearchBot/i,
		info: { name: 'OAI-SearchBot', operator: 'OpenAI', category: 'indexing' }
	},
	{
		pattern: /ChatGPT-User/i,
		info: { name: 'ChatGPT-User', operator: 'OpenAI', category: 'ai_answer' }
	},
	// Anthropic
	{
		pattern: /Claude-SearchBot/i,
		info: { name: 'Claude-SearchBot', operator: 'Anthropic', category: 'indexing' }
	},
	{
		pattern: /Claude-User/i,
		info: { name: 'Claude-User', operator: 'Anthropic', category: 'ai_answer' }
	},
	{
		pattern: /ClaudeBot/i,
		info: { name: 'ClaudeBot', operator: 'Anthropic', category: 'training' }
	},
	{
		pattern: /anthropic-ai/i,
		info: { name: 'anthropic-ai', operator: 'Anthropic', category: 'training' }
	},
	// Perplexity
	{
		pattern: /Perplexity-User/i,
		info: { name: 'Perplexity-User', operator: 'Perplexity', category: 'ai_answer' }
	},
	{
		pattern: /PerplexityBot/i,
		info: { name: 'PerplexityBot', operator: 'Perplexity', category: 'indexing' }
	},
	// Google
	{
		pattern: /GoogleOther/i,
		info: { name: 'GoogleOther', operator: 'Google', category: 'training' }
	},
	{ pattern: /Googlebot/i, info: { name: 'Googlebot', operator: 'Google', category: 'indexing' } },
	// Microsoft
	{ pattern: /bingbot/i, info: { name: 'Bingbot', operator: 'Microsoft', category: 'indexing' } },
	// Apple
	{
		pattern: /Applebot-Extended/i,
		info: { name: 'Applebot-Extended', operator: 'Apple', category: 'training' }
	},
	{ pattern: /Applebot/i, info: { name: 'Applebot', operator: 'Apple', category: 'indexing' } },
	// Others
	{ pattern: /Amazonbot/i, info: { name: 'Amazonbot', operator: 'Amazon', category: 'indexing' } },
	{
		pattern: /Bytespider/i,
		info: { name: 'Bytespider', operator: 'ByteDance', category: 'training' }
	},
	{ pattern: /CCBot/i, info: { name: 'CCBot', operator: 'CommonCrawl', category: 'training' } },
	{
		pattern: /meta-externalagent/i,
		info: { name: 'meta-externalagent', operator: 'Meta', category: 'training' }
	},
	{
		pattern: /DuckAssistBot/i,
		info: { name: 'DuckAssistBot', operator: 'DuckDuckGo', category: 'ai_answer' }
	},
	{
		pattern: /DuckDuckBot/i,
		info: { name: 'DuckDuckBot', operator: 'DuckDuckGo', category: 'indexing' }
	}
];

/**
 * Identify a known AI/search crawler from a User-Agent string.
 * @returns the crawler info, or `null` if the UA is empty or unrecognised.
 */
export function detectAiCrawler(userAgent: string | null | undefined): CrawlerInfo | null {
	if (!userAgent) {
		return null;
	}
	return CRAWLERS.find(({ pattern }) => pattern.test(userAgent))?.info ?? null;
}
