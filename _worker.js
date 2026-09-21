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

/** API suggest hint only; client TEMPORARY gates (0.55/0.35) reclassify lean. */
var CONF_GATE = 0.7;
/** Pin versioned id (aliases like jev-latest may move). */
var MODEL = "jev-1.13.0";
var TYPESAFE_URL = "https://api.typesafe.ai/v1/systemone";
var FETCH_TIMEOUT_MS = 25000;

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
    "Vary": "Origin",
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

function scoreLabel(score) {
  var i = Math.max(0, Math.min(4, Math.round(Number(score) || 0)));
  return SCORE_WORDS[i];
}

function normalizeRosterNeeds(rosterNeeds, drafted) {
  var rn = rosterNeeds && typeof rosterNeeds === "object" ? rosterNeeds : {};
  var filled = rn.filledSlots || rn.filled_slots || [];
  var open = rn.openSlots || rn.open_slots || [];
  var already =
    rn.alreadyDraftedByUser ||
    rn.already_drafted_by_user ||
    drafted ||
    [];
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
  return list.slice(0, 8).map(function (item) {
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
  }).filter(function (x) {
    return x && x.name;
  });
}

function buildState(body) {
  var pickNumber = Number(body.pickNumber) || 1;
  var teams = 12;
  var picksUntil =
    body.picksUntilNext != null && body.picksUntilNext !== ""
      ? Number(body.picksUntilNext)
      : null;
  var rn = normalizeRosterNeeds(body.rosterNeeds, body.drafted);
  var scarcity =
    body.scarcityRem || body.scarcity_rem || body.boardContext && body.boardContext.scarcity_rem || null;
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
      built_in_rank: body.rank != null && body.rank !== "" ? Number(body.rank) : null,
      yahoo_adp: body.adp != null && body.adp !== "" ? Number(body.adp) : null,
    },
    roster_needs: rn,
    board_context: board,
  };
  // Deterministic signals: computed client-side from market data + curated
  // edges. Jev's job is to EXPLAIN these numbers in natural language, not to
  // re-derive a verdict via confidence thresholds.
  if (body.signals && typeof body.signals === "object") {
    out.deterministic_signals = {
      verdict: body.signals.verdict || null,
      true_value_rank: body.signals.V != null ? Number(body.signals.V) : null,
      market_consensus_rank: body.signals.consensus != null ? Math.round(Number(body.signals.consensus)) : null,
      value_at_pick: body.signals.valueAtPick != null ? Number(body.signals.valueAtPick) : null,
      reasons: Array.isArray(body.signals.reasons) ? body.signals.reasons : [],
      edges: Array.isArray(body.signals.edges) ? body.signals.edges.map(function (e) {
        return { signal: e.k, impact: e.v, note: e.note };
      }) : [],
      target_window: body.signals.target || null,
    };
  }
  return out;
}

function buildQuestions(hasSignals) {
  var scoreInstructions =
    "How good is drafting `candidate` at this pick right now, given " +
    "`roster_needs`, ADP/rank vs `draft.pick_number`, and `board_context`? " +
    "Use the ordered levels in criteria (lowest to highest). ";
  var choiceInstructions =
    "Should the user take this player now, wait for a later pick, or " +
    "treat drafting them now as a reach? Consider ADP vs pick number, " +
    "positional/category needs, and who else is available. ";
  if (hasSignals) {
    var grounding =
      "IMPORTANT — deterministic signals provided: `deterministic_signals` " +
      "contains a precomputed verdict (take/wait/pass/reach), true_value_rank, " +
      "value_at_pick, and the specific signal edges (actuals, role, vacated " +
      "usage, playoff schedule). Your job is to EXPLAIN these numbers, not to " +
      "re-derive the verdict. Reference the concrete numbers (e.g. 'our #28 " +
      "vs market #70, +42 value'). Keep confidence calibrated to how clear " +
      "the numbers are, not to the player's star power.";
    scoreInstructions += grounding;
    choiceInstructions += grounding + " HARD RULE — stay consistent with " +
      "the deterministic verdict: verdict take → choose take; wait → wait; " +
      "reach → reach; pass → choose wait (do not take now). Never recommend " +
      "a different action than the deterministic verdict, and never " +
      "contradict it in your explanation.";
  } else {
    scoreInstructions +=
      "IMPORTANT — calibrated confidence: report how clear the ranking is vs " +
      "ADP and the remaining board, NOT how elite the player is. Average or " +
      "Good market picks should still carry moderate-to-high confidence " +
      "(roughly 0.45–0.85) when the grade is clear relative to ADP/alternatives. " +
      "Reserve near-zero confidence only when evidence is contradictory or sparse. " +
      "Do not collapse score confidence toward 0 just because the pick is Average.";
    choiceInstructions +=
      "IMPORTANT — calibrated confidence: confidence reflects clarity of the " +
      "take/wait/reach decision given ADP and board context, not star power. " +
      "Clear market-rate decisions (including wait on Average picks) should " +
      "keep moderate confidence; use very low confidence only when take vs " +
      "wait vs reach is genuinely ambiguous.";
  }
  return {
    score: {
      type: "score",
      instructions: scoreInstructions,
      criteria: SCORE_CRITERIA,
    },
    choice: {
      type: "choice",
      instructions: choiceInstructions,
      criteria: CHOICE_CRITERIA,
    },
  };
}

function buildWhy(scoreAns, choiceAns, score, choice) {
  var label = scoreLabel(score);
  var parts = [
    "Jev pick quality " + Number(score).toFixed(2) + " ≈ " + label,
    "choice " + choice,
  ];
  var sc = Number(scoreAns && scoreAns.confidence);
  var cc = Number(choiceAns && choiceAns.confidence);
  if (isFinite(sc) && isFinite(cc)) {
    parts.push(
      "conf score " + sc.toFixed(2) + " / choice " + cc.toFixed(2)
    );
  }
  return parts.join("; ") + ".";
}

async function handlePickQuality(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "POST only", verdict: "uncertain" }, 405, request);
  }

  var apiKey = env.TYPESAFE_API_KEY;
  if (!apiKey) {
    return uncertain("TYPESAFE_API_KEY not configured", request);
  }

  var body;
  try {
    body = await request.json();
  } catch (e) {
    return uncertain("Invalid JSON body", request);
  }

  if (!body || typeof body !== "object" || !body.player) {
    return uncertain("Missing player in request body", request);
  }

  var state = buildState(body);
  var hasSignals = !!(state.deterministic_signals && state.deterministic_signals.verdict);
  var payload = {
    state: state,
    model: MODEL,
    questions: buildQuestions(hasSignals),
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
    return uncertain(
      "TypeSafe HTTP " + upstream.status + (snippet ? ": " + snippet : ""),
      request
    );
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

  var verdict =
    scoreConf >= CONF_GATE && choiceConf >= CONF_GATE ? "suggest" : "uncertain";

  var modelUsed = (data && data.model) || MODEL;
  var label = scoreLabel(score);

  return jsonResponse({
    score: score,
    scoreConfidence: scoreConf,
    choice: choice,
    choiceConfidence: choiceConf,
    why: buildWhy(scoreAns, choiceAns, score, choice),
    verdict: verdict,
    model: modelUsed,
    scoreLabel: label,
  }, 200, request);
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
