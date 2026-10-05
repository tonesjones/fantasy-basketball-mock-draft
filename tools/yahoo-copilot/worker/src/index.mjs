const YAHOO_API = "https://fantasysports.yahooapis.com";
const YAHOO_TOKEN_URL = "https://api.login.yahoo.com/oauth2/get_token";
const OAUTH_STATE_PREFIX = "oauth:state:";
const LOGIN_PREFIX = "login:";
const SESSION_PREFIX = "session:";
const USER_PREFIX = "user:";
const WATCH_PREFIX = "watch:";
const WATCH_TTL_SECONDS = 8 * 60 * 60;
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
/* KV's minimum expiration. The page redeems the code immediately after the redirect. */
const LOGIN_CODE_TTL_SECONDS = 60;
const DEFAULT_ORIGIN = "https://tony-draft-lab-yahoo.pages.dev";

/* Access tokens per Yahoo user, kept only for the life of this isolate. */
const tokenCache = new Map();

class SignedOutError extends Error {}

function pageOrigin(env) {
  return env.PAGE_ORIGIN || DEFAULT_ORIGIN;
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  const headers = {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin",
  };
  if (origin === pageOrigin(env)) headers["Access-Control-Allow-Origin"] = origin;
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
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Draft Lab Yahoo sign-in</title><style>body{font:16px system-ui;max-width:540px;margin:10vh auto;padding:24px;color:#18202b}</style><h1>Draft Lab Yahoo sign-in</h1>${message}`;
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return base64Url(bytes);
}

function base64Url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function bytesFromBase64(value) {
  const raw = atob(String(value).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function sha256(value) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function encryptionKey(env) {
  const raw = env.TOKEN_ENC_KEY ? bytesFromBase64(env.TOKEN_ENC_KEY) : null;
  if (!raw || (raw.length !== 16 && raw.length !== 32)) {
    throw new Error("TOKEN_ENC_KEY must be a base64 16- or 32-byte key.");
  }
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/* The Yahoo user ID is bound as additional data, so a stored token only decrypts under its own user. */
async function sealRefreshToken(env, guid, refreshToken) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(guid) },
    await encryptionKey(env),
    new TextEncoder().encode(refreshToken),
  );
  return { iv: base64Url(iv), ct: base64Url(new Uint8Array(sealed)) };
}

async function openRefreshToken(env, guid, record) {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytesFromBase64(record.iv), additionalData: new TextEncoder().encode(guid) },
    await encryptionKey(env),
    bytesFromBase64(record.ct),
  );
  return new TextDecoder().decode(plain);
}

async function saveUser(env, guid, refreshToken) {
  const sealed = await sealRefreshToken(env, guid, refreshToken);
  await env.YAHOO_SESSIONS.put(`${USER_PREFIX}${guid}`, JSON.stringify({ ...sealed, updatedAt: new Date().toISOString() }));
}

async function limited(request, env, reason) {
  if (!env.AUTH_LIMITER) return false;
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const result = await env.AUTH_LIMITER.limit({ key: `${reason}:${ip}` });
  return !result.success;
}

async function rejectUnauthorized(request, env) {
  if (await limited(request, env, "bad-session")) {
    return json(request, env, 429, errorBody("rate_limited", "Too many failed sign-in attempts."));
  }
  return json(request, env, 401, errorBody("signed_out", "Sign in with Yahoo to continue."));
}

function bearer(request) {
  const match = /^Bearer (.+)$/.exec(request.headers.get("Authorization") || "");
  return match ? match[1] : "";
}

/* Returns the signed-in Yahoo user ID, or null. A session whose user disconnected is removed. */
async function sessionUser(request, env) {
  const token = bearer(request);
  if (!token) return null;
  const key = `${SESSION_PREFIX}${await sha256(token)}`;
  const raw = await env.YAHOO_SESSIONS.get(key);
  if (!raw) return null;
  const { guid } = JSON.parse(raw);
  if (!(await env.YAHOO_SESSIONS.get(`${USER_PREFIX}${guid}`))) {
    await env.YAHOO_SESSIONS.delete(key);
    return null;
  }
  return { guid, sessionKey: key };
}

