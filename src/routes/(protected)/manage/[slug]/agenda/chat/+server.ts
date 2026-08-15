import { handleAgendaChatRequest } from '$lib/server/chat/request';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	return handleAgendaChatRequest(event);
};
