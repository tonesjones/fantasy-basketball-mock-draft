const YAHOO_API = "https://fantasysports.yahooapis.com";
const YAHOO_TOKEN_URL = "https://api.login.yahoo.com/oauth2/get_token";
const SESSION_KEY = "watch:active";
const OAUTH_REFRESH_KEY = "oauth:refresh-token";
const OAUTH_STATE_PREFIX = "oauth:state:";
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const DEFAULT_ORIGIN = "https://tony-draft-lab-yahoo.pages.dev";

let tokenCache = null;

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  const allowed = env.PAGE_ORIGIN || DEFAULT_ORIGIN;
  const headers = {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin",
  };
  if (origin === allowed) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(request, env, status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(request, env),
  });
}

function errorBody(code, message) {
  return { ok: false, error: { code, message } };
}

function html(status, body) {
  return new Response(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/html; charset=utf-8",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function oauthPage(message) {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Draft Lab Yahoo setup</title><style>body{font:16px system-ui;max-width:540px;margin:10vh auto;padding:24px;color:#18202b}input,button{box-sizing:border-box;width:100%;padding:12px;margin:8px 0}button{cursor:pointer;font-weight:700}.note{color:#596579;font-size:14px}</style><h1>Draft Lab Yahoo setup</h1>${message}`;
}

function randomState() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sameSecret(actual, expected) {
  if (!actual || !expected) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(actual)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  const av = new Uint8Array(a);
  const bv = new Uint8Array(b);
  let diff = av.length ^ bv.length;
  for (let i = 0; i < Math.max(av.length, bv.length); i++) {
    diff |= (av[i] || 0) ^ (bv[i] || 0);
  }
  return diff === 0;
}

async function authorized(request, env) {
  const header = request.headers.get("Authorization") || "";
  const match = /^Bearer (.+)$/.exec(header);
  return sameSecret(match && match[1], env.WATCH_TOKEN);
}

async function rejectUnauthorized(request, env) {
  if (env.AUTH_LIMITER) {
    const colo = request.cf && request.cf.colo ? request.cf.colo : "unknown";
    const limited = await env.AUTH_LIMITER.limit({ key: `bad-auth:${colo}` });
    if (!limited.success) {
      return json(request, env, 429, errorBody("rate_limited", "Too many failed authorization attempts."));
    }
  }
  return json(request, env, 401, errorBody("unauthorized", "A valid watch token is required."));
}

function ensureAllowedOrigin(request, env) {
  const origin = request.headers.get("Origin");
  return !origin || origin === (env.PAGE_ORIGIN || DEFAULT_ORIGIN);
}

function mlidFromInput(value) {
  const raw = String(value || "").trim();
  if (/^\d{1,20}$/.test(raw)) return raw;
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Enter a Yahoo draft-room URL or numeric mlid.");
  }
  if (!/(^|\.)yahoo\.com$/i.test(url.hostname)) {
    throw new Error("The draft-room URL must use a yahoo.com hostname.");
  }
  const mlid = url.searchParams.get("mlid") || (/\/draftclient\/[^/]+\/(\d+)/.exec(url.pathname) || [])[1];
  if (!/^\d{1,20}$/.test(mlid || "")) {
    throw new Error("The Yahoo draft-room URL does not contain an mlid.");
  }
  return mlid;
}

function parseWatchInput(raw) {
  if (!raw || typeof raw !== "object") throw new Error("Request body must be JSON.");
  const mlid = mlidFromInput(raw.roomUrl || raw.mlid);
  const slot = Number(raw.userSlot ?? raw.slot);
  if (!Number.isInteger(slot) || slot < 1 || slot > 20) {
    throw new Error("Draft slot must be an integer from 1 through 20.");
  }
  return { mlid, slot };
}

function dicts(node, out = []) {
  if (node && typeof node === "object") {
    if (!Array.isArray(node)) out.push(node);
    Object.values(node).forEach((value) => dicts(value, out));
  }
  return out;
}

function first(node, key) {
  const found = dicts(node).find((value) => Object.prototype.hasOwnProperty.call(value, key));
  return found ? found[key] : null;
}

function leagueSub(payload, name) {
  const league = payload && payload.fantasy_content && payload.fantasy_content.league;
  const found = dicts(league).find((value) => Object.prototype.hasOwnProperty.call(value, name));
  if (!found) throw new Error(`Yahoo response omitted ${name}.`);
  return found[name];
}

