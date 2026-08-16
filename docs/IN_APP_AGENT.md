# Stufe 2: the in-app agent

The in-app assistant already talks, and it already acts. What it cannot do
is use an organization's own model, or build a CFP, or fill a board the way
the screens do. This spec is the contract for that step. It is not an
implementation.

Inventory is of `68a7e2e` on `main` (2026-08-16). The registry has held 49
tools since `20c736e` (#697). A later commit that adds a tool does not
invalidate the rule; it only moves a row in the table.

The companion document is [MCP.md](./MCP.md) — how an external client
connects. This one is about the assistant that lives in the product.

## What is already shipping

The assistant is application-wide (`src/lib/server/chat/assistant.ts`).
Since #683 it offers every tool in `allTools`
(`src/lib/server/mcp/server.ts`), not a per-page allow-list. Authorization
stays inside each registry handler. Every write waits for explicit user
approval (`writes: true` on the definition; chat builds `toolApproval`
from that).

The same 49 definitions are the MCP server at `/api/v1/mcp` and the REST
adapter under `/api/v1`. There is no second registry. `docs/MCP.md` is
kept in lockstep by `src/lib/server/mcp/server.unit.test.ts`.

The model is a process-wide OpenAI-compatible client
(`src/lib/server/chat/model.ts`):

| Variable              | Where it lives today                    | Scope             |
| --------------------- | --------------------------------------- | ----------------- |
| `AI_GATEWAY_BASE_URL` | env / Infisical / `wrangler.jsonc` vars | the whole install |
| `AI_GATEWAY_API_KEY`  | env / Infisical / Worker secret         | the whole install |
| `AI_CHAT_MODEL`       | env, default `openai/gpt-4o-mini`       | the whole install |

`FEATURE_INAPP_CHAT` still gates the endpoint. Unset Gateway credentials
return 503 (`ChatModelNotConfiguredError`). `AI_CHAT_MODEL=mock` is the
local/E2E stub.

That is Stufe 1: one backend for every organization, and no way to edit a
CFP or fill a board through a tool.

## What the organization configures

Stufe 2 lets an organization bring its own OpenAI-compatible backend. One
pair — base URL + API key — scoped to that organization, never to the
install and never to a single conference.

### Where it lives on screen

A card on **Organization settings**,
`/settings/organization/[slug]`
(`src/routes/(protected)/(with-sidebar)/settings/organization/[slug]/`).
Not conference Settings. The model is a tenant cost and a tenant secret;
a conference organizer who is only a `member` of the org must not be able
to rotate it.

Owner or admin can set, rotate, or clear the pair. Everyone else sees
whether a backend is configured, never any part of the key.

### Where it lives in the database

A new table, not a column on Better Auth's `organization`.
`src/lib/server/db/CLAUDE.md` treats that table as library-owned;
`organization.metadata` is a plaintext `text` column and is the wrong
place for a secret.

Suggested shape, in a new schema module next to the conference schemas
(and spread into `db/index.ts` and `db/test-utils.ts`):

```
organization_ai_settings
  organization_id  text PK, FK → organization.id ON DELETE CASCADE
  base_url         text not null
  api_key_cipher   bytea not null
  api_key_iv       bytea not null
  api_key_suffix   text          -- last 4, for the "key ending in …7f3a" line
  model_id         text          -- optional; falls back to AI_CHAT_MODEL
  updated_at       timestamptz
  updated_by       text          -- user id who last wrote
```

One row per organization. Clearing the card deletes the row.

### How the key is encrypted

AES-256-GCM through Web Crypto (the Worker already has it; do not add a
Node-crypto dependency).

- Wrapping key: a dedicated Worker secret `ORG_AI_WRAP_KEY`, 32 bytes.
  Not `BETTER_AUTH_SECRET` — session signing and tenant-secret wrapping
  rotate on different clocks.
- IV: 12 random bytes per write, stored in `api_key_iv`.
- AAD: the organization id, so a ciphertext copied onto another org's
  row will not decrypt.
- The plaintext key is held only for the duration of `createChatModel`
  and the form action that encrypts it. It is never returned in a load,
  a tool result, or a log line. `src/lib/server/otel-logs.ts` already
  redacts `api_key` / `apiKey`; keep it that way.

If `ORG_AI_WRAP_KEY` is unset, saving the card fails closed. The hosted
fallback below still works.

### How the chat picks a backend

`createChatModel` takes the active organization (`locals.organizationId`),
not a conference id.

1. A row for that org → use that `base_url` + decrypted key, and
   `model_id` or `AI_CHAT_MODEL`.
2. No row → today's hosted pair (`AI_GATEWAY_*`). Missing hosted
   credentials still 503.
3. A row whose ciphertext will not unwrap → 503 naming a configuration
   error, not a model error. Do not fall through to the hosted pair: the
   org asked not to send their traffic there.

A reviewer invited into someone else's conference therefore spends the
API key of _their_ active organization, not the organizer's. That is the
same scope as every other org-owned setting. Do not look at
`conference.organizationId`.

`AI_CHAT_MODEL=mock` still wins, so Cypress does not need an org row.

### What the URL is allowed to be

OpenAI-compatible chat completions, the same client
`src/lib/server/chat/model.ts` already constructs (`createOpenAI` +
`baseURL`). No second provider adapter.

In production the URL must be `https:` and must not resolve to a
private, link-local, or loopback address — the Worker will POST the
conversation to whatever the org typed. Localhost is allowed only when
`NODE_ENV` is not production.

### What Stufe 2 does not store

- A key per conference, per user, or per chat session.
- A provider enum (`openai` / `anthropic` / …). The URL is the adapter.
- The key in `wrangler.jsonc`, Infisical-per-org, or the assistant's
  own tool arguments. The model cannot read or change this card.

## The rule the issue actually carries

> Everything the UI can do exists as a callable server function.

"Callable server function" here means an entry in `allTools` that
forwards to the same domain function the form action already calls. It
does not mean a new chat-only wrapper, and it does not mean the form
action becoming the public API.

The existing tools already do this. `place_talk` calls `placeSession`.
`swap_talks` calls `swapPlacements`. `open_cfp` calls `createCfpForm` +
`publishCfpForm`. `decide_submissions` calls `decideSubmissions`. The
chat has no write path of its own — that is the point of #302, restated
in `src/lib/server/chat/tools.ts`.

The gap is the result of this spec. Rows marked **tool** already satisfy
the rule. Rows marked **form only** are the debt. A row marked **tool
without UI** is the reverse case — a registry entry with no screen —
and does not count as the rule being met. Stufe 2 pays two clusters of
the form-only debt (form builder, schedule fill) and leaves the rest
visible.

## Tool vs UI — organizer actions at `68a7e2e`

49 registered tools. Speaker and reviewer journeys are listed at the
bottom; they already have tools. The interesting gaps are organizer
writes that only exist as `export const actions` on a manage page.

### Conference lifecycle and settings

`src/routes/(protected)/manage/[slug]/settings/+page.server.ts`
`src/routes/(protected)/(with-sidebar)/manage/new/+page.server.ts`

| UI action                                                  | Form action                                                       | Domain function                                         | Tool today                                    |
| ---------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------- |
| Create a conference                                        | `default` on `/manage/new`                                        | `createConference`                                      | `create_conference`                           |
| Name / venue / dates                                       | `dates` (dates); name lives on the same update                    | `updateConference`                                      | `update_conference`                           |
| Publish / return to draft                                  | `visibility`                                                      | `setConferenceVisibility`                               | `publish_conference` / `unpublish_conference` |
| List on the front door                                     | `listing`                                                         | `setConferenceListing`                                  | —                                             |
| Archive                                                    | `archive`                                                         | `archiveConference`                                     | `archive_conference`                          |
| Restore                                                    | `restore`                                                         | `restoreConference`                                     | `restore_conference`                          |
| — (no screen; "Erase" appears nowhere under `src/routes/`) | —                                                                 | `deleteConference` (only caller: `conference-write.ts`) | `delete_conference` — **tool without UI**     |
| Add room                                                   | `addRoom`                                                         | `addRooms`                                              | `create_room`                                 |
| Rename / delete room                                       | `renameRoom` / `deleteRoom`                                       | `src/lib/server/conference/config.ts`                   | —                                             |
| Add track                                                  | `addTrack`                                                        | same module                                             | `create_track`                                |
| Rename / delete track                                      | `renameTrack` / `deleteTrack`                                     | same                                                    | —                                             |
| Add session format                                         | `addFormat`                                                       | same                                                    | `create_session_format`                       |
| Update / delete format                                     | `updateFormat` / `deleteFormat`                                   | same                                                    | —                                             |
| Task templates (add / hand out / update / delete)          | `addTemplate` `handOutTemplate` `updateTemplate` `deleteTemplate` | `task-templates.ts`                                     | —                                             |
| Sponsor tiers                                              | `addSponsorTier` `updateSponsorTier` `deleteSponsorTier`          | `sponsor-tiers.ts`                                      | —                                             |

Reads that already have tools: `get_conference`, `list_my_conferences`
(alias `list_conferences`), `list_rooms`, `list_tracks`,
`list_session_formats`.

### Call for papers — the form builder

`src/routes/(protected)/manage/[slug]/cfp/+page.server.ts`
`src/lib/server/conference/cfp-form.ts`

| UI action                                 | Form action                               | Domain function         | Tool today                                     |
| ----------------------------------------- | ----------------------------------------- | ----------------------- | ---------------------------------------------- |
| Create the form                           | `createForm`                              | `createCfpForm`         | covered by `open_cfp` (creates then publishes) |
| Publish the call                          | `publishForm`                             | `publishCfpForm`        | `open_cfp`                                     |
| Close the call                            | `closeForm`                               | `closeCfpForm`          | `close_cfp`                                    |
| Edit title, copy, window, speaker-support | `updateForm`                              | `updateCfpForm`         | —                                              |
| Add a question                            | `addField`                                | `addField`              | —                                              |
| Edit a question                           | `updateField`                             | `updateField`           | —                                              |
| Remove a question                         | `deleteField`                             | `deleteField`           | —                                              |
| Reorder a question                        | `moveField`                               | `moveField`             | —                                              |
| Hide / show a built-in question           | `hideFixedQuestion` / `showFixedQuestion` | `setFixedQuestionShown` | —                                              |
| Read the form the builder shows           | (load)                                    | `cfpFormView`           | —                                              |

`open_cfp` / `close_cfp` change the call's _status_. They do not edit
fields. An agent can open a call that still only asks for title,
abstract and speaker — and then cannot add a track question, a file
upload, or a conditional field. That is the Stufe-2 hole.

### Agenda — place, fill, swap, hold

`src/routes/(protected)/manage/[slug]/agenda/+page.server.ts`
`src/lib/server/conference/agenda.ts`

| UI action                              | Form action | Domain function                 | Tool today                                     |
| -------------------------------------- | ----------- | ------------------------------- | ---------------------------------------------- |
| Place or move a talk                   | `place`     | `placeOnBoard` / `placeSession` | `place_talk` / `move_talk`                     |
| Swap two talks                         | `swap`      | `swapPlacements`                | `swap_talks`                                   |
| Take a talk back to the tray           | `unplace`   | `unplaceSession`                | `unplace_talk`                                 |
| Fill the tray into free slots          | `autoPlace` | `autoPlace`                     | —                                              |
| Publish or unpublish the board         | `publish`   | `setAgendaPublished`            | —                                              |
| Confirm or tentativize one talk        | `toggleOne` | `setPlacementStatus`            | —                                              |
| Put lunch / a sponsor hold on the grid | `hold`      | `createBlock`                   | `create_break`                                 |
| Take a hold off                        | `release`   | `removeBlock`                   | `remove_break`                                 |
| Read the board / the tray              | (load)      | `agendaBoard`                   | `get_agenda` `list_sessions` `get_agenda_tray` |

`swap_talks` already exists. Fill does not. `hold` and `create_break`
are the same `createBlock` since #450. The tool is not the gap.

`autoPlace` is greedy (longest first, earliest clash-free slot) and
deliberately not an optimiser. A fill tool must call that function, not
invent a second packer.

### Submissions, decisions, review committee

| UI action                           | Form handler                                                       | Domain function                                        | Tool today                            |
| ----------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------- |
| Accept / reject / waitlist          | `decide` on submissions, submission detail, and decisions          | `decideSubmissions`                                    | `decide_submissions`                  |
| Notify speakers                     | `notify`                                                           | `decision-notifications.ts`                            | `notify_speakers`                     |
| Assign reviewers                    | `assign` / `assignment`                                            | `setReviewAssignment` / `assignReviewersToSubmissions` | `assign_reviews`                      |
| Auto-distribute the queue           | `distribute`                                                       | `autoDistributeReviews`                                | —                                     |
| Invite a reviewer                   | `addReviewer` on people                                            | `reviewer-roster.ts`                                   | `invite_reviewer`                     |
| Remove a reviewer                   | `removeReviewer`                                                   | same                                                   | `remove_reviewer`                     |
| Restrict a reviewer to tracks       | `updateTracks`                                                     | same                                                   | —                                     |
| Review-visibility mode              | `reviewVisibility`                                                 | same                                                   | —                                     |
| Add a review round                  | `add` on rounds                                                    | `addReviewRound`                                       | `create_review_round`                 |
| Rename / delete a round             | `rename` / `remove`                                                | `renameReviewRound` / `deleteReviewRound`              | —                                     |
| Scorecard criteria                  | `addCriterion` `updateCriterion` `removeCriterion` `moveCriterion` | `scorecard-criteria.ts`                                | —                                     |
| Slot capacity on the decision board | `capacity`                                                         | `setSlotCapacity`                                      | —                                     |
| Read submissions                    | (load)                                                             | `listSubmissions` / `submissionDetail`                 | `list_submissions` `get_submission`   |
| Read the committee / the rounds     | (load)                                                             | roster + `reviewRounds`                                | `list_reviewers` `list_review_rounds` |

### Speakers, materials, dashboard, carry-forward

No tools. All form-only.

| Screen                   | Form actions                                                                                                     | Domain                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Speakers                 | `add` `import` `updateProfile` `setStatus` `compose`                                                             | `speakers.ts`, `speaker-mail.ts`                                       |
| Speaker materials        | `remindSpeakers` `resolveCondition` `advanceStand`; task `decide` `comment`                                      | `organizer-content.ts`, `accept-condition.ts`, `editorial-stand.ts`    |
| Submission extras        | `content` `recording` `sponsor` `resolveCondition` `setEditorialStand` `advanceEditorialStand` `updateCondition` | `submission-content.ts`, `recordings.ts`, same condition/stand modules |
| Dashboard                | `remindReviewer` `remindReviewers` `dispatchMail`                                                                | `review-management.ts` (`queueReviewReminders`), mail outbox           |
| Carry-forward            | `invite` `discard`                                                                                               | `carry-forward.ts`                                                     |
| Predecessor on `/manage` | `predecessor`                                                                                                    | `predecessor.ts`                                                       |

### Not conference-organizer, and not this Stufe

Organization membership (`renameOrganization` `inviteMember`
`updateMemberRole` `removeMember` …) lives on the same settings page the
API-key card will join. Contacts / CRM
(`src/routes/(protected)/(with-sidebar)/contacts/`) is a separate
product surface. Neither is a conference action and neither gets a tool
in Stufe 2.

### Speaker and reviewer journeys — already tooled

These are in the 49. They are not the gap.

| Journey  | Tools                                                                                                                                        |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Speaker  | `list_open_cfps` `submit_proposal` `update_proposal` `finalize_proposal` `withdraw_proposal` `list_my_proposals` `update_my_speaker_profile` |
| Reviewer | `list_my_review_assignments` `get_review_assignment` `submit_review`                                                                         |
| Identity | `get_my_profile` `list_my_organizations`                                                                                                     |

The reviewer scorecard's `save` / `recuse` form actions
(`src/routes/(protected)/(with-sidebar)/review/[slug]/[submissionId]/+page.server.ts`)
share `saveReview` with `submit_review`. Recusal has no tool; it stays
out of Stufe 2.

## What Stufe 2 adds against today

Two clusters. Both wrap functions that already exist. Both land in
`allTools`, so MCP, REST, OpenAPI, `docs/MCP.md`,
`scripts/ai/chat-tools.json` and the in-app assistant pick them up
together. `SERVER_INSTRUCTIONS` has to name each new tool — the unit
test in `server.unit.test.ts` fails the other way.

Writes stay `writes: true`. The assistant will ask before they run.

### Form builder

| New tool                 | Wraps                   | Same as                                       |
| ------------------------ | ----------------------- | --------------------------------------------- |
| `get_cfp_form`           | `cfpFormView`           | the builder load                              |
| `update_cfp_form`        | `updateCfpForm`         | `?/updateForm`                                |
| `add_cfp_field`          | `addField`              | `?/addField`                                  |
| `update_cfp_field`       | `updateField`           | `?/updateField`                               |
| `delete_cfp_field`       | `deleteField`           | `?/deleteField`                               |
| `move_cfp_field`         | `moveField`             | `?/moveField`                                 |
| `set_cfp_fixed_question` | `setFixedQuestionShown` | `?/hideFixedQuestion` / `?/showFixedQuestion` |

Field kinds are the builder's existing set
(`src/lib/conference/form-definition.ts`): `short_text`, `long_text`,
`select`, `file`, `boolean`. Options, required, and conditions go
through `validateDefinition` / `conditionProblem` — the tool does not
grow a second validator. Ids come from `get_cfp_form`, never from the
page title.

`open_cfp` / `close_cfp` stay the status switch. Do not fold field
edits into them.

### Schedule fill (swap is already there)

| New tool        | Wraps       | Same as       |
| --------------- | ----------- | ------------- |
| `fill_schedule` | `autoPlace` | `?/autoPlace` |

`swap_talks` is already registered (`src/lib/server/mcp/tools/agenda.ts`)
and already the same `swapPlacements` the drag uses. Stufe 2 does not
add a second swap.

`fill_schedule` returns how many talks moved, the same number the form
action returns as `autoPlaced`. A collision the packer skips is not an
error; it is a leftover in the tray, readable with `get_agenda_tray`.

## What Stufe 2 is not

- Closing the rest of the gap table. Templates, sponsor tiers, room
  rename/delete, review-round edit, scorecard criteria, auto-distribute,
  speaker roster, materials, editorial stand, accept-conditions,
  recordings, carry-forward, dashboard mail, front-door listing, agenda
  publish / per-talk confirm — all stay form-only. The table is the
  backlog, not the Stufe-2 diff.
- A new chat surface, a per-page tool allow-list, or a second registry.
- Changing `FEATURE_INAPP_CHAT`, the approval rule, or the "assistant
  follows the user through the whole application" decision from #683.
- Contacts, CRM, organization membership, or recusal.
- Per-conference keys, non-OpenAI-compatible providers, or letting the
  model read or write the backend card.
- Production code in the spec PR. The next PR implements this document.

## Implementation notes for the PR that follows

1. Org settings card + `organization_ai_settings` + wrap/unwrap helpers
   - `createChatModel(organizationId)` fallback. No tool changes.
2. Form-builder tools in a new `src/lib/server/mcp/tools/` module (or
   next to `conference-write.ts` if they stay small), registered through
   `allTools`. REST routes under
   `/api/v1/conferences/{conferenceSlug}/cfp/…`. Update `docs/MCP.md`
   and regenerate `scripts/ai/chat-tools.json` the way the existing
   unit test already requires.
3. `fill_schedule` next to the other agenda tools. REST
   `POST /api/v1/conferences/{conferenceSlug}/agenda/fill`.
4. Do not touch the form actions. If a test can tell the tool's write
   apart from the screen's write, the tool called the wrong function.

A tool named in `SERVER_INSTRUCTIONS` that is not in `allTools`, or a
tool in `allTools` that is not in `docs/MCP.md`, will fail CI. That is
the fence; do not weaken it.
