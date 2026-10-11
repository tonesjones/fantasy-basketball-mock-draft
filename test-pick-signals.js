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
 "playoff-data.js", "playoff-core.js", "draft-core.js", "pick-signals.js"].forEach(function (f) {
  loadInto(sandbox, f);
});

loadInto(sandbox, "player-pool.js"); // real PLAYERS literal + PDATA enrichment

var S = sandbox.PickSignals;
assert.ok(S, "PickSignals exported");
var PLAYERS = sandbox.PLAYERS;
assert.strictEqual(PLAYERS.length, 274, "branch pool is 274 players");

var byName = {};
PLAYERS.forEach(function (p) { byName[p.n] = p; });
function P(n) { var p = byName[n]; assert.ok(p, "player missing: " + n); return p; }

var ctx = {
  moves: sandbox.MOVES,
  netVac: S.netVacated(PLAYERS, sandbox.MOVES, sandbox.VACATED_USAGE),
  returning: S.returningTeammates(PLAYERS, sandbox.MOVES),
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
  // Any player with both ADPs in their reliable range: plain mean.
  var p = PLAYERS.filter(function (x) { return x.adp != null && x.adp <= 100 && x.adpF != null && x.adpF <= 150; })[0];
  assert.ok(p, "need a player with both ADPs in range");
  assert.ok(Math.abs(S.consensus(p) - (p.adp + p.adpF) / 2) < 1e-9, p.n + " got " + S.consensus(p));
});
t("consensus matches DraftCore market rank", function () {
  PLAYERS.forEach(function (p) { assert.strictEqual(S.consensus(p), sandbox.DraftCore.marketRank(p), p.n); });
});
t("consensus falls back to one source", function () {
  assert.strictEqual(S.consensus({ adp: 80, adpF: null }), 80);
  assert.strictEqual(S.consensus({ adp: null, adpF: 120 }), 120);
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
function playerWithRole(role) {
  var n = Object.keys(ctx.moves).filter(function (k) { return ctx.moves[k].roleDelta === role && byName[k] && !byName[k].inj; })[0];
  assert.ok(n, "need a role-" + role + " player");
  return P(n);
}
t("role-up IMPROVES rank (lowers V)", function () {
  var p = playerWithRole("up");
  var withRole = S.trueValue(p, ctx).V;
  var noRole = S.trueValue(p, { moves: {}, netVac: {}, playoffStart: 20 }).V;
  assert.ok(withRole < noRole, "role-up should lower V: with=" + withRole + " without=" + noRole);
});
t("role-down WORSENS rank (raises V)", function () {
  var p = playerWithRole("down");
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
t("vacated netting stacks every absorbing arrival (Brown AND LeBron)", function () {
  var nv = ctx.netVac["Tyrese Maxey"];
  assert.ok(nv.v < -5, "second arrival should deepen the loss: " + JSON.stringify(nv));
  assert.ok(/Jaylen Brown/.test(nv.note) && /LeBron James/.test(nv.note), "note should name both: " + nv.note);
  assert.ok(Object.keys(ctx.netVac).every(function (n) { return ctx.netVac[n].v >= -10; }), "floor is -10");
});
t("returning star docks teammates who outproduced without him (Embiid -> Maxey)", function () {
  var rt = ctx.returning["Tyrese Maxey"];
  assert.ok(rt && rt.v < 0 && /Joel Embiid/.test(rt.note), "Maxey should carry a returning-Embiid edge: " + JSON.stringify(rt));
  var p = P("Tyrese Maxey");
  var withRt = S.trueValue(p, ctx).V;
  var noRt = S.trueValue(p, { moves: ctx.moves, netVac: ctx.netVac, returning: {}, playoffStart: 20 }).V;
  assert.ok(withRt > noRt, "returning star should raise V: with=" + withRt + " without=" + noRt);
});
t("returning edge skips teammates who underproduced and the star himself", function () {
  assert.ok(!ctx.returning["Joel Embiid"], "star is not docked by himself");
  Object.keys(ctx.returning).forEach(function (n) {
    var p = P(n), a = S.actuals(p);
    assert.ok(a != null && a < S.consensus(p), n + " was docked but did not outproduce market");
    assert.ok(ctx.returning[n].v >= -6, n + ": returning edge below floor");
  });
});
t("playoff edge is measured against the window's league average", function () {
  var avg = S.playoffAverage(20);
  assert.ok(avg > 10 && avg < 11.5, "weeks 20-22 average should be ~10.7, got " + avg);
  var e = S.trueValue(P("Donovan Mitchell"), ctx).edges.filter(function (x) { return x.k === "playoff"; })[0];
  assert.ok(e && e.v <= -2, "CLE's 9-game window should cost Mitchell at least 2 spots: " + JSON.stringify(e));
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
  // Not pinned to one player: data refreshes and new edges shift who sits
  // exactly on the +6 threshold. The mechanic must fire for someone at 40.
  var avail = availAt(40), r = null;
  avail.some(function (p) {
    var x = S.evaluate(p, { pick: 40, nextPick: 64, available: avail, openSlots: OPEN, ctx: ctx });
    if (x.verdict === "wait" && x.valueAtPick >= -2) { r = x; return true; }
    return false;
  });
  assert.ok(r, "expected at least one acceptable-value 'wait' at pick 40");
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
t("punt: riser gets positive punt edge and lower V", function () {
  var p = P("Jayson Tatum");
  var base = S.trueValue(p, ctx);
  var pu = S.trueValue(p, Object.assign({}, ctx, { puntShift: { "Jayson Tatum": 20 }, puntLabel: "FT%" }));
  var e = pu.edges.filter(function (x) { return x.k === "punt"; })[0];
  assert.ok(e && e.v > 0, "expected positive punt edge: " + JSON.stringify(pu.edges));
  assert.ok(/rises 20 spots punting FT%/.test(e.note), e.note);
  assert.ok(pu.V < base.V, "punt V " + pu.V + " should be below " + base.V);
});
t("punt: no punt or tiny shift -> no punt edge", function () {
  var p = P("Jayson Tatum");
  assert.ok(!S.trueValue(p, ctx).edges.some(function (x) { return x.k === "punt"; }));
  var tiny = S.trueValue(p, Object.assign({}, ctx, { puntShift: { "Jayson Tatum": 1 } }));
  assert.ok(!tiny.edges.some(function (x) { return x.k === "punt"; }), "|e|<1 skipped");
  var capped = S.trueValue(p, Object.assign({}, ctx, { puntShift: { "Jayson Tatum": 200 } }));
  assert.strictEqual(capped.edges.filter(function (x) { return x.k === "punt"; })[0].v, 20, "cap 40 * w 0.5");
});
t("punt: verdict can flip from pass to take", function () {
  var opts = { pick: 10, nextPick: 34, available: availAt(10), openSlots: OPEN };
  var no = S.evaluate(P("Jayson Tatum"), Object.assign({ ctx: ctx }, opts));
  assert.strictEqual(no.verdict, "pass");
  var yes = S.evaluate(P("Jayson Tatum"), Object.assign({ ctx: Object.assign({}, ctx, { puntShift: { "Jayson Tatum": 80 }, puntLabel: "FT%" }) }, opts));
  assert.strictEqual(yes.verdict, "take", JSON.stringify(yes.reasons));
});

console.log("\ntest-pick-signals: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
