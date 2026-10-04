# Plan: Yahoo version up to date and usable by other people

Background and findings: [docs/yahoo-copilot-review-2026-10-03.md](docs/yahoo-copilot-review-2026-10-03.md).

Goal: the Yahoo site (`tony-draft-lab-yahoo`, built from
`test/yahoo-draft-copilot`) has everything on `main`, and anyone with the
invite code can sign in with their own Yahoo account and follow their own
draft. The main site stays as it is.

Today the Yahoo Worker reads Yahoo with one stored token (the owner's) and
keeps one global watch (`watch:active`), so it can only follow drafts the
owner's account can see, one at a time.

Work happens on branches off `test/yahoo-draft-copilot`, with PRs into that
branch, because it is the Yahoo site's production branch. `main` is not
touched.

## Items

### 1. Bring the Yahoo branch up to date with main

Merge `main` into the Yahoo branch, matching how the branch has taken `main`
before. Expect conflicts in `app.js` (11 hunks), `styles.css` (2) and
`README.md` (3).

Acceptance:
- `npm test` passes, with `test-yahoo-live.js` and the worker tests in
  `run-tests.js`.
- Outside Yahoo mode, the app matches `main`: same mock draft, same phone
  layout (`test-mobile-views.js` passes).
- Player data and ADP files match `main` exactly.
- Owner check on the branch preview: a Yahoo draft still connects and syncs
  with the current setup.

### 2. Serve the Yahoo routes from the Yahoo site itself

Move the routes in `tools/yahoo-copilot/worker/src/index.mjs` into
`_worker.js`, so the page and the API share one origin. Sign-in needs this:
a sign-in cookie set by `workers.dev` would be a third-party cookie on
`pages.dev`, which Safari and Chrome block.

Acceptance:
- `/api/yahoo/*` and `/oauth/*` are served by `_worker.js`. The existing
  worker test cases pass against it.
- Cross-origin requests to `/api/yahoo/*` get 403.
- `/api/pick-quality` behaves as before.
- The README lists the KV binding and secrets the Yahoo Pages project needs.

### 3. Per-user Yahoo sign-in

"Sign in with Yahoo" runs Yahoo's OAuth flow for whoever clicks it. The
Worker identifies the user by the `xoauth_yahoo_guid` in Yahoo's token
response.

- Each user's refresh token is stored in KV under their Yahoo ID, encrypted
  with AES-GCM using a `TOKEN_ENC_KEY` secret.
- The browser gets an HttpOnly, Secure, SameSite=Lax session cookie holding
  a random ID. The page never sees a Yahoo token.
- The invite code (today's `WATCH_TOKEN`) is asked for once before sign-in. It
  no longer grants access to the owner's Yahoo account.

Acceptance:
- Two test users with separate Yahoo tokens each read Yahoo with their own
  token (tests with a mocked Yahoo API).
- KV holds no plaintext refresh tokens (test).
- Without the invite code, sign-in can't start. With a session cookie for
  user A, nothing returns user B's data (test).
- The owner's current single-token setup is removed.

### 4. Per-user draft watches and automatic team detection

Store watches under `watch:<yahoo id>`. When a watch starts, find the
signed-in user's team from Yahoo's `is_owned_by_current_login` flag and use
its `draft_position`. Remove the watch-token box and the slot dropdown.

Acceptance:
- Two users watching different drafts at the same time each get their own
  board (test).
- The slot comes from Yahoo. The page shows "You're <team name>, pick N"
  before advice starts.
- If Yahoo shows no team for the user in that draft, the page says so instead
  of guessing a slot.

### 5. Sign out and disconnect

Acceptance:
- "Disconnect Yahoo" deletes the user's stored token, watches and sessions
  (test), and links to Yahoo's page for revoking app access.
- Signed-out users see the sign-in button, not an error.

### 6. Other people's leagues: traded picks and keepers

Real leagues are more likely than the owner's mocks to have these.

Acceptance:
- Picks are assigned by `team_key`. With a traded pick, the pick lands on the
  receiving team, and "your pick" fires on a traded-in pick (test).
- A board with keepers already placed (gaps in pick numbers) syncs without an
  error (test). A board that loses an already-made pick is still rejected.

### 7. Retire the standalone Worker

Acceptance:
- Two Yahoo accounts follow two drafts at once on the live Yahoo site.
- `publish.py`, `sync.py` and the `tools/yahoo-copilot/worker/` copy are
  removed, and the README is updated.
- The owner deletes the `yahoo-draft-copilot` Worker in Cloudflare.

## Owner setup (Cloudflare and Yahoo dashboards)

Needed before item 3 can be tested live:

- Yahoo developer app: set the redirect URI to
  `https://tony-draft-lab-yahoo.pages.dev/oauth/callback`, with Fantasy
  Sports **Read** permission only.
- Pages project `tony-draft-lab-yahoo`: bind the `YAHOO_SESSIONS` KV namespace,
  and add the secrets `YAHOO_CLIENT_ID`, `YAHOO_CLIENT_SECRET`,
  `TOKEN_ENC_KEY` and `INVITE_CODE`.

## Later

- Match picks by Yahoo player ID instead of name (needs IDs in the pool).
- Measure freshness with the device's own clock.
- One poller per draft (Durable Object) if many people watch the same draft.
- Copilot UX from the review: mode picker, on-deck panel, one advice source,
  phone layout for Yahoo controls.

## Open decisions

- Invite code or open sign-in. Plan assumes an invite code shared with
  friends.

## Status (3 October 2026)

- Done: review rechecked; plan written.
- In progress: item 1.
