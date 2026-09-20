/* Pick Coach — advisory-only helper.
 *
 * Stub pending real TypeSafe/Jev hook via /api/pick-quality.
 * Deterministic fixtures from ADP vs pick#; bias low confidence so
 * UNCERTAIN is the default (no auto-draft, no CPU auto-pick).
 */
(function (root) {
  "use strict";

  var SCORE_WORDS = ["Poor", "Below avg", "Average", "Good", "Excellent"];
  var CONF_GATE = 0.7;
  var DEBOUNCE_MS = 200;

  var _timer = null;
  var _seq = 0;

  function scoreWord(score) {
    var i = Math.max(0, Math.min(4, Math.round(Number(score) || 0)));
    return SCORE_WORDS[i];
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
      model: "stub-adp-gap",
      scoreLabel: scoreWord(score),
    };
  }

  function evaluate(state) {
    var mySeq = ++_seq;
    return new Promise(function (resolve) {
      if (_timer) clearTimeout(_timer);
      _timer = setTimeout(function () {
        _timer = null;
        if (mySeq !== _seq) {
          resolve({ stale: true, verdict: "uncertain" });
          return;
        }
        try {
          var result = pickCoachEvaluate(state || {});
          result.stale = false;
          resolve(result);
        } catch (e) {
          resolve({
            verdict: "uncertain",
            error: "Coach unavailable",
            stale: false,
            model: "stub-adp-gap",
          });
        }
      }, DEBOUNCE_MS);
    });
  }

  function cancel() {
    if (_timer) {
      clearTimeout(_timer);
      _timer = null;
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
