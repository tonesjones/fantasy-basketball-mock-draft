const assert = require('node:assert/strict');
const core = require('./draft-core');
const players = [
  {n:'Center only', p:['C'], r:40, adp:40},
  {n:'Forward', p:['PF','SF'], r:41, adp:41},
  {n:'Guard', p:['PG','SG'], r:42, adp:42},
  {n:'Utility', p:['PG'], r:43, adp:43}
];
assert.equal(core.validPlayerIndex(players, [], 2), true);
assert.equal(core.validPlayerIndex(players, [2], 2), false, 'taken player must be rejected');
assert.equal(core.validPlayerIndex(players, [], -1), false, 'negative indexes must be rejected');
const roster = core.assignRoster([
  {player:players[1], pi:1}, {player:players[2], pi:2}, {player:players[0], pi:0}
], ['PG','SF','PF','C','Util','BN']);
assert.equal(roster.overflow.length, 0);
assert.equal(roster.slots.filter(s=>s.player).length, 3, 'every drafted player appears once');
assert.equal(roster.slots.find(s=>s.slot==='C').player.player.n, 'Center only', 'reassignment preserves scarce center slot');
const rngA=core.seededRandom(123), rngB=core.seededRandom(123);
assert.deepEqual([rngA.next(),rngA.next(),rngA.next()],[rngB.next(),rngB.next(),rngB.next()], 'seeded RNG replays');
const market = [
  {n:'Rank 1', p:['PG'], r:1, adp:90},
  {n:'ADP 5', p:['SG'], r:90, adp:5},
  {n:'ADP 6', p:['C'], r:91, adp:6}
];
const pick=core.cpuPickIndex({players:market,log:[],teams:2,slots:['PG','SG','C','BN'],random:()=>0});
assert.equal(pick,1, 'CPU should use ADP market timing over built-in rank');
let log=[]; const rng=core.seededRandom(42);
for(let i=0;i<4;i++){const pi=core.cpuPickIndex({players:market,log,teams:2,slots:['PG','SG','C','BN'],random:()=>rng.next()});if(pi===-1)break;assert(core.validPlayerIndex(market,log,pi));log.push(pi);}
assert.equal(new Set(log).size, 3, 'no duplicate cpu picks when pool exhausts');
assert.equal(core.cpuPickIndex({players:market,log,teams:2,slots:['PG'],random:()=>0}), -1, 'empty pool has no valid CPU pick');
// marketRank: ADP passthrough, median-of-actuals fallback, prospect penalty
assert.equal(core.marketRank({adp:45.2,r:80},0),45.2,'published ADP is the market');
assert.equal(core.marketRank({adp:null,r:94,last:456,lastTotal:214},0),214,'fallback is median of actuals + built-in rank');
assert.equal(core.marketRank({adp:null,r:107,lastTotal:212},0),159.5,'two-signal median averages');
assert.equal(core.marketRank({adp:null,r:200},5),245,'no 2025-26 data keeps built-in rank +45 penalty');
assert.equal(core.marketRank({adp:null,r:50,last:100,lastTotal:120},3),100,'median works across all three signals');
console.log('draft-core tests passed');
