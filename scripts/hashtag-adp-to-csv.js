#!/usr/bin/env node
/* Converts a saved copy of Hashtag Basketball's fantasy ADP page into the CSV
   that scripts/refresh-adp.js reads (name,team,pos,yahoo,fantrax).

     curl -sS -A "Mozilla/5.0" -o page.html https://hashtagbasketball.com/fantasy-basketball-adp
     node scripts/hashtag-adp-to-csv.js page.html > table.csv

   Reads only the Yahoo (adp-col-y) and Fantrax (adp-col-f) cells. ESPN ADP
   and the BLEND column (which mixes ESPN in) are never used. Position is the
   Yahoo eligibility. Prints the table's "Updated:" stamp to stderr. */
"use strict";
var fs = require("fs");

function text(html) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, function (_, n) {
      return String.fromCharCode(Number(n));
    })
    .replace(/\s+/g, " ")
    .trim();
}

/* Returns { stamp, rows: [{name, team, pos, yahoo, fantrax}] }. */
function parse(html) {
  var stamp = (text(html.slice(html.indexOf("Updated:"), html.indexOf("Updated:") + 200)).match(
    /Updated:\s*(\d{1,2} \w+ \d{4})/
  ) || [])[1];
  var start = html.indexOf('<table id="rawDataTable"');
  if (start < 0) throw new Error("rawDataTable not found: page layout changed");
  var table = html.slice(start, html.indexOf("</table>", start));
  var rows = [];
  (table.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || []).forEach(function (tr) {
    var tds = [],
      re = /<td([^>]*)>([\s\S]*?)<\/td>/g,
      m;
    while ((m = re.exec(tr))) tds.push({ cls: (m[1].match(/class="([^"]*)"/) || [])[1] || "", html: m[2] });
    if (tds.length < 2) return; // header rows use <th>
    var nameA = tds[0].html.match(/<a[^>]*d-sm-inline[^>]*>([\s\S]*?)<\/a>/);
    var name = text(nameA ? nameA[1] : tds[0].html);
    function group(tag) {
      var own = tds.filter(function (td) {
        return new RegExp("(^|\\s)" + tag + "(\\s|$)").test(td.cls);
      });
      var pos = own.filter(function (td) {
        return /adp-pos-col/.test(td.cls);
      })[0];
      var nums = own.filter(function (td) {
        return !/adp-pos-col|psg-sep/.test(td.cls);
      });
      var adp = nums.length ? text(nums[0].html) : "";
      return { pos: pos ? text(pos.html) : "", adp: adp };
    }
    var y = group("adp-col-y"),
      f = group("adp-col-f");
    rows.push({ name: name, team: text(tds[1].html), pos: y.pos || f.pos, yahoo: y.adp, fantrax: f.adp });
  });
  if (!rows.length) throw new Error("no player rows parsed");
  return { stamp: stamp || null, rows: rows };
}

function csvCell(v) {
  v = String(v == null ? "" : v);
  return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

function toCsv(rows) {
  return (
    ["name,team,pos,yahoo,fantrax"]
      .concat(
        rows.map(function (r) {
          return [r.name, r.team, r.pos, r.yahoo, r.fantrax].map(csvCell).join(",");
        })
      )
      .join("\n") + "\n"
  );
}

if (require.main === module) {
  var file = process.argv[2];
  if (!file) {
    console.error("usage: node scripts/hashtag-adp-to-csv.js page.html > table.csv");
    process.exit(2);
  }
  var out = parse(fs.readFileSync(file, "utf8"));
  console.error("Hashtag table updated: " + (out.stamp || "unknown") + "; " + out.rows.length + " rows");
  process.stdout.write(toCsv(out.rows));
}

module.exports = { parse: parse, toCsv: toCsv };
