/* PickCoach tests: stub bias, TEMPORARY 0.45/0.25 gates + max(conf) banding + score/ADP floors, fixtures, preview soft-fail → labeled stub,
 * non-preview https TypeError → uncertain (not stub), soft-error shape,
 * fingerprint cache, sourceLabel, softAdpClause fixtures. */
var assert = require("assert");
var path = require("path");
var fs = require("fs");
var vm = require("vm");

function loadPickCoach(extra) {
  var code = fs.readFileSync(path.join(__dirname, "pick-coach.js"), "utf8");
  var sandbox = {
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    console: console,
    AbortController: AbortController,
  };
  if (extra) {
    Object.keys(extra).forEach(function (k) {
      sandbox[k] = extra[k];
    });
  }
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(code, sandbox);
  return sandbox.PickCoach;
}

var PC = loadPickCoach();
assert.ok(PC, "PickCoach exported");

// QA query fixtures must never be activatable on the production host.
var previewQa = loadPickCoach({
  location: { protocol: "https:", hostname: "tony-draft-lab-preview.pages.dev", search: "?leanDemo=1" },
});
assert.strictEqual(previewQa.readCoachQaMode().mode, "leanDemo");
var prodQa = loadPickCoach({
  location: { protocol: "https:", hostname: "tony-draft-lab.pages.dev", search: "?leanDemo=1" },
});
assert.strictEqual(prodQa.readCoachQaMode(), null, "production host must ignore QA fixture queries");

// --- Stub heuristics ---
var mid = PC.pickCoachEvaluate({ player: "X", pickNumber: 50, adp: 48, rank: 50 });
assert.strictEqual(mid.verdict, "uncertain", "near-ADP should be uncertain");
assert.ok(mid.scoreConfidence < 0.45);

var value = PC.pickCoachEvaluate({ player: "Y", pickNumber: 80, adp: 40, rank: 40 });
assert.strictEqual(value.verdict, "suggest", "large ADP fall should suggest");
assert.strictEqual(value.choice, "take");
assert.ok(value.scoreConfidence >= 0.45 && value.choiceConfidence >= 0.45);
assert.strictEqual(PC.scoreWord(value.score), "Excellent");

var reach = PC.pickCoachEvaluate({ player: "Z", pickNumber: 20, adp: 55, rank: 55 });
assert.strictEqual(reach.choice, "reach");
assert.strictEqual(reach.verdict, "lean", "mid-gap reach is lean (≥0.25, <0.45)");
assert.ok(reach.scoreConfidence >= 0.25 && reach.scoreConfidence < 0.45);
assert.ok(reach.choiceConfidence >= 0.25 && reach.choiceConfidence < 0.45);

// Near-ADP stays below lean floor
var near = PC.pickCoachEvaluate({ player: "N", pickNumber: 50, adp: 49, rank: 50 });
assert.strictEqual(near.verdict, "uncertain", "near-ADP below lean floor");
assert.ok(Math.max(near.scoreConfidence, near.choiceConfidence) < 0.25);

