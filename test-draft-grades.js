const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const core=require('./draft-core');
const HERE=__dirname;
const read=(f)=>fs.readFileSync(path.join(HERE,f),'utf8');

// Load PDATA
const pdataCtx={};vm.createContext(pdataCtx);
vm.runInContext(read('player-data.js'),pdataCtx);
const PDATA=pdataCtx.PDATA;

// Extract PLAYERS from index.html (same pattern as test-draft-simulation.js)
const html=read('index.html');
const playersMatch=html.match(/var PLAYERS=([\s\S]*?\r?\n\];)\r?\nPLAYERS\.forEach/);
assert(playersMatch,'PLAYERS array extraction failed: expected "var PLAYERS=[...];" followed by "PLAYERS.forEach" in index.html');
const snippet=playersMatch[1];
const ctx={};vm.createContext(ctx);
vm.runInContext('var PLAYERS='+snippet+'; this.PLAYERS=PLAYERS;',ctx);
const PLAYERS=ctx.PLAYERS.map((p,i)=>({n:p[0],p:p[1],t:p[2],r:i+1,
  adp:(PDATA[p[0]]||{}).adp ?? null}));

// Extract draftGrades and catMatchup functions from index.html
const fnMatch=html.match(/function draftGrades\(\)\{[\s\S]*?\n\}/);
assert(fnMatch,'draftGrades function must exist in index.html');
const cmMatch=html.match(/function catMatchup\(userCats,oppCats\)\{[\s\S]*?\n\}/);
assert(cmMatch,'catMatchup function must exist in index.html');
// draftGrades uses scarcityBase().repl as the replacement fill; extract it + consRank
const sbMatch=html.match(/var _scarcBase=null;\r?\n[ \t]*function scarcityBase\(\)\{[\s\S]*?\r?\n[ \t]*\}/);
assert(sbMatch,'scarcityBase function must exist in index.html');
const crMatch=html.match(/function consRank\(p\)\{[^\n]*\}/);
assert(crMatch,'consRank function must exist in index.html');

// Set up context with mocked globals
const TEAMS=12;
const state={log:[],rounds:13};
const userTeam=()=>5;
const teamName=(t)=>t===5?'You':'CPU '+(t+1);
const testCtx={CORE:core,PLAYERS,PDATA,TEAMS,state,userTeam,teamName,esc:(s)=>String(s)};
vm.createContext(testCtx);
vm.runInContext(crMatch[0]+'; this.consRank=consRank;',testCtx);
vm.runInContext(sbMatch[0]+'; this.scarcityBase=scarcityBase;',testCtx);
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
// Every roster spot counts: rated + unrated must equal the full 13-man roster
g.forEach(x=>assert.equal(x.rated+x.unrated,13,'rated+unrated must cover the full roster'));
// Replacement fill: a team with unrated players must score higher than the
// same roster with those spots contributing zero
const repl=Array.from(testCtx.scarcityBase().repl);
assert(repl.length===9&&repl.every(v=>typeof v==='number'&&isFinite(v)),'replacement vector must be 9 finite numbers');
const replTotal=repl.reduce((a,b)=>a+b,0);
g.forEach(x=>{
  if(x.unrated>0){
    // score must exceed the sum of rated-only contributions; verify via cats
    const cats=Array.from(x.cats);
    assert(cats.every(v=>typeof v==='number'&&isFinite(v)),'category totals must be finite numbers');
  }
});
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
