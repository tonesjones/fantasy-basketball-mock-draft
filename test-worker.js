/* Worker abuse-guard tests: origin check, body cap, rate limit, fail-soft. */
"use strict";
var fs = require("fs"), path = require("path"), vm = require("vm"), assert = require("assert");

function loadWorker(fetchImpl) {
  var src = fs.readFileSync(path.join(__dirname, "_worker.js"), "utf8")
    .replace(/export default\s*\{/, "module.exports = {");
  var mod = { exports: {} };
  var ctx = { module: mod, URL: URL, Request: Request, Response: Response, Map: Map,
    AbortController: AbortController, setTimeout: setTimeout, clearTimeout: clearTimeout,
    fetch: fetchImpl || function () { throw new Error("upstream fetch must not be called in tests"); } };
  vm.runInNewContext(src, ctx);
  return mod.exports;
}

var ORIGIN = "https://tony-draft-lab.pages.dev";
function req(opts) {
  opts = opts || {};
  var headers = { "Content-Type": "application/json", "CF-Connecting-IP": opts.ip || "1.1.1.1" };
  if (opts.origin !== null) headers.Origin = opts.origin || ORIGIN;
  return new Request(ORIGIN + "/api/pick-quality", {
    method: "POST", headers: headers, body: opts.body || JSON.stringify({ player: { n: "X" } }),
  });
}

(async function () {
  var w = loadWorker(), env = {}; /* no key: allowed calls soft-fail as uncertain/200 */

  var r = await w.fetch(req({ origin: null }), env);
  assert.strictEqual(r.status, 403, "missing Origin rejected");
  r = await w.fetch(req({ origin: "https://evil.example" }), env);
  assert.strictEqual(r.status, 403, "foreign Origin rejected");

  for (var o of ["https://tony-draft-lab-preview.pages.dev", "https://tony-draft-lab-yahoo.pages.dev",
    "https://chore-repo-hygiene.tony-draft-lab.pages.dev", "http://localhost:8788"]) {
    r = await w.fetch(req({ origin: o, ip: "9.9.9." + o.length }), env);
    assert.strictEqual(r.status, 200, "allowed origin " + o);
  }

  r = await w.fetch(req({ ip: "2.2.2.2", body: JSON.stringify({ player: { n: "x".repeat(20000) } }) }), env);
  assert.strictEqual(r.status, 413, "oversized body rejected");

  r = await w.fetch(req({ ip: "3.3.3.3" }), env);
  assert.strictEqual(r.status, 200);
  var j = await r.json();
  assert.strictEqual(j.verdict, "uncertain");
  assert.ok(/TYPESAFE_API_KEY/.test(j.error), "missing key soft-fails");

  var codes = [];
  for (var i = 0; i < 25; i++) codes.push((await w.fetch(req({ ip: "4.4.4.4" }), env)).status);
  assert.strictEqual(codes.filter(function (c) { return c === 200; }).length, 20, "20 allowed per window");
  assert.strictEqual(codes[24], 429, "then 429");
  r = await w.fetch(req({ ip: "5.5.5.5" }), env);
  assert.strictEqual(r.status, 200, "other clients unaffected");

  var calls = 0;
  var bound = { PICK_RATE_LIMITER: { limit: async function () { calls++; return { success: false }; } } };
  r = await w.fetch(req({ ip: "6.6.6.6" }), bound);
  assert.strictEqual(r.status, 429, "binding verdict respected");
  assert.strictEqual(calls, 1);

  // --- Jev contract: neutral questions, no fed-in verdict, no fake prose ---
  var sent = null;
  var mocked = loadWorker(async function (url, init) {
    sent = JSON.parse(init.body);
    return new Response(JSON.stringify({
      model: "jev-1.13.0",
      answers: {
        score: { score: 2.6, confidence: 0.1, probabilities: { "0": 0.05, "1": 0.1, "2": 0.3, "3": 0.35, "4": 0.2 } },
        choice: { choice: "wait", confidence: 0.4, probabilities: { take: 0.3, wait: 0.6, reach: 0.1 } },
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  var jevBody = {
    player: "Test Guy", pickNumber: 30, adp: 22, rank: 25, picksUntilNext: 17,
    signals: { verdict: "pass", V: 40, consensus: 23.4, valueAtPick: -10,
      reasons: ["our #40 vs market #23"], edges: [{ k: "role", v: -3, note: "bench" }], target: "40-48" },
  };
  r = await mocked.fetch(req({ ip: "7.7.7.7", body: JSON.stringify(jevBody) }), { TYPESAFE_API_KEY: "k" });
  j = await r.json();
  assert.ok(sent, "upstream called");
  var sentText = JSON.stringify(sent);
  assert.ok(!/HARD RULE|EXPLAIN|deterministic_signals/.test(sentText), "no forced-agreement / explain prompts");
  assert.ok(!sent.state.engine_numbers.verdict && !sent.state.engine_numbers.reasons, "engine verdict/reasons not sent");
  assert.strictEqual(sent.state.engine_numbers.true_value_rank, 40, "engine numbers sent");
  assert.strictEqual(sent.state.candidate.picks_past_adp, 8, "picks_past_adp precomputed");
  assert.strictEqual(sent.state.candidate.picks_past_rank, 5, "picks_past_rank precomputed");
  assert.ok(/engine_numbers/.test(sent.questions.choice.instructions), "engine numbers referenced when present");
  assert.strictEqual(j.why, "", "no synthesized numeric string posing as prose");
  assert.strictEqual(j.choice, "wait");
  assert.strictEqual(j.choiceProbabilities.wait, 0.6, "choice probabilities passed through");
  assert.strictEqual(j.scoreProbabilities["3"], 0.35, "score probabilities passed through");

  r = await mocked.fetch(req({ ip: "8.8.8.8", body: JSON.stringify({ player: "No Sig", pickNumber: 5 }) }), { TYPESAFE_API_KEY: "k" });
  assert.ok(!sent.state.engine_numbers, "no engine numbers without signals");
  assert.ok(!/engine_numbers/.test(sent.questions.score.instructions), "no dangling engine_numbers reference");
  assert.strictEqual(sent.state.candidate.picks_past_adp, null, "no ADP -> null, not NaN");

  assert.ok(!sent.state.strategy && !/strategy/.test(sent.questions.score.instructions), "no strategy without punts");
  r = await mocked.fetch(req({ ip: "8.8.4.1", body: JSON.stringify({ player: "P", pickNumber: 5, puntCats: ["FT%", "ft%", "FT%", "TO", "<b>x</b>", 5, "AST", "BLK"] }) }), { TYPESAFE_API_KEY: "k" });
  assert.deepStrictEqual(sent.state.strategy.punt_categories, ["FT%", "TO", "AST"], "whitelisted, deduped, capped at 3");
  assert.ok(/strategy\.punt_categories/.test(sent.questions.choice.instructions), "questions mention strategy when punting");
  assert.ok(!/<b>/.test(JSON.stringify(sent)), "junk never echoed");
  r = await mocked.fetch(req({ ip: "8.8.4.2", body: JSON.stringify({ player: "P", pickNumber: 5, puntCats: "FT%" }) }), { TYPESAFE_API_KEY: "k" });
  assert.ok(!sent.state.strategy, "non-array ignored");
  r = await mocked.fetch(req({ ip: "8.8.4.3", body: JSON.stringify({ player: "P", pickNumber: 5, puntCats: ["nope"] }) }), { TYPESAFE_API_KEY: "k" });
  assert.ok(!sent.state.strategy, "all-junk array -> no strategy");

  console.log("worker guard tests passed");
})().catch(function (e) { console.error(e); process.exit(1); });