// --- Gate: normalizeApiResult uses TEMP max banding ---
var demoted = PC.normalizeApiResult({
  score: 3,
  scoreConfidence: 0.9,
  choice: "take",
  choiceConfidence: 0.20,
  verdict: "suggest",
  model: "jev-1.13.0",
  why: "x",
});
assert.strictEqual(demoted.verdict, "suggest", "TEMP max: high scoreConf wins over low choiceConf");
var bothLow = PC.normalizeApiResult({
  score: 2,
  scoreConfidence: 0.2,
  choice: "take",
  choiceConfidence: 0.15,
  verdict: "suggest",
  model: "jev-1.13.0",
  why: "x",
});
assert.strictEqual(bothLow.verdict, "uncertain", "max below lean gate + score<3 → uncertain");
var scoreFloorLean = PC.normalizeApiResult({
  score: 3,
  scoreConfidence: 0.1,
  choice: "take",
  choiceConfidence: 0.1,
  verdict: "uncertain",
  model: "jev-1.13.0",
  why: "x",
});
assert.strictEqual(scoreFloorLean.verdict, "lean", "TEMP score≥3 floor → at least lean");
var scoreFloorSuggest = PC.normalizeApiResult({
  score: 4,
  scoreConfidence: 0.05,
  choice: "take",
  choiceConfidence: 0.05,
  verdict: "uncertain",
  model: "jev-1.13.0",
  why: "x",
});
assert.strictEqual(scoreFloorSuggest.verdict, "suggest", "TEMP score≥4 floor → at least suggest");
var eliteAdp = PC.normalizeApiResult(
  {
    score: 2.4,
    scoreConfidence: 0.0,
    choice: "take",
    choiceConfidence: 0.22,
    verdict: "uncertain",
    model: "jev-1.13.0",
    why: "wemby-like",
  },
  { pickNumber: 1, adp: 1.8, rank: 1 }
);
assert.strictEqual(eliteAdp.verdict, "lean", "TEMP elite ADP≤5 + pick≤adp+3 → at least lean");
var eliteTooLate = PC.normalizeApiResult(
  {
    score: 2,
    scoreConfidence: 0.05,
    choice: "wait",
    choiceConfidence: 0.05,
    verdict: "uncertain",
    model: "jev-1.13.0",
    why: "late",
  },
  { pickNumber: 10, adp: 2, rank: 2 }
);
assert.strictEqual(eliteTooLate.verdict, "uncertain", "elite ADP but pick past adp+3 → no floor");

var kept = PC.normalizeApiResult({
  score: 3,
  scoreConfidence: 0.8,
  choice: "wait",
  choiceConfidence: 0.75,
  verdict: "suggest",
  model: "jev-1.13.0",
});
assert.strictEqual(kept.verdict, "suggest");

// Lean band: max conf ≥ 0.25 and < 0.45 (client-side from confs; API may say uncertain)
var leanNorm = PC.normalizeApiResult({
  score: 2,
  scoreConfidence: 0.38,
  choice: "take",
  choiceConfidence: 0.32,
  verdict: "uncertain",
  model: "jev-1.13.0",
  why: "mid",
});
assert.strictEqual(leanNorm.verdict, "lean", "mid conf → lean");

var leanEdge = PC.normalizeApiResult({
  score: 2,
  scoreConfidence: 0.25,
  choice: "wait",
  choiceConfidence: 0.25,
  verdict: "suggest",
  model: "jev-1.13.0",
});
assert.strictEqual(leanEdge.verdict, "lean", "exactly 0.25 is lean not suggest");

var suggestEdge = PC.normalizeApiResult({
  score: 2,
  scoreConfidence: 0.45,
  choice: "take",
  choiceConfidence: 0.45,
  verdict: "uncertain",
  model: "jev-1.13.0",
});
assert.strictEqual(suggestEdge.verdict, "suggest", "exactly 0.45 is suggest");

var belowLean = PC.normalizeApiResult({
  score: 2,
  scoreConfidence: 0.10,
  choice: "take",
  choiceConfidence: 0.20,
  verdict: "suggest",
  model: "jev-1.13.0",
});
assert.strictEqual(belowLean.verdict, "uncertain", "max conf below 0.25 → uncertain");
var maxLeanLive = PC.normalizeApiResult({
  score: 2,
  scoreConfidence: 0.0,
  choice: "take",
  choiceConfidence: 0.30,
  verdict: "uncertain",
  model: "jev-1.13.0",
});
assert.strictEqual(maxLeanLive.verdict, "lean", "TEMP max: sc=0 cc=0.30 → lean (was uncertain under 0.35)");
// score floor upgrades Average/Good elites even when confs tiny
var maxLeanLiveScore = PC.normalizeApiResult({
  score: 3,
  scoreConfidence: 0.0,
  choice: "take",
  choiceConfidence: 0.42,
  verdict: "uncertain",
  model: "jev-1.13.0",
});
assert.strictEqual(maxLeanLiveScore.verdict, "lean", "TEMP max+score≥3: sc=0 cc=0.42 → lean");

