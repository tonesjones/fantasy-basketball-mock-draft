# Yahoo ADP workbook extraction — 2026-09-29

Source: user-supplied `yahoo adp.xlsx`, captured 29 September 2026, SHA-256 `531521340325b92bd2053f74c32dfdae366c90b5fc619850d46cdc3589ac130f`. The source workbook remains in the user's Downloads folder; this directory stores only the extracted data needed to repeat the app update.

The workbook has one sheet. Each player occupies a rank row followed by name and team/position rows; single-letter separator rows are ignored. `yahoo-adp.csv` contains the player name, team, position and the **All Drafts** ADP column. A source dash becomes a blank cell. The Preseason, Rank, Pos Rank, CER and %Drafted columns were not used. The 230 embedded portraits were not copied.

The extracted table has 240 players, 190 numeric ADPs and 50 blanks. Refresh with `node scripts/refresh-adp.js scripts/data-provenance/2026-09-29-yahoo-direct/yahoo-adp.csv`; the `--apply` flag writes Yahoo values into `player-data.js` after review. Fantrax remains from Hashtag Basketball's 25 September table.
