/* pick-signals.js — deterministic pick-value signal engine (browser).
 *
 * Computes draft pick value from market data + curated signals, WITHOUT
 * asking Jev to guess. Jev (via /api/pick-quality) gets the engine's numbers
 * and answers independently as a second opinion — it never sets the verdict.
 *
 * Core model:
 *   V(x) = true-value rank estimate (lower = better). Anchored on market
 *          consensus (DraftCore.marketRank: weighted Yahoo + Fantrax ADP),
 *          adjusted by damped edges:
 *          - last-season actuals gap (produced better/worse than market)
 *          - (role up/down is a displayed label only; it carries no value)
 *          - vacated usage, NETTED against every incoming arrival (a departure
 *            only opens usage if nobody better arrives to absorb it)
 *          - returning teammates (a star who missed much of last season is
 *            back, so teammates' inflated 2025-26 numbers are discounted)
 *          - playoff schedule for the user's selected 3-week window, vs the
 *            league average for that window
 *   valueAtPick = pick - V(x): positive = projects better than this slot.
 *
 * Verdicts: take | wait | pass | reach
 *   take  — best available value at this pick (or tied); won't survive
 *   wait  — acceptable value, but a more urgent better-value alternative
 *           won't survive to your next pick — take that one, he's fallback
 *   pass  — below value; names the better alternative with its value
 *   reach — below value but fills an acute positional need (mid+ draft only)
 *
 * Only season-out injuries are a hard pass; other INJ statuses stay eligible
 * with a sourced warning. A sourced earliest return (inj.retBy) discounts V
 * by the share of the regular season missed; out-indefinitely with no
 * timetable assumes about a third of the season.
 *
 * Globals used: PLAYERS, MOVES, VACATED_USAGE, window.DraftCore,
 * window.PlayoffData, window.PlayoffCore. Attach: window.PickSignals.
 */
