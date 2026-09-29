# Three.js makeover checkpoint

## Work and previews

- `codex/draft-lab-three-foundation` adds a lazy three.js punt radar with an SVG fallback, a pick card, an on-clock background cue, and the same pick card for new Yahoo user picks.
- `codex/draft-lab-three-explore-v2` builds on that branch. It adds a 3D draft board with a selectable team roster and a value point field. The existing board table and a labeled SVG value plot remain available. On mobile, the board scene opens only when requested.
- All three scenes use the existing Geist theme colors. Renderers, geometry, and materials are disposed when their host leaves the page. They render on changes instead of running an idle animation loop.
- Both branches were pushed to `https://github.com/tonesjones/fantasy-basketball-mock-draft.git` after the user approved that destination. No branch was merged.
- Cloudflare Pages checks succeeded for all three configured projects on both pushed commits. Browser checks used the immutable [foundation preview](https://9e89e9a1.tony-draft-lab-preview.pages.dev) at `c36e710` and [explore preview](https://d9f6aeb4.tony-draft-lab-preview.pages.dev) at `3d83463`.

## Verified

- All 18 test files pass. The Yahoo test covers a newly synced user pick triggering the pick card.
- Browser checks covered the radar mounting after its disclosure entered view, TO punt selection, a mock pick card, the board roster buttons, the value scene, and the mobile board disclosure.
- The browser reported no script errors during those checks.
- On the deployed previews, a mock pick showed the card, the radar loaded when visible, TO updated the radar, and the board team buttons and value field worked.
- The pinned three.js CDN response reported `Content-Encoding: gzip` and `Content-Length: 131524` bytes, below the plan's 200 KB target.
- Two mobile Lighthouse 13.5.0 navigation audits scored `91, 91` for the current `main` site and `89, 97` for the explore preview. First Contentful Paint was `2514, 2472` ms on `main` and `2054, 1273` ms on the preview. Lighthouse wrote valid reports, then exited with a Windows temporary-folder cleanup error. These samples show no observed five-point score regression, but they are not a mid-range phone test.

## Still to check

- Measure pick latency and frame rate during a full draft on a mid-range phone. The Lighthouse runs measured initial page load, not an open 3D scene.
- Exercise an actual Yahoo live draft and a forced WebGL failure and reduced-motion session. The code has fallbacks, but those environments have not been tested end to end.
- Review the changes before considering a merge. The foundation branch descends from `test/yahoo-draft-copilot` at `d80df96`, and the explore branch descends from foundation. They include unrelated development commits relative to `main`; neither branch should be merged directly into `main` as a makeover-only change.

## Next action

Review foundation against `test/yahoo-draft-copilot` and explore against foundation. Then test a real Yahoo draft and the reduced-motion/WebGL fallbacks. Promotion to `main` needs a separate, scoped decision after the base development work is ready.
