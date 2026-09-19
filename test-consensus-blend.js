// Failing repro for: consensus ADP blend is dead code.
// The site claims the "Consensus" board sort is the average of Yahoo and
// Fantrax ADP, but the PDATA merge never attaches adpF, so consRank (and
// draft-core's marketRank) only ever see Yahoo. This test extracts the
// verbatim merge line and consRank from index.html and runs them against
// the real player-data.js, so it fails until the merge carries adpF.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('./index.html', 'utf8');
const pdataSrc = fs.readFileSync('./player-data.js', 'utf8');

const playersSrc = html.slice(
  html.indexOf('var PLAYERS=['),
  html.indexOf('];', html.indexOf('var PLAYERS=[')) + 2
);
const normLine = html.match(/PLAYERS\.forEach\(function\(p,i\)\{[^\n]*\n/)[0];
const mergeLine = html.match(/PLAYERS\.forEach\(function\(p\)\{var d=[^\n]*\n/)[0];
const consRankSrc = html.match(/function consRank\(p\)\{[^\n]*\n/)[0];

const ctx = {};
vm.createContext(ctx);
vm.runInContext(pdataSrc, ctx);
vm.runInContext(playersSrc, ctx);
vm.runInContext(normLine, ctx);
vm.runInContext(mergeLine, ctx);
vm.runInContext(consRankSrc, ctx);

const byName = {};
ctx.PLAYERS.forEach(function (p) { byName[p.n] = p; });

const aj = byName['AJ Green'];
assert.equal(aj.adp, 79.2, 'sanity: AJ Green Yahoo ADP present');
assert.equal(aj.adpF, 241.7, 'merge attaches Fantrax ADP (adpF)');
assert.equal(
  ctx.consRank(aj),
  (79.2 + 241.7) / 2,
  'consRank blends Yahoo + Fantrax when both published'
);

const eason = byName['Tari Eason'];
assert.equal(eason.adp, null, 'sanity: Tari Eason has no Yahoo ADP');
assert.equal(eason.adpF, 138.7, 'merge attaches Fantrax-only ADP');
assert.equal(
  ctx.consRank(eason),
  138.7,
  'consRank uses Fantrax ADP when Yahoo is unpublished'
);

console.log('consensus blend tests passed');
