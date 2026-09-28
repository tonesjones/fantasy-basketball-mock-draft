#!/usr/bin/env node
/* Rebuilds the built-in "Rank" order (the PLAYERS literal in player-pool.js).

   Rank key = consensus market rank (DraftCore.marketRank: the weighted Yahoo +
   Fantrax ADP blend), nudged toward 2025-26 production:

     key = consensus - 0.4 * clamp(consensus - lastSeasonRank, -50, +50)

   lastSeasonRank is the median of the totals rank and per-game rank. This is
   the same damped "actuals" edge the Pick coach applies (pick-signals.js).
   No edge for INJ-tagged players (last season says little about this one),
   for players without 2025-26 data, or for unlisted players (consensus > 200).
   Ties break by consensus, then name.

   Usage:
     node scripts/rebuild-rank.js           rewrite player-pool.js in place
     node scripts/rebuild-rank.js --check   exit 1 if player-pool.js is stale

   Changing the order changes pool indexes, so bump DATA_VERSION in app.js
   whenever this rewrites the file. */
"use strict";
var fs = require("fs"),
  path = require("path");
var core = require("../draft-core");
var load = require("./load-data");

var EDGE_WEIGHT = 0.4,
  EDGE_CAP = 50,
  EDGE_MAX_CONSENSUS = 200;

function rankKey(p) {
  var c = core.marketRank(p),
    last = core.lastSeasonRank(p);
  if (p.inj || last == null || c > EDGE_MAX_CONSENSUS) return c;
  return c - EDGE_WEIGHT * Math.max(-EDGE_CAP, Math.min(EDGE_CAP, c - last));
}

function rankedPlayers(players) {
  return players
    .map(function (p) {
      return { p: p, key: rankKey(p), cons: core.marketRank(p) };
    })
    .sort(function (a, b) {
      return a.key - b.key || a.cons - b.cons || (a.p.n < b.p.n ? -1 : a.p.n > b.p.n ? 1 : 0);
    })
    .map(function (x) {
      return x.p;
    });
}

function literal(players) {
  var cells = players.map(function (p) {
    var pos = p.p
      .map(function (x) {
        return "'" + x + "'";
      })
      .join(", ");
    return "[" + JSON.stringify(p.n) + ",[" + pos + "]," + JSON.stringify(p.t) + "]";
  });
  var lines = [];
  for (var i = 0; i < cells.length; i += 3) lines.push(cells.slice(i, i + 3).join(","));
  return lines.join(",\n");
}

var POOL = path.join(load.ROOT, "player-pool.js");
var START = "var PLAYERS=[\n",
  END = "\n\n];";

function rebuild() {
  var src = fs.readFileSync(POOL, "utf8");
  var s = src.indexOf(START),
    e = src.indexOf(END, s);
  if (s < 0 || e < 0) throw new Error("PLAYERS literal not found in player-pool.js");
  var ctx = load.loadData();
  var ordered = rankedPlayers(Array.from(ctx.PLAYERS));
  var next = src.slice(0, s + START.length) + literal(ordered) + src.slice(e);
  return { current: src, next: next, ordered: ordered, before: Array.from(ctx.PLAYERS) };
}

if (require.main === module) {
  var r = rebuild();
  var moved = r.ordered.filter(function (p, i) {
    return p.r !== i + 1;
  }).length;
  if (process.argv.indexOf("--check") >= 0) {
    if (r.next !== r.current) {
      console.error(
        "player-pool.js rank order is stale (" + moved + " players would move). " +
          "Run: node scripts/rebuild-rank.js, then bump DATA_VERSION in app.js."
      );
      process.exit(1);
    }
    console.log("player-pool.js rank order is current (" + r.ordered.length + " players).");
  } else if (r.next === r.current) {
    console.log("player-pool.js already current; nothing to write.");
  } else {
    fs.writeFileSync(POOL, r.next);
    console.log(
      "Rewrote player-pool.js: " + moved + " of " + r.ordered.length + " players changed rank. " +
        "Bump DATA_VERSION in app.js."
    );
  }
}

module.exports = { rankKey: rankKey, rankedPlayers: rankedPlayers, rebuild: rebuild };