assert.strictEqual(PC.classifyVerdict(0.8, 0.75), "suggest");
assert.strictEqual(PC.classifyVerdict(0.38, 0.32), "lean");
assert.strictEqual(PC.classifyVerdict(0.5, 0.45), "suggest");
// TEMP max banding: usable peer wins when other conf is low/zero (Wemby-like)
assert.strictEqual(PC.classifyVerdict(0.0, 0.30), "lean", "max: sc=0 cc=0.30 → lean");
assert.strictEqual(PC.classifyVerdict(0.0, 0.50), "suggest", "max: sc=0 cc=0.50 → suggest");
assert.strictEqual(PC.classifyVerdict(0.2, 0.9), "suggest", "max: 0.2/0.9 → suggest");
assert.strictEqual(PC.classifyVerdict(0.1, 0.2), "uncertain", "max still below lean gate");
assert.strictEqual(
  PC.classifyVerdict(0.0, 0.22, { score: 2.4, adp: 1.8, rank: 1, pickNumber: 1 }),
  "lean",
  "Wemby-like: max 0.22 + elite ADP floor → lean"
);
assert.strictEqual(
  PC.classifyVerdict(0.0, 0.28, { score: 2.5, adp: 14.7, rank: 15, pickNumber: 5 }),
  "lean",
  "Edwards-like: max 0.28 ≥ LEAN 0.25 → lean"
);
assert.strictEqual(PC.LEAN_GATE, 0.25);
assert.strictEqual(PC.CONF_GATE, 0.45);

// SoftFail payload with error stays uncertain even with mid confs
var softLean = PC.normalizeApiResult({
  score: 2,
  scoreConfidence: 0.6,
  choice: "take",
  choiceConfidence: 0.6,
  verdict: "uncertain",
  model: "jev-1.13.0",
  error: "TYPESAFE_API_KEY not configured",
});
assert.strictEqual(softLean.verdict, "uncertain", "error forces uncertain (no lean)");

var soft = PC.uncertainResult("TYPESAFE_API_KEY not configured", "jev-1.13.0");
assert.strictEqual(soft.verdict, "uncertain");
assert.ok(soft.error && /TYPESAFE_API_KEY/.test(soft.error));
assert.strictEqual(PC.sourceLabel(soft), "Unavailable");
assert.strictEqual(PC.sourceLabel(value), "Stub · offline");
assert.strictEqual(PC.sourceLabel(kept), "Jev");

// --- QA fixtures: leanDemo / coachFixture / forceConf (never Jev) ---
var fixLean = PC.fixtureResult({ player: "Edwards", pickNumber: 5, adp: 8 }, { mode: "leanDemo", band: "lean" });
assert.strictEqual(fixLean.verdict, "lean");
assert.strictEqual(fixLean.model, "stub");
assert.strictEqual(fixLean.fallback, "fixture");
// leanDemo confs are fixed mid paint values; band comes from honor-res.verdict
assert.strictEqual(fixLean.scoreConfidence, 0.38);
assert.strictEqual(fixLean.choiceConfidence, 0.36);

var fixSuggest = PC.fixtureResult({ player: "Jokic", pickNumber: 1, adp: 1 }, { mode: "forceConf", band: "suggest" });
assert.strictEqual(fixSuggest.verdict, "suggest");
assert.ok(/^Stub\/Fixture/.test(PC.sourceLabel(fixSuggest)));

var fixUnc = PC.fixtureResult({ player: "X", pickNumber: 50, adp: 50 }, { mode: "forceConf", band: "uncertain" });
assert.strictEqual(fixUnc.verdict, "uncertain");

var fixCoachLean = PC.fixtureResult({ player: "Edwards", pickNumber: 10, adp: 5 }, { mode: "coachFixture", band: null });
assert.strictEqual(fixCoachLean.verdict, "lean", "coachFixture mid gap → lean");
assert.notStrictEqual(fixCoachLean.model, "jev-1.13.0");

var fixCoachSug = PC.fixtureResult({ player: "Y", pickNumber: 40, adp: 20 }, { mode: "coachFixture", band: null });
assert.strictEqual(fixCoachSug.verdict, "suggest", "coachFixture large value → suggest");



// --- Fingerprint ---
assert.strictEqual(
  PC.fingerprint({ player: "A", pickNumber: 10, logLen: 9 }),
  "A|10|9"
);
assert.strictEqual(
  PC.fingerprint({ player: "A", pickNumber: 10 }),
  "A|10|9",
  "logLen defaults from pickNumber-1"
);

