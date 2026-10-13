/**
 * Cloudflare Pages _worker.js (advanced mode).
 *
 * Single worker for the whole site:
 *   - /api/pick-quality  -> Jev (TypeSafe System One, pinned jev-1.13.0)
 *   - everything else     -> static assets (env.ASSETS), with SPA fallback
 *                            to /index.html for HTML navigations.
 *
 * Why _worker.js instead of functions/: wrangler's `pages deploy` compiles
 * functions/ locally and the resulting worker intermittently fails to route
 * (empty 405 on /api/pick-quality despite uses_functions=true). Advanced
 * mode removes that compilation step entirely - this file IS the worker, on
 * both `wrangler pages deploy` and git-integration deploys.
 *
 * Fail-soft: missing key / timeout / API error -> HTTP 200 with
 * verdict "uncertain" + error string (never break the draft).
 * Never logs TYPESAFE_API_KEY.
 *
 * Secret (Pages project): TYPESAFE_API_KEY
 *   npx wrangler pages secret put TYPESAFE_API_KEY --project-name tony-draft-lab
 */

/** Legacy (no-signals) suggest hint only; client gates reclassify lean. */
var CONF_GATE = 0.7;
/** Pin versioned id (aliases like jev-latest may move). */
var MODEL = "jev-1.13.0";
var TYPESAFE_URL = "https://api.typesafe.ai/v1/systemone";
var FETCH_TIMEOUT_MS = 25000;
/** Largest request body accepted (real payloads are ~2-4 KB). */
var MAX_BODY_BYTES = 16 * 1024;
/** Per-client budget: calls allowed per window before HTTP 429. */
var RATE_LIMIT = 20;
var RATE_WINDOW_MS = 60 * 1000;

var SCORE_WORDS = ["Poor", "Below avg", "Average", "Good", "Excellent"];

var SCORE_CRITERIA = [
  "Poor — clear reach or wrong positional fit given roster needs",
  "Below average — better options likely available at similar ADP",
  "Average — fair market pick; neither strong value nor costly reach",
  "Good — solid fit for current needs and reasonable vs ADP",
  "Excellent — high-confidence value or must-draft fit right now",
];

var CHOICE_CRITERIA = {
  take: "Draft this player now; waiting risks losing them without a better replacement",
  wait: "Prefer to wait; similar or better value should remain for a later pick",
  reach: "Picking now would be an early reach relative to ADP and available alternatives",
};

/** Allowed browser origins for preview + prod + local wrangler (not *). */
var ALLOWED_ORIGINS = [
  "https://tony-draft-lab-preview.pages.dev",
  "https://tony-draft-lab.pages.dev",
  "https://tony-draft-lab-yahoo.pages.dev",
  "http://localhost:8788",
  "http://127.0.0.1:8788",
  "http://localhost:8799",
  "http://127.0.0.1:8799",
];

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.indexOf(origin) >= 0) return true;
  try {
    var u = new URL(origin);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    var host = u.hostname;
    if (host === "tony-draft-lab-preview.pages.dev") return true;
    if (host === "tony-draft-lab.pages.dev") return true;
    if (/\.tony-draft-lab-preview\.pages\.dev$/i.test(host)) return true;
    if (/\.tony-draft-lab\.pages\.dev$/i.test(host)) return true;
    if (host === "tony-draft-lab-yahoo.pages.dev") return true;
    if (/\.tony-draft-lab-yahoo\.pages\.dev$/i.test(host)) return true;
    if (host === "localhost" || host === "127.0.0.1") return true;
    return false;
  } catch (e) {
    return false;
  }
}

function corsHeaders(request) {
  var origin = (request && request.headers && request.headers.get("Origin")) || "";
  var allow = isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
    "Content-Type": "application/json; charset=utf-8",
  };
}

function jsonResponse(body, status, request) {
  return new Response(JSON.stringify(body), {
    status: status == null ? 200 : status,
    headers: corsHeaders(request),
  });
}

function uncertain(error, request, extra) {
  var out = {
    score: null,
    scoreConfidence: 0,
    choice: null,
    choiceConfidence: 0,
    why: "",
    verdict: "uncertain",
    model: MODEL,
    error: String(error || "Coach unavailable"),
  };
  if (extra && typeof extra === "object") {
    for (var k in extra) {
      if (Object.prototype.hasOwnProperty.call(extra, k)) out[k] = extra[k];
    }
  }
  return jsonResponse(out, 200, request);
}

