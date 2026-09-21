/* Pick Coach — advisory-only helper.
 *
 * Prefers POST /api/pick-quality (Cloudflare Pages Function → TypeSafe/Jev).
 * Fail-soft: API soft-errors return uncertain + error (draft never breaks).
 * Offline file:// (or no fetch) → stub labeled model:"stub".
 * On *.pages.dev preview hosts: TYPESAFE_API_KEY / network soft-fails fall back
 * to labeled stub (model:"stub", source "Stub") so QA can exercise suggest /
 * lean / "Not sure enough…" — never labeled as Jev.
 * Other http(s) hosts: network TypeError → uncertain + quiet error (NOT stub).
 * QA query (preview): ?leanDemo=1 | ?coachFixture=1 | ?forceConf=suggest|lean|uncertain
 * forces Stub/Fixture paths (never Jev) for paint QA.
 */
(function (root) {
  "use strict";

  var SCORE_WORDS = ["Poor", "Below avg", "Average", "Good", "Excellent"];
  /**
   * TEMPORARY gates (2026-09-20 recal): lowered further so bare preview paints
   * Soft lean/suggest for stars. Live Jev often returns scoreConfidence ~0 and
   * choiceConfidence ~0.25–0.30 (Wemby/Edwards) — prior LEAN 0.35 still left
   * max≈0.30 uncertain. classifyVerdict uses max(score,choice) TEMPORARILY
   * (not min), plus score / elite-ADP floors (upward only). softFail → uncertain.
   * Full suggest when max(scoreConf, choiceConf) ≥ CONF_GATE.
   */
  var CONF_GATE = 0.45;
  /** TEMPORARY: lean when max ≥ LEAN_GATE and < CONF_GATE (not softFail). */
  var LEAN_GATE = 0.25;
  var DEBOUNCE_MS = 200;
  var CACHE_TTL_MS = 45000;
  var API_PATH = "/api/pick-quality";
  var PINNED_MODEL = "jev-1.13.0";
  /**
   * Client-side backstop for /api/pick-quality. The Pages Function aborts its
   * upstream Jev call at 25s and returns a structured fail-soft; this timer
   * only fires when the function itself never responds (observed once: 60s+
   * with zero bytes). Longer than the server timeout so the server's
   * structured "uncertain" wins whenever it arrives.
   */
  var CLIENT_TIMEOUT_MS = 30000;

  var _timer = null;
  var _seq = 0;
  var _abort = null;
  var _cache = Object.create(null);
  var _pendingResolve = null;

  function scoreWord(score) {
    var i = Math.max(0, Math.min(4, Math.round(Number(score) || 0)));
    return SCORE_WORDS[i];
  }

  /**
   * Client-side verdict from confidences (+ optional ctx floors).
   * TEMPORARY (2026-09-20 recal): band uses max(scoreConf, choiceConf) — live
   * Jev often returns scoreConfidence ~0 while choiceConfidence is usable
   * (Wemby/Edwards). suggest ≥ 0.45; lean ≥ 0.25 and < 0.45; else uncertain.
   * Then TEMP floors (upward only, never softFail):
   *   - score ≥ 4 → at least suggest; score ≥ 3 → at least lean
   *   - yahoo ADP or rank ≤ 5 AND pickNumber ≤ (adp||rank)+3 → at least lean
   * SoftFail / error paths should not call this — stay uncertain.
   * Revisit after prompt calibration lands (prefer min again when both confs fire).
   */
  function verdictRank(v) {
    return v === "suggest" ? 2 : v === "lean" ? 1 : 0;
  }
  function raiseVerdict(cur, floor) {
    return verdictRank(floor) > verdictRank(cur) ? floor : cur;
  }
  function classifyVerdict(scoreConf, choiceConf, ctx) {
    var sc = Number(scoreConf);
    var cc = Number(choiceConf);
    if (!(isFinite(sc) && isFinite(cc))) return "uncertain";
    // TEMP product rule: max — one conf ~0 must not collapse a usable peer.
    var bandC = Math.max(sc, cc);
    var verdict = "uncertain";
    if (bandC >= CONF_GATE) verdict = "suggest";
    else if (bandC >= LEAN_GATE) verdict = "lean";

    ctx = ctx || {};
    // TEMP score floor (not softFail): raise effective band upward only.
    var score = ctx.score != null && ctx.score !== "" ? Number(ctx.score) : NaN;
    if (isFinite(score)) {
      if (score >= 4) verdict = raiseVerdict(verdict, "suggest");
      else if (score >= 3) verdict = raiseVerdict(verdict, "lean");
    }
    // TEMP elite ADP floor: top-5 market + pick still near ADP → at least lean.
    var adp = ctx.adp != null && ctx.adp !== "" ? Number(ctx.adp) : NaN;
    var rank = ctx.rank != null && ctx.rank !== "" ? Number(ctx.rank) : NaN;
    var pick = ctx.pickNumber != null && ctx.pickNumber !== "" ? Number(ctx.pickNumber) : NaN;
    var market = isFinite(adp) ? adp : isFinite(rank) ? rank : NaN;
    if (isFinite(market) && market <= 5 && isFinite(pick) && pick <= market + 3) {
      verdict = raiseVerdict(verdict, "lean");
    }
    return verdict;
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


  /** Parse preview QA query: ?coachFixture=1 | ?leanDemo=1 | ?forceConf=suggest|lean|uncertain */
  function readCoachQaMode() {
    try {
      if (typeof location === "undefined" || !location.search) return null;
      var search = String(location.search || "");
      if (search.charAt(0) === "?") search = search.slice(1);
      var params = Object.create(null);
      if (search) {
        search.split("&").forEach(function (pair) {
          var i = pair.indexOf("=");
          var k = i >= 0 ? pair.slice(0, i) : pair;
          var v = i >= 0 ? pair.slice(i + 1) : "";
          try {
            k = decodeURIComponent(k.replace(/\+/g, " "));
            v = decodeURIComponent(v.replace(/\+/g, " "));
          } catch (eDec) {}
          params[String(k)] = String(v);
        });
      }
      var force = String(params.forceConf || "").toLowerCase();
      if (force === "suggest" || force === "lean" || force === "uncertain") {
        return { mode: "forceConf", band: force };
      }
      if (params.leanDemo === "1" || params.leanDemo === "true") {
        return { mode: "leanDemo", band: "lean" };
      }
      if (params.coachFixture === "1" || params.coachFixture === "true") {
        return { mode: "coachFixture", band: null };
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Deterministic Stub/Fixture result — never labeled Jev.
   * coachFixture: map ADP/pick gap → suggest|lean|uncertain.
   * leanDemo / forceConf: fixed band for UX paint QA.
   */
  function fixtureResult(state, qa) {
    var band = (qa && qa.band) || null;
    var choice = "wait";
    var score = 2;
    var scoreConf = 0.28;
    var choiceConf = 0.26;
    var why = "Fixture — deterministic QA path (not Jev).";

    if (!band && qa && qa.mode === "coachFixture") {
      var pick = Number(state && state.pickNumber) || 1;
      var adp = state && state.adp != null ? Number(state.adp) : null;
      var rank = state && state.rank != null ? Number(state.rank) : null;
      var market = adp != null ? adp : rank != null ? rank : pick;
      var delta = pick - market;
      if (delta >= 8) band = "suggest";
      else if (Math.abs(delta) >= 3) band = "lean";
      else band = "uncertain";
      // Prefer take on value, reach on early, wait near market — Edwards-like mid lean uses wait/take.
      if (delta >= 3) {
        choice = "take";
        score = 3;
      } else if (delta <= -3) {
        choice = "reach";
        score = 1;
      } else {
        choice = "wait";
        score = 2;
      }
    }

    if (band === "suggest") {
      scoreConf = 0.72;
      choiceConf = 0.68;
      if (!qa || qa.mode !== "coachFixture") {
        choice = "take";
        score = 4;
      }
      why = "Fixture suggest — high confidence stub (not Jev).";
    } else if (band === "lean") {
      // Mid-conf Edwards-like: paints outline Lean take/wait/reach + Soft lean.
      // 0.38/0.36 clearly in lean band under LEAN_GATE=0.25 / CONF_GATE=0.45
      // (even if UI briefly reclassifies; honor res.verdict is the paint source).
      scoreConf = 0.38;
      choiceConf = 0.36;
      if (!qa || qa.mode === "leanDemo" || qa.mode === "forceConf") {
        choice = "take";
        score = 2;
      }
      why = "Fixture lean — mid confidence stub (not Jev). Soft lean path for UX QA.";
    } else {
      band = "uncertain";
      scoreConf = 0.22;
      choiceConf = 0.18;
      choice = null;
      score = null;
      why = "Fixture uncertain — low confidence stub (not Jev).";
    }

    var verdict = classifyVerdict(scoreConf, choiceConf, {
      score: score,
      adp: state && state.adp,
      rank: state && state.rank,
      pickNumber: state && state.pickNumber,
    });
    // forceConf/leanDemo must honor requested band even if classify drifts
    if (qa && (qa.mode === "forceConf" || qa.mode === "leanDemo") && qa.band) {
      verdict = qa.band;
    }

    return {
      score: score,
      scoreConfidence: scoreConf,
      choice: choice,
      choiceConfidence: choiceConf,
      verdict: verdict,
      why: why,
      model: "stub",
      scoreLabel: score != null ? scoreWord(score) : undefined,
      fallback: "fixture",
      fixture: true,
      stale: false,
    };
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
    if (!value || value.stale) return;
    // Cache successful results. Deterministic verdicts are cacheable even
    // when Jev errored — the numbers don't depend on Jev.
    if (value.error && !value.deterministic) return;
    // Cache take/wait/pass/reach + legacy bands (uncertain-without-error only).
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

    // Bias under TEMPORARY gates: large-value → suggest (≥0.45); mid → lean (≥0.25); else uncertain.
    var scoreConf = delta >= 12 ? 0.72 : Math.abs(delta) >= 6 ? 0.38 : 0.18;
    var choiceConf = delta >= 12 ? 0.70 : Math.abs(delta) >= 6 ? 0.36 : 0.16;

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

    var verdict = classifyVerdict(scoreConf, choiceConf, {
      score: score,
      adp: adp,
      rank: rank,
      pickNumber: pick,
    });

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

  function normalizeApiResult(data, state) {
    var scoreConf = Number(data.scoreConfidence);
    var choiceConf = Number(data.choiceConfidence);
    var score = data.score != null ? Number(data.score) : null;
    var s = state || {};
    var ctx = {
      score: score,
      adp: s.adp != null ? s.adp : data.adp,
      rank: s.rank != null ? s.rank : data.rank,
      pickNumber: s.pickNumber != null ? s.pickNumber : data.pickNumber,
    };
    // Deterministic signals (from PickSignals.evaluate): the verdict comes
    // from computed value, NOT from Jev's confidence thresholds. Jev's role
    // is to explain the numbers, not to vote via uncalibrated confidences.
    var sig = s.signals || null;
    var verdict, choice, deterministic = false;
    if (sig && sig.verdict) {
      deterministic = true;
      // Native deterministic verdicts: take | wait | pass | reach.
      // Computed from market value + curated edges — never re-derived from
      // Jev's confidence thresholds. The UI maps these to display bands; a
      // confident pass is NOT "uncertain".
      var dv = String(sig.verdict).toLowerCase();
      if (dv !== "take" && dv !== "wait" && dv !== "pass" && dv !== "reach") dv = "uncertain";
      verdict = dv;
      choice = dv;
      var detWhy = (sig.reasons || []).join(" · ");
      // Jev explains; it must not contradict. Append Jev's prose only when
      // its stated choice agrees with the deterministic verdict — otherwise
      // the deterministic numbers stand alone.
      var jevWhy = data.why || "";
      var jevChoice = data.choice ? String(data.choice).toLowerCase() : null;
      var why = detWhy;
      // Jev's choice schema has no "pass"; the API prompt maps deterministic
      // pass -> Jev "wait" (do not take now). A Jev "wait" against a
      // deterministic "pass" is agreement, not contradiction. Jev "take"
      // or "reach" against any non-matching verdict is still dropped.
      var jevAgrees = jevChoice === dv || (dv === "pass" && jevChoice === "wait");
      if (jevWhy && jevAgrees && jevWhy.indexOf(detWhy.slice(0, 40)) < 0) {
        why = detWhy + (detWhy ? " · " : "") + jevWhy;
      }
      var model = data.model || PINNED_MODEL;
      return {
        score: score,
        scoreConfidence: isFinite(scoreConf) ? scoreConf : 0,
        choice: choice,
        choiceConfidence: isFinite(choiceConf) ? choiceConf : 0,
        verdict: verdict,
        why: why,
        model: model,
        scoreLabel: data.scoreLabel || (score != null ? scoreWord(score) : undefined),
        error: data.error || undefined,
        stale: false,
        deterministic: true,
        signals: sig,
      };
    }
    // Fallback: legacy confidence-gate path (no signals computed).
    // Prefer client-side lean/suggest classification from confidences (API unchanged).
    // Soft-fail payloads with error stay uncertain (do not lean / floors).
    if (data && data.error) {
      verdict = "uncertain";
    } else {
      verdict = classifyVerdict(scoreConf, choiceConf, ctx);
    }
    if (verdict !== "suggest" && verdict !== "lean" && verdict !== "uncertain") {
      verdict = "uncertain";
    }
    var model2 = data.model || PINNED_MODEL;
    return {
      score: score,
      scoreConfidence: isFinite(scoreConf) ? scoreConf : 0,
      choice: data.choice || null,
      choiceConfidence: isFinite(choiceConf) ? choiceConf : 0,
      verdict: verdict,
      why: data.why || "",
      model: model2,
      scoreLabel: data.scoreLabel || (score != null ? scoreWord(score) : undefined),
      error: data.error || undefined,
      stale: false,
      deterministic: false,
    };
  }

  /** Short UI label: "Jev" / "Stub" / "Stub · offline" / "Unavailable". */
  function sourceLabel(res) {
    if (!res) return "";
    // Deterministic verdicts stand even when Jev errored — label honestly.
    if (res.deterministic && res.error) return "Deterministic \u00b7 Jev unavailable";
    if (res.error) return "Unavailable";
    var m = String(res.model || "");
    if (m === "stub" || res.fallback) {
      // Preview soft-fail / fixture stub is QA-only — never look like Jev.
      if (res.fallback === "fixture" || res.fixture) {
        var qa = readCoachQaMode();
        if (qa && qa.mode === "leanDemo") return "Stub/Fixture · leanDemo";
        if (qa && qa.mode === "forceConf" && qa.band)
          return "Stub/Fixture · forceConf=" + qa.band;
        if (qa && qa.mode === "coachFixture") return "Stub/Fixture · coachFixture";
        return "Stub/Fixture";
      }
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
          return softFailResult(msg, state);
        }
        if (!data || typeof data !== "object") {
          return softFailResult("Empty pick-quality response", state);
        }
        return normalizeApiResult(data, state || {});
      });
    });
  }

  /**
   * Soft-fail payload routed through normalizeApiResult, so deterministic
   * signals (when present) still produce their verdict — only Jev's
   * explanation is missing. Without signals this is plain uncertain + error.
   */
  function softFailResult(error, state) {
    return normalizeApiResult({
      score: null,
      scoreConfidence: 0,
      choice: null,
      choiceConfidence: 0,
      verdict: "uncertain",
      why: "",
      model: "pick-quality",
      error: String(error || "Coach unavailable"),
      stale: false,
    }, state || {});
  }

  function runEvaluate(state, mySeq) {
    if (mySeq !== _seq) {
      return Promise.resolve({ stale: true, verdict: "uncertain" });
    }

    var qa = readCoachQaMode();
    if (qa) {
      try {
        return Promise.resolve(fixtureResult(state || {}, qa));
      } catch (eFix) {
        return Promise.resolve(uncertainResult("Fixture failed", "stub"));
      }
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

    // Client-side backstop: a hung /api/pick-quality must degrade to
    // "Jev unavailable", never freeze the coach card. Distinguished from the
    // supersede-abort above via timedOut, so a replaced evaluation still
    // resolves stale instead of painting an error.
    var timedOut = false;
    var timeoutTimer = null;
    if (controller && typeof setTimeout === "function") {
      timeoutTimer = setTimeout(function () {
        timedOut = true;
        try {
          controller.abort();
        } catch (e) {}
      }, CLIENT_TIMEOUT_MS);
    }

    return fetchPickQuality(state, controller ? controller.signal : undefined)
      .then(function (result) {
        if (mySeq !== _seq) {
          return { stale: true, verdict: "uncertain" };
        }
        // Preview *.pages.dev: key-missing / soft API errors → labeled stub for QA.
        // (feat-* aliases often lack Preview-env TYPESAFE_API_KEY; Production secret
        // applies to the production preview hostname only.)
        // Deterministic signals stand on their own: the engine's verdict
        // survives; only Jev's explanation is missing. The stub heuristic is
        // reserved for states with no signals.
        if (
          result &&
          result.error &&
          !result.stale &&
          isPreviewPagesHost() &&
          isStubbableSoftFail(result.error)
        ) {
          if (result.deterministic) return result;
          try {
            return labeledStubResult(state, "preview-softfail");
          } catch (eStub) {
            return result;
          }
        }
        // Cache clean results; deterministic verdicts cache even when Jev
        // errored (the numbers don't depend on Jev).
        if (result && !result.stale && (!result.error || result.deterministic)) {
          cacheSet(fp, result);
        }
        return result;
      })
      .catch(function (err) {
        if (mySeq !== _seq) {
          return { stale: true, verdict: "uncertain" };
        }
        if (err && err.name === "AbortError") {
          // Timeout backstop fired: degrade gracefully (deterministic verdict
          // survives via softFailResult); a superseded evaluation stays stale.
          if (timedOut) return softFailResult("Jev timed out", state);
          return { stale: true, verdict: "uncertain" };
        }
        var isNet =
          err &&
          (err.name === "TypeError" ||
            /Failed to fetch|Invalid URL|NetworkError/i.test(
              String(err.message || err)
            ));
        // Preview Pages: network failure → labeled stub so QA can still see paths —
        // unless deterministic signals stand on their own.
        if (isNet && isHttpHost() && isPreviewPagesHost()) {
          var netStub = softFailResult("Coach unreachable", state);
          if (netStub.deterministic) return netStub;
          try {
            return labeledStubResult(state, "preview-network");
          } catch (ePrev) {
            return netStub;
          }
        }
        // Other http(s) hosts: never paint stub as if live — but deterministic
        // verdicts still survive; only the explanation degrades.
        if (isNet && isHttpHost()) {
          return softFailResult("Coach unreachable", state);
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
        return softFailResult(
          err && err.message ? err.message : "Coach unavailable",
          state
        );
      })
      .then(function (result) {
        if (timeoutTimer && typeof clearTimeout === "function") {
          try { clearTimeout(timeoutTimer); } catch (e) {}
          timeoutTimer = null;
        }
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
    classifyVerdict: classifyVerdict,
    readCoachQaMode: readCoachQaMode,
    fixtureResult: fixtureResult,
    CONF_GATE: CONF_GATE,
    LEAN_GATE: LEAN_GATE,
    CACHE_TTL_MS: CACHE_TTL_MS,
    PINNED_MODEL: PINNED_MODEL,
  };
})(typeof window !== "undefined" ? window : globalThis);
