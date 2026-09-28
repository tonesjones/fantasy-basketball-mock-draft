/* Headless Draft Lab recommendation runner (node).
 * Loads the branch's own engine files in a vm sandbox exactly the way the
 * browser + test suites do, then recommends at a given pick on a live board.
 *
 * Usage: node recommend.js state.json
 * state.json: {pick, nextPick, drafted:[pool names], openSlots:[...], topN?}
 * Prints JSON: {pick, primary:{...}, alternatives:[...], boardTop:[...]}
 */
"use strict";
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var DIR = __dirname + "/../..";

function loadInto(sandbox, file) {
  var code = fs.readFileSync(path.join(DIR, file), "utf8");
  vm.runInNewContext(code, sandbox);
}

var sandbox = { console: console };
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
// Same data scripts index.html loads; player-pool.js holds the PLAYERS
// literal + PDATA enrichment (it used to be inline in index.html).
["player-data.js", "movers-outlook.js", "vacated-usage.js", "player-pool.js",
 "playoff-data.js", "playoff-core.js", "pick-signals.js"].forEach(function (f) {
  loadInto(sandbox, f);
});

var PS = sandbox.PickSignals;
if (!PS) { console.error("PickSignals not exported"); process.exit(1); }
var PLAYERS = sandbox.PLAYERS;

var ctx = {
  moves: sandbox.MOVES,
  netVac: PS.netVacated(PLAYERS, sandbox.MOVES, sandbox.VACATED_USAGE),
  playoffStart: 20
};

function main() {
  var state = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  var pick = state.pick;
  var nextPick = state.nextPick > 0 ? state.nextPick : pick + 24;
  var openSlots = state.openSlots || [];
  var topN = state.topN || 8;
  var taken = {};
  (state.drafted || []).forEach(function (n) { taken[n] = 1; });

  var available = PLAYERS.filter(function (p) { return !taken[p.n] && !p.inj; });
  // Rank by true value, evaluate the top candidates.
  var ranked = available.map(function (p) {
    return { p: p, V: PS.trueValue(p, ctx).V };
  }).sort(function (a, b) { return a.V - b.V; }).slice(0, topN);

  var verdictRank = { take: 0, wait: 1, reach: 2, pass: 3 };
  var scored = ranked.map(function (r) {
    var ev = PS.evaluate(r.p, {
      pick: pick, nextPick: nextPick, available: available,
      openSlots: openSlots, ctx: ctx
    });
    return {
      name: r.p.n, verdict: ev.verdict, V: ev.V,
      valueAtPick: Math.round(ev.valueAtPick * 10) / 10,
      reasons: ev.reasons
    };
  }).sort(function (a, b) {
    var d = (verdictRank[a.verdict] - verdictRank[b.verdict]);
    return d !== 0 ? d : b.valueAtPick - a.valueAtPick;
  });

  console.log(JSON.stringify({
    pick: pick,
    nextPick: nextPick,
    availableCount: available.length,
    primary: scored[0] || null,
    alternatives: scored.slice(1, 3),
    boardTop: ranked.slice(0, 5).map(function (r) { return r.p.n; })
  }));
}

main();
