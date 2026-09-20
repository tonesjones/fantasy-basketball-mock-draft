/* Pick Coach — advisory-only helper.
 *
 * Prefers POST /api/pick-quality (Cloudflare Pages Function → TypeSafe/Jev).
 * Fail-soft: API soft-errors return uncertain + error (no silent stub).
 * Offline / file:// / network TypeError → stub labeled model:"stub" so
 * index.html still works without wrangler.
 */
(function (root) {
  "use strict";

  var SCORE_WORDS = ["Poor", "Below avg", "Average", "Good", "Excellent"];
  var CONF_GATE = 0.7;
  var DEBOUNCE_MS = 200;
  var API_PATH = "/api/pick-quality";

  var _timer = null;
  var _seq = 0;
  var _abort = null;

  function scoreWord(score) {
    var i = Math.max(0, Math.min(4, Math.round(Number(score) || 0)));
    return SCORE_WORDS[i];
  }

  function isFileProtocol() {
    try {
      return typeof location !== "undefined" && location.protocol === "file:";
    } catch (e) {
      return false;
    }
  }

  /**
   * Deterministic stub. Biases toward low confidence / UNCERTAIN.
   * Returns { score, scoreConfidence, choice, choiceConfidence, verdict, why, model }.
   */
  function pickCoachEvaluate(candidate) {
    var pick = Number(candidate && candidate.pickNumber) || 1;
    var adp = candidate && candidate.adp != null ? Number(candidate.adp) : null;
    var rank = candidate && candidate.rank != null ? Number(candidate.rank) : null;
    var market = adp != null ? adp : rank != null ? rank : pick;
    // + = value (available later than ADP); - = reach (picking earlier than ADP).
    var delta = pick - market;

    var score;
    var choice;
    if (delta >= 8) {
      score = 4;
      choice = "take";
    } else if (delta >= 3) {
      score = 3;
      choice = "take";
    } else if (delta >= -2) {
      score = 2;
      choice = "wait";
    } else if (delta >= -8) {
      score = 1;
      choice = "reach";
    } else {
      score = 0;
      choice = "reach";
    }

    // Bias low confidence: only rare large-value cases clear the 0.7 gate.
    var scoreConf = delta >= 12 ? 0.78 : Math.abs(delta) >= 6 ? 0.55 : 0.35;
    var choiceConf = delta >= 12 ? 0.76 : Math.abs(delta) >= 6 ? 0.52 : 0.32;

    var why;
    if (adp != null) {
      why =
        "ADP " +
        adp +
        " vs pick #" +
        pick +
        " (" +
        (delta >= 0 ? "+" : "") +
        Math.round(delta) +
        " vs market). Stub heuristic only.";
    } else {
      why = "No ADP — using rank/pick gap. Stub heuristic only.";
    }

    var verdict =
      scoreConf >= CONF_GATE && choiceConf >= CONF_GATE ? "suggest" : "uncertain";

    return {
      score: score,
      scoreConfidence: scoreConf,
      choice: choice,
      choiceConfidence: choiceConf,
      verdict: verdict,
      why: why,
      model: "stub",
      scoreLabel: scoreWord(score),
    };
  }

  function uncertainResult(error, model) {
    return {
      score: null,
      scoreConfidence: 0,
      choice: null,
      choiceConfidence: 0,
      verdict: "uncertain",
      why: "",
      model: model || "pick-quality",
      error: String(error || "Coach unavailable"),
      stale: false,
    };
  }

  function normalizeApiResult(data) {
    var scoreConf = Number(data.scoreConfidence);
    var choiceConf = Number(data.choiceConfidence);
    var verdict = data.verdict;
    if (
      verdict === "suggest" &&
      !(
        isFinite(scoreConf) &&
        isFinite(choiceConf) &&
        scoreConf >= CONF_GATE &&
        choiceConf >= CONF_GATE
      )
    ) {
      verdict = "uncertain";
    }
    if (verdict !== "suggest" && verdict !== "uncertain") {
      verdict = "uncertain";
    }
    var score = data.score != null ? Number(data.score) : null;
    return {
      score: score,
      scoreConfidence: isFinite(scoreConf) ? scoreConf : 0,
      choice: data.choice || null,
      choiceConfidence: isFinite(choiceConf) ? choiceConf : 0,
      verdict: verdict,
      why: data.why || "",
      model: data.model || "jev-latest",
      scoreLabel: data.scoreLabel || (score != null ? scoreWord(score) : undefined),
      error: data.error || undefined,
      stale: false,
    };
  }

  function fetchPickQuality(state, signal) {
    return fetch(API_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(state || {}),
      signal: signal,
    }).then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        if (text) {
          try {
            data = JSON.parse(text);
          } catch (e) {
            throw new Error("pick-quality returned non-JSON (" + res.status + ")");
          }
        }
        if (!res.ok) {
          var msg =
            (data && data.error) ||
            "pick-quality HTTP " + res.status;
          return uncertainResult(msg, "pick-quality");
        }
        if (!data || typeof data !== "object") {
          return uncertainResult("Empty pick-quality response", "pick-quality");
        }
        return normalizeApiResult(data);
      });
    });
  }

  function runEvaluate(state, mySeq) {
    if (mySeq !== _seq) {
      return Promise.resolve({ stale: true, verdict: "uncertain" });
    }

    if (isFileProtocol()) {
      try {
        var stubFile = pickCoachEvaluate(state || {});
        stubFile.stale = false;
        stubFile.fallback = "file";
        return Promise.resolve(stubFile);
      } catch (e) {
        return Promise.resolve(uncertainResult("Coach unavailable", "stub"));
      }
    }

    if (typeof fetch !== "function") {
      var stubNoFetch = pickCoachEvaluate(state || {});
      stubNoFetch.stale = false;
      stubNoFetch.fallback = "no-fetch";
      return Promise.resolve(stubNoFetch);
    }

    if (_abort) {
      try {
        _abort.abort();
      } catch (e) {}
      _abort = null;
    }
    var controller =
      typeof AbortController !== "undefined" ? new AbortController() : null;
    _abort = controller;

    return fetchPickQuality(state, controller ? controller.signal : undefined)
      .then(function (result) {
        if (mySeq !== _seq) {
          return { stale: true, verdict: "uncertain" };
        }
        return result;
      })
      .catch(function (err) {
        if (mySeq !== _seq) {
          return { stale: true, verdict: "uncertain" };
        }
        if (err && err.name === "AbortError") {
          return { stale: true, verdict: "uncertain" };
        }
        // Network / missing function (browser "Failed to fetch", Node relative URL).
        if (err && (err.name === "TypeError" || /Failed to fetch|Invalid URL|NetworkError/i.test(String(err.message || err)))) {
          try {
            var stubNet = pickCoachEvaluate(state || {});
            stubNet.stale = false;
            stubNet.fallback = "network";
            return stubNet;
          } catch (e2) {
            return uncertainResult("Coach unavailable", "stub");
          }
        }
        return uncertainResult(
          err && err.message ? err.message : "Coach unavailable",
          "pick-quality"
        );
      })
      .then(function (result) {
        if (_abort === controller) _abort = null;
        return result;
      });
  }

  function evaluate(state) {
    var mySeq = ++_seq;
    return new Promise(function (resolve) {
      if (_timer) clearTimeout(_timer);
      if (_abort) {
        try {
          _abort.abort();
        } catch (e) {}
        _abort = null;
      }
      _timer = setTimeout(function () {
        _timer = null;
        runEvaluate(state || {}, mySeq).then(resolve);
      }, DEBOUNCE_MS);
    });
  }

  function cancel() {
    if (_timer) {
      clearTimeout(_timer);
      _timer = null;
    }
    if (_abort) {
      try {
        _abort.abort();
      } catch (e) {}
      _abort = null;
    }
    _seq++;
  }

  root.PickCoach = {
    evaluate: evaluate,
    pickCoachEvaluate: pickCoachEvaluate,
    scoreWord: scoreWord,
    cancel: cancel,
    CONF_GATE: CONF_GATE,
  };
})(typeof window !== "undefined" ? window : globalThis);
