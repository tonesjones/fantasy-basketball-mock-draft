/* In-season roster check, shared by the browser app and Node tests.
   Compares the user's Yahoo roster with this week's opponent and the
   available players, then says hold or drop for each rostered player. A drop
   is suggested only with a named pickup that is a clear upgrade. Values are
   2025-26 per-game category z-scores (cv), the same numbers the draft uses:
   this is last season's production, not a projection. No DOM, no app state. */
(function (root, factory) {
  var analysis =
    root.DraftAnalysis ||
    (typeof module !== "undefined" && module.exports ? require("./draft-analysis") : null);
  var api = factory(analysis);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.SeasonCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (analysis) {
  "use strict";
  var CATS = ["PTS", "REB", "AST", "STL", "BLK", "3PM", "FG%", "FT%", "TO"];
  /* Yahoo stat display names for the nine categories. */
  var YAHOO_CATS = {
    PTS: "PTS",
    REB: "REB",
    AST: "AST",
    ST: "STL",
    STL: "STL",
    BLK: "BLK",
    "3PTM": "3PM",
    "3PM": "3PM",
    "FG%": "FG%",
    "FT%": "FT%",
    TO: "TO",
  };
  /* A pickup must beat the dropped player by this much summed category value
     (about a round and a half of draft value at the end of a 13-round draft). */
  var CLEAR_GAIN = 1.5;
  /* Players drafted this early are never drop suggestions on last season's
     numbers alone; a slow start is not a reason to cut a top-100 pick. */
  var PROTECT_RANK = 100;
  var MAX_MOVES = 3;
  var WATCH_SIZE = 5;
  /* Matchup weights by category margin (summed per-game z): a close category
     is where one player swings the week. */
  var SWING_MARGIN = 2,
    SAFE_MARGIN = 5;
  /* Yahoo player statuses that mean he won't play soon. */
  var OUT = { O: true, INJ: true, NA: true, SUSP: true };
  var IL_SLOTS = { IL: true, "IL+": true };
  var ANY_SLOTS = { Util: true, UTIL: true, BN: true };

  function activeCats(yahooCats, punts) {
    var seen = {},
      ignored = [];
    (yahooCats || []).forEach(function (name) {
      var cat = YAHOO_CATS[String(name).toUpperCase()] || YAHOO_CATS[name];
      if (cat) seen[cat] = true;
      else ignored.push(name);
    });
    /* No category list from Yahoo: assume standard nine-category. */
    if (!yahooCats || !yahooCats.length)
      CATS.forEach(function (c) {
        seen[c] = true;
      });
    (punts || []).forEach(function (c) {
      delete seen[c];
    });
    return {
      idx: CATS.map(function (c, i) {
        return seen[c] ? i : -1;
      }).filter(function (i) {
        return i >= 0;
      }),
      ignored: ignored,
    };
  }

  function sum(cv, idx) {
    var total = 0;
    idx.forEach(function (c) {
      total += cv[c];
    });
    return total;
  }

  /* Pool data for a Yahoo player: { pi, cv, rated, rank, seasonOut }. */
  function describe(yp, ctx) {
    var pi = ctx.index(yp.name);
    var out = {
      name: yp.name,
      nbaTeam: yp.nbaTeam || "",
      positions: yp.positions || [],
      status: yp.status || "",
      injuryNote: yp.injuryNote || "",
      selectedPosition: yp.selectedPosition || null,
      availability: yp.availability || null,
      pi: pi,
      cv: null,
      rated: false,
      rank: Infinity,
      seasonOut: false,
      poolOut: false,
    };
    if (pi < 0) return out;
    var p = ctx.players[pi],
      d = ctx.pdata[p.n];
    out.rank = analysis.consRank(p);
    out.seasonOut = !!(p.inj && p.inj.status === "season-out");
    /* Yahoo's status is live; the pool's injury notes also catch a long
       absence whose sourced return date hasn't come yet. */
    out.poolOut = !!(
      p.inj &&
      (p.inj.status === "out-indefinitely" ||
        (p.inj.retBy && Date.parse(p.inj.retBy + "T00:00:00Z") > ctx.now))
    );
    if (d && d.cv) {
      out.cv = d.cv;
      out.rated = true;
    } else {
      out.cv = analysis.impliedCv(p, ctx.players, ctx.pdata);
    }
    return out;
  }

  function value(row, idx) {
    if (row.seasonOut) return 0;
    return row.cv ? sum(row.cv, idx) : null;
  }

  function isOut(row) {
    return !!OUT[String(row.status).toUpperCase()];
  }

  function onIl(row) {
    return !!IL_SLOTS[row.selectedPosition];
  }

  /* Category totals for the players who count this week (not on IL). */
  function totals(rows) {
    var t = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    rows.forEach(function (r) {
      if (onIl(r) || !r.cv || r.seasonOut) return;
      for (var c = 0; c < 9; c++) t[c] += r.cv[c];
    });
    return t;
  }

  function matchupWeights(mine, opp, idx) {
    var w = [0, 0, 0, 0, 0, 0, 0, 0, 0],
      result = [];
    for (var c = 0; c < 9; c++) {
      if (idx.indexOf(c) < 0) {
        result.push(null);
        continue;
      }
      var diff = mine[c] - opp[c],
        margin = Math.abs(diff);
      w[c] = margin <= SWING_MARGIN ? 1.5 : margin <= SAFE_MARGIN ? 1 : 0.5;
      result.push(margin <= SWING_MARGIN ? "swing" : diff > 0 ? "win" : "loss");
    }
    return { weights: w, result: result };
  }

  /* Can these players fill every starting slot? Slots are Yahoo roster
     positions; BN and IL don't need filling. Bipartite matching. */
  function fillsStarters(rows, positions) {
    var slots = [];
    (positions || []).forEach(function (p) {
      if (p.position === "BN" || IL_SLOTS[p.position]) return;
      for (var k = 0; k < (p.count || 1); k++) slots.push(p.position);
    });
    var players = rows.filter(function (r) {
      return !onIl(r);
    });
    var owner = slots.map(function () {
      return -1;
    });
    function fits(r, slot) {
      return ANY_SLOTS[slot] || r.positions.indexOf(slot) >= 0;
    }
    function assign(i, seen) {
      for (var s = 0; s < slots.length; s++) {
        if (seen[s] || !fits(players[i], slots[s])) continue;
        seen[s] = true;
        if (owner[s] < 0 || assign(owner[s], seen)) {
          owner[s] = i;
          return true;
        }
      }
      return false;
    }
    for (var i = 0; i < players.length; i++) assign(i, {});
    return owner.every(function (o) {
      return o >= 0;
    });
  }

  /* What a player adds in one category; a season-ending injury adds nothing. */
  function contrib(r, c) {
    return r.cv && !r.seasonOut ? r.cv[c] : 0;
  }

  function topCats(add, drop, idx, n) {
    return idx
      .map(function (c) {
        return { cat: CATS[c], d: add.cv[c] - contrib(drop, c) };
      })
      .filter(function (x) {
        return x.d > 0.25;
      })
      .sort(function (a, b) {
        return b.d - a.d;
      })
      .slice(0, n)
      .map(function (x) {
        return x.cat;
      });
  }

  /* opts: { players, pdata, index(name) -> pool index or -1, league
     ({ categories, positions, scoringType }), mine, opponent, available
     (Yahoo player lists from the Worker), punts (category names), now (ms) } */
  function analyze(opts) {
    var league = opts.league || {};
    var ctx = {
      players: opts.players,
      pdata: opts.pdata,
      index: opts.index,
      now: opts.now || Date.now(),
    };
    var cats = activeCats(league.categories, opts.punts);
    var idx = cats.idx;
    var points = /point/i.test(league.scoringType || "");
    var mine = (opts.mine || []).map(function (p) {
      return describe(p, ctx);
    });
    var opp = opts.opponent
      ? opts.opponent.map(function (p) {
          return describe(p, ctx);
        })
      : null;
    var avail = (opts.available || []).map(function (p) {
      return describe(p, ctx);
    });
    mine.forEach(function (r) {
      r.value = value(r, idx);
    });
    avail.forEach(function (r) {
      r.value = value(r, idx);
    });

    var matchup = null;
    if (opp) {
      var myT = totals(mine),
        oppT = totals(opp),
        mw = matchupWeights(myT, oppT, idx);
      matchup = { mine: myT, opp: oppT, result: mw.result, weights: mw.weights };
    }

    /* Pickups need real 2025-26 numbers and must be able to play. */
    var adds = avail
      .filter(function (r) {
        return r.rated && !r.seasonOut && !r.poolOut && !isOut(r);
      })
      .sort(function (a, b) {
        return b.value - a.value;
      });

    function dropBlock(r) {
      if (onIl(r)) return "On IL; doesn't use a roster spot.";
      if (r.pi < 0) return "Not in Draft Lab's player pool, so there's nothing to compare.";
      if (r.seasonOut) return null;
      if (!r.rated) return "No 2025-26 stats; held at his draft value.";
      if (r.rank <= PROTECT_RANK) return "Early-round pick; don't drop on last season's numbers.";
      return null;
    }

    function matchupGain(add, drop) {
      if (!matchup) return null;
      var g = 0;
      idx.forEach(function (c) {
        g += matchup.weights[c] * (add.cv[c] - contrib(drop, c));
      });
      return g;
    }

    var pairs = [];
    mine.forEach(function (drop, di) {
      drop.block = dropBlock(drop);
      if (drop.block || points) return;
      adds.forEach(function (add) {
        var gain = add.value - (drop.value || 0);
        var mg = matchupGain(add, drop);
        pairs.push({ di: di, add: add, gain: gain, matchupGain: mg });
      });
    });
    pairs.sort(function (a, b) {
      return (
        (b.matchupGain != null ? b.matchupGain : b.gain) -
        (a.matchupGain != null ? a.matchupGain : a.gain)
      );
    });

    var moves = [],
      usedDrop = {},
      usedAdd = {},
      roster = mine.slice();
    pairs.forEach(function (pair) {
      if (moves.length >= MAX_MOVES || usedDrop[pair.di] || usedAdd[pair.add.name]) return;
      if (pair.gain < CLEAR_GAIN || (pair.matchupGain != null && pair.matchupGain <= 0)) return;
      var drop = mine[pair.di];
      var trial = roster.map(function (r) {
        return r === drop ? pair.add : r;
      });
      /* Block only a swap that leaves a starting slot empty that is filled now. */
      if (fillsStarters(roster, league.positions) && !fillsStarters(trial, league.positions))
        return;
      roster = trial;
      usedDrop[pair.di] = true;
      usedAdd[pair.add.name] = true;
      moves.push({
        drop: drop.name,
        add: pair.add.name,
        addTeam: pair.add.nbaTeam,
        availability: pair.add.availability,
        gain: pair.gain,
        matchupGain: pair.matchupGain,
        helps: topCats(pair.add, drop, idx, 3),
      });
    });

    var rosterRows = mine.map(function (r, di) {
      var move = moves.filter(function (m) {
        return m.drop === r.name;
      })[0];
      var verdict = move ? "drop" : onIl(r) ? "il" : "hold";
      var reason;
      if (move) reason = "Drop for " + move.add + " (+" + move.gain.toFixed(1) + ").";
      else if (points) reason = "Points league: nine-category values don't apply.";
      else if (r.block) reason = r.block;
      else {
        var best = pairs
          .filter(function (p) {
            return p.di === di && !usedAdd[p.add.name];
          })
          .sort(function (a, b) {
            return b.gain - a.gain;
          })[0];
        reason = best
          ? best.gain >= CLEAR_GAIN
            ? "Best pickup (" +
              best.add.name +
              ") doesn't help this week's matchup or breaks your lineup."
            : "No clear upgrade on waivers (best: " +
              best.add.name +
              " " +
              (best.gain >= 0 ? "+" : "") +
              best.gain.toFixed(1) +
              ")."
          : "No rated player available.";
      }
      if (verdict === "hold" && isOut(r) && !onIl(r))
        reason += " Out: move him to an open IL slot.";
      return {
        name: r.name,
        nbaTeam: r.nbaTeam,
        selectedPosition: r.selectedPosition,
        status: r.status,
        injuryNote: r.injuryNote,
        value: r.value,
        rated: r.rated,
        verdict: verdict,
        reason: reason,
      };
    });

    var watch = adds
      .filter(function (r) {
        return !usedAdd[r.name];
      })
      .slice(0, WATCH_SIZE)
      .map(function (r) {
        return {
          name: r.name,
          nbaTeam: r.nbaTeam,
          availability: r.availability,
          value: r.value,
          positions: r.positions,
        };
      });

    return {
      cats: idx.map(function (c) {
        return CATS[c];
      }),
      ignoredCats: cats.ignored,
      points: points,
      matchup: matchup,
      moves: moves,
      roster: rosterRows,
      watch: watch,
      unmatchedAvailable: avail.filter(function (r) {
        return r.pi < 0;
      }).length,
    };
  }

  return {
    CATS: CATS,
    CLEAR_GAIN: CLEAR_GAIN,
    PROTECT_RANK: PROTECT_RANK,
    MAX_MOVES: MAX_MOVES,
    activeCats: activeCats,
    fillsStarters: fillsStarters,
    analyze: analyze,
  };
});
