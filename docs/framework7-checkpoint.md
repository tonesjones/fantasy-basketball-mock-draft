# Framework7 preview checkpoint

September 30, 2026. Stopped at the user's suggested review point.

## Release state

- Production remains at `9bf6828`, with the native mobile player sheet and no
  More menu: https://tony-draft-lab.pages.dev/.
- Work is isolated on `codex/framework7-preview`. The initial checkpoint commit
  is `165bc88`. The branch is being pushed for cloud review at the user's request.
  Git integration may create a branch preview automatically; treat it as
  unverified. Do not merge or promote it until the interaction check passes.
- The preview entrypoint is `framework7.html`; `index.html` still loads the
  existing native sheet. Both use the same draft engine, player pool, and coach.
- No global skill files or model configuration were edited.

## Completed work

- Vendored Framework7 9.2.0 JS/CSS and MIT license under `vendor/framework7`.
- Added a separate preview entrypoint and adapter in `framework7-preview.js`
  and `framework7-preview.css`.
- Added mobile-only app hooks for mounting, opening, closing, and destroying
  the sheet controller.
- Added Expand/Less, a touch swipe handle, explicit named Draft action,
  keyboard Escape and focus containment, and background inert handling.
- Existing draft math, data, and coach evaluation logic are unchanged.
- Extended `scripts/verify-mobile.cjs` to select either entrypoint using
  `MOBILE_ENTRYPOINT` and exercise real touch drag events, sheet expansion,
  reopening, drafting, undo, resize, and completion cleanup.

## Verification and current failure

- All 17 existing test files passed. App and adapter syntax checks passed.
- Earlier preview browser runs passed at 390×844, 320×568, 430×932, and
  667×375, including expansion, swipe closure, and the basic draft flow.
- A stronger completion cleanup assertion then found 34 elements with
  `[inert]` still present after a full draft. A successful basic flow therefore
  did not establish correct lifecycle cleanup.
- Latest run, after making teardown restore inert state unconditionally and
  close Framework7 synchronously before destruction, failed during the
  13-round sequence. `scripts/verify-mobile.cjs:136` timed out waiting for
  `.pc-draft:not([disabled])` to be visible. It repeatedly found a hidden
  enabled button for Kon Knueppel, data-pi 39, with generic text `Draft`.
  This is consistent with the next player sheet not opening, but the precise
  cause is not proven.
- The native-entrypoint run also caught a test race immediately after changing
  viewport width. The test now waits for mobile navigation to detach/appear;
  that correction has not been verified in a final clean run.

## Attempted fixes and observations

1. The initial child adapter returned a controller from `mount`. Parent wiring
   was corrected to store and use that controller instead of global methods.
2. Framework7 initially moved sheets under `body`, outside the existing `#md`
   CSS scope. App root and modal container were changed to `#md`; destroy
   explicitly removes the sheet element so it cannot leave duplicate IDs.
3. Framework7 breakpoints translate a full-height sheet downward. Draft and
   scrolling content now compensate for that offset. Close/Expand widths were
   corrected against the framework's global button defaults.
4. CSS now permits Framework7's closing transform and preserves page scrolling
   outside the active mobile draft layout.
5. Touch checks now use taps rather than mixing mouse clicks after touch drags,
   and wait for viewport/closing transitions. Intermittent reopening failures
   still appeared after these changes.
6. Latest adapter teardown sets its destroyed guard, removes the key listener,
   restores inert state, calls `instance.close(false)`, then destroys and removes
   the sheet. This change is retained for inspection but is not a proven fix.

## Resolution (October 1, 2026)

The lifecycle failure had two independent causes, found by instrumenting each
turn of the 390px completion loop:

1. **Backdrop leak (real bug).** With `backdropUnique: true`, Framework7
   creates a `.sheet-backdrop` per sheet instance, and `instance.destroy()`
   does not remove it. `render()` remounts the sheet on every render, so two
   backdrops leaked per turn, each picking up `inert` handling on the next
   open (the growing `[inert]` count). Adapter `destroy` now removes the
   instance backdrop; the count stays at one.
2. **Tap target (test bug).** By round 9 the top available player could carry
   an injury tag. Tapping the row centre hit the nested injury toggle, which
   expands the injury note instead of opening the sheet. This is intended app
   behaviour; the native entrypoint passed only because AI picks left a
   different player on top. The check now taps the row's rank cell.

The browser check now launches Playwright's bundled Chromium by default (set
`MOBILE_BROWSER_CHANNEL=msedge` for Edge) and asserts backdrops never
accumulate. Both entrypoints passed all four viewports on three consecutive
runs in a Linux cloud environment; `npm test` passes 17/17.

Remaining before promotion: deployment checks, a deployed phone check, and
a decision on the full-bundle cost noted in `framework7-preview.md`.

## Original next action (superseded)

Run the preview check with Playwright available on `NODE_PATH`:

```powershell
$env:NODE_PATH='C:/Users/Owner/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'
$env:MOBILE_ENTRYPOINT='/framework7.html'
node scripts/verify-mobile.cjs
```

Before another general fix, instrument each turn of the 390px completion
sequence. Capture the selected player, `[open]`/modal classes, current controller
state, script errors, inert nodes and ancestor inert state, and whether the
player tap handler ran. Trace the boundary between `userDraft`,
`closeMobileSheet`, `render`, adapter `destroy`, and the next `mount/open`.
Determine whether a delayed close callback or Framework7 touch/modal lifecycle
is suppressing the next tap or restoring a stale inert snapshot. Keep that
diagnosis separate from the already-fixed positioning issues.

For cloud review, check out `codex/framework7-preview` and read this file first.
The browser check currently uses installed Microsoft Edge and a Windows-only
bundled Playwright path in the command above. In a Linux cloud environment, use
its available Playwright installation and Chromium launch instead of the
`msedge` channel. The pure 17-file suite runs with `npm test` without that
browser dependency. Do not mistake an unavailable browser for the sheet bug.

Then run both entrypoints, the 17-file suite, and the deployment checks. Publish
only the preview branch and verify the deployed phone flow before sending a
comparison link. Do not change main or remove the native sheet during review.

## Model routing evidence

The earlier tokenomics call used `--current-model unknown`; its no-pricing
fallback returned stay because it could not establish a cheaper parent tier.
Runtime metadata now confirms the parent as `gpt-6.1-sol`. Supplying that
verified model with substantial independent mechanical work returned delegate
to `gpt-6-luna`.

The adapter child `/root/framework7_sheet` was spawned with an explicit Luna
override and no history fork. Recorded child session
`01a0f5e7-c91d-70c0-ae03-6b214837b80b` confirms `gpt-6-luna`. Its implementation
was usable as a starting point, but parent review found integration and cleanup
issues. No Astra escalation occurred. No dollar or credit savings were measured.

The installed router also returns stay for a small standalone commit by policy.
Creating a child for that command alone generally costs more coordination than
the command itself. Existing child work can include its own commit when useful;
that is a different handoff decision.
