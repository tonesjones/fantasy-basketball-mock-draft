# Pick coach (advisory-only)

Side-panel tab **Pick coach** scores the focused available player on your turn.
Advisory only — never auto-drafts and never runs for CPU picks.

**Deploy topology (truth after merge to `main`):**

| Host | Pick coach |
|------|------------|
| [tony-draft-lab-preview.pages.dev](https://tony-draft-lab-preview.pages.dev) | Live TypeSafe/Jev when `TYPESAFE_API_KEY` is set on **tony-draft-lab-preview** |
| [tony-draft-lab.pages.dev](https://tony-draft-lab.pages.dev) (prod) | **Not** a live coach host — no prod ship of the TypeSafe secret |
| Local `file://` `index.html` | Labeled **Stub · offline** only |

Code lives on `main`. Do **not** put `TYPESAFE_API_KEY` on the prod Pages project unless Tony explicitly asks.

## Data source

`pick-coach.js` exposes `window.PickCoach.evaluate(state)`.

1. **Pages preview (http/https)** — `POST /api/pick-quality` (Cloudflare Pages
   Function → TypeSafe System One, **pinned model `jev-1.13.0`**). Score (0–4) +
   Choice `take|wait|reach` match spike `scripts/pick_quality_jev.py` (PR #3).
2. **Fail-soft** — missing `TYPESAFE_API_KEY`, timeout, or API error → HTTP 200
   with `verdict: "uncertain"` + `error` string (draft never breaks). On hosts
   whose hostname includes **`pages.dev`**, the browser then falls back to a
   **labeled stub** (`model: "stub"`, source **Stub**) so QA can still see
   suggest / “Not sure enough to suggest”. Never labeled as Jev. On other
   http(s) hosts the UI shows **Coach unavailable** (not “low confidence”) and
   does **not** swap in the stub.
3. **http(s) network TypeError** — on `*.pages.dev` → labeled stub (**Stub**);
   elsewhere → uncertain + quiet error + source **Unavailable**.
4. **Offline / local file** — `file://` (or no `fetch`) falls back to the
   deterministic ADP stub with `model: "stub"` and source **Stub · offline** so
   `index.html` still opens without wrangler.

UI source marker (`.pc-source`): **Jev** | **Stub** (preview soft-fail) |
**Stub · offline** | **Unavailable**.
Tooltip may show the raw `model` id (e.g. `jev-1.13.0` / `stub`).

`verdict` is `"suggest"` only when **both** confidences are ≥ **0.7**.

Client cache: fingerprint `player|pickNumber|logLen`, TTL ~45s. Leaving Pick
coach or ending the draft calls `PickCoach.cancel()` (aborts in-flight).

## Cloudflare secret

**Secret name (once):** `TYPESAFE_API_KEY`

```bash
# Preview project only (do not put on tony-draft-lab prod unless asked)
npx wrangler pages secret put TYPESAFE_API_KEY --project-name tony-draft-lab-preview
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
  -d '{"player":"Tyrese Maxey","pickNumber":23,"adp":19.4,"rank":22,"positions":["PG","SG"],"team":"PHI","picksUntilNext":22,"notableAvailable":[{"name":"Domantas Sabonis","adp":21,"positions":["PF","C"]}],"recentlyTaken":[{"name":"Anthony Edwards","pick":20}]}'
```

Tony must set the Pages secret (or `.dev.vars` / env for `pages dev`) for live
Jev. Opening `index.html` via `file://` does **not** need the secret (stub only).

### Production vs Preview environment secrets

Cloudflare Pages **Production** secrets on project **tony-draft-lab-preview**
apply to the production hostname
(`tony-draft-lab-preview.pages.dev`) after a deploy that picks them up.
They do **not** automatically apply to **branch / feat-* preview aliases**
(`https://<branch>.tony-draft-lab-preview.pages.dev`) — those use the
**Preview** environment. Branch aliases that return
`TYPESAFE_API_KEY not configured` are expected until the secret is also added
under **Settings → Environment variables → Preview** (or “Encrypt” / secret for
Preview) in the CF dashboard, then **redeploy** the branch preview.

Same-origin `POST /api/pick-quality` from a branch alias does not need CORS for
the browser call (same project / same origin). CORS still allows draft-lab /
preview `*.pages.dev` and local wrangler origins when Origin is sent (not `*`).

**CORS** — Function allows draft-lab / preview `*.pages.dev` origins and local
`localhost` / `127.0.0.1` wrangler ports (not `*`).

## UX contract

- Tab: `data-view="coach"` label **Pick coach**
- Panel root: `#pick-coach.pick-coach`
- CPU turn → `.pc-wait` (“Available on your turn.”)
- No focus → `.pc-empty`
- Evaluating → `.pc-loading`
- Result card → `.pc-card` with strength row + `.pc-suggest` or `.pc-uncertain`
- Source: `.pc-source` (**Jev** / **Stub · offline** / **Unavailable**)
- Strength row: `.pc-strengths` / `.pc-chip` from `PLAYERS[i].c.slice(0,4)` (always when tags exist)
- Suggest: choice chip Take|Wait|Reach + board why (strengths/scarcity/INJ/soft ADP); quiet Confidence N%; score words demoted
- Uncertain (low conf): “Not sure enough…” / “Low confidence — your call”
- Soft error (`res.error`): “Coach unavailable” / “Unavailable — not a low-confidence read”
  — **still paints** muted `.pc-uncertain-why` mover/role clause when applicable
  (do not clear why on softFail). Vacated `Vacates usage → …` uses the same rule.
- Preview soft-fail stub (`model: "stub"`, source **Stub**): may show true
  uncertain (“Not sure enough…”) or suggest — never source **Jev**.
- Choice: `take` | `wait` | `reach`
- Advisory only — never auto-drafts
- **Movers / outlook (preview):** may show quiet NEW / ↑ role / ↓ role chips and
  why clauses (`new team · …` / `expanded role` / `smaller role`) on suggest
  **and** uncertain (including Coach unavailable). Role chips are ADP-vs-last
  heuristic — see `docs/movers-outlook.md`. Not on prod.

## Evaluate payload (browser → `/api/pick-quality`)

```json
{
  "player": "Tyrese Maxey",
  "pickNumber": 23,
  "logLen": 22,
  "adp": 19.4,
  "rank": 5,
  "positions": ["PG"],
  "team": "PHI",
  "picksUntilNext": 22,
  "rosterNeeds": {
    "filledSlots": [],
    "openSlots": [],
    "alreadyDraftedByUser": [],
    "priorityNeeds": ["C", "PF", "STL"]
  },
  "notableAvailable": [
    { "name": "Domantas Sabonis", "adp": 21.0, "positions": ["PF", "C"], "rank": 21 }
  ],
  "recentlyTaken": [{ "name": "Anthony Edwards", "pick": 20 }],
  "scarcityRem": { "PTS": 72, "STL": 28 }
}
```

Board context feeds Jev (`notable_available` / `recently_taken` / optional
`scarcity_rem_pct` + `priority_needs`). Client board why remains the display layer.

## Result shape

```json
{
  "score": 2,
  "scoreConfidence": 0.35,
  "choice": "wait",
  "choiceConfidence": 0.32,
  "verdict": "uncertain",
  "why": "…",
  "model": "jev-1.13.0",
  "scoreLabel": "Average",
  "error": "optional soft-fail string"
}
```

## Tests

```bash
node test-pick-coach.js
```
