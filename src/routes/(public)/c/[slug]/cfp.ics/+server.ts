import { cfpDeadlineCalendar, cfpDeadlineFilename } from '$lib/conference/cfp-deadline';
import { surfaceUrl } from '$lib/conference/embed';
import { openCall } from '$lib/server/conference/cfp-submission';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * The public call's close date as a one-event calendar download (#510).
 *
 * Sister of `agenda.ics`: same access story (the call is already on a page
 * anyone can read), same 404 for an unknown slug. The difference is the
 * disposition. The agenda is a feed a calendar subscribes to; this is a file
 * someone saves and we never see again — that is the point. No account, no
 * reminder mail, no subscription for us to keep.
 *
 * `openCall` is the same loader the CFP page uses, so a slug that 404s there
 * 404s here. A published call with no `closesAt` is also 404: there is no
 * instant to put on a calendar.
 */
export const GET: RequestHandler = async ({ params, setHeaders, url }) => {
	const call = await openCall(params.slug);
	if (!call?.form.closesAt) error(404, 'No conference with that address');

	const filename = cfpDeadlineFilename(call.conference.name, call.form.title);

	setHeaders({
		'content-type': 'text/calendar; charset=utf-8',
		'content-disposition': `attachment; filename="${filename}"`,
		// Public: the close date is already on the page. An hour is short enough
		// that moving the deadline reaches a re-download the same morning.
		'cache-control': 'public, max-age=3600'
	});

	return new Response(
		cfpDeadlineCalendar(
			{
				formId: call.form.id,
				conferenceName: call.conference.name,
				formTitle: call.form.title,
				closesAt: call.form.closesAt,
				url: surfaceUrl(url.origin, call.conference.slug, '/cfp')
			},
			new Date()
		)
	);
};
