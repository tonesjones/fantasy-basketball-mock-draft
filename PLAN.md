# Plan: Yahoo version up to date and usable by other people

Background and findings: [docs/yahoo-copilot-review-2026-10-03.md](docs/yahoo-copilot-review-2026-10-03.md).

Goal: the Yahoo site (`tony-draft-lab-yahoo`, built from
`test/yahoo-draft-copilot`) has everything on `main`, and anyone can sign in
with their own Yahoo account and follow their own draft. The main site stays
as it is.

Today the Yahoo Worker reads Yahoo with one stored token (the owner's) and
keeps one global watch (`watch:active`), so it can only follow drafts the
owner's account can see, one at a time.

The existing setup stays: the standalone `yahoo-draft-copilot` Worker, its
Yahoo callback, and its Cloudflare secrets and KV binding. The only new
secret is `TOKEN_ENC_KEY`.

Work happens on branches off `test/yahoo-draft-copilot`, with PRs into that
branch, because it is the Yahoo site's production branch. `main` is not
touched.

## Items

### 1. Bring the Yahoo branch up to date with main

Acceptance:
- `npm test` passes, with `test-yahoo-live.js`. Worker tests pass.
- Outside Yahoo mode, the app matches `main`: same mock draft, same phone
  layout (`test-mobile-views.js` passes).
- Player data and ADP files match `main` exactly.
- Owner check on the branch preview: a Yahoo draft still connects and syncs
  with the current setup.

### 2. Per-user Yahoo sign-in

"Sign in with Yahoo" runs Yahoo's OAuth flow through the existing Worker
callback for whoever clicks it. Sign-in is open: no invite code or watch
token.

- The Worker identifies the user by the `xoauth_yahoo_guid` in Yahoo's token
  response.
- Each user's refresh token is stored in KV under their Yahoo ID, encrypted
  with AES-GCM using `TOKEN_ENC_KEY`.
- The page and Worker are on different sites, so a cookie would be
  third-party and blocked. Instead, the callback redirects back to the page
  with a one-time code (60 s, single use) in the URL fragment. The page
  trades it for a random session token, keeps that in `localStorage`, and
  sends it as `Authorization: Bearer`. The page never sees a Yahoo token.

Acceptance (tests use a mocked Yahoo API):
- Two users each read Yahoo with their own token.
- KV holds no plaintext refresh tokens.
- A one-time code works once and expires after 60 s.
- User A's session token can't read user B's data.
- `WATCH_TOKEN`, the single `oauth:refresh-token` key and the watch-token box
  are removed.

### 3. Per-user draft watches and automatic team detection

Store watches under `watch:<yahoo id>`. When a watch starts, find the
signed-in user's team from Yahoo's `is_owned_by_current_login` flag and use
its `draft_position`. Remove the slot dropdown.

Acceptance:
- Two users watching different drafts at the same time each get their own
  board (test).
- The slot comes from Yahoo. The page shows "You're <team name>, pick N"
  before advice starts.
- If Yahoo shows no team for the user in that draft, the page says so instead
  of guessing a slot.

### 4. Sign out and clean up

Acceptance:
- "Disconnect Yahoo" deletes the user's stored token, watches and sessions
  (test), and links to Yahoo's page for revoking app access.
- Signed-out users see the sign-in button, not an error.
- `publish.py` and `sync.py` (the old redeploy-per-pick path) are removed, and
  the README describes sign-in.
- Owner check: two Yahoo accounts follow two drafts at once on the live site.

## Owner setup

- Add a `TOKEN_ENC_KEY` secret to the `yahoo-draft-copilot` Worker before
  item 2 goes live.
- Delete the `WATCH_TOKEN` secret after item 2 ships.

## Later

- Match picks by Yahoo player ID instead of name (needs IDs in the pool).
- Measure freshness with the device's own clock.
- A per-user rate limit, if open sign-in draws more traffic than expected.
- One poller per draft (Durable Object) if many people watch the same draft.
- Copilot UX from the review: mode picker, on-deck panel, one advice source,
  phone layout for Yahoo controls.

Not planned: traded picks and keeper leagues.

## Status (3 October 2026)

- Done: review rechecked; plan written.
- Item 1: merged `main` (PR into `test/yahoo-draft-copilot`). Tests, worker
  tests, format check and data audit pass. Data files match `main`. Checked
  locally on desktop and phone with a saved Yahoo board. On phones, the
  Engine's take line now gets its own row; it overlapped the next-pick line
  under main's new phone header. Waiting on the owner's live Yahoo check on
  the branch preview.
- Next: item 2.
