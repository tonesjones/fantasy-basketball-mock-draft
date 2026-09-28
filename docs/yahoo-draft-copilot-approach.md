# Yahoo Draft Copilot — approach

Branch: `test/yahoo-draft-copilot` (based on `main@c02d524`). Test site:
`https://tony-draft-lab-yahoo.pages.dev`. Production (`tony-draft-lab.pages.dev`)
is untouched.

## 1. The problem

Tony drafts for real on Yahoo. He wants Draft Lab open beside it as a live
copilot: the board mirrors Yahoo's real picks, taken players disappear from
the available pool, his roster fills in, and the deterministic engine advises
each of his picks. He makes every selection in Yahoo — Draft Lab never picks
for him and never needs CPU picks.

## 2. Constraints that shaped the design

- **Yahoo exposes no draft-pick write endpoint.** The tool is advisory by
  construction. Picks only ever happen in Yahoo.
- **Yahoo's fantasy API requires server-side OAuth (1.0a).** A static page
  cannot call it — no CORS, and the credential can't live in public JS.
  Something holding a secret must sit between the page and Yahoo.
- **Yahoo `draftresults` fills during a live draft.** Polling it sees the
  whole board, so a poller can reconstruct every pick without any other feed.
- **Mock drafts are API-readable from a room URL.** The room URL yields the
  league key; the league key yields settings and results.
- **Tony's standing rules:** test branch only, every push/deploy explicitly
  approved, no auto-deploy, sync must happen inside the app (not via chat
  links/codes).

## 3. What was built

### Server side — `tools/yahoo-copilot/` (runs on the agent VM)

| File | Job |
|---|---|
| `yahoo_api.py` | Yahoo OAuth via the vault connector, `draftresults` reads |
| `copilot.py` | `init` builds draft state from league settings + Tony's slot |
| `sync.py` | Encodes/decodes the board as a compact `yh1…` string |
| `publish.py` | `run` polls Yahoo, encodes the board, writes `yh-sync.json`, redeploys the test site |

### Client side — `index.html` (Yahoo Live mode)

- Setup section: sync-code textarea (fallback), teams / slot / rounds inputs.
- Red `LIVE · Yahoo draft` chip; turn bar shows whose pick it is and Tony's
  next pick; no CPU picks are ever made in this mode.
- `Sync board` disclosure with auto-sync status.
- `liveSyncTick()` fetches `yh-sync.json` from the site's own origin every
  15 s and applies it when safe:
  - only if teams, slot, and rounds match the open board;
  - only if the published pick count is ahead of the displayed board;
  - never double-applies the same update;
  - timer stops when the draft completes.
- Players Yahoo drafted who aren't in our pool become `-1` board cells with
  their Yahoo names preserved (they still consume the pick).
- Empty board state explains auto-sync will fill it once the publisher runs.

### Hosting

Separate Cloudflare Pages project `tony-draft-lab-yahoo`, deployed with
`cf.py` direct upload from the test branch. The publisher redeploys this
same project each time it detects new picks, with the fresh `yh-sync.json`
included.

## 4. The loop, end to end

1. Tony joins a Yahoo mock draft lobby.
2. **Trigger (the unsolved step — see §6):** the room URL + his slot get to
   the poller.