// --- softAdpClause fixtures (mirrored from index.html display layer) ---
function softAdpClause(choice, pickNumber, adp) {
  if (adp == null || !isFinite(Number(adp))) return "";
  var delta = pickNumber - Number(adp);
  if (choice === "take") {
    if (delta >= 3) return "value vs ADP";
    if (delta <= -3) return "near ADP";
    return "near ADP";
  }
  if (choice === "reach") return "early vs ADP";
  if (choice === "wait") return "can wait vs ADP";
  if (Math.abs(delta) <= 2) return "near ADP";
  if (delta > 2) return "value vs ADP";
  return "early vs ADP";
}
assert.strictEqual(softAdpClause("take", 30, 20), "value vs ADP");
assert.strictEqual(softAdpClause("wait", 25, 22), "can wait vs ADP");
assert.strictEqual(softAdpClause("reach", 15, 40), "early vs ADP");

// --- Async: http(s) TypeError → uncertain, NOT stub ---
function withFakeLocation(protocol, host, run) {
  return new Promise(function (resolve, reject) {
    var fetchCalls = 0;
    var PC2 = loadPickCoach({
      location: { protocol: protocol, hostname: host || "localhost" },
      fetch: function () {
        fetchCalls++;
        return Promise.reject(new TypeError("Failed to fetch"));
      },
    });
    PC2.clearCache();
    PC2.evaluate({ player: "Net", pickNumber: 12, adp: 10, logLen: 11 }).then(function (r) {
      try {
        run(r, fetchCalls, PC2);
        resolve();
      } catch (e) {
        reject(e);
      }
    }, reject);
  });
}

var chain = Promise.resolve();

chain = chain.then(function () {
  // *.pages.dev preview: network TypeError → labeled stub (QA), never Jev.
  return withFakeLocation("https:", "tony-draft-lab-preview.pages.dev", function (r, n, PC2) {
    assert.ok(n >= 1, "fetch attempted on https");
    assert.strictEqual(r.model, "stub", "preview pages.dev may stub on network soft-fail");
    assert.strictEqual(r.fallback, "preview-network");
    assert.ok(!r.error, "stub fallback must not carry soft-fail error");
    assert.strictEqual(PC2.sourceLabel(r), "Stub");
  });
});

chain = chain.then(function () {
  // Non-pages.dev https: still uncertain, NOT stub.
  return withFakeLocation("https:", "example.com", function (r, n, PC2) {
    assert.ok(n >= 1, "fetch attempted on https");
    assert.strictEqual(r.verdict, "uncertain");
    assert.ok(r.error, "non-preview https TypeError must set error");
    assert.notStrictEqual(r.model, "stub", "non-preview https must NOT fall back to stub");
    assert.strictEqual(PC2.sourceLabel(r), "Unavailable");
  });
});

chain = chain.then(function () {
  return withFakeLocation("file:", "", function (r, n) {
    assert.strictEqual(n, 0, "file:// skips fetch");
    assert.strictEqual(r.model, "stub");
    assert.strictEqual(r.fallback, "file");
    assert.ok(!r.error);
  });
});

// Cache hit on second evaluate (mock fetch returns suggest once)
chain = chain.then(function () {
  var calls = 0;
  var PC3 = loadPickCoach({
    location: { protocol: "https:", hostname: "tony-draft-lab-preview.pages.dev" },
    fetch: function () {
      calls++;
      return Promise.resolve({
        ok: true,
        status: 200,
        text: function () {
          return Promise.resolve(
            JSON.stringify({
              score: 3,
              scoreConfidence: 0.85,
              choice: "take",
              choiceConfidence: 0.82,
              verdict: "suggest",
              model: "jev-1.13.0",
              why: "ok",
              scoreLabel: "Good",
            })
          );
        },
      });
    },
  });
  PC3.clearCache();
  var state = { player: "CacheMe", pickNumber: 5, logLen: 4, adp: 8 };
  return PC3.evaluate(state).then(function (r1) {
    assert.strictEqual(r1.verdict, "suggest");
    assert.strictEqual(calls, 1);
    return PC3.evaluate(state).then(function (r2) {
      assert.strictEqual(r2.verdict, "suggest");
      assert.ok(r2.cached, "second call should be cached");
      assert.strictEqual(calls, 1, "cache skips second fetch");
    });
  });
});

