/* PickCoach tests: stub bias, 0.7 suggest / 0.5 lean gates, preview soft-fail → labeled stub,
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

// --- Stub heuristics ---
var mid = PC.pickCoachEvaluate({ player: "X", pickNumber: 50, adp: 48, rank: 50 });
assert.strictEqual(mid.verdict, "uncertain", "near-ADP should be uncertain");
assert.ok(mid.scoreConfidence < 0.7);

var value = PC.pickCoachEvaluate({ player: "Y", pickNumber: 80, adp: 40, rank: 40 });
assert.strictEqual(value.verdict, "suggest", "large ADP fall should suggest");
assert.strictEqual(value.choice, "take");
assert.ok(value.scoreConfidence >= 0.7 && value.choiceConfidence >= 0.7);
assert.strictEqual(PC.scoreWord(value.score), "Excellent");

var reach = PC.pickCoachEvaluate({ player: "Z", pickNumber: 20, adp: 55, rank: 55 });
assert.strictEqual(reach.choice, "reach");
assert.strictEqual(reach.verdict, "lean", "mid-gap reach is lean (≥0.5, <0.7)");
assert.ok(reach.scoreConfidence >= 0.5 && reach.scoreConfidence < 0.7);
assert.ok(reach.choiceConfidence >= 0.5 && reach.choiceConfidence < 0.7);

// Near-ADP stays below lean floor
var near = PC.pickCoachEvaluate({ player: "N", pickNumber: 50, adp: 49, rank: 50 });
assert.strictEqual(near.verdict, "uncertain", "near-ADP below lean floor");
assert.ok(Math.min(near.scoreConfidence, near.choiceConfidence) < 0.5);

// --- Gate: normalizeApiResult demotes suggest when conf < 0.7 ---
var demoted = PC.normalizeApiResult({
  score: 3,
  scoreConfidence: 0.9,
  choice: "take",
  choiceConfidence: 0.4,
  verdict: "suggest",
  model: "jev-1.13.0",
  why: "x",
});
assert.strictEqual(demoted.verdict, "uncertain", "gate demotes when choice conf low");

var kept = PC.normalizeApiResult({
  score: 3,
  scoreConfidence: 0.8,
  choice: "wait",
  choiceConfidence: 0.75,
  verdict: "suggest",
  model: "jev-1.13.0",
});
assert.strictEqual(kept.verdict, "suggest");

// Lean band: both conf ≥ 0.5 and < 0.7 (client-side from confs; API may say uncertain)
var leanNorm = PC.normalizeApiResult({
  score: 2,
  scoreConfidence: 0.62,
  choice: "take",
  choiceConfidence: 0.55,
  verdict: "uncertain",
  model: "jev-1.13.0",
  why: "mid",
});
assert.strictEqual(leanNorm.verdict, "lean", "mid conf → lean");

var leanEdge = PC.normalizeApiResult({
  score: 2,
  scoreConfidence: 0.5,
  choice: "wait",
  choiceConfidence: 0.5,
  verdict: "suggest",
  model: "jev-1.13.0",
});
assert.strictEqual(leanEdge.verdict, "lean", "exactly 0.5 is lean not suggest");

var belowLean = PC.normalizeApiResult({
  score: 2,
  scoreConfidence: 0.49,
  choice: "take",
  choiceConfidence: 0.9,
  verdict: "suggest",
  model: "jev-1.13.0",
});
assert.strictEqual(belowLean.verdict, "uncertain", "min conf below 0.5 → uncertain");

assert.strictEqual(PC.classifyVerdict(0.8, 0.75), "suggest");
assert.strictEqual(PC.classifyVerdict(0.6, 0.55), "lean");
assert.strictEqual(PC.classifyVerdict(0.4, 0.9), "uncertain");
assert.strictEqual(PC.LEAN_GATE, 0.5);
assert.strictEqual(PC.CONF_GATE, 0.7);

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

chain
  .then(function () {
    console.log("test-pick-coach: ok");
  })
  .catch(function (err) {
    console.error("test-pick-coach FAILED", err);
    process.exit(1);
  });
