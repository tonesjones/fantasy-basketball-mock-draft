/* pick-signals.js — deterministic pick-value signal engine (browser).
 *
 * Computes draft pick value from market data + curated signals, WITHOUT
 * asking Jev to guess. Jev (via /api/pick-quality) receives these signals
 * and explains them — it does not choose verdicts via confidence thresholds.
 *
 * Core model:
 *   V(x) = true-value rank estimate (lower = better). Anchored on market
 *          consensus (Yahoo + Fantrax ADP), adjusted by damped edges:
 *          - last-season actuals gap (produced better/worse than market)
 *          - role up/down (movers-outlook heuristic)
 *          - vacated usage, NETTED against incoming talent (a departure only
 *            opens usage if nobody better arrives to absorb it)
 *          - playoff schedule for the user's selected 3-week window
 *   valueAtPick = pick - V(x): positive = projects better than this slot.
 *
 * Verdicts: take | wait | pass | reach
 *   take  — best available value at this pick (or tied); won't survive
 *   wait  — acceptable value, but a more urgent better-value alternative
 *           won't survive to your next pick — take that one, he's fallback
 *   pass  — below value; names the better alternative with its value
 *   reach — below value but fills an acute positional need (mid+ draft only)
 *
 * INJ-tagged players are a hard pass.
 *
 * Globals used: PLAYERS, MOVES, VACATED_USAGE, window.PlayoffData,
 * window.PlayoffCore. Attach: window.PickSignals.
 */