// Soft-fail API (TYPESAFE_API_KEY) on *.pages.dev → labeled stub
chain = chain.then(function () {
  var PC5 = loadPickCoach({
    location: { protocol: "https:", hostname: "feat-coach-softfail-why.tony-draft-lab-preview.pages.dev" },
    fetch: function () {
      return Promise.resolve({
        ok: true,
        status: 200,
        text: function () {
          return Promise.resolve(
            JSON.stringify({
              score: null,
              scoreConfidence: 0,
              choice: null,
              choiceConfidence: 0,
              verdict: "uncertain",
              why: "",
              model: "jev-1.13.0",
              error: "TYPESAFE_API_KEY not configured",
            })
          );
        },
      });
    },
  });
  PC5.clearCache();
  return PC5.evaluate({ player: "KeyMiss", pickNumber: 20, adp: 18, logLen: 19 }).then(function (r) {
    assert.strictEqual(r.model, "stub");
    assert.strictEqual(r.fallback, "preview-softfail");
    assert.ok(!r.error);
    assert.strictEqual(PC5.sourceLabel(r), "Stub");
    assert.ok(r.verdict === "suggest" || r.verdict === "lean" || r.verdict === "uncertain");
  });
});

// Soft-fail API on non-pages host → keep uncertain + error (no stub)
chain = chain.then(function () {
  var PC6 = loadPickCoach({
    location: { protocol: "https:", hostname: "localhost" },
    fetch: function () {
      return Promise.resolve({
        ok: true,
        status: 200,
        text: function () {
          return Promise.resolve(
            JSON.stringify({
              verdict: "uncertain",
              error: "TYPESAFE_API_KEY not configured",
              model: "jev-1.13.0",
              scoreConfidence: 0,
              choiceConfidence: 0,
            })
          );
        },
      });
    },
  });
  PC6.clearCache();
  return PC6.evaluate({ player: "LocalKey", pickNumber: 20, adp: 18, logLen: 19 }).then(function (r) {
    assert.ok(r.error && /TYPESAFE_API_KEY/.test(r.error));
    assert.notStrictEqual(r.model, "stub");
    assert.strictEqual(PC6.sourceLabel(r), "Unavailable");
  });
});

// API 404 on non-pages host WITH deterministic signals → verdict survives.
// The engine's numbers stand on their own; only Jev's explanation degrades.
chain = chain.then(function () {
  var calls = 0;
  var PC7 = loadPickCoach({
    location: { protocol: "https:", hostname: "example.com" },
    fetch: function () {
      calls++;
      return Promise.resolve({ ok: false, status: 404, text: function () { return Promise.resolve(""); } });
    },
  });
  PC7.clearCache();
  var sig = {
    verdict: "take", V: 1, consensus: 2, valueAtPick: 0,
    reasons: ["+0 value at pick 1 (our #1) — at market and best available"],
    edges: [], target: { valueRank: 1, marketRank: 2, earliest: 1, targetPick: 1, lastChance: 6 }
  };
  var state = { player: "Victor Wembanyama", pickNumber: 1, logLen: 0, adp: 1.8, signals: sig };
  return PC7.evaluate(state).then(function (r) {
    assert.strictEqual(r.deterministic, true);
    assert.strictEqual(r.verdict, "take", "deterministic verdict survives API 404");
    assert.strictEqual(r.choice, "take");
    assert.ok(r.error && /404/.test(r.error), "error preserved for labeling");
    assert.notStrictEqual(r.model, "stub", "must not fall back to stub heuristic");
    assert.strictEqual(PC7.sourceLabel(r), "Deterministic · Jev unavailable");
    // Deterministic-with-error results cache: the numbers don't depend on Jev.
    return PC7.evaluate(state).then(function (r2) {
      assert.strictEqual(r2.verdict, "take");
      assert.ok(r2.cached, "deterministic+error should cache");
      assert.strictEqual(calls, 1, "cache skips second fetch");
    });
  });
});