/*
 * Abuse guard. CORS only stops browsers, so anyone could otherwise curl this
 * endpoint and spend TypeSafe credits. Layers, cheapest first:
 *   1. Origin must be one of ours (browsers always send it on POST).
 *   2. Body size cap.
 *   3. Per-IP rate limit. Uses a Cloudflare Rate Limiting binding named
 *      PICK_RATE_LIMITER when configured (global, reliable); otherwise a
 *      best-effort in-memory window per worker isolate.
 * A dashboard WAF rate-limit rule on /api/pick-quality is still the strongest
 * option - see docs/pick-coach.md.
 */
var rateBuckets = new Map();

function clientKey(request) {
  return (
    request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "unknown"
  );
}

function memoryRateOk(key, now) {
  var b = rateBuckets.get(key);
  if (!b || now - b.start >= RATE_WINDOW_MS) {
    b = { start: now, count: 0 };
    rateBuckets.set(key, b);
  }
  b.count += 1;
  if (rateBuckets.size > 5000) {
    rateBuckets.forEach(function (v, k) {
      if (now - v.start >= RATE_WINDOW_MS) rateBuckets.delete(k);
    });
  }
  return b.count <= RATE_LIMIT;
}

async function rateOk(request, env) {
  var key = clientKey(request);
  if (env && env.PICK_RATE_LIMITER && typeof env.PICK_RATE_LIMITER.limit === "function") {
    try {
      var r = await env.PICK_RATE_LIMITER.limit({ key: key });
      return !!(r && r.success);
    } catch (e) {
      /* fall through to the in-memory limiter */
    }
  }
  return memoryRateOk(key, Date.now());
}

function scoreLabel(score) {
  var i = Math.max(0, Math.min(4, Math.round(Number(score) || 0)));
  return SCORE_WORDS[i];
}

function normalizeRosterNeeds(rosterNeeds, drafted) {
  var rn = rosterNeeds && typeof rosterNeeds === "object" ? rosterNeeds : {};
  var filled = rn.filledSlots || rn.filled_slots || [];
  var open = rn.openSlots || rn.open_slots || [];
  var already = rn.alreadyDraftedByUser || rn.already_drafted_by_user || drafted || [];
  var priority = rn.priorityNeeds || rn.priority_needs || [];
  return {
    filled_slots: filled,
    open_slots: open,
    priority_needs: priority,
    already_drafted_by_user: already,
  };
}

function normalizeBoardList(list, kind) {
  if (!Array.isArray(list)) return [];
  return list
    .slice(0, 8)
    .map(function (item) {
      if (!item || typeof item !== "object") return null;
      if (kind === "recent") {
        return {
          name: item.name || item.player || "",
          pick: item.pick != null ? Number(item.pick) : null,
        };
      }
      return {
        name: item.name || item.player || "",
        adp: item.adp != null && item.adp !== "" ? Number(item.adp) : null,
        positions: Array.isArray(item.positions) ? item.positions : [],
        rank: item.rank != null && item.rank !== "" ? Number(item.rank) : null,
      };
    })
    .filter(function (x) {
      return x && x.name;
    });
}

var CATS9 = ["PTS", "REB", "AST", "STL", "BLK", "3PM", "FG%", "FT%", "TO"];
/** Committed punts: array only, whitelisted, deduped, max 3. Never echoes raw input. */
function cleanPuntCats(raw) {
  var out = [];
  if (!Array.isArray(raw)) return out;
  for (var i = 0; i < raw.length && out.length < 3; i++) {
    var c = raw[i];
    if (typeof c === "string" && CATS9.indexOf(c) >= 0 && out.indexOf(c) < 0) out.push(c);
  }
  return out;
}

