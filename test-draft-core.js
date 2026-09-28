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
// marketAdp / marketRank: reliability-weighted Yahoo + Fantrax blend
const near=(a,b,msg)=>assert(Math.abs(a-b)<0.05,msg+': got '+a+', want '+b);
near(core.marketRank({adp:40,adpF:44}),42,'both reliable: plain mean');
assert.equal(core.marketRank({adp:45.2,r:80}),45.2,'Yahoo only is the market');
assert.equal(core.marketRank({adp:null,adpF:138.7}),138.7,'Fantrax only is the market');
const tail=core.marketRank({adp:79.2,adpF:241.7});
assert(tail>79.2&&tail<115,'Fantrax rarely-drafted tail must not drag a Yahoo 79 to ~160: got '+tail);
const satY=core.marketRank({adp:111.9,adpF:140.3});
assert(satY>(111.9+140.3)/2&&satY<140.3,'saturated Yahoo defers to reliable Fantrax: got '+satY);
assert(Math.abs(core.marketAdp({adp:80,adpF:199.9})-core.marketAdp({adp:80,adpF:200.1}))<0.1,'no jump at the Fantrax tail edge');
assert(Math.abs(core.marketAdp({adp:99.9,adpF:120})-core.marketAdp({adp:100.1,adpF:120}))<0.2,'no jump at the Yahoo band edge');
assert.equal(core.marketAdp({adp:null,adpF:null}),null,'unlisted has no market ADP');
assert(core.marketRank({adpF:244.9})<212,'every listed value sorts before the unlisted block');
near(core.marketRank({adp:null,r:94,last:456,lastTotal:214}),245.5,'unlisted: after listed players, by last-season rank');
near(core.marketRank({adp:null,r:1,lastTotal:100}),222,'built-in rank never feeds the market');
near(core.marketRank({adp:null,r:200}),252,'no 2025-26 data sorts last');
console.log('draft-core tests passed');