function ensureAllowedOrigin(request, env) {
  const origin = request.headers.get("Origin");
  return !origin || origin === pageOrigin(env);
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
  return { mlid: mlidFromInput(raw.roomUrl || raw.mlid) };
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

async function requestToken(env, fetchImpl, params) {
  const basic = btoa(`${env.YAHOO_CLIENT_ID}:${env.YAHOO_CLIENT_SECRET}`);
  const response = await fetchImpl(YAHOO_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

function cacheAccessToken(guid, data) {
  tokenCache.set(guid, {
    value: data.access_token,
    expiresAt: Date.now() + Math.max(60, Number(data.expires_in) || 3600) * 1000,
  });
}

async function getAccessToken(env, fetchImpl, guid, force = false) {
  const cached = tokenCache.get(guid);
  if (!force && cached && cached.expiresAt > Date.now() + 60_000) return cached.value;
  if (!env.YAHOO_CLIENT_ID || !env.YAHOO_CLIENT_SECRET) throw new Error("Yahoo OAuth secrets are not configured.");
  const raw = await env.YAHOO_SESSIONS.get(`${USER_PREFIX}${guid}`);
  if (!raw) throw new SignedOutError("Sign in with Yahoo to continue.");
  const refreshToken = await openRefreshToken(env, guid, JSON.parse(raw));
  const { response, data } = await requestToken(env, fetchImpl, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  /* Yahoo answers 400 or 401 when the user revoked Draft Lab or the refresh token expired. */
  if (response.status === 400 || response.status === 401) {
    await env.YAHOO_SESSIONS.delete(`${USER_PREFIX}${guid}`);
    throw new SignedOutError("Yahoo sign-in expired. Sign in with Yahoo again.");
  }
  if (!response.ok || !data.access_token) {
    throw new Error(`Yahoo token refresh failed with HTTP ${response.status}.`);
  }
  cacheAccessToken(guid, data);
  if (data.refresh_token && data.refresh_token !== refreshToken) await saveUser(env, guid, data.refresh_token);
  return data.access_token;
}

async function beginOAuth(request, env) {
  if (!env.YAHOO_CLIENT_ID || !env.YAHOO_CLIENT_SECRET || !env.YAHOO_SESSIONS || !env.TOKEN_ENC_KEY) {
    return html(503, oauthPage("<p>Yahoo sign-in is not configured.</p>"));
  }
  if (await limited(request, env, "oauth-start")) {
    return html(429, oauthPage("<p>Too many sign-in attempts. Wait a minute and try again.</p>"));
  }
  const state = randomToken();
  const redirectUri = `${new URL(request.url).origin}/oauth/callback`;
  await env.YAHOO_SESSIONS.put(`${OAUTH_STATE_PREFIX}${state}`, JSON.stringify({ redirectUri }), { expirationTtl: 600 });
  const auth = new URL("https://api.login.yahoo.com/oauth2/request_auth");
  auth.searchParams.set("client_id", env.YAHOO_CLIENT_ID);
  auth.searchParams.set("redirect_uri", redirectUri);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("state", state);
  return Response.redirect(auth.toString(), 303);
}

async function yahooGuid(data, env, fetchImpl) {
  if (data.xoauth_yahoo_guid) return String(data.xoauth_yahoo_guid);
  const response = await fetchImpl(`${YAHOO_API}/fantasy/v2/users;use_login=1?format=json`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${data.access_token}` },
  });
  const payload = await response.json().catch(() => ({}));
  const guid = response.ok ? first(payload.fantasy_content && payload.fantasy_content.users, "guid") : null;
  if (!guid) throw new Error("Yahoo did not identify the signed-in user.");
  return String(guid);
}

async function finishOAuth(request, env, fetchImpl) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state") || "";
  const code = url.searchParams.get("code") || "";
  if (url.searchParams.get("error")) return html(400, oauthPage("<p>Yahoo sign-in was cancelled.</p>"));
  if (!state || !code) return html(400, oauthPage("<p>Yahoo did not return a complete sign-in response.</p>"));
  const stateKey = `${OAUTH_STATE_PREFIX}${state}`;
  const saved = await env.YAHOO_SESSIONS.get(stateKey);
  if (!saved) return html(400, oauthPage("<p>This sign-in link is invalid or has expired. Start again.</p>"));
  await env.YAHOO_SESSIONS.delete(stateKey);
  const { redirectUri } = JSON.parse(saved);
  const { response, data } = await requestToken(env, fetchImpl, {
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code,
  });
  if (!response.ok || !data.access_token || !data.refresh_token) {
    return html(502, oauthPage(`<p>Yahoo sign-in failed (HTTP ${response.status}). Start again.</p>`));
  }
  let guid;
  try {
    guid = await yahooGuid(data, env, fetchImpl);
  } catch (error) {
    return html(502, oauthPage(`<p>${error.message} Start again.</p>`));
  }
  await saveUser(env, guid, data.refresh_token);
  cacheAccessToken(guid, data);
  const loginCode = randomToken();
  await env.YAHOO_SESSIONS.put(`${LOGIN_PREFIX}${loginCode}`, JSON.stringify({ guid }), {
    expirationTtl: LOGIN_CODE_TTL_SECONDS,
  });
  return Response.redirect(`${pageOrigin(env)}/#yhlogin=${loginCode}`, 303);
}

/* Trades the one-time code from the sign-in redirect for a long-lived session token. */
async function redeemLogin(request, env) {
  const body = await request.json().catch(() => ({}));
  const code = String((body && body.code) || "");
  const key = `${LOGIN_PREFIX}${code}`;
  const raw = code ? await env.YAHOO_SESSIONS.get(key) : null;
  if (!raw) {
    if (await limited(request, env, "bad-login")) {
      return json(request, env, 429, errorBody("rate_limited", "Too many failed sign-in attempts."));
    }
    return json(request, env, 401, errorBody("signed_out", "That sign-in link expired. Sign in with Yahoo again."));
  }
  await env.YAHOO_SESSIONS.delete(key);
  const { guid } = JSON.parse(raw);
  const token = randomToken();
  await env.YAHOO_SESSIONS.put(`${SESSION_PREFIX}${await sha256(token)}`, JSON.stringify({ guid }), {
    expirationTtl: SESSION_TTL_SECONDS,
  });
  return json(request, env, 201, { ok: true, token });
}

async function disconnect(env, user) {
  await Promise.all([
    env.YAHOO_SESSIONS.delete(`${USER_PREFIX}${user.guid}`),
    env.YAHOO_SESSIONS.delete(`${WATCH_PREFIX}${user.guid}`),
    env.YAHOO_SESSIONS.delete(user.sessionKey),
  ]);
  tokenCache.delete(user.guid);
}

async function yahooGet(path, env, fetchImpl, guid) {
  const call = async (force) => {
    const token = await getAccessToken(env, fetchImpl, guid, force);
    const url = `${YAHOO_API}${path}${path.includes("?") ? "&" : "?"}format=json`;
    return fetchImpl(url, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    });
  };
  let response = await call(false);
  if (response.status === 401) response = await call(true);
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

/* Team names by draft position, plus the signed-in user's team. Its draft position is null until Yahoo sets the order. */
function parseTeams(teamsPayload) {
  const names = {};
  let own = null;
  numberedValues(leagueSub(teamsPayload, "teams")).forEach((item) => {
    const team = item.team || item;
    const draftPosition = Number(first(team, "draft_position")) || null;
    const name = first(team, "name");
    if (draftPosition && name) names[String(draftPosition)] = String(name);
    if (String(first(team, "is_owned_by_current_login") || "0") === "1") {
      own = { teamKey: String(first(team, "team_key") || ""), name: name ? String(name) : "", draftPosition };
    }
  });
  return { teamNames: names, own };
}

function parseLeagueInfo(metaPayload, settingsPayload, teamsPayload) {
  const league = metaPayload.fantasy_content.league;
  const meta = Array.isArray(league) ? league.find((item) => item && !Array.isArray(item)) || {} : league || {};
  const teams = Number(first(meta, "num_teams"));
  if (!Number.isInteger(teams) || teams < 2 || teams > 20) throw new Error("Yahoo returned an invalid team count.");
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
  const { teamNames, own } = parseTeams(teamsPayload);
  if (!own) throw new Error("Your Yahoo account has no team in this draft. Join the draft in Yahoo first.");
  return { teams, rounds, teamNames, own };
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

async function resolvePlayerNames(leagueKey, keys, known, env, fetchImpl, guid) {
  const names = { ...(known || {}) };
  const missing = [...new Set(keys.filter((key) => !names[key]))];
  for (let i = 0; i < missing.length; i += 25) {
    const chunk = missing.slice(i, i + 25);
    const payload = await yahooGet(
      `/fantasy/v2/league/${encodeURIComponent(leagueKey)}/players;player_keys=${chunk.map(encodeURIComponent).join(",")}`,
      env,
      fetchImpl,
      guid,
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

async function putWatch(env, guid, watch) {
  await env.YAHOO_SESSIONS.put(`${WATCH_PREFIX}${guid}`, JSON.stringify(watch), { expirationTtl: WATCH_TTL_SECONDS });
}

async function startWatch(input, env, fetchImpl, guid) {
  const game = await yahooGet("/fantasy/v2/game/nba", env, fetchImpl, guid);
  const gameKey = String(first(game.fantasy_content && game.fantasy_content.game, "game_key") || "");
  if (!/^\d+$/.test(gameKey)) throw new Error("Yahoo did not return the current NBA game key.");
  const leagueKey = `${gameKey}.l.${input.mlid}`;
  const encoded = encodeURIComponent(leagueKey);
  const [meta, settings, teams] = await Promise.all([
    yahooGet(`/fantasy/v2/league/${encoded}`, env, fetchImpl, guid),
    yahooGet(`/fantasy/v2/league/${encoded}/settings`, env, fetchImpl, guid),
    yahooGet(`/fantasy/v2/league/${encoded}/teams`, env, fetchImpl, guid),
  ]);
  const info = parseLeagueInfo(meta, settings, teams);
  const watch = {
    draftId: leagueKey,
    slot: info.own.draftPosition,
    teamName: info.own.name,
    teams: info.teams,
    rounds: info.rounds,
    teamNames: info.teamNames,
    playerNames: {},
    createdAt: new Date().toISOString(),
  };
  await putWatch(env, guid, watch);
  return watch;
}

async function loadBoard(env, fetchImpl, guid) {
  const raw = await env.YAHOO_SESSIONS.get(`${WATCH_PREFIX}${guid}`);
  if (!raw) return null;
  const watch = JSON.parse(raw);
  let changed = false;
  if (!watch.slot) {
    const { teamNames, own } = parseTeams(
      await yahooGet(`/fantasy/v2/league/${encodeURIComponent(watch.draftId)}/teams`, env, fetchImpl, guid),
    );
    if (own && own.draftPosition) {
      Object.assign(watch, { slot: own.draftPosition, teamName: own.name, teamNames });
      changed = true;
    }
  }
  const payload = await yahooGet(
    `/fantasy/v2/league/${encodeURIComponent(watch.draftId)}/draftresults`,
    env,
    fetchImpl,
    guid,
  );
  const picks = parseDraftResults(payload);
  const names = await resolvePlayerNames(
    watch.draftId,
    picks.map((pick) => pick.yahooPlayerKey),
    watch.playerNames,
    env,
    fetchImpl,
    guid,
  );
  if (Object.keys(names).length !== Object.keys(watch.playerNames || {}).length) {
    watch.playerNames = names;
    changed = true;
  }
  if (changed) await putWatch(env, guid, watch);
  const boardPicks = picks.map((pick) => ({
    ...pick,
    playerName: names[pick.yahooPlayerKey] || pick.yahooPlayerKey,
    playerIndex: null,
  }));
  return {
    draftId: watch.draftId,
    fetchedAt: new Date().toISOString(),
    teams: watch.teams,
    rounds: watch.rounds,
    userSlot: watch.slot,
    userTeamName: watch.teamName || "",
    teamNames: watch.teamNames || {},
    pickCount: boardPicks.length,
    boardHash: await sha256(JSON.stringify(boardPicks)),
    complete: boardPicks.length >= watch.teams * watch.rounds,
    picks: boardPicks,
  };
}

export function createWorker(fetchImpl = fetch) {
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      if (url.pathname === "/oauth/start" && request.method === "GET") return beginOAuth(request, env);
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
        return json(request, env, 200, {
          ok: true,
          configured: {
            sessions: Boolean(env.YAHOO_SESSIONS),
            yahooOAuth: Boolean(env.YAHOO_CLIENT_ID && env.YAHOO_CLIENT_SECRET),
            tokenKey: Boolean(env.TOKEN_ENC_KEY),
          },
        });
      }
      if (!ensureAllowedOrigin(request, env)) return json(request, env, 403, errorBody("origin_denied", "Origin is not allowed."));
      if (url.pathname === "/api/session" && request.method === "POST") return redeemLogin(request, env);
      const user = await sessionUser(request, env);
      if (!user) return rejectUnauthorized(request, env);
      try {
        if (url.pathname === "/api/me" && request.method === "GET") {
          return json(request, env, 200, { ok: true, signedIn: true });
        }
        if (url.pathname === "/api/disconnect" && request.method === "POST") {
          await disconnect(env, user);
          return json(request, env, 200, { ok: true });
        }
        if (url.pathname === "/api/watch" && request.method === "POST") {
          const input = parseWatchInput(await request.json());
          await startWatch(input, env, fetchImpl, user.guid);
          const board = await loadBoard(env, fetchImpl, user.guid);
          return json(request, env, 201, { ok: true, ...board });
        }
        if (url.pathname === "/api/board" && request.method === "GET") {
          const board = await loadBoard(env, fetchImpl, user.guid);
          if (!board) return json(request, env, 404, errorBody("no_watch", "Start a Yahoo watch session first."));
          return json(request, env, 200, { ok: true, ...board });
        }
        return json(request, env, 404, errorBody("not_found", "Route not found."));
      } catch (error) {
        if (error instanceof SignedOutError) return json(request, env, 401, errorBody("signed_out", error.message));
        const message = error instanceof Error ? error.message : "Request failed.";
        const badInput = /Enter a Yahoo|must use|does not contain|no team in this draft|Auction/.test(message);
        return json(request, env, badInput ? 400 : 502, errorBody(badInput ? "invalid_request" : "upstream_error", message));
      }
    },
  };
}

export { mlidFromInput, parseWatchInput, parseDraftResults, parseLeagueInfo, sha256 };

export default createWorker();
