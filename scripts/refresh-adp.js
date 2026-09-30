#!/usr/bin/env node
/* ADP refresh: diff a saved copy of Hashtag Basketball's fantasy ADP table
   (https://hashtagbasketball.com/fantasy-basketball-adp) against the bundled
   data, and optionally write the new Yahoo / Fantrax ADPs into player-data.js.

   Input: a CSV with a header row. Columns are matched case-insensitively:
     name     "name" | "player"                       (required)
     Yahoo    "yahoo" | "yahoo adp" | "adp"           (required)
     Fantrax  "fantrax" | "fantrax adp" | "adpf"      (optional)
     team     "team", position "pos" | "position"     (optional; reported only)
   Blank cells mean "no ADP published". ESPN ADP is never used (standing
   rule), and neither is any blend that includes it. Make the CSV from the
   saved page with scripts/hashtag-adp-to-csv.js.

   Usage:
     node scripts/refresh-adp.js table.csv            report only
     node scripts/refresh-adp.js table.csv --apply    also rewrite adp/adpF

   Conventions (docs/adp-refresh-2026-09-14.md): a pool player missing from
   the table keeps his old values (flagged); a player in the table with a
   blank cell gets null. Team / position changes are reported, never written.
   After --apply: node scripts/rebuild-rank.js, bump DATA_VERSION in app.js,
   update the "updated <date>" stamps, and commit the CSV under
   scripts/data-provenance/<date>-adp-refresh/. */
"use strict";
var fs = require("fs"),
  path = require("path");
var core = require("../draft-core");
var load = require("./load-data");

/* Hashtag display names -> canonical pool names. Diacritics are handled by
   normalize(); these are real spelling differences. */
var ALIASES = {
  "Alexandre Sarr": "Alex Sarr",
  "Nicolas Claxton": "Nic Claxton",
  "Jimmy Butler III": "Jimmy Butler",
  "Cameron Johnson": "Cam Johnson",
  "Ron Holland II": "Ron Holland",
  "GG Jackson II": "GG Jackson",
  "Bobby Portis Jr.": "Bobby Portis",
};
var TEAM_ALIASES = { GSW: "GS", NOP: "NO", NYK: "NY", PHX: "PHO", SAS: "SA", WSH: "WAS", UTAH: "UTA", BRK: "BKN" };
var MATERIAL = 3;

function normalize(name) {
  return String(name)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[.'’]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function parseCsv(text) {
  var rows = [],
    row = [],
    cell = "",
    q = false;
  for (var i = 0; i < text.length; i++) {
    var ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") row.push(cell), (cell = "");
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell), rows.push(row), (row = []), (cell = "");
    } else cell += ch;
  }
  if (cell || row.length) row.push(cell), rows.push(row);
  return rows.filter(function (r) {
    return r.some(function (c) {
      return c.trim();
    });
  });
}

function column(header, names) {
  for (var i = 0; i < header.length; i++)
    if (names.indexOf(header[i].trim().toLowerCase()) >= 0) return i;
  return -1;
}

function num(cell) {
  if (cell == null || !String(cell).trim()) return null;
  var v = Number(String(cell).trim());
  if (!isFinite(v) || v <= 0) throw new Error("Not an ADP value: " + JSON.stringify(cell));
  return v;
}

/* Returns [{name (table), yahoo, fantrax|undefined, team, pos}]. */
function readTable(text) {
  var rows = parseCsv(text),
    header = rows.shift() || [];
  var cName = column(header, ["name", "player"]),
    cY = column(header, ["yahoo", "yahoo adp", "adp"]),
    cF = column(header, ["fantrax", "fantrax adp", "adpf"]),
    cT = column(header, ["team"]),
    cP = column(header, ["pos", "position"]);
  if (cName < 0 || cY < 0) throw new Error("CSV needs a name column and a Yahoo ADP column");
  return rows.map(function (r) {
    return {
      name: r[cName].trim(),
      yahoo: num(r[cY]),
      fantrax: cF < 0 ? undefined : num(r[cF]),
      team: cT < 0 ? null : r[cT].trim(),
      pos: cP < 0 ? null : r[cP].trim(),
    };
  });
}

