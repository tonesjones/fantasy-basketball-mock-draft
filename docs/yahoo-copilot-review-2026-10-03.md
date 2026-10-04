# Yahoo Draft Copilot review (3 October 2026)

This review covers `test/yahoo-draft-copilot` at `d425e4b`. The branch is 24
commits behind `main` and 33 ahead. It replaces nothing in
`yahoo-draft-copilot-review.md` (28 September), which covered the older
redeploy-per-pick design.

Line references are to files on the Yahoo branch.

## Verdict

The Yahoo mode is solid for one person. Other people can't use it as built.
The Worker serves exactly one Yahoo account, one password, and one active
draft.

## Why it only works for one person

| Limit | Where | Effect |
|---|---|---|
| One Yahoo account | `worker/src/index.mjs:4`, `getAccessToken` | The Worker stores one refresh token (`oauth:refresh-token`). Every Yahoo read uses the owner's account. A friend's private league is probably blocked. |
| One shared password | `index.mjs:71` (`authorized`) | `WATCH_TOKEN` is the only gate. Anyone with it can read Yahoo as the owner and replace the active watch. |
| One active draft | `index.mjs:3`, `:344` | The watch is stored at the single KV key `watch:active`. A second person who connects overwrites the first person's draft, and both see the second board. |

Untested: whether the owner's token can read a Yahoo mock lobby the owner
didn't join. If it can, mock-draft users might not need their own Yahoo sign-in
at first.

The OAuth request (`index.mjs:194`) sends no `scope`, so the scope comes from
the Yahoo app registration. Check that the app is registered for Fantasy
Sports read access only.

## Bugs, including for a single user

### Exact-name matching can leave a drafted player available

The Worker returns `yahooPlayerKey` and sets `playerIndex: null`
(`index.mjs:373`). The app maps each pick to the pool by normalized name only
(`app.js:913`, `yahooPoolIndex`). If a pool player's Yahoo name differs, for
example by a suffix, nickname, or spelling, the pick is stored as `-1`
(off-pool). The real pool player stays on the available list, and the engine
can still recommend that player. Nothing warns the user.

Fix: add Yahoo player IDs to the pool data (it has none today) and match by
ID, with name matching as a fallback. Show a visible count of unmatched picks.

### The freshness check depends on the device clock

`yahooBoardFresh` (`app.js:966`) compares the Worker's `fetchedAt` with
`Date.now()` against a 25-second window. Polling runs every 12 seconds.

- A device clock that runs fast by more than about 13 seconds can mark a fresh
  board as stale and disable advice.
- A device clock that runs slow never marks the board stale, even after sync
  stops. That defeats the safety check.

Fix: record when the response arrived using the device's own clock, and use
that for freshness. Keep `fetchedAt` for display only.

### Traded picks use snake order

The Worker parses `teamKey` (`index.mjs:289`), but the app never reads it. The
app assigns every pick by snake position (`CORE.teamForPick`, used at
`app.js:986` and throughout). In a league with traded picks, rosters, grades,
the "your pick" prompt, and the pick-landed toast can attach to the wrong team.

Fix: map `team_key` to draft slot when the watch starts, and assign picks by
`teamKey`.

### Keeper leagues probably fail the missing-pick check

`yahooApplySnapshot` throws `missing pick` unless picks are numbered 1, 2, 3
with no gaps (`app.js:977`). The Worker drops picks that have no player
(`index.mjs:285`). If Yahoo puts keepers at their assigned picks before the
draft starts, the board has gaps and sync stops with an error.

This follows from the code, but nobody has tested it against a real keeper
league.

Fix: allow gaps. Represent unmade picks explicitly, and only call a board
older when a pick that was already made disappears.

## UI and UX

Works well:

- The `LIVE · Yahoo draft` chip.
- Undo and Sim are hidden in Yahoo mode.
- "YOUR PICK — make it in Yahoo".
- The pick-landed toast when your Yahoo pick shows up.
- Advice stops while the board is stale.

Needs work:

- **Bolted on.** Yahoo appears under the mock-draft setup (`renderSetup`,
  `app.js:1061`). It should be a first choice: practice mock or follow my
  Yahoo draft.
- **Setup details in the UI.** The user types a watch token and picks a slot
  from a dropdown that defaults to 6 (`app.js:1064`). If the slot is wrong,
  every piece of advice is for someone else's team, with no warning. Yahoo
  already returns each team's `draft_position`, so the app can detect the slot
  and ask the user to confirm it.
- **Two advice sources.** The turn bar's "Engine's take" (`yahooAdvice`)
  ranks the top eight by true value, then takes the best Pick Signals verdict.
  Pick Coach rates whichever player is selected. They can disagree on the same
  turn. Pick one source and show it in both places.
- **Advice starts late.** Advice appears only on your turn. The CLI
  (`tools/yahoo-copilot/copilot.py:283`) gives a lean from two picks out,
  which is more useful in a timed Yahoo room.
- **Mobile.** None of `mobile.css`, `mobile-sheet.css` or
  `mobile-approved.css` on `main` has rules for the Yahoo controls (`.yhrow`,
  `.yhsync`, `.livechip`). The mobile redesign never covered this mode.

## Merge state

A trial merge of the branch into `main` conflicts in three files:

| File | Conflict hunks |
|---|---|
| `app.js` | 11 |
| `styles.css` | 2 |
| `README.md` | 3 |

The Yahoo Worker is a separate deployment (`yahoo-draft-copilot.workers.dev`).
It allows CORS only from the separate Pages project `tony-draft-lab-yahoo`,
which `tools/yahoo-copilot/publish.py` creates and deploys. `main` already
has `_worker.js` serving `/api/pick-quality`, so the Yahoo routes can live
there on the same origin, with no CORS or second project.

## Recommended order

0. **Land it on `main`, hidden.** Merge or rebase, fix the four bugs above,
   put Yahoo mode behind a flag, and move the Worker routes into `_worker.js`.
   Retire `publish.py` and the `tony-draft-lab-yahoo` project.
1. **Multiple users.** Per-user Yahoo sign-in with read-only scope. Store
   refresh tokens encrypted and keyed by Yahoo user. Keep watches per user
   instead of one global key. Drop `WATCH_TOKEN`. Detect league and slot. Add
   a disconnect button.
2. **Scale.** One Durable Object per draft, so one poller serves every viewer
   and Yahoo rate limits stay safe.
3. **Copilot UX.** Mode picker, an on-deck panel two to three picks out, one
   advice source, and a compact phone layout.

Before step 1, have a friend try a Yahoo mock lobby the owner isn't in. If
the owner's token can read it, mock-only users can wait for per-user sign-in.
