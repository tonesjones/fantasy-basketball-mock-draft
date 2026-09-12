# Fantasy Basketball Mock Draft Simulator

A single-page mock draft trainer for Yahoo-style fantasy basketball leagues.
No build step, no dependencies, no server — just open it in a browser.

## Use it

**Easiest:** open `index.html` directly in any browser (double-click it).
Everything runs locally in the page.

**Or host it free with GitHub Pages:**

1. Push this folder to a GitHub repo (see below).
2. On GitHub: **Settings → Pages → Deploy from a branch → main → /** (root).
3. Your draft tool is live at `https://<your-username>.github.io/<repo-name>/`.

## Push to GitHub

```bash
cd mock-draft-site
gh auth login            # one-time: links your GitHub account
gh repo create fantasy-mock-draft --public --source=. --push
```

Or create an empty repo on github.com and run:

```bash
git remote add origin https://github.com/<you>/<repo>.git
git branch -M main
git push -u origin main
```

## What's inside

- `index.html` — the whole app (draft engine, player pool, UI).
- `player-data.js` — real-world data merged into the player pool at load:
  `var PDATA = { "Player Name": { adp: <2026-27 ADP>, last: <2025-26 final rank> }, ... }`.

### Data sources

- **Last season's rank finish** — Basketball Monster's final 2025-26 season
  rankings, cross-checked against Hashtag Basketball.
- **ADP** — Yahoo 2026-27 preseason ADP when published; FantasyPros consensus
  ADP as the fallback until then.

To refresh the data, replace `player-data.js` with a new `PDATA` object in the
same shape. Player names must match the `PLAYERS` array in `index.html`
character-for-character (including `Jr.`, `III`, apostrophes).

## Draft settings

- 12 teams, snake draft, you pick your draft slot (1–12).
- 10–15 rounds (default 13).
- Yahoo default roster: PG, SG, G, SF, PF, F, C, C, Util, Util, BN, BN, BN.
- CPU teams draft from the built-in rankings with randomness and positional need.
- Sort the available list by built-in rank, ADP, or last season's finish.
- Category-scarcity panel (PTS/REB/AST/STL/BLK/3PM/FG%/FT%/TO) counts remaining
  difference-makers per category so you can see what's drying up.

## Notes

- Rankings and category tags are preseason estimates, not a projection model.
- Rookies with no 2025-26 season show `—` for last season's finish.