(function (root) {
  "use strict";

  function consensus(p) {
    var a = p.adp, f = p.adpF;
    if (a != null && f != null) return (a + f) / 2;
    if (a != null) return a;
    if (f != null) return f;
    return p.r;
  }

  /* Robust last-season actuals: median of totals-rank and per-game rank. */
  function actuals(p) {
    var v = [];
    if (p.lastTotal != null && isFinite(p.lastTotal) && p.lastTotal <= 320) v.push(p.lastTotal);
    if (p.last != null && isFinite(p.last) && p.last <= 320) v.push(p.last);
    if (!v.length) return null;
    v.sort(function (a, b) { return a - b; });
    return v.length % 2 ? v[(v.length - 1) / 2] : (v[0] + v[1]) / 2;
  }

  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
  function dampen(gap, cap, w) {
    return (gap < 0 ? -1 : gap > 0 ? 1 : 0) * Math.min(Math.abs(gap), cap) * w;
  }

  /* Net vacated-usage against incoming talent.
   * A departure only opens usage if the team doesn't import someone to absorb
   * it. Position-aware: "minutes" reasons need positional overlap; "usage"
   * reasons are absorbed by any high-usage arrival (consensus < 60).
   * Returns {gainerName: {v: +5|0|-5, note}}.
   */
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
        var bestArr = null, bestArrCons = Infinity;
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
          if (c < bestArrCons) { bestArrCons = c; bestArr = n; }
        });
        var base = dep + " vacates (" + g.reason + ")";
        if (bestArr == null) {
          out[g.name] = { v: 5, note: base };
        } else if (bestArrCons < depCons - 10) {
          out[g.name] = { v: -5, note: base + ", but " + bestArr + " arrives — net usage LOSS" };
        } else if (bestArrCons < depCons + 10) {
          out[g.name] = { v: 0, note: base + ", offset by " + bestArr + " arrival — wash" };
        } else {
          out[g.name] = { v: 5, note: base };
        }
      });
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

  /* True-value rank estimate.
   * ctx: {moves, netVac, playoffStart} — netVac from netVacated().
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

    // 2. Role edge from movers-outlook.
    var mv = ctx.moves && ctx.moves[p.n];
    if (mv && mv.roleDelta === "up") { edge += 6; edges.push({ k: "role", v: 6, note: "role up (" + (mv.roleNote || "ADP ahead of last rank") + ")" }); }
    else if (mv && mv.roleDelta === "down") { edge -= 6; edges.push({ k: "role", v: -6, note: "role down (" + (mv.roleNote || "ADP behind last rank") + ")" }); }

    // 3. Vacated usage (netted).
    var nv = ctx.netVac && ctx.netVac[p.n];
    if (nv && nv.v !== 0) {
      edge += nv.v;
      edges.push({ k: "vacated", v: nv.v, note: nv.note });
    }

    // 4. Playoff schedule: more games = more value. Avg ~10 games.
    var pg = playoffGamesFor(p.t, ctx.playoffStart);
    if (pg != null) {
      var pe = dampen(pg - 10, 4, 0.8);
      if (Math.abs(pe) >= 0.5) {
        edge += pe;
        edges.push({ k: "playoff", v: +pe.toFixed(1), note: pg + " games in your playoff window" });
      }
    }

    var V = clamp(Math.round(c - edge), 1, 320);
    return { V: V, consensus: c, edges: edges, edgeTotal: +edge.toFixed(1) };
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

  /* Evaluate ONE candidate at THIS pick.
   * opts: {pick, nextPick, available (array of player objs), openSlots, ctx}
   * Returns {verdict, V, consensus, valueAtPick, reasons[], edges[], target}
   */
  function evaluate(candidate, opts) {
    var pick = opts.pick, nextPick = opts.nextPick;
    var available = opts.available || [];
    var openSlots = opts.openSlots || [];
    var ctx = opts.ctx || {};

    // INJ hard pass.
    if (candidate.inj) {
      return {
        verdict: "pass", V: 999, consensus: consensus(candidate), valueAtPick: -999,
        reasons: ["INJ — " + (candidate.inj.injury || "injured") + ", out for the season"],
        edges: [], target: null
      };
    }

    var tv = trueValue(candidate, ctx);
    var V = tv.V;
    var valueAtPick = pick - V;

    // Best available by true value (excluding injured).
    var best = null, bestV = Infinity;
    available.forEach(function (p) {
      if (p.inj || p.n === candidate.n) return;
      var pv = trueValue(p, ctx).V;
      if (pv < bestV) { bestV = pv; best = p; best._V = pv; }
    });
    var bestValueAtPick = best ? pick - bestV : -999;

    var need = positionalNeed(candidate, openSlots);
    var verdict, reasons = [];

    var xIsBest = !best || V <= bestV + 1;

    if (xIsBest) {
      // Best (or tied) available: take unless the market says he'll survive
      // AND a later pick is nearly as good — but survival is rare (market is
      // efficient vs our edges), so default to take.
      var survives = candidate.adp != null && candidate.adp >= nextPick + 8;
      if (survives && bestValueAtPick > valueAtPick + 4) {
        verdict = "wait";
        reasons.push(vStr(valueAtPick) + " value at pick " + pick + " (our #" + V + ") — but ADP " + Math.round(candidate.adp) + " says he survives to " + nextPick);
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
      } else if (valueAtPick < -4 && need >= 1 && !earlyDraft) {
        verdict = "reach";
        var alt = null, altV = Infinity;
        available.forEach(function (p) {
          if (p.inj || p.n === candidate.n) return;
          var sharesPos = (p.p || []).some(function (pp) { return (candidate.p || []).indexOf(pp) >= 0; });
          if (!sharesPos) return;
          var pv = trueValue(p, ctx).V;
          if (pv < altV) { altV = pv; alt = p; }
        });
        reasons.push(vStr(valueAtPick) + " below value at pick " + pick + " (our #" + V + ") — but fills an open " + (candidate.p || []).join("/") + " slot");
        if (alt) reasons.push("no better " + (candidate.p || []).join("/") + " alternative on the board; " + bestStr + " doesn't fill the need");
        else reasons.push("no positional alternative available; " + bestStr + " doesn't fill the need");
      } else {
        verdict = "pass";
        reasons.push(vStr(valueAtPick) + " below value at pick " + pick + " (our #" + V + " vs slot #" + pick + ")");
        reasons.push("better: " + bestStr);
      }
    }

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
      valueAtPick: valueAtPick, reasons: reasons, edges: tv.edges, target: target
    };
  }

  root.PickSignals = {
    consensus: consensus,
    actuals: actuals,
    netVacated: netVacated,
    trueValue: trueValue,
    positionalNeed: positionalNeed,
    evaluate: evaluate
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
