import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { createWorker, mlidFromInput, parsePlayer, parseWatchInput } from "./src/index.mjs";

class MemoryKV {
  constructor() { this.values = new Map(); this.ttl = new Map(); }
  async get(key) { return this.values.get(key) || null; }
  async put(key, value, options = {}) { this.values.set(key, value); this.ttl.set(key, options.expirationTtl); }
  async delete(key) { this.values.delete(key); this.ttl.delete(key); }
  keys(prefix) { return [...this.values.keys()].filter((key) => key.startsWith(prefix)); }
}

/* Two Yahoo users. Each OAuth code and token maps to one of them. */
const USERS = {
  alice: { guid: "GUIDALICE", code: "code-alice", refresh: "refresh-alice", access: "access-alice", league: "111", position: 3, team: "Alice Team", metaTeams: 10 },
  bob: { guid: "GUIDBOB", code: "code-bob", refresh: "refresh-bob", access: "access-bob", league: "222", position: null, team: "Bob Team" },
};
const byCode = (code) => Object.values(USERS).find((u) => u.code === code);
const byRefresh = (token) => Object.values(USERS).find((u) => u.refresh === token);
const byAccess = (token) => Object.values(USERS).find((u) => u.access === token);

function leagueEnvelope(key, resource, value) {
  return { fantasy_content: { league: [{ league_key: key, num_teams: 12 }, { [resource]: value }] } };
}

