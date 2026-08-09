# Design system — Untitled Conference

Two halves, and the second one is the important one:

1. **Foundations** — the tokens. Colour, type, spacing, radius. Mostly inherited from
   shadcn-svelte; we change little on purpose.
2. **Rules** — where things go and how many of them there may be. This half is what keeps
   twenty screens looking like one product, and it is the half a component library cannot
   give you.

> The product speaks **English**. This document is the only place where a design decision is
> written down; if a screen contradicts it, the screen is wrong.

**The values live in [`design/tokens.json`](../design/tokens.json)**, in the W3C Design Tokens
(DTCG) format — the format Figma, Penpot, Sketch, Tokens Studio and Style Dictionary all read.
That file is the source of truth. `src/app.css` is generated from it by `npm run tokens`, and a
unit test regenerates and compares, so editing the CSS by hand fails CI instead of quietly
becoming a second palette. See §4.

**To look at it, run the app and open `/styleguide`.** That page reads the same token file and renders the real components, so it cannot show you something the product does not do.

---

## 1. Foundations

### Colour

The base stays **neutral and quiet**. This is a working tool: an organizer looks at it for
hours, and the only things that may shout are status and the primary action.

```
--background   near-white          --foreground   near-black ink
--muted        surface for rails, table headers, disabled areas
--primary      near-black — the action colour
--act          goose yellow — see below
--border       hairline, never a box shadow where a border does
```

**`--act` is the one warm surface in the product, and it is rationed.** It marks the action
that _creates_ something — new conference, publish the call for papers, submit a talk — and the
dot that says "new, you have not seen this". On a screen it appears at most once. The rule
comes from the mascot: on a goose the bill is a small part of the bird, and that is the
proportion we allow it on a page.

Two things it may never do:

- **carry white text.** White on `--act` is 2.03:1. The label is always ink-black
  (`--act-foreground`, 9.79:1). Do not darken the yellow to make white work; invert the text.
- **be a foreground colour itself.** `text-act` on the page background is 2.02:1 — below
  even the 3:1 floor for icons, so a `text-act` star is a star nobody can see. It is a
  surface: `bg-act text-act-foreground`. For an indicator, `--status-warn` is the usual
  answer. Checked by `src/lib/design/act-usage.unit.test.ts`.
- **stand next to a filled `--primary` button.** It _replaces_ the primary on that screen, so
  R1 still holds — one filled button, it is simply the warm one.

**Status colours are semantic tokens, not Tailwind classes picked per screen.** There are
exactly six, and each one means one thing everywhere:

| Token               | Meaning                  | Used for                            |
| ------------------- | ------------------------ | ----------------------------------- |
| `--status-neutral`  | nothing has happened yet | draft, not started, unassigned      |
| `--status-progress` | someone is working on it | in review, submitted, tentative     |
| `--status-good`     | settled, positive        | accepted, confirmed, approved, done |
| `--status-warn`     | needs a human soon       | waiting, overdue, pending approval  |
| `--status-bad`      | settled, negative        | rejected, withdrawn, failed         |
| `--status-internal` | **never public**         | sponsor tier, internal notes        |

`--status-internal` is not decoration. Everything wearing it is excluded from every public
surface and from the reviewer's view. One colour, one rule, checked in one place.

Two neighbours that are deliberately different colours: **`--status-warn` is orange and means
warning, `--act` is yellow and means act.** Warn was moved from hue 75 to 55 so the two cannot
be confused at a glance. **`--status-bad` and `--destructive` are red** and stay red — losing
something is not the same as being warned about it.

The `--chart-*` tokens are a data-series ramp, not status. They carry no meaning of their own
and must never be used to say "this is bad" — that is what the status tokens are for.

Every foreground/background pair above is asserted at ≥4.5:1 and the focus ring at ≥3:1, in
both light and dark, by `src/lib/design/tokens.unit.test.ts`. A colour that fails is a failing
test.

### Type

One family (the system stack), four sizes. A conference tool is a reading tool; more sizes
means more decisions and no more clarity.

| Role           | Size      | Weight     |
| -------------- | --------- | ---------- |
| Page title     | `text-lg` | 600        |
| Section title  | `text-sm` | 600        |
| Body / table   | `text-sm` | 400        |
| Meta, captions | `text-xs` | 400, muted |

> This table used to specify `text-[13.5px]` for body text. No screen ever used it — the
> product has always been `text-sm`. The doc now says what the code does; a scale nobody
> follows is not a scale.

Numbers in tables are `tabular-nums`. A column of counts that jitters is unreadable.

### Spacing and density

`4px` grid. Two densities, and only two:

- **Reading density** (public pages, forms, portal): generous — `py-2.5` rows, `gap-6`.
- **Working density** (submissions table, reviewer queue, agenda): tight — `py-2` rows,
  `gap-4`. These screens are judged on how many rows fit on one screen.

### Radius and elevation

`--radius: 0.625rem` inherited. **Borders, not shadows.** Shadow is reserved for things that
genuinely float above the page: popovers, dialogs, the block being dragged in the agenda.
A card that casts a shadow while sitting still is lying about its state.

---

## 2. Rules

### R1 · One primary action per screen

Exactly one filled button. Everything else is outline or ghost. If two things seem equally
primary, the screen is doing two jobs and should be split.

### R2 · Where the action goes

| Situation                                                  | Placement                                                                        |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Acts on the **whole page** (Save, Publish, New conference) | top right, in the header                                                         |
| Ends a **form** the user is filling in                     | bottom right, after the last field                                               |
| Acts on **one row**                                        | right end of the row                                                             |
| Destructive                                                | never adjacent to the primary; always with a confirmation naming the consequence |

