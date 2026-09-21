/* Deterministic pick-signal engine tests (ported from prototype).
 * Loads the branch's own data files + pick-signals.js in a vm sandbox, in the
 * same order the browser loads them, then rebuilds PLAYERS exactly the way
 * index.html does. Run with: bun test-pick-signals.js
 *
 * Guards the sign-error bug class (edges must move V the right direction),
 * Tony's Maxey net-usage-loss catch, INJ hard pass, verdict scenarios,
 * target-window bounds, and one-based nextPick.
 */
var assert = require("assert");
var path = require("path");
var fs = require("fs");
var vm = require("vm");

var DIR = __dirname;

function loadInto(sandbox, file) {
  var code = fs.readFileSync(path.join(DIR, file), "utf8");
  vm.runInNewContext(code, sandbox);
}

var sandbox = { console: console };
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
["player-data.js", "movers-outlook.js", "vacated-usage.js",
 "playoff-data.js", "playoff-core.js", "pick-signals.js"].forEach(function (f) {
  loadInto(sandbox, f);
});

// PLAYERS literal + enrichment, exactly as index.html builds it.
var html = fs.readFileSync(path.join(DIR, "index.html"), "utf8");
var lit = html.match(/var PLAYERS=\[[\s\S]*?\n\];/);
assert.ok(lit, "PLAYERS literal not found in index.html");
vm.runInNewContext(lit[0], sandbox);
vm.runInNewContext(
  'PLAYERS.forEach(function(p,i){p.r=i+1;p.n=p[0];p.p=p[1];p.t=p[2]||"\\u2014";});' +
  'PLAYERS.forEach(function(p){var d=(typeof PDATA!=="undefined"&&PDATA[p.n])||null;' +
  'p.adp=d&&d.adp!=null?d.adp:null;p.adpF=d&&d.adpF!=null?d.adpF:null;' +
  'p.last=d&&d.last!=null?d.last:null;p.lastTotal=d&&d.lastTotal!=null?d.lastTotal:null;' +
  'p.mpg=d&&d.mpg!=null?d.mpg:null;p.inj=(typeof INJ!=="undefined"&&INJ[p.n])||null;' +
  'p.teamPrev=d&&d.teamPrev||null;p.teamCurr=(d&&d.teamCurr)||p.t;p.mover=!!(d&&d.mover);' +
  'p.roleDelta=(d&&d.roleDelta)||"unknown";p.roleNote=(d&&d.roleNote)||null;' +
  'p.projMpg=d&&d.projMpg!=null?d.projMpg:null;p.projRank=d&&d.projRank!=null?d.projRank:null;' +
  'p.vacatedGainers=(d&&d.vacatedGainers)||null;});',
  sandbox
);

var S = sandbox.PickSignals;
assert.ok(S, "PickSignals exported");
var PLAYERS = sandbox.PLAYERS;
assert.strictEqual(PLAYERS.length, 270, "branch pool is 270 players");

var byName = {};
PLAYERS.forEach(function (p) { byName[p.n] = p; });
function P(n) { var p = byName[n]; assert.ok(p, "player missing: " + n); return p; }

var ctx = {
  moves: sandbox.MOVES,
  netVac: S.netVacated(PLAYERS, sandbox.MOVES, sandbox.VACATED_USAGE),
  playoffStart: 20,
};

var pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; }
  catch (e) { fail++; console.log("FAIL -", name, "\n  ", String(e.message).split("\n")[0]); }
}

var OPEN = ["PG", "SG", "G", "SF", "PF", "C", "UTIL", "UTIL", "BN", "BN", "BN", "BN", "BN"];
function availAt(pick) {
  // Deterministic: exclude top (pick-1) by consensus, like a real draft board.
  var sorted = PLAYERS.filter(function (p) { return !p.inj; })
    .sort(function (a, b) { return S.consensus(a) - S.consensus(b); });
  var drafted = {};
  sorted.slice(0, pick - 1).forEach(function (p) { drafted[p.n] = 1; });
  return PLAYERS.filter(function (p) { return !drafted[p.n] && !p.inj; });
}

// --- consensus ---
t("consensus blends Yahoo+Fantrax", function () {
  var v = S.consensus(P("Nikola Vucevic")); // adp 111.9, adpF 199
  assert.ok(Math.abs(v - 155.4) < 1, "got " + v);
});
t("consensus falls back to one source", function () {
  var v = S.consensus(P("Tre Jones")); // adp null, adpF 155.3
  assert.ok(Math.abs(v - 155.3) < 0.5, "got " + v);
});

