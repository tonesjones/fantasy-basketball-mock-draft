/* Pick Coach — advisory-only helper.
 *
 * Prefers POST /api/pick-quality (Cloudflare Pages Function → TypeSafe/Jev).
 * Fail-soft: API soft-errors return uncertain + error (draft never breaks).
 * Offline file:// (or no fetch) → stub labeled model:"stub".
 * On *.pages.dev preview hosts: TYPESAFE_API_KEY / network soft-fails fall back
 * to labeled stub (model:"stub", source "Stub") so QA can exercise suggest /
 * "Not sure enough…" — never labeled as Jev.
 * Other http(s) hosts: network TypeError → uncertain + quiet error (NOT stub).
 */
(function (root) {
  "use strict";

  var SCORE_WORDS = ["Poor", "Below avg", "Average", "Good", "Excellent"];
  var CONF_GATE = 0.7;
  var DEBOUNCE_MS = 200;
  var CACHE_TTL_MS = 45000;
  var API_PATH = "/api/pick-quality";
  var PINNED_MODEL = "jev-1.13.0";

  var _timer = null;
  var _seq = 0;
  var _abort = null;
  var _cache = Object.create(null);
  var _pendingResolve = null;

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

  function isHttpHost() {
    try {
      if (typeof location === "undefined") return false;
      return location.protocol === "http:" || location.protocol === "https:";
    } catch (e) {
      return false;
    }
  }

  /** Preview Pages hosts (incl. feat-* aliases): hostname includes pages.dev. */
  function isPreviewPagesHost() {
    try {
      if (typeof location === "undefined") return false;
      var host = String(location.hostname || "");
      return /pages\.dev$/i.test(host) || host.indexOf("pages.dev") >= 0;
    } catch (e) {
      return false;
    }
  }

  /** Soft-fails where preview may use labeled stub for QA (key missing / net). */
  function isStubbableSoftFail(error) {
    var msg = String(error || "");
    return /TYPESAFE_API_KEY|not configured|Coach unreachable|Failed to fetch|NetworkError|timeout|ETIMEDOUT|pick-quality HTTP|Empty pick-quality/i.test(
      msg
    );
  }

  function labeledStubResult(state, fallback) {
    var stub = pickCoachEvaluate(state || {});
    stub.stale = false;
    stub.fallback = fallback || "preview-softfail";
    stub.model = "stub";
    // Never carry soft-fail error onto stub — would force Unavailable UI.
    delete stub.error;
    return stub;
  }

  /** Fingerprint: player + pick# + logLen (board identity for cache). */
  function fingerprint(state) {
    var s = state || {};
    var player = String(s.player || "");
    var pick = Number(s.pickNumber) || 0;
    var logLen =
      s.logLen != null && s.logLen !== ""
        ? Number(s.logLen)
        : Math.max(0, pick - 1);
    return player + "|" + pick + "|" + logLen;
  }

  function cacheGet(key) {
    var hit = _cache[key];
    if (!hit) return null;
    if (Date.now() - hit.t > CACHE_TTL_MS) {
      delete _cache[key];
      return null;
    }
    return hit.v;
  }

  function cacheSet(key, value) {
    if (!value || value.stale || value.error) return;
    // Cache successful suggest/uncertain-without-error only.
    _cache[key] = { t: Date.now(), v: value };
  }

  function clearCache() {
    _cache = Object.create(null);
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
    var model = data.model || PINNED_MODEL;
    return {
      score: score,
      scoreConfidence: isFinite(scoreConf) ? scoreConf : 0,
      choice: data.choice || null,
      choiceConfidence: isFinite(choiceConf) ? choiceConf : 0,
      verdict: verdict,
      why: data.why || "",
      model: model,
      scoreLabel: data.scoreLabel || (score != null ? scoreWord(score) : undefined),
      error: data.error || undefined,
      stale: false,
    };
  }

  /** Short UI label: "Jev" / "Stub" / "Stub · offline" / "Unavailable". */
  function sourceLabel(res) {
    if (!res) return "";
    if (res.error) return "Unavailable";
    var m = String(res.model || "");
    if (m === "stub" || res.fallback) {
      // Preview soft-fail stub is QA-only — never look like Jev.
      if (
        res.fallback === "preview-softfail" ||
        res.fallback === "preview-network"
      ) {
        return "Stub";
      }
      if (res.fallback === "file" || res.fallback === "no-fetch" || m === "stub") {
        return "Stub · offline";
      }
      return "Stub";
    }
    if (/^jev/i.test(m) || m === "pick-quality") {
      // Prefer friendly "Jev"; keep version in title tooltip via model field.
      return "Jev";
    }
    if (m) return m;
    return "";
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

    var fp = fingerprint(state);

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

    var cached = cacheGet(fp);
    if (cached) {
      var copy = {};
      for (var k in cached) {
        if (Object.prototype.hasOwnProperty.call(cached, k)) copy[k] = cached[k];
      }
      copy.stale = false;
      copy.cached = true;
      return Promise.resolve(copy);
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
        // Preview *.pages.dev: key-missing / soft API errors → labeled stub for QA.
        // (feat-* aliases often lack Preview-env TYPESAFE_API_KEY; Production secret
        // applies to the production preview hostname only.)
        if (
          result &&
          result.error &&
          !result.stale &&
          isPreviewPagesHost() &&
          isStubbableSoftFail(result.error)
        ) {
          try {
            return labeledStubResult(state, "preview-softfail");
          } catch (eStub) {
            return result;
          }
        }
        if (result && !result.stale && !result.error) {
          cacheSet(fp, result);
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
        var isNet =
          err &&
          (err.name === "TypeError" ||
            /Failed to fetch|Invalid URL|NetworkError/i.test(
              String(err.message || err)
            ));
        // Preview Pages: network failure → labeled stub so QA can still see paths.
        if (isNet && isHttpHost() && isPreviewPagesHost()) {
          try {
            return labeledStubResult(state, "preview-network");
          } catch (ePrev) {
            return uncertainResult("Coach unreachable", "pick-quality");
          }
        }
        // Other http(s) hosts: never paint stub as if live — uncertain + quiet error.
        if (isNet && isHttpHost()) {
          return uncertainResult("Coach unreachable", "pick-quality");
        }
        // Non-browser / relative-URL Node smoke: allow stub only off http(s).
        if (isNet && !isHttpHost()) {
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
      if (_pendingResolve) {
        try {
          _pendingResolve({ stale: true, verdict: "uncertain" });
        } catch (e) {}
        _pendingResolve = null;
      }
      if (_timer) clearTimeout(_timer);
      if (_abort) {
        try {
          _abort.abort();
        } catch (e) {}
        _abort = null;
      }
      _pendingResolve = resolve;
      _timer = setTimeout(function () {
        _timer = null;
        var fin = _pendingResolve;
        _pendingResolve = null;
        runEvaluate(state || {}, mySeq).then(function (result) {
          if (fin) fin(result);
        });
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
    if (_pendingResolve) {
      try {
        _pendingResolve({ stale: true, verdict: "uncertain" });
      } catch (e) {}
      _pendingResolve = null;
    }
  }

  root.PickCoach = {
    evaluate: evaluate,
    pickCoachEvaluate: pickCoachEvaluate,
    scoreWord: scoreWord,
    cancel: cancel,
    clearCache: clearCache,
    fingerprint: fingerprint,
    sourceLabel: sourceLabel,
    normalizeApiResult: normalizeApiResult,
    uncertainResult: uncertainResult,
    isPreviewPagesHost: isPreviewPagesHost,
    isStubbableSoftFail: isStubbableSoftFail,
    labeledStubResult: labeledStubResult,
    CONF_GATE: CONF_GATE,
    CACHE_TTL_MS: CACHE_TTL_MS,
    PINNED_MODEL: PINNED_MODEL,
  };
})(typeof window !== "undefined" ? window : globalThis);