// Network failure on non-pages host WITH deterministic signals → pass verdict survives.
chain = chain.then(function () {
  var PC8 = loadPickCoach({
    location: { protocol: "https:", hostname: "example.com" },
    fetch: function () { return Promise.reject(new TypeError("Failed to fetch")); },
  });
  PC8.clearCache();
  var sig = {
    verdict: "pass", V: 136, consensus: 98, valueAtPick: -38,
    reasons: ["-38 below value at pick 98 (our #136 vs slot #98)"],
    edges: [], target: null
  };
  return PC8.evaluate({ player: "Nikola Vucevic", pickNumber: 98, logLen: 97, adp: 111.9, signals: sig }).then(function (r) {
    assert.strictEqual(r.deterministic, true);
    assert.strictEqual(r.verdict, "pass", "a confident pass is NOT uncertain on network failure");
    assert.ok(r.error, "error preserved");
    assert.notStrictEqual(r.model, "stub");
    assert.strictEqual(PC8.sourceLabel(r), "Deterministic · Jev unavailable");
  });
});

// Preview softfail WITH deterministic signals → deterministic result, NOT the stub heuristic.
chain = chain.then(function () {
  var PC9 = loadPickCoach({
    location: { protocol: "https:", hostname: "feat-x.tony-draft-lab-preview.pages.dev" },
    fetch: function () {
      return Promise.resolve({
        ok: true, status: 200,
        text: function () {
          return Promise.resolve(JSON.stringify({
            score: null, scoreConfidence: 0, choice: null, choiceConfidence: 0,
            verdict: "uncertain", why: "", model: "jev-1.13.0",
            error: "TYPESAFE_API_KEY not configured"
          }));
        },
      });
    },
  });
  PC9.clearCache();
  var sig = {
    verdict: "wait", V: 70, consensus: 72, valueAtPick: 0,
    reasons: ["-1 value — he's fine, but not this pick"],
    edges: [], target: null
  };
  return PC9.evaluate({ player: "WaitCase", pickNumber: 70, logLen: 69, adp: 72, signals: sig }).then(function (r) {
    assert.strictEqual(r.deterministic, true);
    assert.strictEqual(r.verdict, "wait", "deterministic verdict survives preview softfail");
    assert.notStrictEqual(r.model, "stub", "stub heuristic reserved for states without signals");
    assert.strictEqual(PC9.sourceLabel(r), "Deterministic · Jev unavailable");
  });
});

assert.ok(PC.isStubbableSoftFail("TYPESAFE_API_KEY not configured"));
assert.ok(PC.isPreviewPagesHost === undefined || typeof PC.isPreviewPagesHost === "function");

// Cancel aborts pending evaluate
chain = chain.then(function () {
  var PC4 = loadPickCoach({
    location: { protocol: "https:", hostname: "example.com" },
    fetch: function (_url, opts) {
      return new Promise(function (resolve, reject) {
        if (opts && opts.signal) {
          opts.signal.addEventListener("abort", function () {
            var e = new Error("aborted");
            e.name = "AbortError";
            reject(e);
          });
        }
      });
    },
  });
  var p = PC4.evaluate({ player: "Abort", pickNumber: 1, logLen: 0 });
  // Cancel after debounce so in-flight abort path is exercised; also covers
  // pre-debounce cancel resolving stale (see cancel()).
  setTimeout(function () {
    PC4.cancel();
  }, 250);
  return p.then(function (r) {
    assert.ok(r.stale || r.verdict === "uncertain");
  });
});

