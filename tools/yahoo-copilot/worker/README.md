# Yahoo draft watcher Worker

This standalone Cloudflare Worker reads a Yahoo NBA draft room and returns a
small, structured board to the Draft Lab test site. It does not affect the
production `tony-draft-lab` Pages project.

## Cloudflare resources

- Worker: `yahoo-draft-copilot`
- Site origin: `https://tony-draft-lab-yahoo.pages.dev`
- KV binding: `YAHOO_SESSIONS`

Set these as encrypted Worker secrets in Cloudflare. Never commit their values:

- `WATCH_TOKEN`: a private passphrase entered in Draft Lab when connecting
- `YAHOO_CLIENT_ID`: Yahoo app client ID
- `YAHOO_CLIENT_SECRET`: Yahoo app client secret
- `YAHOO_REFRESH_TOKEN`: optional bootstrap fallback; the normal setup flow creates and rotates this credential in KV

Add this exact redirect URI to the Yahoo app:

`https://yahoo-draft-copilot.tonyjaysales.workers.dev/oauth/callback`

After deploying and setting `WATCH_TOKEN`, `YAHOO_CLIENT_ID`, and
`YAHOO_CLIENT_SECRET`, visit `/oauth/start`. Enter the watch token and approve
the app in Yahoo. The Worker exchanges the one-time code itself, keeps the
refresh token in KV, and preserves any rotated replacement. The browser never
receives the Yahoo credentials.

## Local checks and deployment

From this directory:

```text
npm test
npx wrangler deploy --dry-run
npx wrangler deploy
```

`GET /health` is public and reports only whether required configuration is
present. The watch and board endpoints require `Authorization: Bearer` with the
configured `WATCH_TOKEN` and accept browser requests only from the test site.

