# ADP capture, 4 October 2026

Source: https://hashtagbasketball.com/fantasy-basketball-adp

Source stamp: **04 October 2026**. Captured on 4 October 2026. Downloaded HTML SHA-256: `20163cfb166079929c378aa82e50cd57552a440750abce7a41c83c15505360c4`.

`hashtag-adp.csv` contains 420 rows extracted with the existing `scripts/hashtag-adp-to-csv.js`. Only Yahoo and Fantrax ADPs and Yahoo position eligibility were extracted. No ESPN or blended values were used. Raw HTML and pre-refresh snapshots are retained locally under ignored `.audit/2026-10-04-refresh/`; the repeatable source CSV and pre-import `refresh-report.txt` are the versioned evidence.

To apply to the prior data:

```powershell
node scripts/refresh-adp.js scripts/data-provenance/2026-10-04-refresh/hashtag-adp.csv --apply
node scripts/generate-movers.js
node scripts/rebuild-rank.js
```

The refresh matched 257/270 players and changed 179 Yahoo and 227 Fantrax values. After importing, matched-player ADP differences are zero. Team/position differences were reported only. See `docs/data-refresh-2026-10-04.md` for the injury changes and remaining review items.

Validation: 21/21 test suites; data audit has zero errors; generated rank order is current; historical stats, positions, teams and prior team history match the pre-refresh snapshot.

The standard formatting check, JavaScript syntax checks and `git diff --check` passed.

Browser validation with installed Edge passed at 390x844, 320x568, 430x932 and 667x375, including drafting, Undo, navigation, scroll and desktop resizing. The 1280x900 desktop check also passed. The bundled Playwright Chromium executable was unavailable, so the check used the script's supported `MOBILE_BROWSER_CHANNEL=msedge` option.
