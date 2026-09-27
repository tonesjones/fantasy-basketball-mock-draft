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
assert.equal(Punt.valid('TO'),false);
assert.equal(Punt.valid('PTS'),true);
assert.deepEqual(Punt.rankings(players,pdata,{},'TO'),[]);
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
const dataCtx={};vm.createContext(dataCtx);vm.runInContext(fs.readFileSync(__dirname+'/player-data.js','utf8'),dataCtx);
const html=fs.readFileSync(__dirname+'/index.html','utf8');
const match=html.match(/var PLAYERS=([\s\S]*?\r?\n\];)\r?\nPLAYERS\.forEach/);
assert(match,'the app player pool is available');
const poolCtx={};vm.createContext(poolCtx);vm.runInContext('var PLAYERS='+match[1]+'; this.PLAYERS=PLAYERS;',poolCtx);
const pool=poolCtx.PLAYERS.map((p,i)=>({n:p[0],p:p[1],t:p[2],r:i+1,adp:(dataCtx.PDATA[p[0]]||{}).adp??null}));
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
assert.notEqual(realChoice.cat,'TO');
console.log('punt core passed');
