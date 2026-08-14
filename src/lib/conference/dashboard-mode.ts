/**
 * Day one is a different screen, not an emptier one (#473).
 *
 * The dashboard answers "what is stuck" in the submissions pipeline. Until a
 * submission exists there is nothing to measure — rooms, tracks and the call
 * are still the work. The first submission is the flip. After that the metric
 * tiles stay, even when every count is zero.
 */

export type DashboardMode = 'setup' | 'measure';

export function dashboardMode(submissions: number): DashboardMode {
	return submissions > 0 ? 'measure' : 'setup';
}

export type SetupProgress = {
	rooms: number;
	tracks: number;
	cfpOpen: boolean;
};

/** The create form's order: rooms, tracks, then the call. */
export type SetupStep = 'rooms' | 'tracks' | 'cfp' | 'ready';

export function nextSetupStep(progress: SetupProgress): SetupStep {
	if (progress.rooms === 0) return 'rooms';
	if (progress.tracks === 0) return 'tracks';
	if (!progress.cfpOpen) return 'cfp';
	return 'ready';
}
