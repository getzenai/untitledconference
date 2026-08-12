/**
 * Known task meanings that have richer speaker-portal workflows.
 *
 * Task templates currently store no semantic type beyond action/file request,
 * so keep title matching deliberately narrow. An organizer's custom action must
 * never turn into a participation decision just because it contains a keyword.
 */
function normalizedTitle(title: string): string {
	return title.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
}

export function isParticipationTaskTitle(title: string): boolean {
	return normalizedTitle(title) === 'confirm participation';
}

export function isProfileTaskTitle(title: string): boolean {
	return normalizedTitle(title) === 'complete bio and profile';
}
