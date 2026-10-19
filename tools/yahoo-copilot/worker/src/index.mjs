import { loadNews, pollNews } from "./news.mjs";

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
  /* Yahoo may send the placeholder "--hidden--" instead of the GUID. */
  if (/^[A-Za-z0-9]+$/.test(data.xoauth_yahoo_guid || "")) return data.xoauth_yahoo_guid;
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
  if (!response.ok) {
    /* Name the resource and pass on Yahoo's reason; the path holds no secrets. */
    const resource = path.split("?")[0].split("/").pop().split(";")[0];
    const reason = data && data.error && typeof data.error.description === "string" ? ` ${data.error.description.slice(0, 200)}` : "";
    throw new Error(`Yahoo API returned HTTP ${response.status} for ${resource}.${reason}`);
  }
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

function draftResultItems(payload) {
  return numberedValues(leagueSub(payload, "draft_results"))
    .map((item) => item.draft_result || item)
    .filter(Boolean);
}

/* Round 1 team keys in pick order, or null if the round isn't fully known yet.
   Yahoo lists every slot (made or not) once the order is set; otherwise round 1
   is complete only after a round 2 pick exists. */
function parseDraftOrder(payload) {
  const items = draftResultItems(payload);
  const complete = items.some((item) => !item.player_key || Number(item.round) >= 2);
  const roundOne = items
    .filter((item) => Number(item.round) === 1 && Number(item.pick) > 0)
    .sort((a, b) => Number(a.pick) - Number(b.pick))
    .map((item) => String(item.team_key || ""));
  if (!complete || roundOne.length < 2 || roundOne.length > 20) return null;
  return roundOne;
}

function parseDraftResults(payload) {
  return draftResultItems(payload)
    .filter((item) => item.player_key)
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
    teamKey: info.own.teamKey,
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
  const before = JSON.stringify(watch);
  const payload = await yahooGet(
    `/fantasy/v2/league/${encodeURIComponent(watch.draftId)}/draftresults`,
    env,
    fetchImpl,
    guid,
  );
  const order = parseDraftOrder(payload);
  /* A mock lobby can fill after the watch starts, so the team count and names
     saved then may be stale. Re-read teams until the draft order matches. */
  if (!watch.slot || !watch.teamKey || (order && order.length !== watch.teams)) {
    const { teamNames, own } = parseTeams(
      await yahooGet(`/fantasy/v2/league/${encodeURIComponent(watch.draftId)}/teams`, env, fetchImpl, guid),
    );
    if (own) {
      Object.assign(watch, { teamKey: own.teamKey, teamName: own.name, teamNames });
      if (own.draftPosition) watch.slot = own.draftPosition;
    }
  }
  if (order) {
    const ownIndex = watch.teamKey ? order.indexOf(watch.teamKey) : -1;
    if (order.length !== watch.teams || (ownIndex >= 0 && ownIndex + 1 !== watch.slot)) {
      watch.teams = order.length;
      if (ownIndex >= 0) watch.slot = ownIndex + 1;
    }
  }
  const picks = parseDraftResults(payload);
  const names = await resolvePlayerNames(
    watch.draftId,
    picks.map((pick) => pick.yahooPlayerKey),
    watch.playerNames,
    env,
    fetchImpl,
    guid,
  );
  if (Object.keys(names).length !== Object.keys(watch.playerNames || {}).length) watch.playerNames = names;
  if (JSON.stringify(watch) !== before) await putWatch(env, guid, watch);
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
    boardHash: await sha256(JSON.stringify({ teams: watch.teams, slot: watch.slot, picks: boardPicks })),
    complete: boardPicks.length >= watch.teams * watch.rounds,
    picks: boardPicks,
  };
}

/* ---- In-season roster check ----
   After the draft: the user's roster, this week's opponent, and the best free
   agents and waiver players, as names and positions. The page values them. */