function buildState(body) {
  var pickNumber = Number(body.pickNumber) || 1;
  var teams = 12;
  var picksUntil =
    body.picksUntilNext != null && body.picksUntilNext !== "" ? Number(body.picksUntilNext) : null;
  var rn = normalizeRosterNeeds(body.rosterNeeds, body.drafted);
  var scarcity =
    body.scarcityRem ||
    body.scarcity_rem ||
    (body.boardContext && body.boardContext.scarcity_rem) ||
    null;
  var board = {
    notable_available: normalizeBoardList(
      body.notableAvailable ||
        body.notable_available ||
        (body.boardContext && body.boardContext.notable_available) ||
        [],
      "notable"
    ),
    recently_taken: normalizeBoardList(
      body.recentlyTaken ||
        body.recently_taken ||
        (body.boardContext && body.boardContext.recently_taken) ||
        [],
      "recent"
    ),
  };
  if (scarcity && typeof scarcity === "object") {
    board.scarcity_rem_pct = scarcity;
  }
  var adpNum = body.adp != null && body.adp !== "" ? Number(body.adp) : null;
  var rankNum = body.rank != null && body.rank !== "" ? Number(body.rank) : null;
  var out = {
    league: {
      format: "9-category H2H (PTS REB AST STL BLK 3PM FG% FT% TO)",
      teams: teams,
      rounds: 13,
      scoring: "Yahoo-style snake draft",
    },
    draft: {
      pick_number: pickNumber,
      round: Math.floor((pickNumber - 1) / teams) + 1,
      picks_until_user_next: picksUntil,
    },
    candidate: {
      name: body.player || "",
      positions: Array.isArray(body.positions) ? body.positions : [],
      team: body.team != null ? body.team : null,
      built_in_rank: rankNum,
      yahoo_adp: adpNum,
      // Precomputed so Jev never does arithmetic (a documented weak spot).
      // Positive = the player has fallen past the market; negative = early.
      picks_past_adp: adpNum != null && isFinite(adpNum) ? Math.round(pickNumber - adpNum) : null,
      picks_past_rank:
        rankNum != null && isFinite(rankNum) ? Math.round(pickNumber - rankNum) : null,
    },
    roster_needs: rn,
    board_context: board,
  };
  var punts = cleanPuntCats(body.puntCats);
  if (punts.length) {
    out.strategy = {
      punt_categories: punts,
      note: "User is punting these; judge value on the remaining categories",
    };
  }
  // Engine numbers (market + curated edges) as context. The engine's own
  // verdict and reason strings are deliberately NOT sent: Jev is an
  // independent second opinion, and the client compares its choice against
  // the engine verdict. Feeding the answer in would make Jev an echo.
  // (Jev returns typed answers only - no prose - so it cannot "explain".)
  if (body.signals && typeof body.signals === "object") {
    out.engine_numbers = {
      true_value_rank: body.signals.V != null ? Number(body.signals.V) : null,
      market_consensus_rank:
        body.signals.consensus != null ? Math.round(Number(body.signals.consensus)) : null,
      value_at_pick: body.signals.valueAtPick != null ? Number(body.signals.valueAtPick) : null,
      edges: Array.isArray(body.signals.edges)
        ? body.signals.edges.map(function (e) {
            return { signal: e.k, impact: e.v, note: e.note };
          })
        : [],
    };
  }
  return out;
}

/*
 * Neutral questions. Jev's confidence is derived from its own probability
 * distribution, so the instructions don't try to steer it - a low
 * confidence means "genuinely split", which is information the client uses.
 */
function buildQuestions(hasEngineNumbers, hasStrategy) {
  var context =
    "Use `candidate.picks_past_adp` (positive = fallen past market ADP, " +
    "negative = early), `roster_needs`" +
    (hasEngineNumbers ? ", `board_context` and `engine_numbers`." : " and `board_context`.") +
    (hasStrategy ? " Also consider `strategy.punt_categories`." : "");
  return {
    score: {
      type: "score",
      instructions:
        "How good a pick is `candidate` at `draft.pick_number` for this roster? " + context,
      criteria: SCORE_CRITERIA,
    },
    choice: {
      type: "choice",
      instructions:
        "Should the user draft `candidate` now, wait for their next pick " +
        "(`draft.picks_until_user_next` picks away), or is drafting them now a reach? " +
        context,
      criteria: CHOICE_CRITERIA,
    },
  };
}

/** Pass Jev's probability map through as plain {label: number}, or null. */
function cleanProbabilities(p) {
  if (!p || typeof p !== "object") return null;
  var out = {};
  var any = false;
  for (var k in p) {
    if (!Object.prototype.hasOwnProperty.call(p, k)) continue;
    var v = Number(p[k]);
    if (isFinite(v)) {
      out[k] = v;
      any = true;
    }
  }
  return any ? out : null;
}

