const assert = require('node:assert/strict');
const Punt = require('./punt-core');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('./draft-core');

const players = [
  {n:'Steady',r:1,adp:10},
  {n:'Weak PTS',r:2,adp:11},
  {n:'No data',r:3,adp:12},
];
const pdata = {
  Steady:{cv:[2,0,0,0,0,0,0,0,0]},
  'Weak PTS':{cv:[-4,2,2,2,0,0,0,0,0]},
};
assert.equal(Punt.valid('TO'),true,'TO can be punted');
assert.equal(Punt.valid('PTS'),true);
assert.equal(Punt.valid('XYZ'),false);
assert.deepEqual(Punt.rankings(players,pdata,{},'XYZ'),[]);
assert.deepEqual(Punt.rankings(players,pdata,{},[]),[]);

// Multi-punt: normalize + label
assert.deepEqual(Punt.normalize(['TO','FT%']),['FT%','TO'],'CATS order');
assert.deepEqual(Punt.normalize('FG%'),['FG%'],'single string still accepted (saved drafts)');
assert.deepEqual(Punt.normalize(['PTS','PTS']),['PTS'],'duplicates collapse');
assert.deepEqual(Punt.normalize(['PTS','bogus']),[],'any invalid entry rejects the set');
assert.deepEqual(Punt.normalize(['PTS','REB','AST','STL']),[],'more than MAX_PUNTS rejected');
assert.equal(Punt.MAX_PUNTS,3);
assert.equal(Punt.label(['TO','FG%']),'FG% + TO');

// Multi-punt ranking removes every punted category.
// Scorer: base 3-2-2 = -1; punt FT% -> 1; punt FT%+TO -> 3.  Glue: base 3 throughout.
{
  const mp=[{n:'Scorer'},{n:'Glue'}];
  const md={Scorer:{cv:[3,0,0,0,0,0,0,-2,-2]},Glue:{cv:[0,1,1,1,0,0,0,0,0]}};
  const one=Punt.rankings(mp,md,{},'FT%'), two=Punt.rankings(mp,md,{},['TO','FT%']);
  const S1=one.find(r=>r.pi===0), S2=two.find(r=>r.pi===0);
  assert.equal(S1.base,-1); assert.equal(S1.punt,1); assert.equal(S1.baseRank,2); assert.equal(S1.puntRank,2);
  assert.equal(S2.punt,3); assert.equal(S2.puntRank,1,'double punt lifts the scorer to #1 (tie broken by pool order)');
  assert.equal(S2.gain,1);
  assert.equal(Punt.rankings(mp,md,{},'TO').find(r=>r.pi===0).punt,1,'punting TO alone drops the inverted TO term');
}
const rows = Punt.rankings(players,pdata,{},'PTS');
assert.equal(rows.length,2,'missing category data must remain unknown');
assert.equal(rows[0].pi,1);
assert.equal(rows[0].baseRank,2);
assert.equal(rows[0].puntRank,1);
assert.equal(rows[0].gain,1);
assert.equal(Punt.rankings(players,pdata,{1:1},'PTS').length,1);
const latePlayers=[
  {n:'DeMar DeRozan',adp:116.7,adpF:138.6},
  {n:'Reed Sheppard',adp:114.7,adpF:118.3},
  {n:'Ayo Dosunmu',adp:106.3,adpF:105.5},
  {n:'Collin Gillespie',adp:124.8,adpF:140.6},
  {n:'Cason Wallace',adp:114.6,adpF:114.9},
  {n:'Ajay Mitchell',adp:110.2,adpF:114.2},
  {n:'Near-term player',adp:93,adpF:95},
];
const rising=latePlayers.map((_,pi)=>({pi,puntRank:pi+1,gain:3}));
assert.deepEqual(Punt.nearTermRisers(rising,latePlayers,89,101).map(r=>r.pi),[6],
  'at pick 90, later-round ADP 106-133 players must not crowd out the near-term target');
assert.deepEqual(Punt.laterRisers(rising,latePlayers,89,101).map(r=>r.pi),[2,5],
  'near-future players may be watches, but distant ADP 115+ players stay out');
assert.deepEqual(Punt.nearTermRisers(rising,latePlayers,-1,-1),[]);
const mixedPlayers=[
  {n:'Guard 1',p:['PG']},{n:'Guard 2',p:['SG']},{n:'Guard 3',p:['PG']},
  {n:'Big 1',p:['PF','C']},{n:'Big 2',p:['C']},{n:'Wing 1',p:['SF']},
];
const mixedRisers=mixedPlayers.map((_,pi)=>({pi,puntRank:pi+1,gain:pi+1}));
const groups=Punt.groupRisers(mixedRisers,mixedPlayers,2);
assert.deepEqual(groups.guards.map(r=>r.pi),[0,1]);
assert.deepEqual(groups.frontcourt.map(r=>r.pi),[3,4],
  'a guard-heavy ranking must still show qualifying frontcourt alternatives');
assert.deepEqual(groups.wings.map(r=>r.pi),[5]);
assert.deepEqual(Punt.groupRisers(mixedRisers.slice(0,3),mixedPlayers,2).frontcourt,[],
  'do not invent a big when none qualifies');
