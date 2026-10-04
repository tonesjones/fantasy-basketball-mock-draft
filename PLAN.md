# Plan: land Yahoo Draft Copilot on main (Step 0)

Background and findings: [docs/yahoo-copilot-review-2026-10-03.md](docs/yahoo-copilot-review-2026-10-03.md).

Goal: get Yahoo live-draft mode onto `main`, hidden unless configured, with its
known bugs fixed. Single user only. Multi-user sign-in is Step 1, not this
plan.

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
worker, same-origin. Keep the `WATCH_TOKEN` gate for now.

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

### 4. Match picks by Yahoo player ID

Add a Yahoo player ID to each pool player. Match by ID first, and fall back to
the name.

Acceptance:
- A pick whose Yahoo name differs from the pool name but whose ID matches is
  removed from the available list (test).
- The board shows a count of unmatched Yahoo picks when there are any.
- `audit-data.js` reports pool players with no Yahoo ID.

### 5. Freshness from the device's own clock

Acceptance:
- Freshness uses the time the response arrived on the device, not `fetchedAt`.
- Tests: a board stays fresh with a device clock skewed ±60 s, and goes stale
  25 s after the last successful sync regardless of skew.

### 6. Assign picks by team, not snake order

Map `team_key` to draft slot when the watch starts. Use the pick's team for
rosters, grades, "your pick", and the pick-landed toast.

Acceptance:
- Test with a traded pick: the pick lands on the receiving team's roster, and
  "your pick" fires on the traded-in pick.
- Boards without traded picks behave as before.

### 7. Allow gaps in the board

Acceptance:
- A board with keepers at picks 5 and 18 and picks 1–4 made syncs without an
  error (test).
- A board where an already-made pick disappears is still rejected as older.

### 8. Retire the separate Yahoo Pages project

Acceptance:
- `tools/yahoo-copilot/publish.py` and `sync.py` are removed. The `yh1` manual
  sync code either goes too or is documented as a fallback.
- `scripts/cleanup-pages-previews.js` and the README no longer list
  `tony-draft-lab-yahoo`.
- The README says which Pages project runs Yahoo mode and which secrets it
  needs.

## Before Step 1

Have a friend open a Yahoo mock lobby the owner isn't in, and test whether
the owner's token can read it. The result decides whether mock-only users need
their own Yahoo sign-in right away.

## Open decisions

- Which Pages project runs Yahoo mode: `tony-draft-lab-preview` (recommended,
  matching Pick Coach) or production.
- Whether to keep the `yh1` manual sync code as a fallback.
- Source for Yahoo player IDs: the Yahoo ADP workbook, if it has them, or a
  one-time lookup through the Yahoo API.

## Status (3 October 2026)

- Done: review rechecked against `d425e4b`; this plan written.
- Next: item 1.
