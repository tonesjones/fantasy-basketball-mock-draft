/* Draft engine shared by the browser app and Node tests. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.DraftCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  function teamForPick(index, teams) {
    var round = Math.floor(index / teams),
      within = index % teams;
    return round % 2 === 0 ? within : teams - 1 - within;
  }
  function validPlayerIndex(players, log, index) {
    return (
      Number.isInteger(index) && index >= 0 && index < players.length && log.indexOf(index) < 0
    );
  }
  function availableIndexes(players, log) {
    var used = {};
    log.forEach(function (i) {
      used[i] = true;
    });
    return players
      .map(function (_, i) {
        return i;
      })
      .filter(function (i) {
        return !used[i];
      });
  }
  function slotOK(slot, positions) {
    if (slot === "BN" || slot === "Util") return true;
    if (slot === "G") return positions.indexOf("PG") >= 0 || positions.indexOf("SG") >= 0;
    if (slot === "F") return positions.indexOf("SF") >= 0 || positions.indexOf("PF") >= 0;
    return positions.indexOf(slot) >= 0;
  }
  function slotWeight(slot) {
    return slot === "BN" ? 4 : slot === "Util" ? 3 : slot === "G" || slot === "F" ? 2 : 1;
  }
  /* Augmenting-path matching assigns every eligible player once, and reassigns
     earlier players when a later, less-flexible player needs their slot. */
  function assignRoster(playerEntries, slots) {
    var filled = slots.map(function (slot) {
      return { slot: slot, player: null };
    });
    var ordered = playerEntries.slice().sort(function (a, b) {
      function choices(entry) {
        return slots.filter(function (slot) {
          return slotOK(slot, entry.player.p);
        }).length;
      }
      return choices(a) - choices(b);
    });
    function tryPlace(entry, seen) {
      var candidates = [];
      for (var i = 0; i < filled.length; i++)
        if (slotOK(filled[i].slot, entry.player.p)) candidates.push(i);
      candidates.sort(function (a, b) {
        return slotWeight(filled[a].slot) - slotWeight(filled[b].slot);
      });
      for (var j = 0; j < candidates.length; j++) {
        var si = candidates[j];
        if (seen[si]) continue;
        seen[si] = true;
        if (!filled[si].player || tryPlace(filled[si].player, seen)) {
          filled[si].player = entry;
          return true;
        }
      }
      return false;
    }
    var overflow = [];
    ordered.forEach(function (entry) {
      if (!tryPlace(entry, {})) overflow.push(entry);
    });
    return { slots: filled, overflow: overflow };
  }
  function slotsForRounds(rounds, baseSlots) {
    var slots = baseSlots.slice();
    while (slots.length < rounds) slots.push("BN");
    return slots;
  }
  function teamEntries(players, log, team, teams) {
    var out = [];
    log.forEach(function (pi, index) {
      if (teamForPick(index, teams) === team)
        out.push({ player: players[pi], pi: pi, index: index });
    });
    return out;
  }
  function positionalNeed(entries, candidate, slots) {
    var before = assignRoster(entries, slots).slots.filter(function (x) {
      return x.player && x.slot !== "BN" && x.slot !== "Util";
    }).length;
    var after = assignRoster(
      entries.concat([{ player: candidate, pi: -1, index: -1 }]),
      slots
    ).slots.filter(function (x) {
      return x.player && x.slot !== "BN" && x.slot !== "Util";
    }).length;
    return after - before;
  }
  /* Consensus market ADP: a reliability-weighted blend of Yahoo and Fantrax
     ADP, the only two market sources. The platforms agree closely through
     about pick 100, then each saturates: Yahoo's published list stops near
     125 with ~80 players bunched from 100 up, and Fantrax's rarely-drafted
     tail piles up between 200 and 244. A value inside a platform's saturated
     band comes from few drafts and mostly means "late or undrafted", so its
     weight fades from 1 to 0.25 across the band, and the Fantrax tail is
     compressed (200 + excess / 4) instead of read as a literal pick. Where
     both values are in their reliable range this is the plain mean.
     Returns null when neither platform lists the player. */
  var ADP_BANDS = { adp: [100, 125], adpF: [150, 200] },
    ADP_MIN_WEIGHT = 0.25,
    ADP_TAIL = 200;
  function adpWeight(value, band) {
    if (value <= band[0]) return 1;
    if (value >= band[1]) return ADP_MIN_WEIGHT;
    return 1 - ((1 - ADP_MIN_WEIGHT) * (value - band[0])) / (band[1] - band[0]);
  }
  function marketAdp(player) {
    var a = player.adp,
      f = player.adpF,
      sum = 0,
      weight = 0,
      w;
    if (a != null && isFinite(a)) {
      w = adpWeight(a, ADP_BANDS.adp);
      sum += a * w;
      weight += w;
    }
    if (f != null && isFinite(f)) {
      w = adpWeight(f, ADP_BANDS.adpF);
      sum += (f > ADP_TAIL ? ADP_TAIL + (f - ADP_TAIL) / 4 : f) * w;
      weight += w;
    }
    return weight ? sum / weight : null;
  }
  /* Median of the 2025-26 totals rank and per-game rank, or null. */
  function lastSeasonRank(player) {
    var vals = [];
    if (player.lastTotal != null && isFinite(player.lastTotal)) vals.push(player.lastTotal);
    if (player.last != null && isFinite(player.last)) vals.push(player.last);
    if (!vals.length) return null;
    return vals.length === 1 ? vals[0] : (vals[0] + vals[1]) / 2;
  }
  /* CPU draft-market estimate and the app's consensus rank. Players neither
     platform lists sort after every listed player (the blend tops out near
     211), ordered by last-season rank; no 2025-26 data at all sorts last. */
  var UNLISTED_BASE = 212;
  function marketRank(player) {
    var m = marketAdp(player);
    if (m != null) return m;
    var last = lastSeasonRank(player);
    return UNLISTED_BASE + (last == null ? 40 : Math.min(last, 400) / 10);
  }
  function filledStarters(entries, slots) {
    return assignRoster(entries, slots).slots.filter(function (x) {
      return x.player && x.slot !== "BN" && x.slot !== "Util";
    }).length;
  }
  /* Noise half-width for a player's market position: +/-20% of market, at
     least +/-1.5 picks. Over 60 seeded 12-team drafts this leaves a player's
     draft slot varying by ~1 pick (SD) in round 1, ~2 in rounds 2-3, ~4 in
     rounds 4-6 and ~5-6 in rounds 7-9; the old fixed +/-2..8 window gave
     ~1.5-2.3 through round 9, far tighter than real rooms. */
  var NOISE_SHARE = 0.2,
    NOISE_MIN = 1.5,
    NEED_BONUS = 3;
  function noiseSpread(market) {
    return Math.max(NOISE_MIN, NOISE_SHARE * market);
  }
  function cpuPickIndex(opts) {
    var players = opts.players,
      log = opts.log,
      teams = opts.teams,
      team = teamForPick(log.length, teams),
      slots = opts.slots;
    var entries = teamEntries(players, log, team, teams),
      random = opts.random || Math.random,
      starters = filledStarters(entries, slots);
    /* Score = market + centered noise - NEED_BONUS if the player fills an open
       starting slot; lowest wins. Candidates are scanned in market order, and
       the scan stops once even a best-case draw can't beat the leader
       (market - spread - bonus only grows with market). */
    var candidates = availableIndexes(players, log)
      .map(function (i) {
        return { i: i, market: marketRank(players[i]) };
      })
      .sort(function (a, b) {
        return a.market - b.market || a.i - b.i;
      });
    var best = -1,
      bestScore = Infinity;
    for (var k = 0; k < candidates.length; k++) {
      var c = candidates[k],
        spread = noiseSpread(c.market);
      if (c.market - spread - NEED_BONUS >= bestScore) break;
      var fills =
        filledStarters(entries.concat([{ player: players[c.i], pi: -1, index: -1 }]), slots) >
        starters;
      var score = c.market + (random() * 2 - 1) * spread - (fills ? NEED_BONUS : 0);
      if (score < bestScore) {
        bestScore = score;
        best = c.i;
      }
    }
    return best;
  }
  function seededRandom(seed) {
    var state = seed >>> 0 || 1;
    return {
      next: function () {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        return (state >>> 0) / 4294967296;
      },
      getState: function () {
        return state >>> 0;
      },
    };
  }
  return {
    teamForPick: teamForPick,
    validPlayerIndex: validPlayerIndex,
    availableIndexes: availableIndexes,
    slotOK: slotOK,
    assignRoster: assignRoster,
    slotsForRounds: slotsForRounds,
    teamEntries: teamEntries,
    positionalNeed: positionalNeed,
    cpuPickIndex: cpuPickIndex,
    marketAdp: marketAdp,
    marketRank: marketRank,
    lastSeasonRank: lastSeasonRank,
    seededRandom: seededRandom,
  };
});