**The rule behind the table:** the action sits where the eye _finishes_, not where it starts.
In a form that is after the last field — putting Submit at the top asks people to act before
they have read. For a page-level action there is nothing to read first, so the header is
right.

Within a group, order is **secondary left, primary right**. The last thing before the edge
is the thing most people want.

### R3 · Every destructive or automatic action says what will happen — before the click

Accepting a submission triggers four things (email, tasks, speaker status, agenda pool). The
screen says so **above** the button, in one sentence per consequence. Four automatic effects
are too many to guess, and a product that surprises you once gets checked twice forever.

### R4 · Status is a word, not a colour alone

Every status badge carries its label. Colour is the second channel, never the only one —
for colour-blind users it is no channel at all.

Use `<StatusBadge status="in_review" />`
([`src/lib/components/status-badge.svelte`](../src/lib/components/status-badge.svelte)). It maps
every domain status from the pgEnums to a tone and always renders the word. **Never write
`bg-green-500` for a status**: that is how the same meaning ends up with five different greens.

### R5 · Empty states carry the next step

An empty screen names what is missing **and** links to the action that fills it. "No
submissions yet" is a dead end; "No submissions yet — share your call for papers" is a path.
This is where the original product loses people, on camera.

Use `<EmptyState title=… action={{ href, label }} />`
([`src/lib/components/empty-state.svelte`](../src/lib/components/empty-state.svelte)). The
component makes the way out a required thought rather than a remembered one: if there genuinely
is none, you have to say so by leaving `action` off. It carries the goose by default.

### R6 · Nothing internal leaks

Sponsor tier, review scores, reviewer names, tentative placements: none of these appear on a
public page, and sponsor tier does not appear in the reviewer's view either. Marked with
`--status-internal` and filtered in the loader, not in the template.

### R7 · The table is a workplace, not a report

Sticky header, filters above the table not in a drawer, `tabular-nums`, row click opens the
detail, and the column the user filters by most (track, status) is always visible. Never more
than seven columns by default.

### R8 · Optimistic, always

Status changes, drag and drop, scoring: the interface updates immediately and reconciles
afterwards. Perceived speed is the pitch of this product — the original is criticised as slow
four separate times in the walkthrough video.

---

## 3. Data flows through loaders, never through imports

```ts
// +page.server.ts — today
export const load = async () => ({ sessions: FIXTURE_SESSIONS });

// +page.server.ts — later, the only line that changes
export const load = async () => ({ sessions: await publicSessions(db, conferenceId) });
```

Components receive data as props and never import fixtures. Wiring the real database then
means swapping function bodies, not rewriting screens.

**The five public surfaces share one loader.** Sessions list, speakers list, agenda,
itinerary and gallery are five renderings of one query — that is both why they are cheap and
the condition under which they stay consistent.

---

## 4. What checks what

A rule that only exists as prose is a wish. This section is the honest ledger; keep it honest.

| Rule                           | Enforced by                                                                                                                                                       |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Token values, both modes       | `design/tokens.json` → `npm run tokens` → generated block in `src/app.css`                                                                                        |
| Contrast (≥4.5:1, ring ≥3)     | `src/lib/design/tokens.unit.test.ts`, every pair the token file declares                                                                                          |
| `--act` never a foreground     | `src/lib/design/act-usage.unit.test.ts` — the pair list cannot catch this, because the bad combination is one we never declare                                    |
| No hand edits to the CSS       | same test: it regenerates `app.css` and compares                                                                                                                  |
| Seeing what a change did       | `/styleguide` — every token in both modes, rendered by the real components                                                                                        |
| R4 status is a word            | `StatusBadge` — the only place a status becomes a colour                                                                                                          |
| R5 empty states have a way out | `EmptyState` — omitting `action` is a deliberate act, not an oversight                                                                                            |
| R6 nothing internal leaks      | one layout loader for all five public surfaces; the internal fields are absent from `PublicConference` itself, so a template cannot render what it never received |

**Dark mode is reachable.** `<ModeWatcher />` sits in the root layout and `ModeToggle` in the
public conference header and on `/styleguide`. Both palettes are now real, which is why the
contrast test asserts both.

**Still only prose, and known to be:** R1 (shadcn's `Button` defaults to filled, so a forgotten
`variant` silently breaks it), R2, R3, R7, R8, and the type scale. The admin surfaces still
carry raw palette classes for statuses. Each of those wants either a component or a lint rule
before it can be called a rule.

---

## 5. The goose

The mascot is a line drawing: [`static/mascot/goose.svg`](../static/mascot/goose.svg), and
holding a quill, [`goose-quill.svg`](../static/mascot/goose-quill.svg). The quill is the joke
and the meaning at once — it is the tool you submit with.

- **Where she belongs:** empty states, the marketing page, 404, the README.
- **Where she does not:** the submissions table, the reviewer queue, the agenda grid. Those
  screens are judged on how many rows fit on one screen.
- **Ink, not illustration.** Everything but the bill and the feet is `currentColor`, so she
  needs no dark-mode variant. The bill is `--act`, and it is the same yellow as the create
  button on purpose.
- **She is ours.** Drawn by hand as SVG paths, not generated and not traced from anyone's
  artwork. That provenance is the point: a mascot is a trademark eventually, and "where did
  this drawing come from" is a question with an answer.
- **Small sizes:** below roughly 24px the drawing collapses into a blob. Use
  [`goose-signet.svg`](../static/mascot/goose-signet.svg) there — head and neck in a circle,
  which still reads at 16px.
