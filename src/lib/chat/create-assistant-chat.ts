/**
 * The in-panel Chat instance. Created on first open, kept by the launcher
 * so closing the sheet does not throw the transcript away (#728).
 *
 * Page context is read at send time, not at construction — same rule as the
 * panel: the first page the user opened must not stick to later turns.
 */
import { page } from '$app/state';
import { pageContext, visiblePageTitle } from '$lib/chat/page-context';
import { pageFocus } from '$lib/chat/page-focus.svelte';
import { Chat } from '@ai-sdk/svelte';
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses } from 'ai';

export function createAssistantChat(): Chat {
	return new Chat({
		transport: new DefaultChatTransport({
			api: '/chat',
			body: () => {
				const context = pageContext({
					routeId: page.route.id,
					url: page.url,
					params: page.params,
					title: visiblePageTitle(document),
					focus: pageFocus(page.route.id)
				});
				return context ? { pageContext: context } : {};
			}
		}),
		sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses
	});
}