async function handlePickQuality(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "POST only", verdict: "uncertain" }, 405, request);
  }

  if (!isAllowedOrigin(request.headers.get("Origin") || "")) {
    return jsonResponse({ error: "Origin not allowed", verdict: "uncertain" }, 403, request);
  }

  var declared = Number(request.headers.get("Content-Length"));
  if (isFinite(declared) && declared > MAX_BODY_BYTES) {
    return jsonResponse({ error: "Request too large", verdict: "uncertain" }, 413, request);
  }

  if (!(await rateOk(request, env))) {
    return jsonResponse(
      { error: "Too many coach requests; try again in a minute", verdict: "uncertain" },
      429,
      request
    );
  }

  var body;
  try {
    var raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return jsonResponse({ error: "Request too large", verdict: "uncertain" }, 413, request);
    }
    body = JSON.parse(raw);
  } catch (e) {
    return uncertain("Invalid JSON body", request);
  }

  if (!body || typeof body !== "object" || !body.player) {
    return uncertain("Missing player in request body", request);
  }

  var apiKey = env.TYPESAFE_API_KEY;
  if (!apiKey) {
    return uncertain("TYPESAFE_API_KEY not configured", request);
  }

  var state = buildState(body);
  var payload = {
    state: state,
    model: MODEL,
    questions: buildQuestions(!!state.engine_numbers, !!state.strategy),
  };

  var controller = new AbortController();
  var timer = setTimeout(function () {
    controller.abort();
  }, FETCH_TIMEOUT_MS);

  var upstream;
  try {
    upstream = await fetch(TYPESAFE_URL, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    var msg =
      err && err.name === "AbortError"
        ? "TypeSafe request timed out"
        : "TypeSafe request failed: " + (err && err.message ? err.message : "network error");
    return uncertain(msg, request);
  }
  clearTimeout(timer);

  if (!upstream.ok) {
    var errText = "";
    try {
      errText = await upstream.text();
    } catch (_) {
      errText = "";
    }
    var snippet = (errText || "").slice(0, 200).replace(/\s+/g, " ");
    return uncertain("TypeSafe HTTP " + upstream.status + (snippet ? ": " + snippet : ""), request);
  }

  var data;
  try {
    data = await upstream.json();
  } catch (e) {
    return uncertain("TypeSafe returned non-JSON", request);
  }

  var answers = (data && data.answers) || {};
  var scoreAns = answers.score;
  var choiceAns = answers.choice;
  if (!scoreAns || !choiceAns) {
    return uncertain("TypeSafe response missing score/choice answers", request);
  }

  var score = Number(scoreAns.score);
  var scoreConf = Number(scoreAns.confidence);
  var choice = choiceAns.choice;
  var choiceConf = Number(choiceAns.confidence);

  if (!isFinite(score) || !isFinite(scoreConf) || !isFinite(choiceConf) || !choice) {
    return uncertain("TypeSafe answers incomplete", request);
  }

  var allowed = { take: 1, wait: 1, reach: 1 };
  if (!allowed[choice]) {
    return uncertain("Unexpected choice: " + String(choice), request);
  }

  var verdict = scoreConf >= CONF_GATE && choiceConf >= CONF_GATE ? "suggest" : "uncertain";

  var modelUsed = (data && data.model) || MODEL;
  var label = scoreLabel(score);

  return jsonResponse(
    {
      score: score,
      scoreConfidence: scoreConf,
      choice: choice,
      choiceConfidence: choiceConf,
      scoreProbabilities: cleanProbabilities(scoreAns.probabilities),
      choiceProbabilities: cleanProbabilities(choiceAns.probabilities),
      // Jev returns typed answers only; there is no prose to pass through.
      // The client builds any wording from the fields above.
      why: "",
      verdict: verdict,
      model: modelUsed,
      scoreLabel: label,
    },
    200,
    request
  );
}

export default {
  async fetch(request, env, ctx) {
    var url = new URL(request.url);
    if (url.pathname === "/api/pick-quality" || url.pathname === "/api/pick-quality/") {
      return handlePickQuality(request, env);
    }
    var res = await env.ASSETS.fetch(request);
    if (res.status === 404) {
      var accept = request.headers.get("Accept") || "";
      if (accept.indexOf("text/html") >= 0) {
        return env.ASSETS.fetch(new Request(new URL("/index.html", url), request));
      }
    }
    return res;
  },
};
