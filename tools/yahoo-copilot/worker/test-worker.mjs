import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { createWorker, mlidFromInput, parseWatchInput } from "./src/index.mjs";

class MemoryKV {
  constructor() { this.values = new Map(); this.ttl = new Map(); }
  async get(key) { return this.values.get(key) || null; }
  async put(key, value, options = {}) { this.values.set(key, value); this.ttl.set(key, options.expirationTtl); }
  async delete(key) { this.values.delete(key); this.ttl.delete(key); }
  keys(prefix) { return [...this.values.keys()].filter((key) => key.startsWith(prefix)); }
}

/* Two Yahoo users. Each OAuth code and token maps to one of them. */
const USERS = {
  alice: { guid: "GUIDALICE", code: "code-alice", refresh: "refresh-alice", access: "access-alice", league: "111", position: 3, team: "Alice Team" },
  bob: { guid: "GUIDBOB", code: "code-bob", refresh: "refresh-bob", access: "access-bob", league: "222", position: null, team: "Bob Team" },
};
const byCode = (code) => Object.values(USERS).find((u) => u.code === code);
const byRefresh = (token) => Object.values(USERS).find((u) => u.refresh === token);
const byAccess = (token) => Object.values(USERS).find((u) => u.access === token);

function leagueEnvelope(key, resource, value) {
  return { fantasy_content: { league: [{ league_key: key, num_teams: 12 }, { [resource]: value }] } };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const calls = [];
let revoked = false;
async function fakeFetch(input, init = {}) {
  const url = String(input);
  const headers = new Headers(init.headers || {});
  calls.push({ url, auth: headers.get("Authorization") });
  if (url.includes("/oauth2/get_token")) {
    const body = new URLSearchParams(String(init.body));
    if (body.get("grant_type") === "authorization_code") {
      const user = byCode(body.get("code"));
      return jsonResponse({ access_token: user.access, refresh_token: user.refresh, expires_in: 3600, xoauth_yahoo_guid: user.guid });
    }
    const user = byRefresh(body.get("refresh_token"));
    if (!user || revoked) return jsonResponse({ error: "invalid_grant" }, 400);
    return jsonResponse({ access_token: user.access, expires_in: 3600 });
  }
  const user = byAccess((headers.get("Authorization") || "").replace("Bearer ", ""));
  if (!user) return jsonResponse({ error: "unauthorized" }, 401);
  const league = (/league\/478\.l\.(\d+)/.exec(url) || [])[1];
  const key = `478.l.${league}`;
  if (url.includes("/fantasy/v2/game/nba")) return jsonResponse({ fantasy_content: { game: [{ game_key: "478" }] } });
  if (league !== user.league) return jsonResponse({ error: "not a member" }, 403);
  if (url.includes("/settings")) {
    return jsonResponse(leagueEnvelope(key, "settings", [{ is_auction_draft: "0", roster_positions: [
      { roster_position: { position: "PG", count: 1 } },
      { roster_position: { position: "C", count: 1 } },
      { roster_position: { position: "BN", count: 1 } },
    ] }]));
  }
  if (url.includes("/teams")) {
    return jsonResponse(leagueEnvelope(key, "teams", {
      0: { team: [[{ team_key: `${key}.t.1` }, { name: "Rival" }, { draft_position: 1 }]] },
      1: { team: [[{ team_key: `${key}.t.2` }, { name: user.team }, { is_owned_by_current_login: 1 }, user.position ? { draft_position: user.position } : {}]] },
      count: 2,
    }));
  }
  if (url.includes("/draftresults")) {
    return jsonResponse(leagueEnvelope(key, "draft_results", {
      0: { draft_result: { pick: "1", round: "1", team_key: `${key}.t.1`, player_key: `478.p.${league}` } },
      1: { draft_result: { pick: "2", round: "1", team_key: `${key}.t.2` } },
      count: 2,
    }));
  }
  if (url.includes("/players;player_keys=")) {
    return jsonResponse(leagueEnvelope(key, "players", {
      0: { player: [{ player_key: `478.p.${league}` }, { name: { full: league === "111" ? "Victor Wembanyama" : "Nikola Jokic" } }] },
      count: 1,
    }));
  }
  if (url.includes("/fantasy/v2/league/")) return jsonResponse({ fantasy_content: { league: [{ league_key: key, num_teams: 12, name: "Mock" }] } });
  throw new Error(`Unexpected URL ${url}`);
}

const env = {
  PAGE_ORIGIN: "https://tony-draft-lab-yahoo.pages.dev",
  YAHOO_CLIENT_ID: "test-client-id",
  YAHOO_CLIENT_SECRET: "test-client-secret",
  TOKEN_ENC_KEY: Buffer.from(webcrypto.getRandomValues(new Uint8Array(32))).toString("base64"),
  YAHOO_SESSIONS: new MemoryKV(),
  AUTH_LIMITER: { async limit() { return { success: true }; } },
};
const kv = env.YAHOO_SESSIONS;
const worker = createWorker(fakeFetch);
const origin = env.PAGE_ORIGIN;

function api(path, token, options = {}) {
  const headers = { Origin: origin, ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  return worker.fetch(new Request(`https://worker.example${path}`, { ...options, headers }), env);
}

function postJson(path, token, body) {
  return api(path, token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

/* Runs the whole sign-in flow for one user and returns their session token. */
async function signIn(user) {
  let response = await worker.fetch(new Request("https://worker.example/oauth/start"), env);
  assert.equal(response.status, 303, "sign-in starts without an invite code or watch token");
  const authorizationUrl = new URL(response.headers.get("Location"));
  assert.equal(authorizationUrl.hostname, "api.login.yahoo.com");
  assert.equal(authorizationUrl.searchParams.get("redirect_uri"), "https://worker.example/oauth/callback");
  const state = authorizationUrl.searchParams.get("state");

  response = await worker.fetch(new Request(`https://worker.example/oauth/callback?code=${user.code}&state=${state}`), env);
  assert.equal(response.status, 303);
  const back = new URL(response.headers.get("Location"));
  assert.equal(back.origin, origin, "the callback returns to the Draft Lab page");
  const code = /^#yhlogin=(.+)$/.exec(back.hash)[1];
  assert.equal(kv.ttl.get(`login:${code}`), 60, "the one-time code expires after 60 seconds");

  response = await postJson("/api/session", null, { code });
  assert.equal(response.status, 201);
  const { token } = await response.json();
  assert.ok(token);

  response = await postJson("/api/session", null, { code });
  assert.equal(response.status, 401, "a one-time code works only once");
  return token;
}

assert.equal(mlidFromInput("2440822"), "2440822");
assert.equal(mlidFromInput("https://basketball.fantasysports.yahoo.com/draftclient/f1/2440822"), "2440822");
assert.equal(parseWatchInput({ roomUrl: "https://basketball.fantasysports.yahoo.com/mock_waiting?mlid=2440822" }).mlid, "2440822");
assert.throws(() => mlidFromInput("https://example.com/?mlid=2440822"), /yahoo\.com/);

let response = await api("/api/board", null);
assert.equal(response.status, 401, "board rejects a request with no session");
assert.equal((await response.json()).error.code, "signed_out");

response = await api("/api/me", "made-up-token");
assert.equal(response.status, 401, "an unknown session token is rejected");

const aliceToken = await signIn(USERS.alice);
const bobToken = await signIn(USERS.bob);

for (const user of Object.values(USERS)) {
  const stored = await kv.get(`user:${user.guid}`);
  assert.ok(stored, "each user gets their own stored record");
  assert.ok(!stored.includes(user.refresh), "refresh tokens are encrypted at rest");
}
for (const key of kv.keys("session:")) {
  const stored = await kv.get(key);
  assert.ok(!stored.includes(aliceToken) && !stored.includes(bobToken), "session tokens are stored only as hashes");
}

response = await api("/api/me", aliceToken);
assert.equal(response.status, 200);

/* Alice's draft order is set; Bob's mock lobby has no order yet. */
response = await postJson("/api/watch", aliceToken, { roomUrl: "https://basketball.fantasysports.yahoo.com/mock_waiting?mlid=111" });
assert.equal(response.status, 201);
const aliceWatch = await response.json();
assert.equal(aliceWatch.draftId, "478.l.111");
assert.equal(aliceWatch.userSlot, 3, "the slot comes from the user's Yahoo team");
assert.equal(aliceWatch.userTeamName, "Alice Team");
assert.equal(aliceWatch.rounds, 3);

response = await postJson("/api/watch", bobToken, { roomUrl: "222" });
assert.equal(response.status, 201);
const bobWatch = await response.json();
assert.equal(bobWatch.draftId, "478.l.222");
assert.equal(bobWatch.userSlot, null, "no slot until Yahoo sets the draft order");

response = await postJson("/api/watch", bobToken, { roomUrl: "111" });
assert.equal(response.status, 502, "a user can't watch a draft their Yahoo account can't read");

response = await api("/api/board", aliceToken);
const aliceBoard = await response.json();
assert.equal(aliceBoard.ok, true);
assert.equal(aliceBoard.draftId, "478.l.111", "watches are kept per user");
assert.equal(aliceBoard.pickCount, 1, "unmade Yahoo slots are excluded from completed picks");
assert.equal(aliceBoard.picks[0].playerName, "Victor Wembanyama");
assert.match(aliceBoard.boardHash, /^[a-f0-9]{64}$/);

USERS.bob.position = 7;
response = await api("/api/board", bobToken);
const bobBoard = await response.json();
assert.equal(bobBoard.draftId, "478.l.222");
assert.equal(bobBoard.picks[0].playerName, "Nikola Jokic");
assert.equal(bobBoard.userSlot, 7, "the slot fills in once Yahoo sets the draft order");

const draftCalls = calls.filter((call) => call.url.includes("/draftresults"));
assert.ok(draftCalls.some((call) => call.url.includes("478.l.111") && call.auth === "Bearer access-alice"));
assert.ok(draftCalls.some((call) => call.url.includes("478.l.222") && call.auth === "Bearer access-bob"));
assert.ok(!draftCalls.some((call) => call.url.includes("478.l.222") && call.auth === "Bearer access-alice"), "each user reads Yahoo with their own token");

response = await api("/api/board", aliceToken, { headers: { Origin: "https://evil.example" } });
assert.equal(response.status, 403, "other sites are refused");

response = await postJson("/api/disconnect", bobToken, {});
assert.equal(response.status, 200);
assert.equal(await kv.get(`user:${USERS.bob.guid}`), null, "disconnect deletes the stored Yahoo token");
assert.equal(await kv.get(`watch:${USERS.bob.guid}`), null, "disconnect deletes the watch");
response = await api("/api/board", bobToken);
assert.equal(response.status, 401, "disconnect ends the session");
response = await api("/api/board", aliceToken);
assert.equal(response.status, 200, "other users are unaffected");

/* Fresh isolate, so the access-token cache is empty and the Worker must refresh. */
const { createWorker: createFresh } = await import(`./src/index.mjs?fresh=${Date.now()}`);
revoked = true;
response = await createFresh(fakeFetch).fetch(new Request("https://worker.example/api/board", {
  headers: { Origin: origin, Authorization: `Bearer ${aliceToken}` },
}), env);
assert.equal(response.status, 401, "a user who revoked Draft Lab in Yahoo is signed out");
assert.equal(await kv.get(`user:${USERS.alice.guid}`), null);

console.log("yahoo worker tests passed");
