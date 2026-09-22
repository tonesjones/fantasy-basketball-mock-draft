# Yahoo Draft Copilot — Worker build plan v2 (reviewed)

Status: probe **PASSED** (2026-09-21, live mock `478.l.2440822`). Option A
(mailbox around the agent VM) **rejected**. Review v1 → four required
changes below, all accepted. This is the approved spec to build against.

## 1. Goal

Tony drafts for real on Yahoo (including mock drafts). Draft Lab runs beside
it as a live copilot: it mirrors Yahoo's actual picks, removes taken players
from the available pool, fills Tony's roster, and the deterministic engine
advises each of his picks. Tony enters the room URL + his slot **in the
page**; no chat, no agent VM, no manual sync codes in the loop.

## 2. What the probe proved

- Mock-room URL `…/mock_waiting?mlid=2440822` → league key `478.l.2440822`
  verbatim (game 478 = 2026 NBA).
- League reachable via authenticated Fantasy API; `is_mock: 1`; 12 teams;
  `draft_status` went `predraft` → `draft` as the lobby filled.
- `draftresults` accreted **live**: 70/156 picks in real time, Yahoo player
  keys resolving to correct names.
- Speed: new picks visible within a 12 s poll, several per poll.
- Shape: all 156 slots pre-exist with pick/round/team_key; `player_key`
  appears only once the pick is made → treat missing `player_key` as an
  unmade pick.
- Still to verify in a full live test: a complete draft, team-key→slot
  mapping for Tony's roster, unmatched players, corrected/reversed picks,
  and Yahoo failure behavior.

## 3. Architecture (request-driven, no KV for the board)

```
┌──────────┐  room URL + slot + WATCH_TOKEN  ┌──────────────┐  draftresults
│ Draft Lab│ ────── POST /api/watch ─────────▶│    Worker    │ ──fetch────▶ Yahoo
│  (page)  │                                 │              │      │
│          │ ◀──── GET /api/board ────────────│              │◀─────┘
└──────────┘  fresh snapshot every 10–12 s    └──────┬───────┘
                                                    │ KV: watch session only
                                                    │ (short expiration)
```

- **Page** polls `GET /api/board` every 10–12 s with
  `Authorization: Bearer <WATCH_TOKEN>`. The worker fetches Yahoo
  `draftresults` **on each request** and returns the fresh board directly
  with `Cache-Control: no-store`. Cron-first polling is rejected: its
  nominal 75 s worst case already exceeds some pick clocks, and KV reads
  are eventually consistent (stale up to 60 s+). The one-minute cron stays
  only as an optional backup, never the live update path.
- **KV** holds only the watch session (target league + slot + WATCH_TOKEN
  binding) with a short expiration. Never the board. A Durable Object would
  solve consistency properly but is more machinery than this one-user v1
  needs.
- **Server-side freshness guard:** if duplicate/rapid browser requests
  become a problem, the worker may serve a cached Yahoo response up to
  5–10 s old. Not built until observed.
- Standalone worker (not Pages Functions): the test Pages project is
  direct-upload, which does not route functions.

## 4. Auth

### 4a. Watch-token (must-fix, was waived in v1 — correctly overruled)

- `WATCH_TOKEN` stored as an encrypted worker secret.
- Tony enters it in the Draft Lab setup form; kept in **sessionStorage**,
  never localStorage; never hardcoded in the page.
- Sent as `Authorization: Bearer …` on **both** `/api/watch` and
  `/api/board`. Missing/invalid → 401.
- Rate-limit failed auth attempts. CORS restricted to
  `https://tony-draft-lab-yahoo.pages.dev`. (CORS alone authenticates
  nothing.)

### 4b. Yahoo OAuth — try OAuth 2 Authorization Code first

Yahoo's current server-side docs describe the Authorization Code flow
(access + refresh tokens). Before building the worker around it, prove
these exact operations:

1. Authorize the Yahoo developer app.
2. Read the exact Fantasy `draftresults` endpoint with the access token.
3. Refresh an expired access token.
4. Read `draftresults` again with the refreshed token.
5. Revoke access and confirm a clean authentication failure.

Only fall back to OAuth 1.0a if OAuth 2 cannot access Fantasy data. Do
**not** assume 1.0a tokens are permanent.

### 4c. Secrets handling (hard rule)

Tony enters the Yahoo client secret, refresh token, and WATCH_TOKEN
**directly into Cloudflare** (dashboard or `wrangler secret put`). They are
never sent through chat and never given to an agent. Worker secrets are
encrypted and hidden after entry.

## 5. Board snapshot schema (structured JSON, not yh1)

The `yh1` codec stays only for the manual copy-paste fallback. The live
API returns an inspectable snapshot:

```json
{
  "draftId": "478.l.2440822",
  "fetchedAt": "2026-09-21T...",
  "teams": 12,
  "rounds": 13,
  "userSlot": 4,
  "pickCount": 70,
  "boardHash": "...",
  "complete": false,
  "picks": [
    {
      "overallPick": 1,
      "round": 1,
      "teamKey": "478.l.2440822.t.1",
      "yahooPlayerKey": "478.p.1234",
      "playerName": "Victor Wembanyama",
      "playerIndex": 17
    }
  ]
}
```

`playerIndex` is the Draft Lab pool index, or `null` when Yahoo drafted a
player outside the pool (still consumes the pick; name preserved).

The page must handle:

- a changed board with the **same** `pickCount` (use `boardHash`),
- a corrected or reversed pick,
- `playerIndex: null` (unmatched player),
- a Yahoo slot with no `player_key` yet (unmade pick),
- a stale `fetchedAt`,
- a snapshot whose `draftId` doesn't match the watched draft.

Stale-board gating: **disable Pick Coach whenever the latest successful
Yahoo fetch is older than ~25 s.** Cancel any in-flight Jev request when a
new board arrives.

## 6. What the worker does NOT do

- No CPU picks, no auto-drafting, no writing to Yahoo (no write endpoint
  exists; read-only by construction).
- No rank/ADP/scoring logic — the deterministic engine in the page owns
  all advice, unchanged.
- No multi-user support, no league discovery UI, no draft-history import.
  v1 watches one league at a time.

## 7. Build order

1. Push `test/yahoo-draft-copilot` or open a draft PR — the deployed
   prototype needs reviewable source in GitHub.
2. Prove OAuth 2 against the exact `draftresults` endpoint (§4b, 5 steps).
3. Build authenticated `POST /api/watch` (§4a).
4. Build request-driven `GET /api/board` (§3).
5. Structured snapshots instead of yh1 (§5).
6. Stale-board gating and Jev cancellation (§5).
7. Tests: corrections, unmatched players, empty slots, stale data, bad
   authorization, Yahoo failures.
8. Deploy the development worker — Tony enters all secrets (§4c).
9. Complete one full mock draft end to end.
10. Delete `publish.py` after the worker passes. Keep only the manual
    sync-code fallback.

## 8. Non-goals

- No agent VM in the loop. No mailbox/polling bridge.
- No changes to production (`tony-draft-lab.pages.dev`) until the worker
  path is proven.
- The `publish.py` redeploy-per-pick path is deleted at step 10, not
  maintained in parallel.