const LEAGUE_KEY_RE = /^\d{1,6}\.l\.\d{1,20}$/;
const PAGE_SIZE = 25;
const FA_PAGES = 3;
const WAIVER_PAGES = 2;
const INJURED_STATUSES = new Set(["O", "INJ", "SUSP"]);

/* Yahoo spreads one record over an array of small objects; merge them. */
function merged(node) {
  const out = {};
  const walk = (value) => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") Object.assign(out, value);
  };
  walk(node);
  return out;
}

function parsePlayer(item) {
  const player = item.player || item;
  const parts = Array.isArray(player) ? player : [player];
  const meta = merged(parts[0]);
  const name = meta.name && typeof meta.name === "object" ? meta.name.full : meta.name;
  const selected = dicts(parts.slice(1)).find((value) => Object.prototype.hasOwnProperty.call(value, "selected_position"));
  const eligible = dicts(meta.eligible_positions || [])
    .map((value) => value.position)
    .filter((value) => typeof value === "string");
  return {
    playerKey: String(meta.player_key || ""),
    name: name ? String(name) : "",
    nbaTeam: String(meta.editorial_team_abbr || "").toUpperCase(),
    positions: eligible.length ? eligible : String(meta.display_position || "").split(",").filter(Boolean),
    status: String(meta.status || ""),
    injuryNote: meta.injury_note ? String(meta.injury_note) : "",
    selectedPosition: selected ? String(first(selected.selected_position, "position") || "") : null,
  };
}

function parsePlayers(node) {
  return numberedValues(node)
    .map(parsePlayer)
    .filter((player) => player.name);
}

/* The signed-in user's NBA leagues this season, with their team in each. */
function parseUserLeagues(leaguesPayload, teamsPayload) {
  const teams = dicts(teamsPayload)
    .filter((value) => Array.isArray(value.team))
    .map((value) => merged(value.team[0]))
    .filter((team) => team.team_key);
  return dicts(leaguesPayload)
    .filter((value) => Array.isArray(value.league))
    .map((value) => merged(value.league[0]))
    .filter((league) => LEAGUE_KEY_RE.test(String(league.league_key || "")))
    .map((league) => {
      const team = teams.find((t) => String(t.team_key).startsWith(`${league.league_key}.t.`));
      return {
        leagueKey: String(league.league_key),
        name: String(league.name || league.league_key),
        teams: Number(league.num_teams) || null,
        scoringType: String(league.scoring_type || ""),
        currentWeek: Number(league.current_week) || null,
        draftStatus: String(league.draft_status || ""),
        teamKey: team ? String(team.team_key) : null,
        teamName: team && team.name ? String(team.name) : "",
      };
    })
    .filter((league) => league.teamKey);
}

function parseSeasonSettings(settingsPayload) {
  const league = settingsPayload.fantasy_content.league;
  const meta = merged(Array.isArray(league) ? league[0] : league);
  const settings = merged(leagueSub(settingsPayload, "settings"));
  const categories = dicts(settings.stat_categories || [])
    .filter((value) => value.stat && typeof value.stat === "object")
    .map((value) => value.stat)
    .filter((stat) => String(stat.is_only_display_stat || "0") !== "1" && String(stat.enabled ?? "1") !== "0")
    .map((stat) => String(stat.display_name || stat.name || ""))
    .filter(Boolean);
  const positions = dicts(settings.roster_positions || [])
    .filter((value) => value.roster_position)
    .map((value) => ({
      position: String(value.roster_position.position || ""),
      count: Number(value.roster_position.count) || 1,
    }));
  return {
    leagueKey: String(meta.league_key || ""),
    name: String(meta.name || ""),
    scoringType: String(meta.scoring_type || ""),
    currentWeek: Number(meta.current_week) || null,
    categories,
    positions,
  };
}

