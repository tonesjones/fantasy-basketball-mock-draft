// Consensus ADP blend against the real bundled data. Players are chosen by
// property, not name, so the test survives ADP refreshes; test-draft-core.js
// pins the exact math with synthetic values.
// Guards two bugs: (1) the PDATA merge once dropped adpF, so the "Yahoo +
// Fantrax" consensus only ever saw Yahoo; (2) a plain mean read Fantrax's
// rarely-drafted tail (238-244) as literal picks, so players Yahoo drafted in
// rounds 7-9 (AJ Green 79.2 / 241.7 -> 160.4 in the Sep 17 data) went
// undrafted in every 13-round sim.
const assert = require('node:assert/strict');

const { loadData } = require('./scripts/load-data');
const { consRank } = require('./draft-analysis');
const core = require('./draft-core');
const ctx = loadData();
const players = Array.from(ctx.PLAYERS);

// The merge attaches both platforms' ADP.
const both = players.filter(p => p.adp != null && p.adpF != null);
assert(both.length > 100, 'most players carry both Yahoo and Fantrax ADP');
both.forEach(p => assert.equal(p.adpF, ctx.PDATA[p.n].adpF, 'adpF merged for ' + p.n));

// Both reliable: plain mean.
both.filter(p => p.adp <= 100 && p.adpF <= 150)
  .forEach(p => assert(Math.abs(consRank(p) - (p.adp + p.adpF) / 2) < 1e-9, 'plain mean for ' + p.n));

// Fantrax tail never drags a reliable Yahoo value to the literal midpoint.
both.filter(p => p.adp <= 100 && p.adpF >= 200).forEach(p => {
  const c = consRank(p);
  assert(c > p.adp && c < (p.adp + p.adpF) / 2 - 25, p.n + ': Yahoo ' + p.adp + ', Fantrax ' + p.adpF + ' -> ' + c);
});

// One platform only (outside its saturated band): that platform's ADP.
players.filter(p => (p.adp == null) !== (p.adpF == null))
  .filter(p => (p.adp != null ? p.adp : p.adpF) <= 150)
  .forEach(p => assert.equal(consRank(p), p.adp != null ? p.adp : p.adpF, 'single-platform ' + p.n));

// Every player either platform lists sorts ahead of every unlisted player.
const listed = players.filter(p => core.marketAdp(p) != null).map(consRank);
const unlisted = players.filter(p => core.marketAdp(p) == null).map(consRank);
assert(Math.max(...listed) < Math.min(...unlisted), 'listed players sort before unlisted ones');

// Real-data CPU drafts: no healthy player the market takes by pick 120 goes undrafted.
const slots = core.slotsForRounds(13, ['PG','SG','G','SF','PF','F','C','C','Util','Util','BN','BN','BN']);
const drafted = {};
const SEEDS = [11, 22, 33, 44, 55, 66];
SEEDS.forEach(function (seed) {
  const rng = core.seededRandom(seed), log = [];
  while (log.length < 156) {
    log.push(core.cpuPickIndex({ players: ctx.PLAYERS, log, teams: 12, slots, totalPicks: 156, random: () => rng.next() }));
  }
  log.forEach(function (pi) { drafted[pi] = (drafted[pi] || 0) + 1; });
});
const missed = players.map((p, i) => ({ p, i }))
  .filter(x => !x.p.inj && consRank(x.p) <= 120 && (drafted[x.i] || 0) < SEEDS.length)
  .map(x => x.p.n + ' (' + consRank(x.p).toFixed(1) + ', ' + (drafted[x.i] || 0) + '/' + SEEDS.length + ')');
assert.equal(missed.length, 0, 'market top-120 players must be drafted in every 13-round sim: ' + missed.join('; '));

console.log('consensus blend tests passed; ' + both.length + ' players with both ADPs');
