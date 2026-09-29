/* Pure draft analysis shared by the browser app and Node tests:
   consensus rank, category replacement levels, draft grades and
   category matchups. No DOM, no app state - everything is passed in. */
(function (root, factory) {
  var core =
    root.DraftCore ||
    (typeof module !== "undefined" && module.exports ? require("./draft-core") : null);
  var api = factory(core);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.DraftAnalysis = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (core) {
  "use strict";
  var ZERO9 = [0, 0, 0, 0, 0, 0, 0, 0, 0];

  /* Consensus market rank: DraftCore's reliability-weighted Yahoo + Fantrax
     ADP blend (the same number the CPU drafts from). */
  function consRank(p) {
    return core.marketRank(p);
  }

  /* BM-style category baseline. Replacement level per category = mean value of
     consensus ranks 150-170 (the end-of-draft tier). `start` is the total
     above-replacement value per category across the pool, the denominator for
     the scarcity gauge. */
  function scarcityBase(players, pdata) {
    var idx = [];
    for (var i = 0; i < players.length; i++) {
      var d = pdata[players[i].n];
      if (d && d.cv) idx.push(i);
    }
    var ord = idx.slice().sort(function (a, b) {
      return consRank(players[a]) - consRank(players[b]);
    });
    var repl = ZERO9.slice(),
      cnt = 0,
      c;
    for (var k = 149; k < 170 && k < ord.length; k++) {
      var cv = pdata[players[ord[k]].n].cv;
      for (c = 0; c < 9; c++) repl[c] += cv[c];
      cnt++;
    }
    for (c = 0; c < 9; c++) repl[c] /= Math.max(1, cnt);
    var start = ZERO9.slice();
    idx.forEach(function (j) {
      var v2 = pdata[players[j].n].cv;
      for (var c3 = 0; c3 < 9; c3++) {
        var vv = v2[c3] - repl[c3];
        if (vv > 0) start[c3] += vv;
      }
    });
    return { idx: idx, repl: repl, start: start };
  }

  /* Market-implied category values for a player with no 2025-26 data
     (injured stars, rookies): the mean cv of the IMPLIED_K rated players
     nearest him in consensus rank. The neutral assumption is that he is worth
     what the market pays; replacement level would grade a Haliburton pick at
     16.8 as a ~6 z-point hole. `rated` is the pool's rated players sorted by
     consensus rank (see ratedByConsensus). Returns null if none are rated. */
  var IMPLIED_K = 10;
  function ratedByConsensus(players, pdata) {
    return players
      .filter(function (p) {
        return pdata[p.n] && pdata[p.n].cv;
      })
      .map(function (p) {
        return { cons: consRank(p), cv: pdata[p.n].cv };
      })
      .sort(function (a, b) {
        return a.cons - b.cons;
      });
  }
  function impliedCv(player, rated) {
    if (!rated.length) return null;
    var target = consRank(player),
      lo = 0;
    while (lo < rated.length && rated[lo].cons < target) lo++;
    var hi = lo,
      out = ZERO9.slice(),
      n = 0;
    lo--;
    /* Two-pointer walk outward from the insertion point, nearest first. */
    while (n < IMPLIED_K && (lo >= 0 || hi < rated.length)) {
      var pickLo =
        hi >= rated.length || (lo >= 0 && target - rated[lo].cons <= rated[hi].cons - target);
      var cv = pickLo ? rated[lo--].cv : rated[hi++].cv;
      for (var c = 0; c < 9; c++) out[c] += cv[c];
      n++;
    }
    for (var c2 = 0; c2 < 9; c2++) out[c2] /= n;
    return out;
  }

  /* Grade every team: sum of 2025-26 per-game category values across the full
     roster (players without data count at their market-implied value, else
     replacement level), letter grade by z-score of team totals. Returns teams
     sorted best-first with rank 1..N.
     opts: { players, pdata, log, teams, core (DraftCore), repl (9 numbers) } */
  function draftGrades(opts) {
    var repl = opts.repl || ZERO9,
      pdata = opts.pdata || {},
      ratedPool = ratedByConsensus(opts.players, pdata),
      teams = [];
    for (var t = 0; t < opts.teams; t++) {
      var entries = opts.core.teamEntries(opts.players, opts.log, t, opts.teams);
      var score = 0,
        rated = 0,
        unrated = 0,
        cats = ZERO9.slice();
      entries.forEach(function (e) {
        var d = pdata[e.player.n] || null;
        var cv = (d && d.cv) || impliedCv(e.player, ratedPool) || repl;
        if (d && d.cv) rated++;
        else unrated++;
        for (var c = 0; c < 9; c++) {
          score += cv[c];
          cats[c] += cv[c];
        }
      });
      teams.push({ team: t, score: score, rated: rated, unrated: unrated, cats: cats });
    }
    var mean =
      teams.reduce(function (a, x) {
        return a + x.score;
      }, 0) / teams.length;
    var vari =
      teams.reduce(function (a, x) {
        return a + (x.score - mean) * (x.score - mean);
      }, 0) / teams.length;
    var std = Math.sqrt(vari) || 1;
    teams.forEach(function (x) {
      var z = (x.score - mean) / std;
      x.z = z;
      x.grade =
        z >= 1.5
          ? "A+"
          : z >= 1.0
            ? "A"
            : z >= 0.5
              ? "B+"
              : z >= 0
                ? "B"
                : z > -0.5
                  ? "C+"
                  : z > -1
                    ? "C"
                    : z > -1.5
                      ? "D"
                      : "F";
    });
    teams.sort(function (a, b) {
      return b.score - a.score;
    });
    teams.forEach(function (x, i) {
      x.rank = i + 1;
    });
    return teams;
  }

  /* Per-category 'win' / 'even' / 'loss' of the user's totals vs an opponent.
     |diff| <= 0.5 is even. */
  function catMatchup(userCats, oppCats) {
    var out = [];
    for (var c = 0; c < 9; c++) {
      var diff = userCats[c] - oppCats[c];
      out.push(diff > 0.5 ? "win" : diff < -0.5 ? "loss" : "even");
    }
    return out;
  }

  /* A draft-stage comparison, not a projection of weekly category wins.
     Normalize by mapped picks so the team currently drafting first does not
     appear stronger just because it has one extra player. Catch-up paths are
     optimistic: they hold the room's per-pick median steady and use players
     available now whose market ADP fits the next two pick windows. */
  function categoryOutlook(opts) {
    var grades = opts.grades || [],
      me = grades.filter(function (g) { return g.team === opts.userTeam; })[0],
      log = opts.log || [],
      totalMine = 0,
      mappedMine = 0,
      mappedRoom = 0,
      taken = {};
    log.forEach(function (pi, pick) {
      if (pi >= 0) { mappedRoom++; taken[pi] = true; }
      if (core.teamForPick(pick, grades.length) === opts.userTeam) {
        totalMine++;
        if (pi >= 0) mappedMine++;
      }
    });
    var count = me ? me.rated + me.unrated : 0;
    var peers = grades.filter(function (g) { return g.team !== opts.userTeam && g.rated + g.unrated > 0; });
    var ready = count >= 3 && peers.length >= 5 && totalMine > 0 &&
      mappedMine / totalMine >= 0.8 && mappedRoom / log.length >= 0.8;
    var nextPick = opts.nextPick == null ? -1 : opts.nextPick;
    var followingPick = opts.followingPick == null ? -1 : opts.followingPick;
    var nearCutoff = followingPick > nextPick
      ? Math.floor((nextPick + followingPick + 2) / 2)
      : nextPick + 13;
    var laterCutoff = followingPick > nextPick ? followingPick + 13 : nearCutoff;
    var available = [];
    if (nextPick >= 0) (opts.players || []).forEach(function (p, pi) {
      var cv = opts.pdata && opts.pdata[p.n] && opts.pdata[p.n].cv;
      var adp = core.marketAdp(p);
      if (!taken[pi] && !p.inj && cv && adp != null && adp <= laterCutoff) {
        available.push({ name: p.n, cv: cv, adp: adp });
      }
    });
    var rows = [];
    for (var c = 0; c < 9; c++) {
      var avg = count ? me.cats[c] / count : 0;
      var peerAvgs = peers.map(function (g) { return g.cats[c] / (g.rated + g.unrated); })
        .sort(function (a, b) { return a - b; });
      var mid = Math.floor(peerAvgs.length / 2);
      var median = peerAvgs.length ? (peerAvgs.length % 2
        ? peerAvgs[mid] : (peerAvgs[mid - 1] + peerAvgs[mid]) / 2) : 0;
      var rank = 1 + peerAvgs.filter(function (v) { return v > avg + 1e-9; }).length;
      var gap = median - avg;
      var status = "early";
      if (ready) {
        if (count >= 5 && rank <= 2 && gap <= -0.5) status = "surplus";
        else if (rank <= 4 && gap <= -0.2) status = "strong";
        else if (rank >= 9 && gap >= 0.2) status = "weak";
        else status = "in-mix";
      }
      var near = available.filter(function (p) { return p.adp <= nearCutoff && p.cv[c] > median; })
        .sort(function (a, b) { return b.cv[c] - a.cv[c] || a.adp - b.adp; });
      var later = available.filter(function (p) { return p.cv[c] > median; })
        .sort(function (a, b) { return b.cv[c] - a.cv[c] || a.adp - b.adp; });
      var first = near[0];
      var second = later.filter(function (p) { return !first || p.name !== first.name; })[0];
      var debt = Math.max(0, gap * count);
      var catchup = null;
      if (status === "weak") {
        if (nextPick < 0) catchup = "no-picks";
        else if (first && first.cv[c] - median >= debt) catchup = "one-pick";
        else if (followingPick > nextPick && first && second &&
          first.cv[c] + second.cv[c] - 2 * median >= debt) catchup = "two-pick";
        else catchup = "hard-climb";
      }
      rows.push({ ci: c, avg: avg, median: median, gap: gap, rank: rank,
        status: status, catchup: catchup,
        near: near.slice(0, 3).map(function (p) { return { name: p.name, lift: p.cv[c] - median }; }),
        second: second ? second.name : null });
    }
    return { ready: ready, knownPicks: count, draftedPicks: totalMine,
      mappedRoom: mappedRoom, roomPicks: log.length, rows: rows };
  }

  return {
    consRank: consRank,
    scarcityBase: scarcityBase,
    impliedCv: function (player, players, pdata) {
      return impliedCv(player, ratedByConsensus(players, pdata || {}));
    },
    draftGrades: draftGrades,
    catMatchup: catMatchup,
    categoryOutlook: categoryOutlook,
  };
});