// --- loader sanity (fail loudly) ---
t("MOVES loaded", function () {
  assert.ok(Object.keys(sandbox.MOVES).length >= 100, "only " + Object.keys(sandbox.MOVES).length);
});
t("VACATED_USAGE loaded", function () {
  assert.ok(Object.keys(sandbox.VACATED_USAGE).length >= 5, "only " + Object.keys(sandbox.VACATED_USAGE).length);
});
t("playoff schedule loaded for all 30 teams", function () {
  var teams = {};
  PLAYERS.forEach(function (p) { teams[p.t] = 1; });
  var n = 0;
  Object.keys(teams).forEach(function (tm) {
    if (tm === "FA" || tm === "—") return; // free agents have no schedule; engine skips the edge
    var c = sandbox.PlayoffCore.counts(sandbox.PlayoffData, tm, 20);
    assert.ok(c, "no playoff counts for " + tm);
    n++;
  });
  assert.ok(n >= 30, "only " + n + " teams");
});

// --- trueValue signs (the bug class we're guarding) ---
t("role-up IMPROVES rank (lowers V)", function () {
  var p = P("Aaron Gordon");
  assert.strictEqual((ctx.moves[p.n] || {}).roleDelta, "up", "test player must be role-up");
  var withRole = S.trueValue(p, ctx).V;
  var noRole = S.trueValue(p, { moves: {}, netVac: {}, playoffStart: 20 }).V;
  assert.ok(withRole < noRole, "role-up should lower V: with=" + withRole + " without=" + noRole);
});
t("role-down WORSENS rank (raises V)", function () {
  var p = P("Nikola Vucevic");
  assert.strictEqual((ctx.moves[p.n] || {}).roleDelta, "down", "test player must be role-down");
  var withRole = S.trueValue(p, ctx).V;
  var noRole = S.trueValue(p, { moves: {}, netVac: {}, playoffStart: 20 }).V;
  assert.ok(withRole > noRole, "role-down should raise V: with=" + withRole + " without=" + noRole);
});
t("vacated-usage gain IMPROVES rank (lowers V)", function () {
  var name = Object.keys(ctx.netVac).filter(function (n) { return ctx.netVac[n].v > 0; })[0];
  assert.ok(name, "need a positive vacated-usage gainer");
  var p = P(name);
  var withVac = S.trueValue(p, ctx).V;
  var noVac = S.trueValue(p, { moves: ctx.moves, netVac: {}, playoffStart: 20 }).V;
  assert.ok(withVac < noVac, "vacated gain should lower V: with=" + withVac + " without=" + noVac + " (" + name + ")");
});
t("vacated-usage net LOSS WORSENS rank (Tony's PHI catch)", function () {
  var nv = ctx.netVac["Tyrese Maxey"];
  assert.ok(nv && nv.v < 0, "Maxey should be net usage loss: " + JSON.stringify(nv));
  var p = P("Tyrese Maxey");
  var withVac = S.trueValue(p, ctx).V;
  var noVac = S.trueValue(p, { moves: ctx.moves, netVac: {}, playoffStart: 20 }).V;
  assert.ok(withVac > noVac, "net loss should raise V: with=" + withVac + " without=" + noVac);
});
t("actuals outperformance IMPROVES rank", function () {
  var p = P("Mikal Bridges"); // actuals ~39.5 vs cons 74.1
  var v = S.trueValue(p, ctx).V;
  assert.ok(v < 74.1, "got " + v);
});
t("actuals underperformance WORSENS rank", function () {
  var p = P("Jayson Tatum"); // actuals ~114 vs cons 10.1
  var v = S.trueValue(p, ctx).V;
  assert.ok(v > 10.1, "got " + v);
});
t("bad playoff schedule WORSENS rank", function () {
  function games(p) {
    return sandbox.PlayoffCore.total(sandbox.PlayoffCore.counts(sandbox.PlayoffData, p.t, 20));
  }
  var bad = PLAYERS.filter(function (p) { return !p.inj && p.adp != null && games(p) <= 9; })[0];
  var good = PLAYERS.filter(function (p) { return !p.inj && p.adp != null && games(p) >= 12; })[0];
  assert.ok(bad && good, "need a bad- and good-schedule team in pool");
  function edgeV(p) {
    var e = S.trueValue(p, ctx).edges.filter(function (x) { return x.k === "playoff"; })[0];
    return e ? e.v : 0;
  }
  var eBad = edgeV(bad), eGood = edgeV(good);
  assert.ok(eBad < 0, bad.n + " (" + bad.t + "): bad schedule should worsen (edge " + eBad + ")");
  assert.ok(eGood > 0, good.n + " (" + good.t + "): good schedule should improve (edge " + eGood + ")");
});
t("edges stay within sane bounds", function () {
  PLAYERS.forEach(function (p) {
    var tv = S.trueValue(p, ctx);
    assert.ok(Math.abs(tv.edgeTotal) <= 40, p.n + ": edge " + tv.edgeTotal + " too big");
    assert.ok(tv.V >= 1 && tv.V <= 320, p.n + ": V " + tv.V + " out of range");
  });
});

