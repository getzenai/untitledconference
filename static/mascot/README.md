# Mascot

The goose people see in the product is
[`src/lib/components/goose.svelte`](../../src/lib/components/goose.svelte) — landing page,
sidebar header, empty states. It is a component and not a file so it can carry the dark
palette and the click easter egg.

`goose.svg` is the same geometry with the light palette baked in, for places that cannot
render Svelte: README, marketing, favicons, anything pasted into a slide. When the component's
drawing changes, change this file with it.

Two other marks used to live here — a circular signet and a goose holding a quill. Nothing
rendered them, and the signet in the sidebar meant signing in changed the bird (#562). They
are gone; git has them if a lockup mark is ever wanted for real.
