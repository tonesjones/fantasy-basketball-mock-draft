/* Worker abuse-guard tests: origin check, body cap, rate limit, fail-soft. */
"use strict";
var fs = require("fs"), path = require("path"), vm = require("vm"), assert = require("assert");

function loadWorker() {
  var src = fs.readFileSync(path.join(__dirname, "_worker.js"), "utf8")
    .replace(/export default\s*\{/, "module.exports = {");
  var mod = { exports: {} };
  var ctx = { module: mod, URL: URL, Request: Request, Response: Response, Map: Map,
    AbortController: AbortController, setTimeout: setTimeout, clearTimeout: clearTimeout,
    fetch: function () { throw new Error("upstream fetch must not be called in tests"); } };
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

  console.log("worker guard tests passed");
})().catch(function (e) { console.error(e); process.exit(1); });