(function (root) {
  "use strict";

  /* Consensus market rank: DraftCore's reliability-weighted Yahoo + Fantrax
     ADP blend, shared with the CPU drafters and the Consensus sort. */
  function consensus(p) {
    return root.DraftCore.marketRank(p);
  }

  /* Robust last-season actuals: median of totals-rank and per-game rank. */
  function actuals(p) {
    return root.DraftCore.historicalRank(p);
  }

  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
  function dampen(gap, cap, w) {
    return (gap < 0 ? -1 : gap > 0 ? 1 : 0) * Math.min(Math.abs(gap), cap) * w;
  }

  /* Net vacated-usage against incoming talent.
   * A departure only opens usage if the team doesn't import someone to absorb
   * it. Position-aware: "minutes" reasons need positional overlap; "usage"
   * reasons are absorbed by any high-usage arrival (consensus < 60).
   * The best absorbing arrival sets the base (+5 open / 0 wash / -5 loss);
   * every OTHER arrival good enough to absorb (consensus < departure + 10)
   * costs a further EXTRA_ARRIVAL, capped at VAC_FLOOR overall. Before this,
   * Maxey's net loss counted Jaylen Brown but not LeBron James.
   * Returns {gainerName: {v, note}}.
   */
  var EXTRA_ARRIVAL = -3, VAC_FLOOR = -10;
  function netVacated(players, moves, vacated) {
    var byName = {};
    players.forEach(function (p) { byName[p.n] = p; });
    var out = {};
    Object.keys(vacated || {}).forEach(function (dep) {
      var depP = byName[dep];
      if (!depP) return;
      var depCons = consensus(depP);
      (vacated[dep].vacatedGainers || []).forEach(function (g) {
        var gainer = byName[g.name];
        if (!gainer) return;
        var team = gainer.t;
        var gPos = gainer.p || [];
        var isMinutes = /minutes/i.test(g.reason || "");
        var arrivals = [];
        Object.keys(moves || {}).forEach(function (n) {
          if (n === g.name) return;
          var m = moves[n];
          if (m.teamCurr !== team || m.teamPrev === team || !byName[n]) return;
          var c = consensus(byName[n]);
          if (isMinutes) {
            var aPos = byName[n].p || [];
            var overlap = aPos.some(function (pp) { return gPos.indexOf(pp) >= 0; });
            if (!overlap) return;
          } else {
            if (c >= 60) return;
          }
          arrivals.push({ n: n, c: c });
        });
        arrivals.sort(function (a, b) { return a.c - b.c || (a.n < b.n ? -1 : 1); });
        var base = dep + " vacates (" + g.reason + ")";
        var best = arrivals[0];
        if (!best || best.c >= depCons + 10) {
          out[g.name] = { v: 5, note: base };
          return;
        }
        var extras = arrivals.slice(1).filter(function (a) { return a.c < depCons + 10; });
        var v = best.c < depCons - 10 ? -5 : 0;
        v = Math.max(VAC_FLOOR, v + EXTRA_ARRIVAL * extras.length);
        var who = [best.n].concat(extras.map(function (a) { return a.n; })).join(" and ");
        var many = extras.length > 0;
        out[g.name] = {
          v: v,
          note: base + (v < 0
            ? ", but " + who + (many ? " arrive" : " arrives") + " — net usage LOSS"
            : ", offset by " + who + " arrival — wash")
        };
      });
    });
    return out;
  }

  /* Returning teammates: a star who missed much of 2025-26 comes back and
   * takes usage from teammates whose numbers were built without him.
   * Detection is data-driven: per-game rank <= RET_PER_GAME but totals rank
   * at least RET_GAP worse (he missed games), still on the same team, not
   * INJ, and still a real usage absorber this season (consensus <= RET_MAX_CONS).
   * Only teammates who OUTPRODUCED their market last season are docked
   * (their actuals edge is what the star's absence inflated), and only those
   * who were on the team then (non-movers) with consensus <= 100.
   * RET_EDGE per returning star, capped at RET_FLOOR.
   * Returns {teammateName: {v, note}}.
   */
  var RET_PER_GAME = 60, RET_GAP = 40, RET_MAX_CONS = 60, RET_EDGE = -4, RET_FLOOR = -6;
  function returningTeammates(players, moves) {
    moves = moves || {};
    function moved(p) { return !!(moves[p.n] && moves[p.n].teamPrev && moves[p.n].teamPrev !== moves[p.n].teamCurr); }
    var stars = players.filter(function (s) {
      return !s.inj && s.last != null && s.lastTotal != null && s.last <= RET_PER_GAME &&
        s.lastTotal - s.last >= RET_GAP && consensus(s) <= RET_MAX_CONS && !moved(s);
    });
    var out = {};
    players.forEach(function (p) {
      if (p.inj || moved(p)) return;
      var c = consensus(p), a = actuals(p);
      if (c > 100 || a == null || a >= c) return;
      var back = stars.filter(function (s) { return s.t === p.t && s.n !== p.n; });
      if (!back.length) return;
      out[p.n] = {
        v: Math.max(RET_FLOOR, RET_EDGE * back.length),
        note: back.map(function (s) { return s.n; }).join(" and ") +
          " back (missed much of 2025-26) — last season's numbers came without " +
          (back.length > 1 ? "them" : "him")
      };
    });
    return out;
  }

  /* Playoff games for the user's selected 3-week window (default 20). */
  function playoffGamesFor(team, startWeek) {
    try {
      if (!root.PlayoffCore || !root.PlayoffData) return null;
      var v = root.PlayoffCore.counts(root.PlayoffData, team, startWeek || 20);
      return v ? root.PlayoffCore.total(v) : null;
    } catch (e) { return null; }
  }
  /* League-average playoff games for the window (~10.7 for weeks 20-22). */
  var _avgCache = {};
  function playoffAverage(startWeek) {
    var w = startWeek || 20;
    if (_avgCache[w] != null) return _avgCache[w];
    var data = root.PlayoffData, sum = 0, n = 0;
    if (!data || !data.teams) return 10;
    Object.keys(data.teams).forEach(function (t) {
      var g = playoffGamesFor(t, w);
      if (g != null) { sum += g; n++; }
    });
    return (_avgCache[w] = n ? sum / n : 10);
  }
  /* Each playoff game above/below the league average is worth PLAYOFF_W
     spots, capped at PLAYOFF_CAP games (so +/-6 at most). Was 0.8 per game
     against a fixed 10, which moved a 9-game team (CLE) by under one spot. */
  var PLAYOFF_W = 1.5, PLAYOFF_CAP = 4;

  /* True-value rank estimate.
   * ctx: {moves, netVac, returning, playoffStart, puntShift, puntLabel} — netVac from netVacated(),
   * returning from returningTeammates().
   */
  function trueValue(p, ctx) {
    ctx = ctx || {};
    var c = consensus(p);
    var edges = [];
    var edge = 0;

    // 1. Actuals edge: damped hard (cap 50, w 0.4) — last season is stale.
    var a = actuals(p);
    if (a != null && c <= 200) {
      var e = dampen(c - a, 50, 0.4);
      if (Math.abs(e) >= 1) {
        edge += e;
        edges.push({ k: "actuals", v: +e.toFixed(1), note: "produced #" + Math.round(a) + " last season vs market #" + Math.round(c) });
      }
    }

    // 2. Role arrows are a label only (market vs last-season rank): v 0, no edge.
    var mv = ctx.moves && ctx.moves[p.n];
    if (mv && mv.roleDelta === "up") edges.push({ k: "role", v: 0, note: "role up (" + (mv.roleNote || "ADP ahead of last rank") + ")" });
    else if (mv && mv.roleDelta === "down") edges.push({ k: "role", v: 0, note: "role down (" + (mv.roleNote || "ADP behind last rank") + ")" });

    // 3. Vacated usage (netted).
    var nv = ctx.netVac && ctx.netVac[p.n];
    if (nv && nv.v !== 0) {
      edge += nv.v;
      edges.push({ k: "vacated", v: nv.v, note: nv.note });
    }

    // 4. Returning teammate (star back from missed time).
    var rt = ctx.returning && ctx.returning[p.n];
    if (rt && rt.v !== 0) {
      edge += rt.v;
      edges.push({ k: "returning", v: rt.v, note: rt.note });
    }

    // 5. Playoff schedule vs the league average for the selected window.
    var pg = playoffGamesFor(p.t, ctx.playoffStart);
    if (pg != null) {
      var avg = playoffAverage(ctx.playoffStart);
      var pe = dampen(pg - avg, PLAYOFF_CAP, PLAYOFF_W);
      if (Math.abs(pe) >= 0.5) {
        edge += pe;
        edges.push({ k: "playoff", v: +pe.toFixed(1), note: pg + " games in your playoff window (league avg " + avg.toFixed(1) + ")" });
      }
    }

    // 6. Punt edge (committed punts only): spots gained under the punt among
    // available rated players. Cap 40 / w 0.5 — rank shifts are big and come
    // from stale category values, so keep it a nudge, not a rewrite of consensus.
    var ps = ctx.puntShift && ctx.puntShift[p.n];
    if (ps) {
      var pe2 = dampen(ps, 40, 0.5);
      if (Math.abs(pe2) >= 1) {
        edge += pe2;
        edges.push({ k: "punt", v: +pe2.toFixed(1), note: (ps > 0 ? "rises " : "drops ") + Math.abs(ps) + " spots punting " + (ctx.puntLabel || "your punts") });
      }
    }

    var V = clamp(Math.round(c - edge), 1, 320);

    // 7. Expected missed time. Applied after the market edges (and kept out
    // of edgeTotal) because it is not a nudge: a player who misses 65% of the
    // season is worth a fraction of his healthy rank. The market may already
    // have priced the injury in, so start from a healthy baseline (the better
    // of V and last season's actuals), scale it by availability, and only
    // ever move V down to that level, never compound a market discount.
    var miss = missedFraction(p.inj);
    if (miss > 0) {
      var healthy = a != null ? Math.min(V, a) : V;
      var hurt = clamp(Math.round(healthy / (1 - miss)), 1, 320);
      if (hurt > V) {
        edges.push({ k: "injury", v: V - hurt, note: "misses ~" + Math.round(miss * 100) + "% of the regular season (" +
          (p.inj.retBy ? "back ~" + p.inj.retBy + " at the earliest" : "out indefinitely, no timetable; assumed") + ")" });
        V = hurt;
      }
    }
    return { V: V, consensus: c, edges: edges, edgeTotal: +edge.toFixed(1) };
  }

  /* Share of the regular season an injured player misses, from inj.retBy
     (earliest sourced return, YYYY-MM-DD). No retBy = no sourced timeline:
     out-indefinitely assumes INDEFINITE_MISS (about two months), anything
     else gets no discount (the warning still shows). Capped below 1:
     season-out is its own status. */
  var SEASON_START = Date.UTC(2026, 9, 20), SEASON_END = Date.UTC(2027, 3, 11);
  var INDEFINITE_MISS = 0.33;
  function missedFraction(inj) {
    if (!inj) return 0;
    if (!inj.retBy) return inj.status === "out-indefinitely" ? INDEFINITE_MISS : 0;
    var r = Date.parse(inj.retBy + "T00:00:00Z");
    if (!isFinite(r)) return 0;
    return clamp((r - SEASON_START) / (SEASON_END - SEASON_START), 0, 0.9);
  }

  function isSeasonOut(p) { return !!(p.inj && p.inj.status === "season-out"); }
  /* Sourced warning for a non-season-out injury, quoting ret and src. */
  function injuryWarning(inj) {
    return "INJ " + (inj.status || "listed") + " — " + (inj.injury || "injured") +
      (inj.ret ? "; " + inj.ret : "") + (inj.src ? " (" + inj.src + ")" : "");
  }

  function vStr(v) { return (v >= 0 ? "+" : "") + v; }

  /* Positional need: does candidate fill an open starter slot? */
  function positionalNeed(p, openSlots) {
    if (!openSlots || !openSlots.length) return 0;
    var pos = p.p || [];
    var best = 0;
    openSlots.forEach(function (s) {
      if (s === "UTIL" || s === "BN") { best = Math.max(best, 0.4); return; }
      if (pos.indexOf(s) >= 0) best = Math.max(best, 2);
      else if (s === "G" && (pos.indexOf("PG") >= 0 || pos.indexOf("SG") >= 0)) best = Math.max(best, 1.5);
      else if (s === "F" && (pos.indexOf("SF") >= 0 || pos.indexOf("PF") >= 0)) best = Math.max(best, 1.5);
    });
    return best;
  }

  /* Is anyone available who shares a position with candidate and has better V? */
  function betterSamePosition(candidate, V, available, ctx) {
    return available.some(function (p) {
      if (isSeasonOut(p) || p.n === candidate.n) return false;
      var sharesPos = (p.p || []).some(function (pp) { return (candidate.p || []).indexOf(pp) >= 0; });
      return sharesPos && trueValue(p, ctx).V < V;
    });
  }

  /* Evaluate ONE candidate at THIS pick.
   * opts: {pick, nextPick, available (array of player objs), openSlots, ctx}
   * Returns {verdict, V, consensus, valueAtPick, reasons[], edges[], target}
   */
  function evaluate(candidate, opts) {
    var pick = opts.pick, nextPick = opts.nextPick;
    var available = opts.available || [];
    var openSlots = opts.openSlots || [];
    var ctx = opts.ctx || {};

    // Season-out injuries are a hard pass; other INJ statuses get a warning.
    if (isSeasonOut(candidate)) {
      return {
        verdict: "pass", V: 999, consensus: consensus(candidate), valueAtPick: -999,
        reasons: ["INJ — " + (candidate.inj.injury || "injured") + ", out for the season"],
        edges: [], target: null, alternative: null
      };
    }

    var tv = trueValue(candidate, ctx);
    var V = tv.V;
    var valueAtPick = pick - V;

    // Best available by true value (excluding season-out injuries).
    var best = null, bestV = Infinity;
    available.forEach(function (p) {
      if (isSeasonOut(p) || p.n === candidate.n) return;
      var pv = trueValue(p, ctx).V;
      if (pv < bestV) { bestV = pv; best = p; best._V = pv; }
    });
    var bestValueAtPick = best ? pick - bestV : -999;

    // A player out for a quarter of the season or more can't fill an open
    // starting slot now, so positional need never props him up (take/reach).
    var need = missedFraction(candidate.inj) >= 0.25 ? 0 : positionalNeed(candidate, openSlots);
    var verdict, reasons = [];

    var xIsBest = !best || V <= bestV + 1;

    if (xIsBest) {
      // Best (or tied) available: take, unless the market says he'll survive
      // to your next pick AND the runner-up is nearly as good but won't —
      // then take the runner-up now and come back for him. Survival is
      // market-based (ADP), never injury-adjusted V. Not in rounds 1-2.
      var survives = candidate.adp != null && candidate.adp >= nextPick + 8;
      var runnerUpGoes = best && best.adp != null && best.adp < nextPick - 2;
      if (survives && runnerUpGoes && bestValueAtPick >= valueAtPick - 4 && pick > 24) {
        verdict = "wait";
        reasons.push(vStr(valueAtPick) + " value at pick " + pick + " (our #" + V + ") — best available, but ADP " + Math.round(candidate.adp) + " says he survives to " + nextPick);
        reasons.push("take " + best.n + " now (" + vStr(bestValueAtPick) + " value, our #" + bestV + ", ADP " + Math.round(best.adp) + ") — he won't last; " + candidate.n + " should still be there at " + nextPick);
      } else {
        verdict = "take";
        reasons.push(vStr(valueAtPick) + " value at pick " + pick + " (our #" + V + ") — " +
          (Math.abs(valueAtPick) <= 2 ? "at market and best available" : valueAtPick > 0 ? "outperforms this slot" : "best available"));
        if (candidate.adp != null && candidate.adp < nextPick) {
          reasons.push("ADP " + Math.round(candidate.adp) + " — won't survive to your next pick (" + nextPick + ")");
        }
        if (need >= 1) reasons.push("fills an open starting slot");
      }
    } else {
      // Not the best. WAIT = acceptable value but a more urgent better-value
      // alternative won't survive — take that one, he's fallback.
      // In rounds 1-2 (pick <= 24): draft talent, not need. No need-based
      // take/reach — just take the best value.
      var bestStr = best.n + " (" + vStr(bestValueAtPick) + " value, our #" + bestV + ")";
      var bestUrgent = bestValueAtPick > valueAtPick + 6 && best.adp != null && best.adp < nextPick - 2;
      var earlyDraft = pick <= 24;
      if (valueAtPick >= -2 && bestUrgent && !earlyDraft) {
        verdict = "wait";
        reasons.push(vStr(valueAtPick) + " value — he's fine, but not this pick");
        reasons.push(bestStr + " won't survive to pick " + nextPick + " (ADP " + Math.round(best.adp) + ") — take " + best.n + " now, " + candidate.n + " is your fallback");
      } else if (valueAtPick >= -4 && need >= 1 && bestValueAtPick <= valueAtPick + 6 && !earlyDraft) {
        verdict = "take";
        reasons.push(vStr(valueAtPick) + " at pick " + pick + " (our #" + V + ") — fills an open starting slot");
        reasons.push("note: " + bestStr + " is close in value");
      } else if (valueAtPick < -4 && need >= 1 && !earlyDraft && !betterSamePosition(candidate, V, available, ctx)) {
        // Reach only when nobody better at his position is on the board.
        verdict = "reach";
        reasons.push(vStr(valueAtPick) + " below value at pick " + pick + " (our #" + V + ") — but fills an open " + (candidate.p || []).join("/") + " slot");
        reasons.push("no better " + (candidate.p || []).join("/") + " on the board; " + bestStr + " doesn't fill the need");
      } else {
        verdict = "pass";
        reasons.push(vStr(valueAtPick) + " below value at pick " + pick + " (our #" + V + " vs slot #" + pick + ")");
        reasons.push("better: " + bestStr);
      }
    }

    if (candidate.inj) reasons.push(injuryWarning(candidate.inj));

    // Target window: where should you draft him?
    // lastChance never precedes the target: if true value is worse than
    // market (V > ADP+4), the market takes him first — the window collapses
    // to "reach by V or lose him" instead of reading inverted.
    var target = {
      valueRank: V,
      marketRank: Math.round(tv.consensus),
      earliest: Math.max(1, V - 8),
      targetPick: V,
      lastChance: candidate.adp != null ? Math.max(Math.round(candidate.adp) + 4, V) : V + 12
    };

    return {
      verdict: verdict, V: V, consensus: tv.consensus,
      valueAtPick: valueAtPick, reasons: reasons, edges: tv.edges, target: target,
      // Best other available player by true value (what the reasons name as
      // "better:" / "take X now"). Lets the UI link to him and judge how
      // close the call is without parsing reason strings.
      alternative: best ? { n: best.n, V: bestV, valueAtPick: bestValueAtPick } : null
    };
  }

  root.PickSignals = {
    consensus: consensus,
    actuals: actuals,
    netVacated: netVacated,
    returningTeammates: returningTeammates,
    playoffAverage: playoffAverage,
    trueValue: trueValue,
    missedFraction: missedFraction,
    positionalNeed: positionalNeed,
    evaluate: evaluate
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
