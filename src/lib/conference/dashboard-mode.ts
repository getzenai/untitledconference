/**
 * Day one is a different screen, not an emptier one (#473).
 *
 * The dashboard answers "what is stuck". Until something is waiting there is
 * nothing to measure — rooms and the call are still the work. Tracks are
 * optional; a conference can run without them.
 *
 * "Nothing to measure" is not "no submission". A speaker added by hand, a
 * queued or failed mail, or an open task is already work — speaker sourcing
 * does not go through the call. Any of those flips. After that the metric
 * tiles stay, even when every count is zero.
 */

export type DashboardMode = 'setup' | 'measure';

/** Counts that mean the organizer is past setup. */
export type DashboardWaiting = {
	submissions: number;
	speakers: number;
	queuedMail: number;
	failedMail: number;
	tasks: number;
};

export function dashboardMode(waiting: DashboardWaiting): DashboardMode {
	return Object.values(waiting).some((n) => n > 0) ? 'measure' : 'setup';
}

export type SetupProgress = {
	rooms: number;
	tracks: number;
	cfpOpen: boolean;
};

/** Rooms, then the call. Tracks can be added but do not block the next step. */
export type SetupStep = 'rooms' | 'cfp' | 'ready';

export function nextSetupStep(progress: SetupProgress): SetupStep {
	if (progress.rooms === 0) return 'rooms';
	if (!progress.cfpOpen) return 'cfp';
	return 'ready';
}
