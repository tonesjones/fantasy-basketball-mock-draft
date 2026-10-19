# Yahoo draft watcher Worker

This standalone Cloudflare Worker lets each Draft Lab user sign in with their
own Yahoo account and follow their own Yahoo NBA draft. It reads the draft
room with that user's Yahoo token and returns a small, structured board to the
Draft Lab Yahoo site. It does not affect the production `tony-draft-lab`
Pages project.

## Cloudflare resources

- Worker: `yahoo-draft-copilot`
- Site origin: `https://tony-draft-lab-yahoo.pages.dev` (`PAGE_ORIGIN` in
  `wrangler.jsonc`)
- KV binding: `YAHOO_SESSIONS`
- Rate limit binding: `AUTH_LIMITER`, applied per IP to sign-in starts and
  failed session lookups

Set these as encrypted Worker secrets. Never commit their values:

- `YAHOO_CLIENT_ID`: Yahoo app client ID.
- `YAHOO_CLIENT_SECRET`: Yahoo app client secret.
- `TOKEN_ENC_KEY`: a base64 32-byte key that encrypts each user's Yahoo
  refresh token in KV. To generate one, run
  `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.

Changing `TOKEN_ENC_KEY` signs everyone out, because the stored tokens no
longer decrypt.

The Yahoo app's redirect URI is
`https://yahoo-draft-copilot.tonyjaysales.workers.dev/oauth/callback`. Give
the app Fantasy Sports read access and the OpenID Connect Profile permission.
Without Profile, Yahoo hides the user's GUID as `--hidden--` and sign-in
fails.

## How sign-in works

1. The page links to `/oauth/start`. The Worker redirects to Yahoo.
2. Yahoo returns to `/oauth/callback`. The Worker exchanges the code,
   identifies the user by their Yahoo GUID, and stores the encrypted
   refresh token under `user:<guid>`.
3. The Worker redirects to the page with `#yhlogin=<code>`. The code works
   once and expires after 60 seconds.
4. The page posts the code to `/api/session` and gets a session token. It
   keeps the token in `localStorage` and sends it as
   `Authorization: Bearer <token>`. KV stores only a SHA-256 hash of the
   token, under `session:<hash>`, for 30 days.

The page never receives a Yahoo token. If Yahoo rejects a user's refresh
token, for example because they removed Draft Lab from their Yahoo account,
the Worker deletes that user's record and answers 401.

## Endpoints

| Method and path | Auth | Purpose |
|---|---|---|
| `GET /health` | none | Reports whether KV, the Yahoo client, and `TOKEN_ENC_KEY` are configured. |
| `GET /oauth/start` | none | Starts Yahoo sign-in. |
| `GET /oauth/callback` | none | Finishes Yahoo sign-in and redirects to the page. |
| `POST /api/session` | none | Trades a one-time `code` for a session `token`. |
| `GET /api/me` | session | Returns 200 while the session is valid. |
| `POST /api/watch` | session | Starts watching `roomUrl` and returns the board. |
| `GET /api/board` | session | Returns the current board for the user's watch. |
| `GET /api/leagues` | session | Lists the user's NBA leagues this season and their team in each. |
| `GET /api/season?league=<key>` | session | Returns the user's roster, this week's opponent roster, free agents and waiver players for the season manager. |
| `GET /api/season-diagnostics?league=<key>` | session | Returns raw Yahoo stat and ownership samples from the league, for building minutes-based scoring. |
| `POST /api/disconnect` | session | Deletes the user's Yahoo token, watch, and session. |

Requests from any origin except `PAGE_ORIGIN` get 403. Each user has one
watch, stored under `watch:<guid>` for 8 hours.

`POST /api/watch` finds the user's team from Yahoo's
`is_owned_by_current_login` flag and takes the slot from its
`draft_position`. If the user has no team in that draft, it answers 400. If
Yahoo hasn't set the draft order yet, the board's `userSlot` is `null`, and
each `GET /api/board` checks again until it is set.

`GET /api/season` reads the league settings, every team's roster, the
scoreboard, three pages of free agents (`status=FA`) and two of waiver players
(`status=W`), both in Yahoo's overall rank order (`sort=OR`). Each player is
`{ playerKey, name, nbaTeam, positions, status, injuryNote, selectedPosition }`;
available players also carry `availability` (`FA` or `W`). Players from last
week's best-available list (`sort=AR;sort_type=lastweek`) carry `hot: true`;
ones not already listed are added with `availability: "A"`. `injured` lists
every rostered player in the league whose status is `O`, `INJ` or `SUSP`, with
`fantasyTeam` and `mine`. The opponent is
`null` when the scoreboard has no matchup for the user. The page does the
valuing (`season-core.js`); the Worker only reads Yahoo.

## Test and deploy

From this directory:

```text
npm test
npx wrangler deploy --dry-run
npx wrangler deploy
```

`npm test` at the repo root also runs these tests through
`test-yahoo-worker.js`.

Deploy the Worker at the same time as the page change that uses it. The
current page sends a session token, and an older Worker expects the retired
watch token.

## Injury news

`GET /api/news` requires the same bearer session as `/api/leagues` and returns
`{ ok: true, espn, rotowire, rotowireAllowed }`. Missing snapshots are `null`.
ESPN injuries are available to all signed-in users. RotoWire RSS content is
returned only to Yahoo GUIDs in `NEWS_OWNER_GUIDS`, a comma-separated Worker
environment variable (empty by default). Set it through the Cloudflare Worker
settings. `GET /api/me` now includes the caller's own `guid` alongside `ok` and
`signedIn`, so the owner can find their value. Other users receive
`rotowire: null` and `rotowireAllowed: false`.

The `*/5 * * * *` cron polls RotoWire every five minutes and ESPN when its stored
snapshot is at least ten minutes old. The existing `YAHOO_SESSIONS` KV stores
`news:espn` (`fetchedAt`, `players`) and `news:rotowire` (`fetchedAt`, `items`).
RotoWire items merge by GUID, newest first, keeping at most 150 from the last
48 hours. ESPN comments are limited to 280 characters.

Unchanged content is not written again until its `fetchedAt` is at least
30 minutes old; timestamps reflect persisted successful refreshes. At the
configured cron frequency, even changing content requires at most 432 news
writes per day (288 RotoWire and 144 ESPN), excluding inline refreshes and
other application writes. The endpoint refreshes missing or 40-minute-old
snapshots inline, fetching RotoWire only for allowed owners. Each source keeps
its previous snapshot on failure and logs a warning. Requests use a ten-second
timeout and reject bodies larger than 5 MB. Tests use synthetic fixtures and
never contact either source.
