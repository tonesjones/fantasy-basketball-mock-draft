/**
 * Cloudflare Pages Function: POST /api/pick-quality
 *
 * Calls TypeSafe System One (jev-latest) with Score + Choice questions
 * matching scripts/pick_quality_jev.py (spike / PR #3) semantics.
 *
 * Fail-soft: missing key / timeout / API error → HTTP 200 with
 * verdict "uncertain" + error string (never break the draft).
 * Never logs TYPESAFE_API_KEY.
 */

const CONF_GATE = 0.7;
const MODEL = "jev-latest";
const TYPESAFE_URL = "https://api.typesafe.ai/v1/systemone";
const FETCH_TIMEOUT_MS = 25000;

const SCORE_WORDS = ["Poor", "Below avg", "Average", "Good", "Excellent"];

const SCORE_CRITERIA = [
  "Poor — clear reach or wrong positional fit given roster needs",
  "Below average — better options likely available at similar ADP",
  "Average — fair market pick; neither strong value nor costly reach",
  "Good — solid fit for current needs and reasonable vs ADP",
  "Excellent — high-confidence value or must-draft fit right now",
];

const CHOICE_CRITERIA = {
  take: "Draft this player now; waiting risks losing them without a better replacement",
  wait: "Prefer to wait; similar or better value should remain for a later pick",
  reach: "Picking now would be an early reach relative to ADP and available alternatives",
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8",
  };
}

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status: status == null ? 200 : status,
    headers: corsHeaders(),
  });
}

function uncertain(error, extra) {
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
  return jsonResponse(out, 200);
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

function buildState(body) {
  var pickNumber = Number(body.pickNumber) || 1;
  var teams = 12;
  var picksUntil =
    body.picksUntilNext != null && body.picksUntilNext !== ""
      ? Number(body.picksUntilNext)
      : null;
  return {
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
    roster_needs: normalizeRosterNeeds(body.rosterNeeds, body.drafted),
    board_context: {
      notable_available: [],
      recently_taken: [],
    },
  };
}

function buildQuestions() {
  return {
    score: {
      type: "score",
      instructions:
        "How good is drafting `candidate` at this pick right now, given " +
        "`roster_needs`, ADP/rank vs `draft.pick_number`, and `board_context`? " +
        "Use the ordered levels in criteria (lowest to highest).",
      criteria: SCORE_CRITERIA,
    },
    choice: {
      type: "choice",
      instructions:
        "Should the user take this player now, wait for a later pick, or " +
        "treat drafting them now as a reach? Consider ADP vs pick number, " +
        "positional/category needs, and who else is available.",
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

export async function onRequest(context) {
  var request = context.request;
  var env = context.env || {};

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "POST only", verdict: "uncertain" }, 405);
  }

  var apiKey = env.TYPESAFE_API_KEY;
  if (!apiKey) {
    return uncertain("TYPESAFE_API_KEY not configured");
  }

  var body;
  try {
    body = await request.json();
  } catch (e) {
    return uncertain("Invalid JSON body");
  }

  if (!body || typeof body !== "object" || !body.player) {
    return uncertain("Missing player in request body");
  }

  var state = buildState(body);
  var payload = {
    state: state,
    model: MODEL,
    questions: buildQuestions(),
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
    return uncertain(msg);
  }
  clearTimeout(timer);

  if (!upstream.ok) {
    var errText = "";
    try {
      errText = await upstream.text();
    } catch (_) {
      errText = "";
    }
    // Do not echo secrets; truncate body for diagnostics only.
    var snippet = (errText || "").slice(0, 200).replace(/\s+/g, " ");
    return uncertain(
      "TypeSafe HTTP " + upstream.status + (snippet ? ": " + snippet : "")
    );
  }

  var data;
  try {
    data = await upstream.json();
  } catch (e) {
    return uncertain("TypeSafe returned non-JSON");
  }

  var answers = (data && data.answers) || {};
  var scoreAns = answers.score;
  var choiceAns = answers.choice;
  if (!scoreAns || !choiceAns) {
    return uncertain("TypeSafe response missing score/choice answers");
  }

  var score = Number(scoreAns.score);
  var scoreConf = Number(scoreAns.confidence);
  var choice = choiceAns.choice;
  var choiceConf = Number(choiceAns.confidence);

  if (!isFinite(score) || !isFinite(scoreConf) || !isFinite(choiceConf) || !choice) {
    return uncertain("TypeSafe answers incomplete");
  }

  var allowed = { take: 1, wait: 1, reach: 1 };
  if (!allowed[choice]) {
    return uncertain("Unexpected choice: " + String(choice));
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
  });
}
