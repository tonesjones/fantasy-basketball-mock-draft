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
 * Only season-out injuries are a hard pass; other INJ statuses stay eligible
 * with a sourced warning. A sourced earliest return (inj.retBy) discounts V
 * by the share of the regular season missed.
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
   * ctx: {moves, netVac, playoffStart, puntShift, puntLabel} — netVac from netVacated().
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

    // 4. Playoff schedule: more games = more value. Avg ~10 games.
    var pg = playoffGamesFor(p.t, ctx.playoffStart);
    if (pg != null) {
      var pe = dampen(pg - 10, 4, 0.8);
      if (Math.abs(pe) >= 0.5) {
        edge += pe;
        edges.push({ k: "playoff", v: +pe.toFixed(1), note: pg + " games in your playoff window" });
      }
    }

    // 5. Punt edge (committed punts only): spots gained under the punt among
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
        edges.push({ k: "injury", v: V - hurt, note: "misses ~" + Math.round(miss * 100) + "% of the regular season (back ~" + p.inj.retBy + " at the earliest)" });
        V = hurt;
      }
    }
    return { V: V, consensus: c, edges: edges, edgeTotal: +edge.toFixed(1) };
  }

  /* Share of the regular season an injured player misses, from inj.retBy
     (earliest sourced return, YYYY-MM-DD). No retBy = no sourced timeline,
     so no discount (the warning still shows). Capped below 1: season-out is
     its own status. */
  var SEASON_START = Date.UTC(2026, 9, 20), SEASON_END = Date.UTC(2027, 3, 11);
  function missedFraction(inj) {
    if (!inj || !inj.retBy) return 0;
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
    trueValue: trueValue,
    missedFraction: missedFraction,
    positionalNeed: positionalNeed,
    evaluate: evaluate
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
