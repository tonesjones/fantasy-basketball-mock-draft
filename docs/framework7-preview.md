# Framework7 player-sheet preview

This is a comparison preview on `codex/framework7-preview`. It does not replace
the main deployment. Open `/framework7.html` on the branch deployment for the
Framework7 sheet, or `/` on the same deployment for the existing native sheet.
Both use the same player data, draft engine, and Pick coach logic.

Compare opening a player, expanding advice, scrolling advice, swiping the
handle down to close, and drafting. Close and Draft should stay reachable at
both sheet heights. Closing should return to the same list position. Test on
a physical phone with its browser keyboard as well as desktop.

Framework7 9.2.0 is pinned and served locally from `vendor/framework7`, with its
MIT license included. The preview uses the bundle to avoid adding a build step.
If adopted, review the cost of loading the full bundle and consider including
only the modules actually used. Only `framework7.html` loads Framework7 assets.

The optional real-browser check supports both entrypoints:

```powershell
# NODE_PATH must point to an existing installation of Playwright.
node scripts/verify-mobile.cjs
$env:MOBILE_ENTRYPOINT='/framework7.html'
node scripts/verify-mobile.cjs
```

## Tokenomics check

The parent session metadata records `gpt-6.1-sol`. The router recommends Luna
for a substantial independent mechanical task when that model is supplied.
The sheet adapter was delegated with an explicit `gpt-6-luna` override and no
history fork. The child's recorded turn metadata confirms `gpt-6-luna`.
The parent owns application wiring, review, verification, and deployment.

The earlier mobile job passed `unknown` as the current model, so the no-pricing
fallback could not establish a cheaper parent-to-child route and chose `stay`.
That was an invocation problem. Tests of the installed router also confirm
that a small mechanical task stays in the parent by policy. Creating a new
agent solely to make a commit is usually more overhead than the command itself.
No dollar or subscription-credit savings were measured. Global skill files
were not changed.
