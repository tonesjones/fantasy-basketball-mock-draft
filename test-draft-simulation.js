const assert=require('node:assert/strict');
const core=require('./draft-core');
const data=require('./scripts/load-data').loadData();
// Yahoo-ADP-only view of the pool: pins the CPU market behaviour this test was written against.
const players=data.PLAYERS.map((p,i)=>({n:p.n,p:p.p,t:p.t,r:i+1,adp:p.adp}));
const slots=core.slotsForRounds(13,['PG','SG','G','SF','PF','F','C','C','Util','Util','BN','BN','BN']);
function run(seed){const rng=core.seededRandom(seed), log=[];while(log.length<156){const pi=core.cpuPickIndex({players,log,teams:12,slots,random:()=>rng.next()});assert(core.validPlayerIndex(players,log,pi),'CPU must only select an available player');log.push(pi);}return log;}
const logs=[1,2,3,4,5,6,7,8,9,10].map(run);
logs.forEach(log=>assert.equal(new Set(log).size,log.length,'full draft cannot duplicate picks'));
const curry=players.findIndex(p=>p.n==='Stephen Curry');
const avg=logs.reduce((sum,log)=>sum+log.indexOf(curry)+1,0)/logs.length;
assert(avg<35,`Curry ADP behavior regressed: average CPU pick ${avg}`);
console.log(`simulation tests passed; Stephen Curry average CPU pick ${avg.toFixed(1)} across ${logs.length} seeded drafts`);
