# Pick coach (advisory-only v1)

Side-panel tab **Pick coach** scores the focused available player on your turn.
Advisory only — never auto-drafts and never runs for CPU picks.

## Current data source

`pick-coach.js` exposes `window.PickCoach.evaluate(state)`.

**Stub first** (`model: "stub-adp-gap"`): deterministic ADP-vs-pick heuristic that
**biases low confidence**, so `verdict: "uncertain"` is the default. A rare
large ADP gap (≥12) can clear the 0.7 gate and return `suggest`.

Comment in code: stub pending real TypeSafe/Jev hook.

## UX contract

- Tab: `data-view="coach"` label **Pick coach**
- Panel root: `#pick-coach.pick-coach`
- CPU turn → `.pc-wait` (“Available on your turn.”)
- No focus → `.pc-empty`
- Evaluating → `.pc-loading`
- Result card → `.pc-card` with `.pc-suggest` or `.pc-uncertain`
- Score words: Poor / Below avg / Average / Good / Excellent (0–4)
- Choice: `take` | `wait` | `reach`
- No red badges, list chips, or blocking modals

## Evaluate payload (browser → stub)

```json
{
  "player": "Tyrese Maxey",
  "pickNumber": 23,
  "adp": 19.4,
  "rank": 5,
  "positions": ["PG"],
  "team": "PHI",
  "picksUntilNext": 22,
  "rosterNeeds": { "filledSlots": [], "openSlots": [], "alreadyDraftedByUser": [] }
}
```

## Result shape

```json
{
  "score": 2,
  "scoreConfidence": 0.35,
  "choice": "wait",
  "choiceConfidence": 0.32,
  "verdict": "uncertain",
  "why": "…",
  "model": "stub-adp-gap",
  "scoreLabel": "Average"
}
```

`verdict` is `"suggest"` only when **both** confidences are ≥ **0.7**.

## Preview (Tony)

Open `index.html` locally (or any static server). Start a draft, wait for
**YOUR PICK**, open the **Pick coach** tab, click a player row to focus.
Draft button still drafts; row click only focuses for the coach.

No Cloudflare Pages Function or `TYPESAFE_API_KEY` required for this stub PR.
Real Jev `/api/pick-quality` can land in a follow-up behind a flag.

## Smoke the stub

```bash
node test-pick-coach.js
```