// --- evaluate verdicts ---
t("INJ is always pass", function () {
  var r = S.evaluate(P("Jimmy Butler"), { pick: 60, nextPick: 84, available: availAt(60), openSlots: OPEN, ctx: ctx });
  assert.strictEqual(r.verdict, "pass");
  assert.ok(r.reasons[0].indexOf("INJ") === 0, "got: " + r.reasons[0]);
});
t("best available at market is take", function () {
  var r = S.evaluate(P("Victor Wembanyama"), { pick: 1, nextPick: 24, available: availAt(1), openSlots: OPEN, ctx: ctx });
  assert.strictEqual(r.verdict, "take", JSON.stringify(r.reasons));
});
t("big value that won't survive is take", function () {
  var r = S.evaluate(P("Derrick White"), { pick: 70, nextPick: 94, available: availAt(70), openSlots: OPEN, ctx: ctx });
  assert.strictEqual(r.verdict, "take");
  assert.ok(r.valueAtPick > 10, "valueAtPick " + r.valueAtPick);
});
t("acceptable value with urgent better alternative is wait", function () {
  var r = S.evaluate(P("Donovan Clingan"), { pick: 40, nextPick: 64, available: availAt(40), openSlots: OPEN, ctx: ctx });
  assert.strictEqual(r.verdict, "wait", JSON.stringify(r.reasons));
  assert.ok(/won't survive to pick 64/.test(r.reasons.join(" ")), "should name the urgent alternative: " + JSON.stringify(r.reasons));
});
t("way below value with better alternative is pass", function () {
  var r = S.evaluate(P("Jayson Tatum"), { pick: 10, nextPick: 34, available: availAt(10), openSlots: OPEN, ctx: ctx });
  assert.strictEqual(r.verdict, "pass");
  assert.ok(/\([+-]?\d+ value/.test(r.reasons.join(" ")), "should name alternative with value: " + JSON.stringify(r.reasons));
});
t("nextPick is one-based (user-facing pick numbers)", function () {
  var r = S.evaluate(P("Victor Wembanyama"), { pick: 1, nextPick: 24, available: availAt(1), openSlots: OPEN, ctx: ctx });
  assert.ok(/\(24\)/.test(r.reasons.join(" ")), "reasons must cite one-based next pick 24: " + JSON.stringify(r.reasons));
});
t("target window is ordered and in range", function () {
  var spots = [1, 40, 70, 100, 130];
  spots.forEach(function (pick) {
    var avail = availAt(pick);
    avail.slice(0, 30).forEach(function (c) {
      var r = S.evaluate(c, { pick: pick, nextPick: pick + 24, available: avail, openSlots: OPEN, ctx: ctx });
      var tg = r.target;
      assert.ok(tg, c.n + " missing target");
      assert.ok(tg.earliest >= 1, c.n + ": earliest " + tg.earliest);
      assert.ok(tg.earliest <= tg.targetPick, c.n + ": earliest " + tg.earliest + " > target " + tg.targetPick);
      assert.ok(tg.targetPick <= tg.lastChance, c.n + ": target " + tg.targetPick + " > lastChance " + tg.lastChance);
      assert.ok(tg.valueRank >= 1 && tg.valueRank <= 320, c.n + ": valueRank " + tg.valueRank);
      assert.ok(isFinite(tg.marketRank), c.n + ": marketRank not finite");
    });
  });
});
t("target window never inverts when value trails market", function () {
  // Giannis: V=25 worse than ADP+4=16 — window must not read 17–16.
  var r = S.evaluate(P("Giannis Antetokounmpo"), { pick: 1, nextPick: 24, available: availAt(1), openSlots: OPEN, ctx: ctx });
  assert.ok(r.target.lastChance >= r.target.targetPick,
    "lastChance " + r.target.lastChance + " < targetPick " + r.target.targetPick);
});
t("every verdict names numbers", function () {
  [1, 60, 100].forEach(function (pick) {
    var avail = availAt(pick);
    avail.slice(0, 20).forEach(function (c) {
      var r = S.evaluate(c, { pick: pick, nextPick: pick + 24, available: avail, openSlots: OPEN, ctx: ctx });
      assert.ok(["take", "wait", "pass", "reach"].indexOf(r.verdict) >= 0, "bad verdict " + r.verdict);
      assert.ok(r.reasons.length > 0, c.n + " has no reasons");
      assert.ok(isFinite(r.V), c.n + " V not finite");
    });
  });
});

console.log("\ntest-pick-signals: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
