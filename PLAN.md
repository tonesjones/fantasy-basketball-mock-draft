# Plan: one codebase for Draft Lab and Yahoo mode

Background and findings: [docs/yahoo-copilot-review-2026-10-03.md](docs/yahoo-copilot-review-2026-10-03.md).

Goal: stop maintaining two versions. Yahoo live-draft mode moves onto `main`
and shows only on the site that has the Yahoo secrets. Afterward, every change
goes to `main`, and the `test/yahoo-draft-copilot` branch and the
`tony-draft-lab-yahoo` Pages project go away.

Yahoo mode stays single-user. It reads Yahoo with the owner's token only.

Work on a branch off `main` (`claude/yahoo-on-main`). Port the Yahoo work
instead of rebasing all 33 branch commits: the branch has merge commits, and
most of its ADP and data changes already exist on `main` in newer form.

## Items

### 1. Port Yahoo code onto current main

Bring over the Yahoo parts of `app.js`, `styles.css`, `draft-core.js`,
`test-yahoo-live.js` and `tools/yahoo-copilot/`. Leave the branch's older
player data, ADP and README changes behind.

Acceptance:
- `npm test` passes, including `test-yahoo-live.js` added to `run-tests.js`.
- With Yahoo not configured, the mock draft looks and works exactly as it does
  on `main` today, on desktop and in `test-mobile-views.js`.
- The diff against `main` contains no player-data or ADP changes.

### 2. Move the Worker routes into `_worker.js`

Serve `/api/yahoo/watch`, `/api/yahoo/board` and `/oauth/*` from the Pages
worker, same-origin. Keep the `WATCH_TOKEN` gate.

Acceptance:
- Port the existing `worker/test-worker.mjs` cases into `test-worker.js`, and
  they pass.
- No CORS headers are needed. Cross-origin requests to `/api/yahoo/*` get 403.
- `/api/pick-quality` behaves as before (existing tests pass).
- The KV namespace and Yahoo secrets are documented as bindings on the Pages
  project that will run it.

### 3. Hide Yahoo unless configured

Show Yahoo mode only when `/api/yahoo/health` reports it configured. This
follows the existing pattern where Pick Coach runs only where its secret is
set.

Acceptance:
- On a project without the Yahoo secrets, no Yahoo UI renders and no Yahoo
  request is made after the health check.
- On a configured project, the Yahoo setup appears.
- A test covers both cases.

### 4. Retire the separate Yahoo version

Acceptance:
- A real Yahoo draft syncs on the chosen Pages project before anything is
  removed.
- `tools/yahoo-copilot/publish.py` and `sync.py` are removed. The `yh1` manual
  sync code either goes too or is documented as a fallback.
- `scripts/cleanup-pages-previews.js` and the README no longer list
  `tony-draft-lab-yahoo`.
- The README says which Pages project runs Yahoo mode and which secrets it
  needs.
- The owner deletes the `tony-draft-lab-yahoo` project, the standalone
  `yahoo-draft-copilot` Worker and the `test/yahoo-draft-copilot` branch.

## Mock-lobby access test (owner, any time)

Join a Yahoo mock lobby with a second Yahoo account, then connect to that room
from Draft Lab signed in as the main account. If the board loads and updates,
the owner's token can read lobbies it didn't join. If Yahoo returns 401 or
403, other users would need their own Yahoo sign-in.

## Later (not needed to merge)

Bugs from the review. Each needs a test when it's done.

- Match picks by Yahoo player ID, not just name. Worth doing first: a name
  mismatch leaves a drafted player available. Needs Yahoo IDs added to the
  pool.
- Measure freshness with the device's own clock. A slow device clock never
  marks the board stale.
- Assign picks by `team_key`. Only matters in leagues with traded picks.
- Allow gaps in the board. Only matters in keeper leagues. Untested.

Multi-user sign-in, one poller per draft, and the copilot UX changes are
Steps 1–3 in the review. They depend on whether other people will use Yahoo
mode.

## Open decisions

- Which Pages project runs Yahoo mode: `tony-draft-lab-preview` (recommended,
  matching Pick Coach) or production.
- Whether to keep the `yh1` manual sync code as a fallback.

## Status (3 October 2026)

- Done: review rechecked against `d425e4b`; this plan written and trimmed to
  the merge.
- Next: item 1. Items 1 and 4 are mechanical enough to run on Sonnet.
