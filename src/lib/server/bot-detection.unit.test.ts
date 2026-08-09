import { describe, expect, it } from 'vitest';
import { detectAiCrawler } from './bot-detection';

describe('detectAiCrawler', () => {
	it('returns null for empty or missing user agents', () => {
		expect(detectAiCrawler(null)).toBeNull();
		expect(detectAiCrawler(undefined)).toBeNull();
		expect(detectAiCrawler('')).toBeNull();
	});

	it('returns null for a normal human browser', () => {
		const chrome =
			'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
		expect(detectAiCrawler(chrome)).toBeNull();
	});

	it('classifies an ai_answer crawler (live user-triggered fetch)', () => {
		const ua =
			'Mozilla/5.0 AppleWebKit/537.36 (compatible; ChatGPT-User/1.0; +https://openai.com/bot)';
		expect(detectAiCrawler(ua)).toEqual({
			name: 'ChatGPT-User',
			operator: 'OpenAI',
			category: 'ai_answer'
		});
	});

	it('classifies an indexing crawler', () => {
		const ua = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
		expect(detectAiCrawler(ua)).toEqual({
			name: 'Googlebot',
			operator: 'Google',
			category: 'indexing'
		});
	});

	it('classifies a training crawler', () => {
		const ua =
			'Mozilla/5.0 AppleWebKit/537.36 (compatible; GPTBot/1.2; +https://openai.com/gptbot)';
		expect(detectAiCrawler(ua)).toEqual({
			name: 'GPTBot',
			operator: 'OpenAI',
			category: 'training'
		});
	});

	it('prefers the more specific pattern over the generic one', () => {
		// Claude-SearchBot must not be misclassified as the generic ClaudeBot.
		const searchBot = 'Mozilla/5.0 (compatible; Claude-SearchBot/1.0; +https://anthropic.com)';
		expect(detectAiCrawler(searchBot)).toMatchObject({
			name: 'Claude-SearchBot',
			category: 'indexing'
		});

		const trainingBot = 'Mozilla/5.0 (compatible; ClaudeBot/1.0; +https://anthropic.com)';
		expect(detectAiCrawler(trainingBot)).toMatchObject({
			name: 'ClaudeBot',
			category: 'training'
		});
	});

	it('matches case-insensitively', () => {
		expect(detectAiCrawler('perplexitybot/1.0')).toMatchObject({ name: 'PerplexityBot' });
	});
});
