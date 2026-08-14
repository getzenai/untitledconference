/**
 * Which clock the person in front of this screen is on.
 *
 * The server cannot know, so it renders `SERVER_ZONE` and the browser corrects
 * it after mount. That order is deliberate: reading the zone during init would
 * make the client's first render differ from the SSR markup, which is the
 * hydration mismatch `public-view` already warns about — and here it would
 * corrupt a deadline rather than a session time. Both texts are true while the
 * swap happens, because each names the zone it used.
 *
 * A factory, not module state: a `$state` at module scope on the server is
 * shared by every request that touches the module.
 */
import { SERVER_ZONE } from '$lib/conference/deadline';
import { onMount } from 'svelte';

export function readerZone(): { readonly current: string } {
	let zone = $state(SERVER_ZONE);

	onMount(() => {
		zone = Intl.DateTimeFormat().resolvedOptions().timeZone || SERVER_ZONE;
	});

	return {
		get current() {
			return zone;
		}
	};
}
