# Yahoo Draft Copilot (test branch)

Live-draft companion: polls a Yahoo snake draft's `draftresults`, detects
Tony's turns, and recommends via Draft Lab's headless deterministic engine.
Advisory only — Yahoo's API has no pick-submission path, so Tony always
clicks in the draft room himself.

## Files

- `copilot.py` — orchestrator. Subcommands:
  - `init --league-key K | --mock-url U --slot N [--out state.json]`
  - `poll --state state.json [--interval 15]` — live loop: prints every
    pick, prints a LEAN when Tony is 2 picks away, prints ON THE CLOCK
    with the engine's take + alternatives on his turn.
  - `replay --league-key K --slot N` — dry-run: replays a completed draft
    through the turn/recommend logic with no sleeping.
- `recommend.js` — headless engine runner (node). Loads the branch's own
  `player-data.js`, `movers-outlook.js`, `vacated-usage.js`,
  `playoff-data.js`, `playoff-core.js`, `pick-signals.js` plus the
  `PLAYERS` literal from `index.html` in a vm sandbox — exactly the way
  the browser and the test suites do — then ranks available players by
  true value and evaluates the top candidates at the given pick.
- `sync.py` — compact board codec for Draft Lab's Yahoo Live view.
  `encode_sync(teams, slot, rounds, yahoo_names)` ->
  `yh1.<teams>.<slot>.<rounds>.~b64,~b64,...`; `decode_sync` tolerates a
  full `#`-link; `sync_code_for_state(state)` builds a code from a poll
  state; `sync_link(base_url, ...)` builds a tappable link. ~2.5KB for a
  full 140-pick board. The page maps names to its pool itself
  (diacritic-insensitive), so off-pool Yahoo picks ride along as names.
- `publish.py` — in-app sync transport (Tony's call 2026-09-22: sync lives
  in the app, not in chat). `run --state state.json --dir <repo-root>
  --project NAME --account ACCT [--interval 20] [--max-mins 180]` polls
  Yahoo, encodes the board, writes `yh-sync.json` into the deploy dir,
  and redeploys via `cf.py` direct upload (only changed files go up).
  The page fetches `yh-sync.json` every ~15s during a Yahoo Live draft
  and auto-applies newer boards. `create-project --project NAME --account
  ACCT` does the one-time Pages project setup. Chat codes / `#yh1` links
  / the manual Sync-board paste remain as fallback.

## Draft Lab Yahoo Live view (index.html)

Setup screen: start an empty board from the teams/slot/rounds selects
(auto-sync fills it in once the publisher is running), or paste a sync
code/link as a fallback (`#yh1.` fragments auto-load). Mid-draft, a "Sync
board" disclosure under the turn bar shows auto-sync status plus a manual
paste fallback. Yahoo mode: no CPU picks, no draft buttons — Tony clicks in
the Yahoo room; Draft Lab mirrors the board, his roster, and shows the
engine's take on his turns. Picks outside the 270-player pool consume the
correct pick slot, show the Yahoo name, and stay out of roster math.
State persists in localStorage so a refresh resumes mid-draft.

## Auth

`copilot.py` imports the `dynamic_credentials` helper from the yahoo skill
(`~/workspace/skills/yahoo/bin`). OAuth tokens stay in the vault; the
copilot only ever holds a short-lived surrogate bearer in memory.

## Notes / v1 limits

- Snake drafts only (auction refused at init: nomination state is not
  exposed by Yahoo's API).
- Mock drafts: not listed by Yahoo's API — pass `--mock-url` with the
  draft-room URL; the league key is derived from it and verified readable.
- Yahoo display names are crosswalked to pool names by normalized match;
  picks outside the 270-player pool are logged and skipped (they can't be
  recommended anyway).
- `openSlots` for positional need are derived greedily from the league's
  real `roster_positions` minus Tony's drafted players.
- Poll interval default 15s. Worst case ~20s from pick to directive; the
  early lean is what beats a 30s pick clock.

## Dry-run (2026-09-21)

`replay --league-key 428.l.57708 --slot 3`: 140 picks, 14/14 turn
recommendations produced, avg 0.07s per recommendation, 20/140 picks
outside the 2026 pool (all legitimate 2023-draft names). Spot-checked:
pick-18 Wembanyama recommendation matched the actual pick.
