const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const core=require('./draft-core');

// Load PDATA
const pdataCtx={};vm.createContext(pdataCtx);
vm.runInContext(fs.readFileSync('player-data.js','utf8'),pdataCtx);
const PDATA=pdataCtx.PDATA;

// Extract PLAYERS from index.html (same pattern as test-draft-simulation.js)
const html=fs.readFileSync('index.html','utf8');
const snippet=html.match(/var PLAYERS=([\s\S]*?\r?\n\];)\r?\nPLAYERS\.forEach/)[1];
const ctx={};vm.createContext(ctx);
vm.runInContext('var PLAYERS='+snippet+'; this.PLAYERS=PLAYERS;',ctx);
const PLAYERS=ctx.PLAYERS.map((p,i)=>({n:p[0],p:p[1],t:p[2],r:i+1,
  adp:(PDATA[p[0]]||{}).adp ?? null}));

// Extract draftGrades and catMatchup functions from index.html
const fnMatch=html.match(/function draftGrades\(\)\{[\s\S]*?\n\}/);
assert(fnMatch,'draftGrades function must exist in index.html');
const cmMatch=html.match(/function catMatchup\(userCats,oppCats\)\{[\s\S]*?\n\}/);
assert(cmMatch,'catMatchup function must exist in index.html');

// Set up context with mocked globals
const TEAMS=12;
const state={log:[],rounds:13};
const userTeam=()=>5;
const teamName=(t)=>t===5?'You':'CPU '+(t+1);
const testCtx={CORE:core,PLAYERS,PDATA,TEAMS,state,userTeam,teamName,esc:(s)=>String(s)};
vm.createContext(testCtx);
vm.runInContext(fnMatch[0]+'; this.draftGrades=draftGrades;',testCtx);
vm.runInContext(cmMatch[0]+'; this.catMatchup=catMatchup;',testCtx);

// Test catMatchup logic
vm.runInContext(`
this.mu1=catMatchup([2,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0]);
this.mu2=catMatchup([0,0,0,0,0,0,0,0,0],[2,0,0,0,0,0,0,0,0]);
this.mu3=catMatchup([0.3,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0]);
`,testCtx);
assert.equal(testCtx.mu1[0],'win','user ahead by >0.5 should be win');
assert.equal(testCtx.mu2[0],'loss','user behind by >0.5 should be loss');
assert.equal(testCtx.mu3[0],'even','diff within 0.5 should be even');

// Simulate a full draft
const slots=core.slotsForRounds(13,['PG','SG','G','SF','PF','F','C','C','Util','Util','BN','BN','BN']);
const rng=core.seededRandom(12345);
const log=[];
while(log.length<156){
  log.push(core.cpuPickIndex({players:PLAYERS,log,teams:12,slots,random:()=>rng.next()}));
}
state.log=log;

// Run draftGrades
vm.runInContext('this.result=draftGrades();',testCtx);
const g=testCtx.result;

// Assertions (note: g comes from a VM context, so avoid deepStrictEqual across realms)
assert.equal(g.length,12,'must grade all 12 teams');
const ranks=Array.from(g.map(x=>x.rank));
assert.equal(ranks.join(','),'1,2,3,4,5,6,7,8,9,10,11,12','ranks must be 1-12 in order');
// Scores should be descending
for(let i=1;i<g.length;i++)assert(g[i-1].score>=g[i].score,'scores must be sorted descending');
// Grades should be valid letters
const validGrades=['A+','A','B+','B','C+','C','D','F'];
g.forEach(x=>assert(validGrades.includes(x.grade),'grade must be valid: '+x.grade));
// Each team should have 13 players with cv data
g.forEach(x=>assert(x.count>0,'each team must have players with cv data'));
// Each team should have 9 per-category totals
g.forEach(x=>{
  const cats=Array.from(x.cats);
  assert.equal(cats.length,9,'each team must have 9 category totals');
  assert(cats.every(v=>typeof v==='number'&&isFinite(v)),'category totals must be finite numbers');
});
// User team must be present
const user=userGrade=g.find(x=>x.team===5);
assert(user,'user team must be in grades');
assert(user.rank>=1&&user.rank<=12,'user rank must be 1-12');

console.log('draft grades tests passed; user team rank '+user.rank+' ('+user.grade+'), scores '+g[0].score.toFixed(1)+' to '+g[11].score.toFixed(1));