assert.deepEqual(Punt.groupRisers([{pi:0,puntRank:1,gain:2}],[{n:'Forward',p:['SF','PF']}],2).frontcourt.map(r=>r.pi),[0],
  'a player eligible at PF should count as a frontcourt alternative');
const teams = Array.from({length:5},(_,team)=>({team,rated:3,unrated:0,cats:[team===0?-9:9,0,0,0,0,0,0,0,0]}));
const choice = Punt.suggest(teams,0,players,pdata,{},10);
assert.equal(choice.cat,'PTS','a weak category should be suggested even with only one nearby riser');
assert.equal(choice.risers,1);
assert.equal(Punt.suggest(teams.map(t=>({...t,rated:t.team===0?2:3})),0,players,pdata,{},10),null,'wait for three user picks');
assert.equal(Punt.suggest(teams.map(t=>({...t,rated:t.team===0?2:3,unrated:t.team===0?1:0})),0,players,pdata,{},10).cat,'PTS','one unrated pick must not suppress advice');
assert.equal(Punt.suggest(teams.map(t=>({...t,cats:[0,0,0,0,0,0,0,0,0]})),0,players,pdata,{},10),null,'balanced categories have no clear punt');
const dataCtx=require('./scripts/load-data').loadData();
const pool=dataCtx.PLAYERS.map((p,i)=>({n:p.n,p:p.p,t:p.t,r:i+1,adp:p.adp}));
const slots=Core.slotsForRounds(13,['PG','SG','G','SF','PF','F','C','C','Util','Util','BN','BN','BN']);
const rng=Core.seededRandom(7),log=[];
while(log.length<60)log.push(Core.cpuPickIndex({players:pool,log,teams:12,slots,random:()=>rng.next()}));
const actualTeams=Array.from({length:12},(_,team)=>{
  const picks=log.filter((_,i)=>Core.teamForPick(i,12)===team);
  const cats=Array(9).fill(0);let rated=0,unrated=0;
  picks.forEach(pi=>{const cv=dataCtx.PDATA[pool[pi].n]?.cv;if(!cv){unrated++;return;}rated++;cv.forEach((v,i)=>cats[i]+=v);});
  return {team,cats,rated,unrated};
});
const realChoice=Punt.suggest(actualTeams,5,pool,dataCtx.PDATA,Object.fromEntries(log.map(pi=>[pi,true])),60);
assert(realChoice,'the actual five-round mock should surface a punt suggestion');
assert(Punt.valid(realChoice.cat),'suggestion is a real category (TO allowed)');
// Suggest can now pick TO, skips committed punts, and stops when the set is full.
{
  const t=Array.from({length:5},(_,team)=>({team,rated:3,unrated:0,cats:team===0?[-9,0,0,0,0,0,0,0,-9]:[9,0,0,0,0,0,0,0,9]}));
  const first=Punt.suggest(t,0,players,pdata,{},10);
  assert.equal(first.cat,'PTS'); assert.deepEqual(first.also,['TO'],'TO is offered as another weak category');
  const second=Punt.suggest(t,0,players,pdata,{},10,-1,['PTS']);
  assert.equal(second.cat,'TO','with PTS committed, the next suggestion is TO');
  assert.equal(Punt.suggest(t,0,players,pdata,{},10,-1,['PTS','TO']),null,'no other weak category left');
  assert.equal(Punt.suggest(t,0,players,pdata,{},10,-1,['REB','AST','STL']),null,'punt set already full');
}
// positionFits / bestCats
{
  const fp=[{n:'Guard',p:['PG'],adp:5},{n:'Big',p:['C'],adp:6},{n:'Big2',p:['PF'],adp:4},{n:'Wing',p:['SF'],adp:8}];
  const fd={Guard:{cv:[0,3,0,0,0,0,0,0,0]},Big:{cv:[0,5,0,0,4,0,1,0,0]},Big2:{cv:[0,4,0,0,1,0,0,0,0]},Wing:{cv:[9,0,0,0,0,0,0,0,0]}};
  const rows=Punt.rankings(fp,fd,{},'REB');
  assert.equal(rows.find(r=>r.pi===1).gain<0,true,'REB punt does not lift the big');
  assert.equal(Punt.nearTermRisers(rows,fp,0,10).some(r=>r.pi===1),false);
  const fits=Punt.positionFits(rows,fp,0,10,[rows.find(r=>r.pi===0)]);
  assert.equal(fits.length,1); assert.equal(fits[0].group,'bigs');
  assert.deepEqual(fits[0].rows.map(r=>r.pi),[1,2],'best by punt value first, max 2');
  assert.deepEqual(Punt.positionFits(rows,fp,0,10,[rows.find(r=>r.pi===1)]).map(f=>f.group),['guards'],'no bigs when shown has a big');
  const bc=Punt.bestCats(fd.Big.cv,'REB',2);
  assert.deepEqual(bc,[{cat:'BLK',v:4},{cat:'FG%',v:1}]);
  assert(!Punt.bestCats(fd.Guard.cv,['REB'],9).some(x=>x.cat==='REB'),'punted cats excluded');
}
console.log('punt core passed');
