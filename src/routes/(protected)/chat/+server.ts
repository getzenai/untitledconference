import { handleAssistantChatRequest } from '$lib/server/chat/assistant';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	return handleAssistantChatRequest(event);
};
