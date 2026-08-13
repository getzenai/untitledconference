# The MCP server

untitledconference exposes its own product as tools an AI agent can call, at
`https://untitledconference.com/api/v1/mcp` (`/api/v1/mcp` on your own install).
Everything below is also reachable as plain HTTP — see [REST](#the-same-tools-over-rest).

## Connect

**Claude Code**

```bash
claude mcp add --transport http untitledconference https://untitledconference.com/api/v1/mcp
```

Then `/mcp` inside Claude Code, pick the server, and approve it in the browser
window that opens. Sign in with the account you use on the site; the consent
screen names the scope it is asking for (`mcp:tools`).

**Any other client** takes the same URL. The server is its own OAuth 2.1
provider: it advertises itself under `/.well-known/oauth-authorization-server`
and `/.well-known/oauth-protected-resource`, registers clients dynamically
(RFC 7591), and uses PKCE. A client that speaks streamable HTTP and OAuth needs
nothing but the URL — no API key exists to paste, and no token ends up in a
config file.

Access tokens last an hour and refresh for thirty days. There is no screen yet
for withdrawing a consent you have given — the standard revocation endpoint
(`/api/auth/oauth2/revoke`) is there, but the account settings have no button
for it.

## What the agent may do

It acts as you. The token carries your identity, so no tool takes a user or an
organization argument, and every tool goes through the same permission checks
the screens do: organizer tools require you to organize that conference,
speaker tools see only your own proposals, and a reviewer cannot read a
submission they were not assigned. An agent cannot do anything through MCP that
you could not do by hand in the browser.

## Organizer

Start with `list_my_conferences` — every other conference tool takes a slug it
returns.

<<<<<<< HEAD
| Tool                                          | What it does                                                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `list_my_conferences`                         | The conferences you organize, newest first                                                             |
| `create_conference`                           | A new conference, always as a draft                                                                    |
| `update_conference`                           | Name, venue, dates                                                                                     |
| `publish_conference` / `unpublish_conference` | Put the public page live, or take it back to draft                                                     |
| `archive_conference`                          | Remove a conference from every public surface, keeping everything. Slug twice if it is published       |
| `restore_conference`                          | Bring an archived conference back exactly where it was                                                 |
| `delete_conference`                           | Erase an archived, never-published conference for good. Slug twice; owner or admin                     |
| `open_cfp` / `close_cfp`                      | Open the call, or stop new submissions without touching the ones already in                            |
| `list_submissions`                            | The proposals, optionally filtered by status                                                           |
| `get_submission`                              | One proposal in full, with the reviews written for it (reviewer names are not returned)                |
| `invite_reviewer`                             | Invite someone into the review round                                                                   |
| `assign_reviews`                              | Hand proposals to reviewers                                                                            |
| `decide_submissions`                          | Accept, reject or waitlist — accepting also confirms the speakers and puts the talk in the agenda tray |
| `get_agenda`                                  | The scheduled programme, in start order                                                                |
| `list_rooms` / `create_room`                  | The rooms of the grid                                                                                  |
| `get_agenda_tray`                             | Accepted talks not yet on the grid, plus the days and rooms open to them                               |
| `place_talk` / `move_talk` / `unplace_talk`   | Put a talk on the grid, move it, take it back to the tray                                              |
| `swap_talks`                                  | Exchange two slots — both move or neither does                                                         |
=======
| Tool                                             | What it does                                                                                           |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `list_my_conferences`                            | The conferences you organize, newest first                                                             |
| `create_conference`                              | A new conference, always as a draft                                                                    |
| `update_conference`                              | Name, venue, dates                                                                                     |
| `publish_conference` / `unpublish_conference`    | Put the public page live, or take it back to draft                                                     |
| `open_cfp` / `close_cfp`                         | Open the call, or stop new submissions without touching the ones already in                            |
| `list_submissions`                               | The proposals, optionally filtered by status                                                           |
| `get_submission`                                 | One proposal in full, with the reviews written for it (reviewer names are not returned)                |
| `invite_reviewer`                                | Invite someone into the review round                                                                   |
| `create_review_round` / `list_review_rounds`     | Add a review round, or list the ones already there. A fresh conference has none                        |
| `assign_reviews`                                 | Hand proposals to reviewers — needs a round from `create_review_round` first                           |
| `create_session_format` / `list_session_formats` | Session shapes (Talk, Keynote, …) and their length. A fresh conference has none                        |
| `create_track` / `list_tracks`                   | Tracks a proposal can pick. A fresh conference has none                                                |
| `decide_submissions`                             | Accept, reject or waitlist — accepting also confirms the speakers and puts the talk in the agenda tray |
| `get_agenda`                                     | The scheduled programme, in start order                                                                |
| `list_rooms` / `create_room`                     | The rooms of the grid                                                                                  |
| `get_agenda_tray`                                | Accepted talks not yet on the grid, plus the days and rooms open to them                               |
| `place_talk` / `move_talk` / `unplace_talk`      | Put a talk on the grid, move it, take it back to the tray                                              |
| `swap_talks`                                     | Exchange two slots — both move or neither does                                                         |
>>>>>>> origin/main

The agenda tools refuse a collision rather than creating one, and say which talk
is in the way: a room double-booked, or a speaker due in two rooms at once. The
builder in the browser lets you place a collision and flags it; through a tool
there is no grid to look at, so the refusal is the flag.

## Speaker

| Tool                        | What it does                         |
| --------------------------- | ------------------------------------ |
| `list_open_cfps`            | Calls currently accepting proposals  |
| `submit_proposal`           | Create a proposal, as a draft        |
| `update_proposal`           | Edit it while the call is open       |
| `finalize_proposal`         | Hand it in — draft becomes submitted |
| `withdraw_proposal`         | Take it back                         |
| `list_my_proposals`         | Your proposals and where each stands |
| `update_my_speaker_profile` | Bio, photo, links                    |

## Reviewer

| Tool                         | What it does                   |
| ---------------------------- | ------------------------------ |
| `list_my_review_assignments` | Your queue                     |
| `get_review_assignment`      | One assignment with its rubric |
| `submit_review`              | Scores and comments            |

In a blind round you see the other reviewers' scores only after submitting your
own — the tools honour that the same way the queue does.

## About you

`get_my_profile` and `list_my_organizations` describe the authenticated caller.
Useful as an agent's first call to work out who it is acting as.

## The same tools over REST

Every tool is also a resource route under `/api/v1`, calling the same handler —
`GET /api/v1/conferences`, `POST /api/v1/conferences/{slug}/publish`,
`POST /api/v1/me/proposals/{id}/withdraw`, and so on. Authenticate with the same
OAuth bearer token:

```bash
curl -H "Authorization: Bearer $TOKEN" https://untitledconference.com/api/v1/conferences
```

The route table is at [`/api/v1/docs`](https://untitledconference.com/api/v1/docs)
and the OpenAPI 3.1 description at `/api/v1/openapi.json`, both generated from
the same registry — a tool cannot appear in one and be missing from the other.

## When the connection fails

The client reports the step it died on; the three that exist are discovery,
authorization and the token exchange.

- **Discovery** — `curl https://untitledconference.com/.well-known/oauth-authorization-server`
  must return JSON naming the authorization and token endpoints.
- **Authorization** — you should land on the sign-in page and then a consent
  screen. Approving takes you back to the client.
- **Token exchange** — this one is invisible: the client posts to
  `/api/auth/oauth2/token` server-to-server. A 403 here surfaces as an
  unparseable OAuth error in the client rather than a readable message.

On a self-hosted install, dynamic client registration is off unless
`OAUTH_ALLOW_DYNAMIC_CLIENT_REGISTRATION=true`. Without it a client that has no
pre-registered credentials cannot get past the first step.
