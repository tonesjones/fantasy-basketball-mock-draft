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
["player-data.js", "movers-outlook.js", "vacated-usage.js",
 "playoff-data.js", "playoff-core.js", "pick-signals.js"].forEach(function (f) {
  loadInto(sandbox, f);
});

// PLAYERS literal + enrichment, exactly as index.html builds it.
var html = fs.readFileSync(path.join(DIR, "index.html"), "utf8");
var lit = html.match(/var PLAYERS=\[[\s\S]*?\n\];/);
if (!lit) { console.error("PLAYERS literal not found in index.html"); process.exit(1); }
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