async function getAccessToken(env, fetchImpl, force = false) {
  if (env.YAHOO_ACCESS_TOKEN && !force) return env.YAHOO_ACCESS_TOKEN;
  if (!force && tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.value;
  const storedRefresh = env.YAHOO_SESSIONS ? await env.YAHOO_SESSIONS.get(OAUTH_REFRESH_KEY) : null;
  const refreshToken = storedRefresh || env.YAHOO_REFRESH_TOKEN;
  if (!env.YAHOO_CLIENT_ID || !env.YAHOO_CLIENT_SECRET || !refreshToken) {
    throw new Error("Yahoo OAuth secrets are not configured.");
  }
  const basic = btoa(`${env.YAHOO_CLIENT_ID}:${env.YAHOO_CLIENT_SECRET}`);
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const response = await fetchImpl(YAHOO_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new Error(`Yahoo token refresh failed with HTTP ${response.status}.`);
  }
  tokenCache = {
    value: data.access_token,
    expiresAt: Date.now() + Math.max(60, Number(data.expires_in) || 3600) * 1000,
  };
  if (data.refresh_token && data.refresh_token !== storedRefresh) {
    await env.YAHOO_SESSIONS.put(OAUTH_REFRESH_KEY, data.refresh_token);
  }
  return tokenCache.value;
}

async function beginOAuth(request, env) {
  if (!env.YAHOO_CLIENT_ID || !env.YAHOO_CLIENT_SECRET || !env.YAHOO_SESSIONS) {
    return html(503, oauthPage("<p>Cloudflare is missing the Yahoo client credentials or KV binding.</p>"));
  }
  const form = await request.formData();
  if (!(await sameSecret(String(form.get("watchToken") || ""), env.WATCH_TOKEN))) {
    if (env.AUTH_LIMITER) {
      const colo = request.cf && request.cf.colo ? request.cf.colo : "unknown";
      const limited = await env.AUTH_LIMITER.limit({ key: `bad-oauth:${colo}` });
      if (!limited.success) return html(429, oauthPage("<p>Too many failed attempts. Wait a minute and try again.</p>"));
    }
    return html(401, oauthPage("<p>The watch token was not accepted.</p><p><a href=\"/oauth/start\">Try again</a></p>"));
  }
  const state = randomState();
  const redirectUri = `${new URL(request.url).origin}/oauth/callback`;
  await env.YAHOO_SESSIONS.put(`${OAUTH_STATE_PREFIX}${state}`, JSON.stringify({ redirectUri }), { expirationTtl: 600 });
  const auth = new URL("https://api.login.yahoo.com/oauth2/request_auth");
  auth.searchParams.set("client_id", env.YAHOO_CLIENT_ID);
  auth.searchParams.set("redirect_uri", redirectUri);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("state", state);
  return Response.redirect(auth.toString(), 303);
}

async function finishOAuth(request, env, fetchImpl) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state") || "";
  const code = url.searchParams.get("code") || "";
  if (url.searchParams.get("error")) return html(400, oauthPage("<p>Yahoo authorization was cancelled.</p>"));
  if (!state || !code) return html(400, oauthPage("<p>Yahoo did not return a complete authorization response.</p>"));
  const stateKey = `${OAUTH_STATE_PREFIX}${state}`;
  const saved = await env.YAHOO_SESSIONS.get(stateKey);
  if (!saved) return html(400, oauthPage("<p>This authorization link is invalid or has expired. Start again.</p>"));
  await env.YAHOO_SESSIONS.delete(stateKey);
  const { redirectUri } = JSON.parse(saved);
  const basic = btoa(`${env.YAHOO_CLIENT_ID}:${env.YAHOO_CLIENT_SECRET}`);
  const response = await fetchImpl(YAHOO_TOKEN_URL, {
    method: "POST",
    headers: { Accept: "application/json", Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", redirect_uri: redirectUri, code }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token || !data.refresh_token) {
    return html(502, oauthPage(`<p>Yahoo token exchange failed (HTTP ${response.status}). Start again.</p>`));
  }
  await env.YAHOO_SESSIONS.put(OAUTH_REFRESH_KEY, data.refresh_token);
  tokenCache = { value: data.access_token, expiresAt: Date.now() + Math.max(60, Number(data.expires_in) || 3600) * 1000 };
  return html(200, oauthPage("<p><strong>Yahoo is connected.</strong></p><p>You can close this tab and connect your draft from Draft Lab.</p><p class=\"note\">The Yahoo tokens were stored inside Cloudflare and were not shown in the browser.</p>"));
}

async function yahooGet(path, env, fetchImpl) {
  const call = async (force) => {
    const token = await getAccessToken(env, fetchImpl, force);
    const url = `${YAHOO_API}${path}${path.includes("?") ? "&" : "?"}format=json`;
    return fetchImpl(url, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    });
  };
  let response = await call(false);
  if (response.status === 401 && !env.YAHOO_ACCESS_TOKEN) response = await call(true);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Yahoo API returned HTTP ${response.status}.`);
  return data;
}

function numberedValues(object) {
  if (!object || typeof object !== "object") return [];
  return Object.keys(object)
    .filter((key) => /^\d+$/.test(key))
    .sort((a, b) => Number(a) - Number(b))
    .map((key) => object[key]);
}

function parseLeagueInfo(metaPayload, settingsPayload, teamsPayload, slot) {
  const league = metaPayload.fantasy_content.league;
  const meta = Array.isArray(league) ? league.find((item) => item && !Array.isArray(item)) || {} : league || {};
  const teams = Number(first(meta, "num_teams"));
  if (!Number.isInteger(teams) || teams < 2 || teams > 20) throw new Error("Yahoo returned an invalid team count.");
  if (slot > teams) throw new Error(`Draft slot must be between 1 and ${teams}.`);
  const settings = leagueSub(settingsPayload, "settings");
  const settingsObject = Array.isArray(settings) ? settings.find((item) => item && typeof item === "object") || {} : settings;
  if (String(first(settingsObject, "is_auction_draft") || "0") === "1") {
    throw new Error("Auction drafts are not supported.");
  }
  const positions = first(settingsObject, "roster_positions") || [];
  let rounds = 0;
  dicts(positions).forEach((entry) => {
    if (!entry.roster_position) return;
    const position = String(entry.roster_position.position || "").toUpperCase();
    if (position !== "IL" && position !== "IL+") rounds += Number(entry.roster_position.count) || 1;
  });
  if (!rounds) rounds = 13;
  const names = {};
  const teamCollection = leagueSub(teamsPayload, "teams");
  numberedValues(teamCollection).forEach((item) => {
    const team = item.team || item;
    const draftPosition = Number(first(team, "draft_position"));
    const name = first(team, "name");
    if (draftPosition && name) names[String(draftPosition)] = String(name);
  });
  return { teams, rounds, teamNames: names };
}

function parseDraftResults(payload) {
  const results = leagueSub(payload, "draft_results");
  return numberedValues(results)
    .map((item) => item.draft_result || item)
    .filter((item) => item && item.player_key)
    .map((item) => ({
      overallPick: Number(item.pick),
      round: Number(item.round),
      teamKey: String(item.team_key || ""),
      yahooPlayerKey: String(item.player_key),
    }))
    .filter((item) => Number.isInteger(item.overallPick) && item.overallPick > 0)
    .sort((a, b) => a.overallPick - b.overallPick);
}

async function resolvePlayerNames(leagueKey, keys, known, env, fetchImpl) {
  const names = { ...(known || {}) };
  const missing = [...new Set(keys.filter((key) => !names[key]))];
  for (let i = 0; i < missing.length; i += 25) {
    const chunk = missing.slice(i, i + 25);
    const payload = await yahooGet(
      `/fantasy/v2/league/${encodeURIComponent(leagueKey)}/players;player_keys=${chunk.map(encodeURIComponent).join(",")}`,
      env,
      fetchImpl,
    );
    const players = leagueSub(payload, "players");
    numberedValues(players).forEach((item) => {
      const player = item.player || item;
      const key = first(player, "player_key");
      const nameObject = first(player, "name");
      const name = nameObject && typeof nameObject === "object" ? nameObject.full : nameObject;
      if (key && name) names[String(key)] = String(name);
    });
  }
  return names;
}

async function sha256(value) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function startWatch(input, env, fetchImpl) {
  const game = await yahooGet("/fantasy/v2/game/nba", env, fetchImpl);
  const gameKey = String(first(game.fantasy_content && game.fantasy_content.game, "game_key") || "");
  if (!/^\d+$/.test(gameKey)) throw new Error("Yahoo did not return the current NBA game key.");
  const leagueKey = `${gameKey}.l.${input.mlid}`;
  const encoded = encodeURIComponent(leagueKey);
  const [meta, settings, teams] = await Promise.all([
    yahooGet(`/fantasy/v2/league/${encoded}`, env, fetchImpl),
    yahooGet(`/fantasy/v2/league/${encoded}/settings`, env, fetchImpl),
    yahooGet(`/fantasy/v2/league/${encoded}/teams`, env, fetchImpl),
  ]);
  const info = parseLeagueInfo(meta, settings, teams, input.slot);
  const session = {
    draftId: leagueKey,
    slot: input.slot,
    teams: info.teams,
    rounds: info.rounds,
    teamNames: info.teamNames,
    playerNames: {},
    createdAt: new Date().toISOString(),
  };
  await env.YAHOO_SESSIONS.put(SESSION_KEY, JSON.stringify(session), { expirationTtl: SESSION_TTL_SECONDS });
  return session;
}

async function loadBoard(env, fetchImpl) {
  const raw = await env.YAHOO_SESSIONS.get(SESSION_KEY);
  if (!raw) return null;
  const session = JSON.parse(raw);
  const payload = await yahooGet(
    `/fantasy/v2/league/${encodeURIComponent(session.draftId)}/draftresults`,
    env,
    fetchImpl,
  );
  const picks = parseDraftResults(payload);
  const names = await resolvePlayerNames(
    session.draftId,
    picks.map((pick) => pick.yahooPlayerKey),
    session.playerNames,
    env,
    fetchImpl,
  );
  const namesChanged = Object.keys(names).length !== Object.keys(session.playerNames || {}).length;
  if (namesChanged) {
    session.playerNames = names;
    await env.YAHOO_SESSIONS.put(SESSION_KEY, JSON.stringify(session), { expirationTtl: SESSION_TTL_SECONDS });
  }
  const boardPicks = picks.map((pick) => ({
    ...pick,
    playerName: names[pick.yahooPlayerKey] || pick.yahooPlayerKey,
    playerIndex: null,
  }));
  return {
    draftId: session.draftId,
    fetchedAt: new Date().toISOString(),
    teams: session.teams,
    rounds: session.rounds,
    userSlot: session.slot,
    teamNames: session.teamNames || {},
    pickCount: boardPicks.length,
    boardHash: await sha256(JSON.stringify(boardPicks)),
    complete: boardPicks.length >= session.teams * session.rounds,
    picks: boardPicks,
  };
}

export function createWorker(fetchImpl = fetch) {
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      if (url.pathname === "/oauth/start" && request.method === "GET") {
        return html(200, oauthPage('<p>Enter the same private watch token configured in Cloudflare. You will then approve Draft Lab in Yahoo.</p><form method="post"><label>Watch token<input name="watchToken" type="password" autocomplete="off" required></label><button type="submit">Authorize with Yahoo</button></form><p class="note">Your Yahoo client secret and OAuth tokens never enter this page.</p>'));
      }
      if (url.pathname === "/oauth/start" && request.method === "POST") return beginOAuth(request, env);
      if (url.pathname === "/oauth/callback" && request.method === "GET") return finishOAuth(request, env, fetchImpl);
      if (request.method === "OPTIONS") {
        if (!ensureAllowedOrigin(request, env)) return json(request, env, 403, errorBody("origin_denied", "Origin is not allowed."));
        const headers = corsHeaders(request, env);
        headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type";
        headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
        headers["Access-Control-Max-Age"] = "600";
        return new Response(null, { status: 204, headers });
      }
      if (url.pathname === "/health" && request.method === "GET") {
        const storedRefresh = env.YAHOO_SESSIONS ? await env.YAHOO_SESSIONS.get(OAUTH_REFRESH_KEY) : null;
        return json(request, env, 200, {
          ok: true,
          configured: {
            sessions: Boolean(env.YAHOO_SESSIONS),
            watchToken: Boolean(env.WATCH_TOKEN),
            yahooOAuth: Boolean(env.YAHOO_ACCESS_TOKEN || (env.YAHOO_CLIENT_ID && env.YAHOO_CLIENT_SECRET && (storedRefresh || env.YAHOO_REFRESH_TOKEN))),
          },
        });
      }
      if (!ensureAllowedOrigin(request, env)) return json(request, env, 403, errorBody("origin_denied", "Origin is not allowed."));
      if (!(await authorized(request, env))) return rejectUnauthorized(request, env);
      try {
        if (url.pathname === "/api/watch" && request.method === "POST") {
          const raw = await request.json();
          const input = parseWatchInput(raw);
          await startWatch(input, env, fetchImpl);
          const board = await loadBoard(env, fetchImpl);
          return json(request, env, 201, { ok: true, ...board });
        }
        if (url.pathname === "/api/board" && request.method === "GET") {
          const board = await loadBoard(env, fetchImpl);
          if (!board) return json(request, env, 404, errorBody("no_watch", "Start a Yahoo watch session first."));
          return json(request, env, 200, board);
        }
        return json(request, env, 404, errorBody("not_found", "Route not found."));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Request failed.";
        const badInput = /Enter a Yahoo|must use|does not contain|Draft slot|Auction/.test(message);
        return json(request, env, badInput ? 400 : 502, errorBody(badInput ? "invalid_request" : "upstream_error", message));
      }
    },
  };
}

export { mlidFromInput, parseWatchInput, parseDraftResults, parseLeagueInfo, sha256 };

export default createWorker();
