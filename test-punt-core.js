const assert = require('node:assert/strict');
const Punt = require('./punt-core');

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
const teams = Array.from({length:5},(_,team)=>({team,rated:3,unrated:0,cats:[team===0?-9:9,0,0,0,0,0,0,0,0]}));
assert.equal(Punt.suggest(teams,0,players,pdata,{},10),null,'one riser is not a reliable punt signal');
assert.equal(Punt.suggest(teams.map(t=>({...t,rated:t.team===0?2:3})),0,players,pdata,{},10),null,'wait for three user picks');
console.log('punt core passed');
