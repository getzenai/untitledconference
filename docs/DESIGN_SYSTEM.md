# Design system — Untitled Conference

Two halves, and the second one is the important one:

1. **Foundations** — the tokens. Colour, type, spacing, radius. Mostly inherited from
   shadcn-svelte; we change little on purpose.
2. **Rules** — where things go and how many of them there may be. This half is what keeps
   twenty screens looking like one product, and it is the half a component library cannot
   give you.

> The product speaks **English**. This document is the only place where a design decision is
> written down; if a screen contradicts it, the screen is wrong.

---

## 1. Foundations

### Colour

The base stays **neutral and quiet**. This is a working tool: an organizer looks at it for
hours, and the only things that may shout are status and the primary action.

```
--background   near-white          --foreground   near-black ink
--muted        surface for rails, table headers, disabled areas
--primary      near-black — the one action colour
--border       hairline, never a box shadow where a border does
```

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

### Type

One family (the system stack), four sizes. A conference tool is a reading tool; more sizes
means more decisions and no more clarity.

| Role           | Size            | Weight     |
| -------------- | --------------- | ---------- |
| Page title     | `text-lg`       | 600        |
| Section title  | `text-sm`       | 600        |
| Body / table   | `text-[13.5px]` | 400        |
| Meta, captions | `text-xs`       | 400, muted |

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

### R5 · Empty states carry the next step

An empty screen names what is missing **and** links to the action that fills it. "No
submissions yet" is a dead end; "No submissions yet — share your call for papers" is a path.
This is where the original product loses people, on camera.

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
