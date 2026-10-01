# Mobile draft room

Implemented locally on September 30, 2026. Not deployed.

Phones at widths up to 700px use one main view with persistent Players,
My team, Board, and Analysis navigation. The status strip, search, filters,
and pagination remain reachable while the player list scrolls.

Selecting a player opens a native dialog with historical stats, injury
details, and existing Pick coach advice. Close and the named Draft button
stay reachable while advice scrolls. Selection does not draft a player.
Escape closes the dialog and restores focus to the player row.

View changes preserve each view's scroll position during the current session.
Search and filters retain their existing browser persistence. Mobile drafting
keeps the current list page; desktop retains its existing behavior. Category
outlook is under Analysis. Undo and Restart are under More.

Desktop layouts above 700px retain the existing controls, including the coach
dock on tablets through 900px. Setup and completed drafts use the existing
page layout without the draft room's scroll lock.

## Verification

`npm test` passes all 17 existing test files.

`scripts/verify-mobile.cjs` is an optional real-browser check using Playwright
and installed Edge. It requires Playwright on Node's module path; it adds no
application dependency. Run `node scripts/verify-mobile.cjs` after setting
`NODE_PATH` to a directory containing Playwright. `MOBILE_SCREENSHOT` can name
a PNG output path for the player list and details screenshots.

Verified at 390×844, 320×568, 430×932, and 667×375: navigation, search,
filters, advice, explicit drafting, undo, list scroll restoration, sheet
focus restoration, persistent Close/Draft controls, horizontal fit, and
resize to the desktop layout. A full 13-round draft reaches the completion
screen and releases the mobile scroll lock. No browser script errors occurred.

Checks use local assets and the coach's unavailable-service fallback. They
do not verify the hosted coach service, physical-device keyboard behavior,
or Safari. Before publishing, check iPhone Safari and Android Chrome with
their on-screen keyboards and verify the deployed draft flow.
