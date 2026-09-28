# Recommended changes for Yahoo Draft Copilot

## Skip redeploy-per-pick

A deployment is the wrong storage mechanism for live draft state. The current
test confirms the problem: requesting `yh-sync.json` before it exists returns
the entire application HTML with HTTP 200.

Use a Worker endpoint instead:

```text
GET /api/yahoo-draft/:session
```

Return JSON with `Cache-Control: no-store`. KV is adequate if its polling
latency is acceptable. Use a Durable Object only if the app later needs ordered
updates or multiple connected clients.

## Make board snapshots replaceable and idempotent

The rule "apply only when the pick count is ahead" misses corrections,
reversals, and changed picks with the same count.

Each snapshot should contain:

```js
{
  draftId,
  version,
  updatedAt,
  teams,
  rounds,
  userSlot,
  picks: [
    {
      overallPick,
      yahooPlayerId,
      playerName,
      teamNumber,
      playerIndex // null when not mapped
    }
  ]
}
```

Draft Lab should replace its external board with the newest valid snapshot. It
should not append inferred changes.

## Stop using `-1` as a player

The existing application expects each `state.log` entry to be a valid index
into `PLAYERS`. A `-1` sentinel can reach roster grades, scarcity, playoff
counts, and Pick Coach payloads.

Treat an unmatched Yahoo player as a real draft pick with `playerIndex: null`.
The player still consumes a board position, but player-analysis code must
exclude that record explicitly.

Match players by Yahoo player ID where possible. Use normalized names only as
a fallback.

## Disable advice when synchronization is stale

Do not show a Pick Coach recommendation when the Yahoo board may be stale.

The page should show:

- The last successful update time
- The current Yahoo pick number
- The connection state
- A stale warning after a short timeout

Cancel an in-flight Jev request when a newer Yahoo snapshot arrives. Request
new advice only after Draft Lab applies the latest board and confirms that it
is Tony's turn.

## Reduce update latency

The proposed worst-case delay is almost one minute. That delay can consume
most of a Yahoo pick timer.

Target five to ten seconds from a Yahoo pick to the updated Draft Lab board. If
Yahoo's API cannot support that polling rate, prefer the browser-extension
approach because it can observe the visible pick log as Yahoo updates it.

## Add a browser-extension option

If mock lobbies are not API-readable, a read-only Chrome extension is likely
the best architecture for this personal tool:

```text
Yahoo draft tab
    -> content script observes the pick log
extension background
    -> Draft Lab side panel or companion tab
```

This option avoids:

- Yahoo OAuth credentials
- The agent VM
- Cloudflare mailbox tokens
- API polling delays
- Site redeployments during the draft

Yahoo may change its page structure, which could require selector updates. For
a personal tool used during draft season, that maintenance may still be
simpler than operating an OAuth service.

## Tighten the security design

If the project uses the Worker architecture:

- Store Yahoo credentials only as encrypted Worker secrets.
- Never place OAuth tokens, Yahoo cookies, or the room URL in Draft Lab storage.
- Give each draft a random, short-lived session ID.
- Expire session data after a few hours.
- Restrict CORS to the exact Draft Lab host.
- Rate-limit session creation and polling.
- Accept only valid Yahoo URLs.
- Never give the browser a Cloudflare API token.

## Resolve the deployment-rule conflict

The plan says that every deployment requires explicit approval, but
`publish.py run` automatically redeploys after it detects picks. Those rules
conflict.

The `test/yahoo-draft-copilot` branch is also absent from the shared local
repository and GitHub. The test site exists, but the repository does not
contain the implementation described in the plan. Push the branch or open a
draft pull request before more work happens.

## Revised roadmap

### 1. Run a live feasibility probe

Prove or disprove live mock-lobby access through Yahoo's API.

Join one live mock and record:

- Whether the room URL contains usable identifiers
- Whether the authenticated Fantasy API can access the mock
- Whether `draftresults` updates while the draft is active
- How long each pick takes to appear
- Whether each result includes a stable Yahoo player ID

Do not connect Draft Lab during this probe.

### 2. Choose the source

- If the API works, use a Cloudflare Worker for Yahoo authorization and polling.
- If the API fails, use a browser extension to observe Yahoo's visible draft feed.

Do not build the VM mailbox. It adds temporary infrastructure and does not
prove the final integration.

### 3. Define the board snapshot contract

Include stable IDs, timestamps, versions, unmatched players, and draft
identity. Make full snapshots safe to apply more than once.

### 4. Integrate read-only live mode

Keep the integration advisory. Do not add CPU picks or Yahoo write actions.
Disable advice whenever the board is stale or inconsistent.

### 5. Run one full mock draft

Measure update latency, mapping failures, missed picks, corrections, and Jev
cancellation. Confirm that the manual sync-code path still works as a fallback.

### 6. Decide whether to promote the integration

Move the integration toward production only after a full mock draft completes
without missed picks or stale recommendations.

## Recommendation

Keep the Yahoo Live interface and the manual sync fallback. Remove the agent VM
mailbox and redeploy-per-pick design. Run the live Yahoo API probe next because
its result determines whether the final source is the Yahoo API or a browser
extension.