3. `copilot.py init` builds the draft state (teams, rounds, Tony's slot).
4. `publish.py run` polls Yahoo `draftresults` (~15 s), encodes the board,
   writes `yh-sync.json`, redeploys the test site.
5. The page fetches `yh-sync.json` every 15 s and applies newer boards.
6. Each applied board: completed picks leave the available pool, Tony's
   roster updates, and on his turn the deterministic engine recommends.

End-to-end latency per pick: ~15 s (Yahoo poll) + ~10 s (redeploy) + ~15 s
(page poll) ≈ under a minute from Yahoo pick to mirrored board.

## 5. What's verified

- Historical replay of Tony's completed 2023 league (140 picks): all 14 of
  his turns produced engine recommendations, ~0.07 s each.
- Page-side harness against the real Yahoo section: newer board applied once,
  same board never twice, mismatched slot ignored, single timer, timer
  cleared at completion, Unicode names intact.
- Live walkthrough of the deployed test site in a real browser: empty board
  loads with the LIVE chip, auto-sync status renders, reload resumes the
  saved draft, no console errors.

## 6. Decision: prove the API first, then build the worker directly

**Option A (Worker + KV mailbox around the agent VM) is rejected.** It builds
temporary infrastructure around the agent VM, needs another Cloudflare
credential, redeploys the site per update, and leaves the real Yahoo
integration unsolved — most of it gets deleted if the worker version is
built later. Not building it.

The decision tree:

1. **Prove Yahoo's API exposes a real mock lobby while the draft is
   running** (disposable read-only probe — see §7).
2. If it works → build the Cloudflare Worker version directly (the worker
   holds Yahoo OAuth, polls on a cron, serves the board JSON; no agent VM,
   no chat, works for any user).
3. If it does not work → fall back to a small browser extension that reads
   the Yahoo draft page DOM.

Open design point: do not lock the worker to OAuth 1.0a. Yahoo's current
server-side docs describe the Authorization Code flow; the probe tests the
existing connector against a live lobby and settles the auth question
empirically.

## 7. Milestone 1 — live mock probe (disposable, read-only)

The plan previously treated these as facts, but evidence only covers a
*completed* 2023 league. None of this is proven for a live mock lobby:

- A mock-room URL contains a usable league key.
- That league is reachable through the authenticated Fantasy API.
- `draftresults` updates while the mock draft is in progress.
- Updates arrive fast enough to advise before Tony's next pick.

Yahoo's docs confirm fantasy data needs authenticated access, but nothing
official guarantees live `draftresults` for temporary mock lobbies.

**Procedure (no Draft Lab connection, no deploys):**

1. Tony joins a live mock draft lobby and pastes the room URL (one-time).
2. Extract the league key from the URL.
3. Poll `draftresults` for that league key every ~10–15 s for the duration
   of the draft.
4. Record per poll: HTTP status, pick count, and for each new pick the
   Yahoo player ID format and the wall-clock time it first appeared.
5. Delay measurement: Tony notes the room time of at least one known pick
   (e.g. his own); lag = first API sighting − room time.
6. Also confirm the league-settings endpoint returns the mock league (team
   count, rounds) — needed later for board init.

**Result (2026-09-21, live mock `478.l.2440822`): PASS on all four.**

- Room URL `mock_waiting?mlid=2440822` → league key `478.l.2440822`
  (game 478 = 2026 NBA season). The `mlid` is the league id verbatim.
- League reachable with the existing `custom.yahoo` connector, no auth
  changes — the OAuth question is settled empirically. Response flags
  `is_mock: 1`, 12 teams, `draft_status` went `predraft` → `draft` as the
  lobby filled.
- `draftresults` accreted live: 70/156 picks observed in real time, each
  with a Yahoo player key resolving to the correct name (e.g. Tony's
  auto-picks: Wembanyama #1, Booker #24, Şengün #25, Irving #48,
  Wagner #49).
- Speed: new picks appeared within a single 12 s poll window, several per
  poll — the API keeps pace with the draft. Advising before Tony's next
  pick is not a constraint (snake draft leaves ~10+ min between his
  turns).
- Shape note: all 156 draft slots pre-exist as entries with
  pick/round/team_key; `player_key` appears only once the pick is made.

→ Decision tree step 2: build the Cloudflare Worker version directly.

## 7. Rough edges and open risks

- **Redeploy-per-pick is heavy.** Every batch of new picks redeploys the
  whole site (~118 files, 1.2 MB) just to publish one small JSON file. Fine
  for a test; the real version should serve the board JSON from a Worker/KV
  instead.
- **Missing `yh-sync.json` returns HTTP 200 with an HTML error page** on
  the test project (edge quirk). The page handles it (JSON parse fails →
  keeps polling), but it's ugly and worth confirming it doesn't mask a real
  file later.
- **`yahooAdvice()` verdict casing** (take/wait/reach/pass vs Take/Wait/…)
  is unverified against the final product copy.
- **No live-draft test yet.** Everything is verified against historical
  replay and an empty board. The probe (§7) is the first real proof.

## 8. What Tony needs to decide / provide

1. **Run the probe (§7):** join any live mock lobby, paste the room URL
   here once, and note the room time of one known pick. The agent does the
   rest — no Draft Lab changes, no deploys.
2. After a PASS: approve the Worker build (needs a Yahoo dev app + one
   authorize click on Tony's PC, and a Workers-capable Cloudflare token).
3. After a FAIL: approve the browser-extension fallback instead.
