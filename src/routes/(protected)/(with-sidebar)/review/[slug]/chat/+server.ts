import { handleReviewerChatRequest } from '$lib/server/chat/request';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	return handleReviewerChatRequest(event);
};