function parseLeagueRosters(rostersPayload) {
  return numberedValues(leagueSub(rostersPayload, "teams")).map((item) => {
    const team = item.team || item;
    const meta = merged(team[0]);
    const roster = dicts(team.slice(1)).find((value) => Object.prototype.hasOwnProperty.call(value, "roster"));
    const players = roster ? parsePlayers(first(roster.roster, "players")) : [];
    return {
      teamKey: String(meta.team_key || ""),
      name: String(meta.name || ""),
      own: String(meta.is_owned_by_current_login || "0") === "1",
      players,
    };
  });
}

/* This week's opponent's team key, or null (no matchup yet, or a roto league). */
function parseOpponentKey(scoreboardPayload, teamKey) {
  for (const value of dicts(scoreboardPayload)) {
    if (!value.matchup) continue;
    const keys = dicts(value.matchup)
      .map((entry) => entry.team_key)
      .filter((key) => typeof key === "string");
    if (keys.includes(teamKey)) return keys.find((key) => key !== teamKey) || null;
  }
  return null;
}

async function availablePlayers(leagueKey, status, pages, env, fetchImpl, guid, sort = "sort=OR") {
  const out = [];
  for (let page = 0; page < pages; page++) {
    const payload = await yahooGet(
      `/fantasy/v2/league/${encodeURIComponent(leagueKey)}/players;status=${status};${sort};start=${page * PAGE_SIZE};count=${PAGE_SIZE}`,
      env,
      fetchImpl,
      guid,
    );
    let players = [];
    try {
      players = parsePlayers(leagueSub(payload, "players"));
    } catch {
      /* Yahoo sends an empty players list as [] with no "players" key. */
    }
    out.push(...players.map((player) => ({ ...player, availability: status })));
    if (players.length < PAGE_SIZE) break;
  }
  return out;
}

async function listLeagues(env, fetchImpl, guid) {
  const [leagues, teams] = await Promise.all([
    yahooGet("/fantasy/v2/users;use_login=1/games;game_keys=nba/leagues", env, fetchImpl, guid),
    yahooGet("/fantasy/v2/users;use_login=1/games;game_keys=nba/teams", env, fetchImpl, guid),
  ]);
  return parseUserLeagues(leagues, teams);
}

async function seasonCheck(leagueKey, env, fetchImpl, guid) {
  if (!LEAGUE_KEY_RE.test(leagueKey || "")) throw new Error("Enter a Yahoo league key like 466.l.12345.");
  const encoded = encodeURIComponent(leagueKey);
  const [settingsPayload, rostersPayload] = await Promise.all([
    yahooGet(`/fantasy/v2/league/${encoded}/settings`, env, fetchImpl, guid),
    yahooGet(`/fantasy/v2/league/${encoded}/teams/roster`, env, fetchImpl, guid),
  ]);
  const league = parseSeasonSettings(settingsPayload);
  const rosters = parseLeagueRosters(rostersPayload);
  const mine = rosters.find((team) => team.own);
  if (!mine) throw new Error("Your Yahoo account has no team in this league.");
  let opponent = null;
  try {
    const scoreboard = await yahooGet(`/fantasy/v2/league/${encoded}/scoreboard`, env, fetchImpl, guid);
    const opponentKey = parseOpponentKey(scoreboard, mine.teamKey);
    opponent = rosters.find((team) => team.teamKey === opponentKey) || null;
  } catch {
    /* Before week 1, or in a roto league, there is no scoreboard matchup. */
  }
  const [freeAgents, waivers, hot] = await Promise.all([
    availablePlayers(leagueKey, "FA", FA_PAGES, env, fetchImpl, guid),
    availablePlayers(leagueKey, "W", WAIVER_PAGES, env, fetchImpl, guid),
    /* Last week's best available players: backups whose role just grew rank
       here before they reach the overall-rank lists above. */
    availablePlayers(leagueKey, "A", 1, env, fetchImpl, guid, "sort=AR;sort_type=lastweek").catch(() => []),
  ]);
  const available = [...waivers, ...freeAgents];
  hot.forEach((player) => {
    const known = available.find((p) => p.playerKey === player.playerKey);
    if (known) known.hot = true;
    else available.push({ ...player, hot: true });
  });
  const team = (t) => (t ? { teamKey: t.teamKey, name: t.name, players: t.players } : null);
  return {
    fetchedAt: new Date().toISOString(),
    league,
    myTeam: team(mine),
    opponent: team(opponent),
    available,
    /* Everyone rostered in the league who is out: the openings for backups. */
    injured: rosters.flatMap((t) =>
      t.players
        .filter((p) => INJURED_STATUSES.has(p.status.toUpperCase()))
        .map((p) => ({ ...p, fantasyTeam: t.name, mine: t.own })),
    ),
  };
}