chain = chain.then(function () {
  // Deterministic signals: verdict comes from computed value, not confidence gates.
  // Jev explains; it doesn't vote.
  var PC5 = loadPickCoach();
  var sigTake = {
    verdict: "take", V: 28, consensus: 70, valueAtPick: 42,
    reasons: ["+42 value at pick 70 (our #28) — outperforms this slot"],
    edges: [{ k: "actuals", v: 8.5, note: "produced #39 last season vs market #70" }],
    target: { valueRank: 28, marketRank: 70, earliest: 20, targetPick: 28, lastChance: 75 }
  };
  var resTake = PC5.normalizeApiResult(
    { score: 4, scoreConfidence: 0.1, choice: "take", choiceConfidence: 0.1, why: "Jev explains the value.", model: "jev-1.13.0" },
    { player: "Derrick White", pickNumber: 70, signals: sigTake }
  );
  assert.strictEqual(resTake.deterministic, true, "should flag deterministic");
  assert.strictEqual(resTake.verdict, "take", "native take verdict (not confidence-mapped)");
  assert.strictEqual(resTake.choice, "take", "choice follows deterministic");
  assert.ok(resTake.why.indexOf("+42 value") >= 0, "deterministic reasons in why");
  assert.ok(resTake.why.indexOf("Jev explains") >= 0, "agreeing Jev explanation appended");

  // Pass is its own native verdict — a confident pass is NOT "uncertain".
  var sigPass = {
    verdict: "pass", V: 136, consensus: 98, valueAtPick: -38,
    reasons: ["-38 below value at pick 98 (our #136 vs slot #98)", "better: Neemias Queta (+13 value, our #85)"],
    edges: [], target: null
  };
  var resPass = PC5.normalizeApiResult(
    { score: 2, scoreConfidence: 0.9, choice: "take", choiceConfidence: 0.9, why: "Jev disagrees.", model: "jev-1.13.0" },
    { player: "Nikola Vucevic", pickNumber: 98, signals: sigPass }
  );
  assert.strictEqual(resPass.verdict, "pass", "native pass verdict");
  assert.strictEqual(resPass.choice, "pass", "choice follows deterministic, not Jev");
  assert.ok(resPass.why.indexOf("-38 below value") >= 0, "pass reason preserved");
  assert.ok(resPass.why.indexOf("Jev disagrees") < 0, "contradicting Jev prose must be dropped");

  // Deterministic pass + Jev "wait" is schema-level agreement: Jev's choice
  // schema has no "pass" (the API prompt maps pass -> wait), so a "wait"
  // explanation is retained while a "take" still contradicts and is dropped.
  var resPassWait = PC5.normalizeApiResult(
    { score: 2, scoreConfidence: 0.7, choice: "wait", choiceConfidence: 0.7, why: "Jev: not worth it here.", model: "jev-1.13.0" },
    { player: "Nikola Vucevic", pickNumber: 98, signals: sigPass }
  );
  assert.strictEqual(resPassWait.verdict, "pass", "pass verdict unchanged");
  assert.ok(resPassWait.why.indexOf("Jev: not worth it here.") >= 0, "Jev wait prose retained for deterministic pass");
  var resPassTake = PC5.normalizeApiResult(
    { score: 4, scoreConfidence: 0.9, choice: "take", choiceConfidence: 0.9, why: "Jev: take him!", model: "jev-1.13.0" },
    { player: "Nikola Vucevic", pickNumber: 98, signals: sigPass }
  );
  assert.strictEqual(resPassTake.verdict, "pass", "verdict not swayed by Jev take");
  assert.ok(resPassTake.why.indexOf("Jev: take him!") < 0, "Jev take prose still dropped for deterministic pass");

  // Deterministic verdict survives a Jev/API error — only the explanation degrades.
  var resErrTake = PC5.normalizeApiResult(
    { score: null, scoreConfidence: 0, choice: null, choiceConfidence: 0, why: "", model: "jev-1.13.0", error: "TYPESAFE_API_KEY not configured" },
    { player: "Derrick White", pickNumber: 70, signals: sigTake }
  );
  assert.strictEqual(resErrTake.deterministic, true, "deterministic flagged even on error");
  assert.strictEqual(resErrTake.verdict, "take", "deterministic verdict survives Jev error");
  assert.ok(resErrTake.error && /TYPESAFE_API_KEY/.test(resErrTake.error), "error preserved for labeling");
  assert.strictEqual(PC5.sourceLabel(resErrTake), "Deterministic · Jev unavailable");
  assert.strictEqual(PC5.sourceLabel(resTake), "Jev", "healthy deterministic result still labeled Jev");

  // wait and reach are native verdicts too (not lean/suggest).
  var resWait = PC5.normalizeApiResult(
    { score: 3, scoreConfidence: 0.5, choice: "wait", choiceConfidence: 0.5, why: "Jev: wait.", model: "jev-1.13.0" },
    { player: "W", pickNumber: 70, signals: { verdict: "wait", V: 70, consensus: 72, valueAtPick: 0, reasons: ["-1 value — fine, but not this pick"], edges: [], target: null } }
  );
  assert.strictEqual(resWait.verdict, "wait", "native wait verdict");
  var resReach = PC5.normalizeApiResult(
    { score: 2, scoreConfidence: 0.5, choice: "reach", choiceConfidence: 0.5, why: "Jev: reach.", model: "jev-1.13.0" },
    { player: "R", pickNumber: 70, signals: { verdict: "reach", V: 90, consensus: 88, valueAtPick: -20, reasons: ["-20 below value — but fills an open C slot"], edges: [], target: null } }
  );
  assert.strictEqual(resReach.verdict, "reach", "native reach verdict");

  // No signals: falls back to legacy confidence gates.
  var resLegacy = PC5.normalizeApiResult(
    { score: 4, scoreConfidence: 0.8, choice: "take", choiceConfidence: 0.8, why: "", model: "jev-1.13.0" },
    { player: "X", pickNumber: 50 }
  );
  assert.strictEqual(resLegacy.deterministic, false, "no signals -> not deterministic");
  assert.strictEqual(resLegacy.verdict, "suggest", "high conf -> suggest (legacy)");
});

