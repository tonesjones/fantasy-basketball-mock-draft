// Failing repro for: consensus ADP blend is dead code.
// The site claims the "Consensus" board sort is the average of Yahoo and
// Fantrax ADP, but the PDATA merge never attaches adpF, so consRank (and
// draft-core's marketRank) only ever see Yahoo. This test loads the real
// player-pool.js merge and draft-analysis.js consRank against player-data.js.
const assert = require('node:assert/strict');

const { loadData } = require('./scripts/load-data');
const { consRank } = require('./draft-analysis');
const ctx = loadData();
ctx.consRank = consRank;

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