function yahooPlayer(playerKey, full, team, eligible, selected, extra = {}) {
  const meta = [{ player_key: playerKey }, { name: { full } }, { editorial_team_abbr: team }, { display_position: eligible.join(",") },
    { eligible_positions: eligible.map((position) => ({ position })) }];
  Object.entries(extra).forEach(([k, v]) => meta.push({ [k]: v }));
  const player = [meta];
  if (selected) player.push({ selected_position: [{ coverage_type: "date" }, { position: selected }] });
  return { player };
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
  if (url.includes("/users;use_login=1/games;game_keys=nba/leagues")) {
    return jsonResponse({ fantasy_content: { users: { 0: { user: [{ guid: user.guid }, { games: { 0: { game: [{ game_key: "478" }, { leagues: {
      0: { league: [{ league_key: `478.l.${user.league}`, name: `${user.team} League`, num_teams: 12, scoring_type: "head", current_week: 1, draft_status: "postdraft" }] },
      1: { league: [{ league_key: "478.l.999", name: "Watched league", num_teams: 10, scoring_type: "head" }] },
      count: 2,
    } }] }, count: 1 } }] }, count: 1 } } });
  }
  if (url.includes("/users;use_login=1/games;game_keys=nba/teams")) {
    return jsonResponse({ fantasy_content: { users: { 0: { user: [{ guid: user.guid }, { games: { 0: { game: [{ game_key: "478" }, { teams: {
      0: { team: [[{ team_key: `478.l.${user.league}.t.2` }, { team_id: "2" }, { name: user.team }]] },
      count: 1,
    } }] }, count: 1 } }] }, count: 1 } } });
  }
  if (league !== user.league) return jsonResponse({ error: { description: "You are not allowed to view this page." } }, 403);
  if (url.includes("/settings")) {
    return jsonResponse(leagueEnvelope(key, "settings", [{ is_auction_draft: "0", roster_positions: [
      { roster_position: { position: "PG", count: 1 } },
      { roster_position: { position: "C", count: 1 } },
      { roster_position: { position: "BN", count: 1 } },
      { roster_position: { position: "IL", count: 1 } },
    ], stat_categories: { stats: [
      { stat: { stat_id: 9004003, display_name: "FGM/A", is_only_display_stat: "1" } },
      { stat: { stat_id: 5, display_name: "FG%" } },
      { stat: { stat_id: 12, display_name: "PTS" } },
      { stat: { stat_id: 19, display_name: "TO" } },
    ] } }]));
  }
  if (url.includes("/teams/roster")) {
    return jsonResponse(leagueEnvelope(key, "teams", {
      0: { team: [[{ team_key: `${key}.t.1` }, { name: "Rival" }], { roster: { coverage_type: "date", 0: { players: {
        0: yahooPlayer("478.p.1", "Nikola Jokic", "DEN", ["C", "Util"], "C"),
        count: 1,
      } } } }] },
      1: { team: [[{ team_key: `${key}.t.2` }, { name: user.team }, { is_owned_by_current_login: 1 }], { roster: { coverage_type: "date", 0: { players: {
        0: yahooPlayer("478.p.2", "Tyrese Maxey", "PHI", ["PG", "G", "Util"], "PG"),
        1: yahooPlayer("478.p.3", "Jusuf Nurkic", "UTA", ["C", "Util", "IL"], "IL", { status: "INJ", injury_note: "Toe" }),
        count: 2,
      } } } }] },
      count: 2,
    }));
  }
  if (url.includes("/scoreboard")) {
    return jsonResponse(leagueEnvelope(key, "scoreboard", { week: "1", 0: { matchups: { 0: { matchup: { week: "1", 0: { teams: {
      0: { team: [[{ team_key: `${key}.t.2` }]] },
      1: { team: [[{ team_key: `${key}.t.1` }]] },
      count: 2,
    } } } }, count: 1 } } }));
  }
  if (url.includes("/players;status=FA")) {
    const start = Number((/start=(\d+)/.exec(url) || [])[1]);
    const page = { count: 25 };
    for (let i = 0; i < 25; i++) page[i] = yahooPlayer(`478.p.${1000 + start + i}`, `Free Agent ${start + i}`, "BOS", ["SF", "F", "Util"]);
    return jsonResponse(leagueEnvelope(key, "players", page));
  }
  if (url.includes("/players;status=A;sort=AR;sort_type=lastweek")) {
    return jsonResponse(leagueEnvelope(key, "players", {
      0: yahooPlayer("478.p.1000", "Free Agent 0", "BOS", ["SF", "F", "Util"]),
      1: yahooPlayer("478.p.950", "Backup Center", "UTA", ["C", "Util"]),
      count: 2,
    }));
  }
  if (url.includes("/players;status=W")) {
    /* Yahoo sends an empty collection as a bare array. */
    if (/start=25/.test(url)) return jsonResponse(leagueEnvelope(key, "players", []));
    return jsonResponse(leagueEnvelope(key, "players", { 0: yahooPlayer("478.p.900", "Waiver Guy", "NY", ["PF", "F", "Util"]), count: 1 }));
  }
  if (url.includes("/teams")) {
    return jsonResponse(leagueEnvelope(key, "teams", {
      0: { team: [[{ team_key: `${key}.t.1` }, { name: "Rival" }, { draft_position: 1 }]] },
      1: { team: [[{ team_key: `${key}.t.2` }, { name: user.team }, { is_owned_by_current_login: 1 }, user.position ? { draft_position: user.position } : {}]] },
      count: 2,
    }));
  }
  if (url.includes("/draftresults")) {
    /* Twelve round 1 slots; only pick 1 is made. The user's team (t.2) sits at their draft position. */
    const slots = { count: 12 };
    for (let pick = 1; pick <= 12; pick++) {
      const team = pick === user.position ? 2 : pick === 1 ? 1 : 100 + pick;
      slots[pick - 1] = { draft_result: { pick: String(pick), round: "1", team_key: `${key}.t.${team}`, ...(pick === 1 ? { player_key: `478.p.${league}` } : {}) } };
    }
    return jsonResponse(leagueEnvelope(key, "draft_results", slots));
  }
  if (url.includes("/players;player_keys=")) {
    return jsonResponse(leagueEnvelope(key, "players", {
      0: { player: [{ player_key: `478.p.${league}` }, { name: { full: league === "111" ? "Victor Wembanyama" : "Nikola Jokic" } }] },
      count: 1,
    }));
  }
  if (url.includes("/fantasy/v2/league/")) return jsonResponse({ fantasy_content: { league: [{ league_key: key, num_teams: user.metaTeams || 12, name: "Mock" }] } });
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
assert.match((await response.json()).error.message, /HTTP 403 for \S+\. You are not allowed to view this page\./, "Yahoo errors name the resource and Yahoo's reason");

response = await api("/api/board", aliceToken);
const aliceBoard = await response.json();
assert.equal(aliceBoard.ok, true);
assert.equal(aliceBoard.draftId, "478.l.111", "watches are kept per user");
assert.equal(aliceBoard.pickCount, 1, "unmade Yahoo slots are excluded from completed picks");
assert.equal(aliceBoard.picks[0].playerName, "Victor Wembanyama");
assert.match(aliceBoard.boardHash, /^[a-f0-9]{64}$/);
assert.equal(aliceBoard.teams, 12, "the team count follows Yahoo's draft order when num_teams was read before the lobby filled");
assert.equal(aliceBoard.userSlot, 3);

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

/* In-season roster check. */
response = await api("/api/leagues", aliceToken);
assert.equal(response.status, 200);
const { leagues } = await response.json();
assert.deepEqual(leagues.map((l) => l.leagueKey), ["478.l.111"], "only leagues where the user has a team are listed");
assert.equal(leagues[0].teamKey, "478.l.111.t.2");
assert.equal(leagues[0].teamName, "Alice Team");

response = await api("/api/season?league=not-a-key", aliceToken);
assert.equal(response.status, 400, "a malformed league key is rejected");

response = await api("/api/season?league=478.l.111", aliceToken);
assert.equal(response.status, 200);
const season = await response.json();
assert.deepEqual(season.league.categories, ["FG%", "PTS", "TO"], "display-only stats are left out");
assert.ok(season.league.positions.some((p) => p.position === "IL"));
assert.equal(season.myTeam.name, "Alice Team");
assert.deepEqual(season.myTeam.players.map((p) => p.name), ["Tyrese Maxey", "Jusuf Nurkic"]);
const nurkic = season.myTeam.players[1];
assert.equal(nurkic.selectedPosition, "IL");
assert.equal(nurkic.status, "INJ");
assert.deepEqual(nurkic.positions, ["C", "Util", "IL"]);
assert.equal(season.opponent.name, "Rival", "the opponent comes from this week's scoreboard");
assert.deepEqual(season.opponent.players.map((p) => p.name), ["Nikola Jokic"]);
assert.equal(season.available.filter((p) => p.availability === "FA").length, 75, "three pages of free agents");
assert.deepEqual(season.available.filter((p) => p.availability === "W").map((p) => p.name), ["Waiver Guy"], "waiver paging stops on a short page");
assert.equal(season.available[0].availability, "W", "waiver players come first");

assert.equal(season.available.find((p) => p.name === "Free Agent 0").hot, true, "last week's hot list flags players already listed");
const backup = season.available.find((p) => p.name === "Backup Center");
assert.equal(backup.hot, true, "and adds ones the rank lists missed");
assert.equal(backup.availability, "A");
assert.deepEqual(season.injured.map((p) => [p.name, p.fantasyTeam, p.mine]), [["Jusuf Nurkic", "Alice Team", true]], "out players come from every roster");

response = await api("/api/season-diagnostics?league=478.l.111", aliceToken);
assert.equal(response.status, 200);
const diagnostics = await response.json();
assert.equal(diagnostics.samples.length, 6);
assert.ok(diagnostics.samples.every((sample) => sample.ok && typeof sample.body === "string"));
assert.ok(!JSON.stringify(diagnostics).includes("access-alice"), "diagnostics carry Yahoo bodies, never tokens");
response = await api("/api/season-diagnostics?league=478.l.111", bobToken);
assert.ok(!(await response.json()).samples.some((sample) => sample.ok && sample.path.includes("players")), "another user's league reads fail");

response = await api("/api/season?league=478.l.111", bobToken);
assert.equal(response.status, 502, "a user can't read another user's league");

assert.equal(parsePlayer(yahooPlayer("478.p.5", "No Positions", "LAL", [])).positions.length, 0);

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