chain = chain.then(function () {
  // Client timeout backstop: a hung /api/pick-quality must degrade to a
  // graceful "Jev timed out" error (deterministic verdict survives), never
  // freeze the coach card. Fake timers fire immediately so the test doesn't
  // wait out the real 30s backstop.
  var fired = [];
  var allMs = [];
  function fakeSetTimeout(fn, ms) {
    var id = fired.length + 1;
    fired.push({ id: id, fn: fn, ms: ms });
    allMs.push(ms);
    return id;
  }
  function fakeClearTimeout(id) {
    for (var i = 0; i < fired.length; i++) {
      if (fired[i] && fired[i].id === id) fired[i] = null;
    }
  }
  function fireAll() {
    var guard = 0;
    while (guard++ < 10) {
      var next = null;
      for (var i = 0; i < fired.length; i++) {
        if (fired[i]) { next = fired[i]; fired[i] = null; break; }
      }
      if (!next) break;
      next.fn();
    }
  }
  function hangingFetch(_url, opts) {
    return new Promise(function (_resolve, reject) {
      if (opts && opts.signal) {
        opts.signal.addEventListener("abort", function () {
          var e = new Error("aborted");
          e.name = "AbortError";
          reject(e);
        });
      }
      // never resolves on its own: simulates the hung upstream
    });
  }
  var PC6 = loadPickCoach({
    setTimeout: fakeSetTimeout,
    clearTimeout: fakeClearTimeout,
    fetch: hangingFetch,
  });
  var p1 = PC6.evaluate({ player: "Hang", pickNumber: 1, logLen: 0 });
  fireAll();
  return p1.then(function (r1) {
    assert.ok(allMs.indexOf(30000) >= 0, "client timeout armed at 30000ms");
    assert.ok(!r1.stale, "timeout resolves a real result, not stale");
    assert.strictEqual(r1.verdict, "uncertain", "no signals -> uncertain on timeout");
    assert.ok(r1.error && /timed out/i.test(r1.error), "error names the timeout, got: " + r1.error);
    // Deterministic verdict survives a Jev timeout — only the explanation degrades.
    var sig = {
      verdict: "take", V: 28, consensus: 70, valueAtPick: 42,
      reasons: ["+42 value at pick 70 (our #28)"], edges: [], target: null
    };
    var p2 = PC6.evaluate({ player: "Hang2", pickNumber: 70, logLen: 69, signals: sig });
    fireAll();
    return p2.then(function (r2) {
      assert.strictEqual(r2.deterministic, true, "deterministic flagged on timeout");
      assert.strictEqual(r2.verdict, "take", "deterministic verdict survives Jev timeout");
      assert.ok(r2.error && /timed out/i.test(r2.error), "timeout error preserved for labeling");
    });
  });
});

chain
  .then(function () {
    console.log("test-pick-coach: ok");
  })
  .catch(function (err) {
    console.error("test-pick-coach FAILED", err);
    process.exit(1);
  });