/* Raw Yahoo samples for the stat, ownership and sort fields the season
   manager doesn't use yet, so they can be checked against a real league.
   Read-only, the signed-in user's own league, Yahoo bodies only. */
const DIAGNOSTIC_LIMIT = 30000;
async function seasonDiagnostics(leagueKey, env, fetchImpl, guid) {
  if (!LEAGUE_KEY_RE.test(leagueKey || "")) throw new Error("Enter a Yahoo league key like 466.l.12345.");
  const players = `/fantasy/v2/league/${encodeURIComponent(leagueKey)}/players;status=A;sort=AR;sort_type=lastweek;count=3`;
  const paths = [
    "/fantasy/v2/game/nba/stat_categories",
    `${players}/stats;type=lastweek`,
    `${players}/stats;type=lastmonth`,
    `${players}/stats;type=season`,
    `${players}/percent_owned`,
    `${players}/ownership`,
  ];
  const samples = await Promise.all(
    paths.map(async (path) => {
      try {
        const body = JSON.stringify(await yahooGet(path, env, fetchImpl, guid));
        return { path, ok: true, truncated: body.length > DIAGNOSTIC_LIMIT, body: body.slice(0, DIAGNOSTIC_LIMIT) };
      } catch (error) {
        if (error instanceof SignedOutError) throw error;
        return { path, ok: false, error: error.message };
      }
    }),
  );
  return { fetchedAt: new Date().toISOString(), leagueKey, samples };
}

export function createWorker(fetchImpl = fetch) {
  return {
    async scheduled(event, env, ctx) {
      await pollNews(env, fetchImpl);
    },
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
          return json(request, env, 200, { ok: true, signedIn: true, guid: user.guid });
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
        if (url.pathname === "/api/news" && request.method === "GET") {
          return json(request, env, 200, { ok: true, ...await loadNews(env, fetchImpl, user.guid) });
        }
        if (url.pathname === "/api/leagues" && request.method === "GET") {
          return json(request, env, 200, { ok: true, leagues: await listLeagues(env, fetchImpl, user.guid) });
        }
        if (url.pathname === "/api/season" && request.method === "GET") {
          const check = await seasonCheck(url.searchParams.get("league"), env, fetchImpl, user.guid);
          return json(request, env, 200, { ok: true, ...check });
        }
        if (url.pathname === "/api/season-diagnostics" && request.method === "GET") {
          const report = await seasonDiagnostics(url.searchParams.get("league"), env, fetchImpl, user.guid);
          return json(request, env, 200, { ok: true, ...report });
        }
        return json(request, env, 404, errorBody("not_found", "Route not found."));
      } catch (error) {
        if (error instanceof SignedOutError) return json(request, env, 401, errorBody("signed_out", error.message));
        const message = error instanceof Error ? error.message : "Request failed.";
        const badInput = /Enter a Yahoo|must use|does not contain|no team in this (draft|league)|Auction/.test(message);
        return json(request, env, badInput ? 400 : 502, errorBody(badInput ? "invalid_request" : "upstream_error", message));
      }
    },
  };
}

export {
  mlidFromInput,
  parseWatchInput,
  parseDraftOrder,
  parseDraftResults,
  parseLeagueInfo,
  parsePlayer,
  parseUserLeagues,
  parseSeasonSettings,
  parseLeagueRosters,
  parseOpponentKey,
  sha256,
};

export default createWorker();
