# Pick coach (advisory-only)

Side-panel tab **Pick coach** scores the focused available player on your turn.
Advisory only — never auto-drafts and never runs for CPU picks.

## Data source

`pick-coach.js` exposes `window.PickCoach.evaluate(state)`.

1. **Production / Pages preview** — `POST /api/pick-quality` (Cloudflare Pages
   Function → TypeSafe System One, model `jev-latest`). Score (0–4) + Choice
   `take|wait|reach` match spike `scripts/pick_quality_jev.py` (PR #3).
2. **Fail-soft** — missing `TYPESAFE_API_KEY`, timeout, or API error → HTTP 200
   with `verdict: "uncertain"` + `error` string (draft never breaks). The
   browser uses that response; it does **not** silently swap in the stub.
3. **Offline / local file** — `file://` or a network `TypeError` (no function
   running) falls back to the deterministic ADP stub with `model: "stub"` so
   `index.html` still opens without wrangler.

`verdict` is `"suggest"` only when **both** confidences are ≥ **0.7**.

## Cloudflare secret

Set the TypeSafe key as a **Cloudflare Pages secret** (never commit it):

```bash
# Production / preview project (once per project)
npx wrangler pages secret put TYPESAFE_API_KEY
# paste the key when prompted
```

Local preview with the Function:

```bash
# from repo root (functions/ present)
source /path/to/typesafe_env.sh   # or export TYPESAFE_API_KEY=...

# Prefer .dev.vars (gitignored) OR --binding:
#   echo "TYPESAFE_API_KEY=$TYPESAFE_API_KEY" > .dev.vars
npx wrangler pages dev . --port 8788
# if global wrangler missing:
#   /tmp/wrangler-home/node_modules/.bin/wrangler pages dev . --port 8788

# Smoke
curl -sS -X POST http://localhost:8788/api/pick-quality \
  -H 'Content-Type: application/json' \
  -d '{"player":"Tyrese Maxey","pickNumber":23,"adp":19.4,"rank":22,"positions":["PG","SG"],"team":"PHI","picksUntilNext":22}'
```

Tony must set the Pages secret (or `.dev.vars` / env for `pages dev`) for live
Jev. Opening `index.html` via `file://` does **not** need the secret (stub only).

**Do not** deploy this branch to `tony-draft-lab` production unless explicitly
asked. Optional remote preview project name if token is available:
`tony-draft-lab-preview` only.

## UX contract

- Tab: `data-view="coach"` label **Pick coach**
- Panel root: `#pick-coach.pick-coach`
- CPU turn → `.pc-wait` (“Available on your turn.”)
- No focus → `.pc-empty`
- Evaluating → `.pc-loading`
- Result card → `.pc-card` with strength row + `.pc-suggest` or `.pc-uncertain`
- Strength row: `.pc-strengths` / `.pc-chip` from `PLAYERS[i].c.slice(0,4)` (always when tags exist)
- Suggest: choice chip Take|Wait|Reach + board why (strengths/scarcity/INJ/soft ADP); quiet Confidence N%; score words demoted
- Uncertain: muted titles; strength chips still shown; no choice chip; no red
- Choice: `take` | `wait` | `reach`
- Advisory only — never auto-drafts

## Evaluate payload (browser → `/api/pick-quality`)

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
  "model": "jev-latest",
  "scoreLabel": "Average",
  "error": "optional soft-fail string"
}
```

## Smoke the stub (no API)

```bash
node test-pick-coach.js
```
