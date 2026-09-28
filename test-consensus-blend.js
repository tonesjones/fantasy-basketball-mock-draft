// Consensus ADP blend against the real bundled data.
// Guards two bugs: (1) the PDATA merge once dropped adpF, so the "Yahoo +
// Fantrax" consensus only ever saw Yahoo; (2) a plain mean read Fantrax's
// rarely-drafted tail (238-244) as literal picks, so players Yahoo drafts in
// rounds 7-9 (AJ Green 79.2 / 241.7 -> 160.4) went undrafted in every
// 13-round sim. Loads the real player-pool.js merge and draft-analysis.js.
const assert = require('node:assert/strict');

const { loadData } = require('./scripts/load-data');
const { consRank } = require('./draft-analysis');
const core = require('./draft-core');
const ctx = loadData();

const byName = {};
ctx.PLAYERS.forEach(function (p) { byName[p.n] = p; });

const aj = byName['AJ Green'];
assert.equal(aj.adp, 79.2, 'sanity: AJ Green Yahoo ADP present');
assert.equal(aj.adpF, 241.7, 'merge attaches Fantrax ADP (adpF)');
const ajCons = consRank(aj);
assert(ajCons > 79.2 && ajCons < 115, 'Fantrax tail pulls AJ Green later, not to ~160: got ' + ajCons);

const bridges = byName['Mikal Bridges'];
assert(Math.abs(consRank(bridges) - (bridges.adp + bridges.adpF) / 2) < 1e-9,
  'both platforms in their reliable range: plain mean');

const eason = byName['Tari Eason'];
assert.equal(eason.adp, null, 'sanity: Tari Eason has no Yahoo ADP');
assert.equal(eason.adpF, 138.7, 'merge attaches Fantrax-only ADP');
assert.equal(consRank(eason), 138.7, 'consRank uses Fantrax ADP when Yahoo is unpublished');

// Every player either platform lists sorts ahead of every unlisted player.
const listed = ctx.PLAYERS.filter(p => core.marketAdp(p) != null).map(consRank);
const unlisted = ctx.PLAYERS.filter(p => core.marketAdp(p) == null).map(consRank);
assert(Math.max(...listed) < Math.min(...unlisted), 'listed players sort before unlisted ones');

// Real-data CPU drafts: no player the market takes by pick 120 goes undrafted.
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
const missed = ctx.PLAYERS.map((p, i) => ({ p, i }))
  .filter(x => !x.p.inj && consRank(x.p) <= 120 && (drafted[x.i] || 0) < SEEDS.length)
  .map(x => x.p.n + ' (' + consRank(x.p).toFixed(1) + ', ' + (drafted[x.i] || 0) + '/' + SEEDS.length + ')');
assert.equal(missed.length, 0, 'market top-120 players must be drafted in every 13-round sim: ' + missed.join('; '));

console.log('consensus blend tests passed; AJ Green consensus ' + ajCons.toFixed(1) + ' (was 160.4)');
