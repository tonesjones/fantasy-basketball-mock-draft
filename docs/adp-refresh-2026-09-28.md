# ADP, team and injury refresh — 2026-09-28

Source: Hashtag Basketball 2026-27 fantasy ADP table
(`https://hashtagbasketball.com/fantasy-basketball-adp`), stamp moved
**17 Sep 2026 → 25 Sep 2026**. Yahoo and Fantrax columns only.

**Standing rule: ESPN ADP and rankings are never used.** Tony considers them
fundamentally flawed. That also excludes Hashtag's BLEND column (it mixes in
ESPN) and FantasyPros' AVG. `scripts/hashtag-adp-to-csv.js` reads only the
Yahoo and Fantrax cells; `test-hashtag-adp-to-csv.js` proves an ESPN-only value
never leaks through.

Raw pull: `scripts/data-provenance/2026-09-28-adp-refresh/hashtag-adp-2026-09-25.csv`
(418 rows). The pre-apply diff report is `refresh-report.txt` in the same folder.

## How it was done (repeatable)

    curl -sS -A "Mozilla/5.0" -o page.html https://hashtagbasketball.com/fantasy-basketball-adp
    node scripts/hashtag-adp-to-csv.js page.html > table.csv
    node scripts/refresh-adp.js table.csv            # review the report
    node scripts/refresh-adp.js table.csv --apply
    node scripts/generate-movers.js                  # role flags follow the new ADP
    node scripts/rebuild-rank.js                     # then bump DATA_VERSION

Post-apply re-diff: 0 value differences. Only the two known team differences
remain (below), where our data is newer than Hashtag's table.

## ADP

- **409 values changed** across 257 matched players; 109 moved by 3+ picks.
  33 players within the top 180 moved 8+ spots in consensus.
- **The Yahoo outliers from the ranking review corrected themselves.** Yahoo
  ADP moved toward Fantrax for the players whose Fantrax values sat in the
  rarely-drafted tail: Aaron Nesmith 75.3 → 106.5, Brook Lopez 77.9 → 104.2,
  AJ Green 79.2 → 103.3, Al Horford 86.6 → 104.3, Adem Bona 85.4 → 102.9.
- **Yahoo dropped 10 players from its list** (now blank, so nulled per
  convention). Their consensus now comes from the Fantrax tail alone (~207–211):
  Luke Kornet, De'Andre Hunter, T.J. McConnell, GG Jackson, Allen Graves, Jay
  Huff, Sam Hauser, Ryan Kalkbrenner, Nate Ament, Isaiah Collier.
- **Yahoo newly lists 4:** Tari Eason 116.8, Tre Jones 112.2, Grayson Allen
  115.0, Jerami Grant 117.7. Grant's consensus moved 202.6 → 147.1.
- Other notable moves: Anthony Davis 24.9 → 39.1 (Yahoo), Brandon Ingram
  75.4 → 64.3, Zach LaVine 120.4 → 105.1, Anthony Edwards 14.7 → 8.8,
  Giannis 12.1 → 8.0.
- **13 pool players are absent from the table** and keep their old values (all
  already unlisted): DiVincenzo, Valanciunas, Bitadze, Batum, Ivey, Aaron
  Holiday, Sochan, Highsmith, Agbaji, D'Angelo Russell, Cam Thomas, Isaac,
  Mogbo.
- **Add candidates, not added (Tony's call):** Bronny James Jr. (LAL, Yahoo
  95.9 / Fantrax 243.4, a classic Yahoo-only outlier, consensus ~120) and
  Brayden Burries (MIL rookie, Yahoo 114.1 / Fantrax 232.6).

## Teams and positions

Each change was verified in news coverage before applying:

| Player | Was | Now | Source |
|---|---|---|---|
| Nikola Vucevic | BOS | ORL | 1-year deal, Jul 1 (NBA.com). Our BOS was wrong |
| Taurean Prince | MIL | DET | Jul trade for LeVert (NBC Sports, Detroit News) |
| Devin Carter | ATL | BOS | Exhibit 10 deal, Sep 14, after ATL waived him (Boston Globe) |
| Cam Whitmore | FA | DEN | Two-way deal, Sep 18 (Hoops Rumors, HoopsHype) |
| Dorian Finney-Smith | CHA | ATL | Hornets got Buddy Hield from ATL for him (ESPN) |
| Moses Moody | SG | SG/SF/PF | Yahoo eligibility (Hashtag Yahoo column) |

Kept as ours (newer than Hashtag's 25 Sep table): Buddy Hield **CHI** and Rob
Dillingham **CHA**, from the Sep 26 Bulls–Hornets trade.

The movers overlay was regenerated with `scripts/generate-movers.js`, a
maintained copy of the Sep 20 generator. The old one read `index.html` from
before the file split and used Yahoo-first ADP; the new one uses consensus ADP.
Mover count is 74, team fields match the verified edits exactly, and 42 role
flags followed the new ADP (e.g. Luke Kornet up → down, Brandon Ingram
flat → up).

## Injuries (INJ) — as of 2026-09-28

Checked against the CBS Sports injury report, then team and beat reports:

- **Removed: Tyrese Haliburton.** He'll be "100% full go" when camp opens
  (Pacers GM Chad Buchanan, Sep 25; RotoWire, CBS, Yahoo). This matters: the
  Pick coach hard-passes INJ players as "out for the season".
- **Updated: Cam Whitmore.** Signed with Denver and reported trending toward
  full health, but not reported fully cleared. He stays listed.
- **Unchanged and consistent with CBS:** Butler and Moody (out until at least
  Dec 1), Mark Williams (Feb 1), Sharpe (Mar 1), DiVincenzo (Apr 1), plus Brandon
  Miller, Lively (not cleared for camp) and Suggs (camp status in doubt).
- **Not added: Kon Knueppel.** Hamstring strain, out for the preseason,
  re-evaluated in the first week of the season. The coach's blanket INJ hard pass
  would be wrong for a short absence. Fix the coach first (see the ranking review).
- Kyrie Irving (no restrictions) and Alex Sarr (expected ready for the opener)
  stay unflagged.

## Better data: what was evaluated

The environment now has full network access, so each candidate was checked:

| Source | Finding | Used? |
|---|---|---|
| Hashtag Basketball ADP | Yahoo + Fantrax per player, updated a few times a week | **Yes** (Yahoo, Fantrax only) |
| Yahoo draft analysis (direct) | Would add **% drafted**, which fixes the late-round compression noted in the review. The page renders by JavaScript; plain fetches have no rows. Headless Chromium here doesn't trust the proxy certificate and can't be given it. | Not yet |
| FantasyPros NBA ADP | Only Yahoo, ESPN and AVG (AVG includes ESPN) | No: adds nothing, and ESPN |
| Basketball Monster ADP | Redirects to login | No |

**Best next data upgrades:**

1. **Yahoo % drafted** through the Yahoo integration's OAuth worker (the Yahoo
   Fantasy API's `draft_analysis` has `average_pick` and `percent_drafted`).
   It would fix ADP compression for rarely-drafted players.
2. **2026-27 projections** (Hashtag or Basketball Monster), to give rookies and
   injured stars real category values and make Rank and grades forward-looking.
   Bigger change: the app is deliberately last-season-based today, so this is a
   product decision.

`DATA_VERSION` → `2026-09-28b` (resets saved drafts). 16/16 test files pass;
the audit is clean.