function diff(table, players) {
  var byKey = {};
  players.forEach(function (p) {
    byKey[normalize(p.n)] = p;
  });
  var seen = {},
    out = { matched: 0, changes: [], unmatched: [], absent: [], teamPos: [], hasFantrax: false };
  table.forEach(function (row) {
    var p = byKey[normalize(ALIASES[row.name] || row.name)];
    if (!p) {
      if (row.yahoo != null) out.unmatched.push(row);
      return;
    }
    if (seen[p.n]) throw new Error("Two table rows match " + p.n);
    seen[p.n] = true;
    out.matched++;
    var next = { adp: row.yahoo, adpF: row.fantrax === undefined ? p.adpF : row.fantrax };
    if (row.fantrax !== undefined) out.hasFantrax = true;
    ["adp", "adpF"].forEach(function (field) {
      if (p[field] !== next[field])
        out.changes.push({
          name: p.n,
          field: field,
          from: p[field],
          to: next[field],
          consFrom: core.marketRank(p),
          consTo: core.marketRank({ adp: next.adp, adpF: next.adpF, last: p.last, lastTotal: p.lastTotal }),
        });
    });
    var team = row.team && (TEAM_ALIASES[row.team.toUpperCase()] || row.team.toUpperCase());
    var pos = row.pos && row.pos.split(/[\s,/]+/).filter(Boolean).sort().join("/");
    var have = p.p.slice().sort().join("/");
    if ((team && team !== p.t) || (pos && pos !== have))
      out.teamPos.push({ name: p.n, team: [p.t, team || p.t], pos: [have, pos || have] });
  });
  players.forEach(function (p) {
    if (!seen[p.n]) out.absent.push(p.n);
  });
  return out;
}

function fmt(v) {
  return v == null ? "null" : String(v);
}

function report(d) {
  var lines = [];
  var moves = d.changes.filter(function (c) {
    return c.from != null && c.to != null && Math.abs(c.to - c.from) >= MATERIAL;
  });
  var gained = d.changes.filter(function (c) {
    return c.from == null;
  });
  var lost = d.changes.filter(function (c) {
    return c.to == null;
  });
  lines.push("Matched pool players: " + d.matched + (d.hasFantrax ? "" : " (no Fantrax column: adpF untouched)"));
  lines.push("Value changes: " + d.changes.length + " (" + moves.length + " moved >= " + MATERIAL + ")");
  moves
    .sort(function (a, b) {
      return Math.abs(b.to - b.from) - Math.abs(a.to - a.from);
    })
    .forEach(function (c) {
      lines.push(
        "  " + c.name + " " + c.field + " " + c.from + " -> " + c.to +
          " (consensus " + c.consFrom.toFixed(1) + " -> " + c.consTo.toFixed(1) + ")"
      );
    });
  lines.push("Newly published: " + gained.length);
  gained.forEach(function (c) {
    lines.push("  " + c.name + " " + c.field + " null -> " + c.to);
  });
  lines.push("Now blank (will be nulled): " + lost.length);
  lost.forEach(function (c) {
    lines.push("  " + c.name + " " + c.field + " " + c.from + " -> null");
  });
  lines.push("Pool players absent from the table (values kept): " + d.absent.length);
  if (d.absent.length) lines.push("  " + d.absent.join(", "));
  lines.push("Table players with a Yahoo ADP not in the pool (add candidates): " + d.unmatched.length);
  d.unmatched.forEach(function (r) {
    lines.push("  " + r.name + " " + (r.team || "") + " Yahoo " + r.yahoo + " Fantrax " + fmt(r.fantrax));
  });
  lines.push("Team / position differences (not written; review by hand): " + d.teamPos.length);
  d.teamPos.forEach(function (x) {
    lines.push("  " + x.name + ": team " + x.team.join(" -> ") + ", pos " + x.pos.join(" -> "));
  });
  return lines.join("\n");
}

/* Rewrites adp / adpF values inside the PDATA block only (INJ reuses names). */
function apply(src, changes) {
  var cut = src.indexOf("var INJ=");
  var head = cut < 0 ? src : src.slice(0, cut),
    tail = cut < 0 ? "" : src.slice(cut);
  changes.forEach(function (c) {
    var esc = c.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    var re = new RegExp('^("' + esc + '":\\{(?:[^\\n]*?,)?' + c.field + ":)(null|[\\d.]+)", "m");
    if (!re.test(head)) throw new Error("No " + c.field + " field for " + c.name + " in PDATA");
    head = head.replace(re, "$1" + fmt(c.to));
  });
  return head + tail;
}

if (require.main === module) {
  var file = process.argv[2];
  if (!file || file.indexOf("--") === 0) {
    console.error("usage: node scripts/refresh-adp.js <table.csv> [--apply]");
    process.exit(2);
  }
  var d = diff(readTable(fs.readFileSync(file, "utf8")), Array.from(load.loadData().PLAYERS));
  console.log(report(d));
  if (process.argv.indexOf("--apply") >= 0) {
    var target = path.join(load.ROOT, "player-data.js");
    fs.writeFileSync(target, apply(fs.readFileSync(target, "utf8"), d.changes));
    console.log(
      "\nWrote " + d.changes.length + " values to player-data.js. Next: node scripts/rebuild-rank.js, " +
        "bump DATA_VERSION in app.js, update the 'updated <date>' stamps, commit the CSV as provenance."
    );
  }
}

module.exports = { normalize: normalize, parseCsv: parseCsv, readTable: readTable, diff: diff, report: report, apply: apply };
