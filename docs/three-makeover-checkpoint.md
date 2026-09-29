# Three.js makeover checkpoint

## Local work

- `codex/draft-lab-three-foundation` adds a lazy three.js punt radar with an SVG fallback, a pick card, an on-clock background cue, and the same pick card for new Yahoo user picks.
- `codex/draft-lab-three-explore-v2` builds on that branch. It adds a 3D draft board with a selectable team roster and a value point field. The existing board table and a labeled SVG value plot remain available. On mobile, the board scene opens only when requested.
- Both scenes use the existing Geist theme colors. Renderers, geometry, and materials are disposed when their host leaves the page. They render on changes instead of running an idle animation loop.

## Verified

- All 18 test files pass. The Yahoo test covers a newly synced user pick triggering the pick card.
- Browser checks covered the radar mounting after its disclosure entered view, TO punt selection, a mock pick card, the board roster buttons, the value scene, and the mobile board disclosure.
- The browser reported no script errors during those checks.

## Still to check

- Measure the three.js transfer size, first paint, pick latency, Lighthouse score, and frame rate against the pre-change app on a mid-range phone.
- Exercise an actual Yahoo live draft and a forced WebGL failure and reduced-motion session. The code has fallbacks, but those environments have not been tested end to end.
- Push each branch, inspect its Cloudflare Pages preview, and review before merging. Automatic approval review rejected the first push because it would send repository contents to the GitHub remote and might start a Pages preview. No branch has been pushed or merged.

## Next action

After the user specifically authorizes pushing to `https://github.com/tonesjones/fantasy-basketball-mock-draft.git`, push the foundation branch and then the explore branch. Check both Pages previews and run the performance checks before considering a merge.
