(function (root, factory) {
  var core =
    (root && root.DraftCore) ||
    (typeof module !== "undefined" && module.exports ? require("./draft-core") : null);
  var api = factory(core);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.PuntCore = api;
})(typeof window !== "undefined" ? window : null, function (core) {
  "use strict";
  var CATS = ["PTS", "REB", "AST", "STL", "BLK", "3PM", "FG%", "FT%", "TO"];
  /* Up to three punts: at three you must still win 5 of the remaining 6
     categories each week, so more than that stops being a strategy. */
  var MAX_PUNTS = 3;
  /* Any of the nine categories can be punted. TO values are stored inverted
     (positive = fewer turnovers), so punting TO simply drops that term and
     lifts high-usage players who turn the ball over. */
  function valid(cat) {
    return CATS.indexOf(cat) >= 0;
  }
  /* Accepts one category or a list. Returns the unique valid categories in
     CATS order, or [] when the input is invalid or has more than MAX_PUNTS. */
  function normalize(cats) {
    if (cats == null || cats === "") return [];
    var list = Array.isArray(cats) ? cats : [cats];
    var seen = {};
    for (var i = 0; i < list.length; i++) {
      if (!valid(list[i])) return [];
      seen[list[i]] = true;
    }
    var out = CATS.filter(function (c) {
      return seen[c];
    });
    return out.length <= MAX_PUNTS ? out : [];
  }
  function label(cats) {
    return normalize(cats).join(" + ");
  }
  function rankings(players, pdata, taken, cats) {
    var set = normalize(cats);
    if (!set.length) return [];
    var omit = set.map(function (c) {
        return CATS.indexOf(c);
      }),
      rows = [];
    players.forEach(function (p, pi) {
      if (taken[pi]) return;
      var cv = pdata[p.n] && pdata[p.n].cv;
      if (!Array.isArray(cv) || cv.length !== 9 || !cv.every(Number.isFinite)) return;
      var base = cv.reduce(function (a, b) {
        return a + b;
      }, 0);
      var punt = base;
      omit.forEach(function (ci) {
        punt -= cv[ci];
      });
      rows.push({ pi: pi, base: base, punt: punt, gain: 0 });
    });
    rows.sort(function (a, b) {
      return b.base - a.base || a.pi - b.pi;
    });
    rows.forEach(function (row, i) {
      row.baseRank = i + 1;
    });
    rows.sort(function (a, b) {
      return b.punt - a.punt || a.pi - b.pi;
    });
    rows.forEach(function (row, i) {
      row.puntRank = i + 1;
      row.gain = row.baseRank - row.puntRank;
    });
    return rows;
  }
  function nearTermRisers(rows, players, pick, followingPick) {
    if (pick < 0) return [];
    var cutoff = pick + 1 + (followingPick > pick ? Math.floor((followingPick - pick) / 2) : 0);
    return rows
      .filter(function (r) {
        var market = marketAdp(players[r.pi]);
        return r.gain > 0 && r.puntRank <= 50 && market != null && market <= cutoff;
      })
      .sort(function (a, b) {
        return a.puntRank - b.puntRank;
      });
  }
  function marketAdp(p) {
    return core.marketAdp(p);
  }
  function laterRisers(rows, players, pick, followingPick) {
    if (pick < 0 || followingPick < 0) return [];
    var cutoff = pick + 1 + Math.floor((followingPick - pick) / 2),
      end = followingPick + 1 + 12;
    return rows
      .filter(function (r) {
        var market = marketAdp(players[r.pi]);
        return r.gain > 0 && r.puntRank <= 50 && market != null && market > cutoff && market <= end;
      })
      .sort(function (a, b) {
        return marketAdp(players[a.pi]) - marketAdp(players[b.pi]) || a.puntRank - b.puntRank;
      });
  }
  function groupRisers(rows, players, perGroup) {
    var groups = { guards: [], frontcourt: [], wings: [] };
    rows.forEach(function (row) {
      var positions = players[row.pi].p;
      var group =
        positions.indexOf("PF") >= 0 || positions.indexOf("C") >= 0
          ? "frontcourt"
          : positions.indexOf("PG") >= 0 || positions.indexOf("SG") >= 0
            ? "guards"
            : "wings";
      if (groups[group].length < perGroup) groups[group].push(row);
    });
    return groups;
  }
  /* Suggest the next category to punt. `committed` (optional) is the punt set
     already chosen: those categories are skipped and near-term risers are
     measured for the combined set. Returns the best choice plus `also`, the
     other qualifying categories, or null when nothing qualifies or the punt
     set is already full. */
  function suggest(teams, userTeam, players, pdata, taken, nextPick, followingPick, committed) {
    var have = normalize(committed);
    if (have.length >= MAX_PUNTS) return null;
    var me = teams.filter(function (t) {
      return t.team === userTeam;
    })[0];
    if (!me || me.rated < 2 || me.rated + me.unrated < 3 || nextPick < 0) return null;
    var peers = teams.filter(function (t) {
      return t.team !== userTeam && t.rated >= 2;
    });
    if (peers.length < 3) return null;
    var choices = [];
    CATS.forEach(function (cat, ci) {
      if (have.indexOf(cat) >= 0) return;
      var mine = me.cats[ci] / me.rated;
      var below = peers.filter(function (t) {
        return t.cats[ci] / t.rated > mine;
      }).length;
      if (below <= peers.length / 2) return;
      var rows = rankings(players, pdata, taken, have.concat([cat]));
      var useful = nearTermRisers(rows, players, nextPick, followingPick);
      choices.push({
        cat: cat,
        below: below,
        peers: peers.length,
        risers: useful.length,
        missing: me.unrated,
      });
    });
    choices.sort(function (a, b) {
      return b.below - a.below || b.risers - a.risers || CATS.indexOf(a.cat) - CATS.indexOf(b.cat);
    });
    if (!choices.length) return null;
    var best = choices[0];
    best.also = choices.slice(1).map(function (c) {
      return c.cat;
    });
    return best;
  }
  return {
    CATS: CATS,
    MAX_PUNTS: MAX_PUNTS,
    valid: valid,
    normalize: normalize,
    label: label,
    rankings: rankings,
    nearTermRisers: nearTermRisers,
    laterRisers: laterRisers,
    groupRisers: groupRisers,
    suggest: suggest,
  };
});
