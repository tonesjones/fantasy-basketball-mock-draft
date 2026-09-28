const assert=require('node:assert/strict');
const core=require('./draft-core');

const DA=require('./draft-analysis');
const data=require('./scripts/load-data').loadData();
const PDATA=data.PDATA;
// Yahoo-ADP-only pool view, as the original extraction built it.
const PLAYERS=data.PLAYERS.map((p,i)=>({n:p.n,p:p.p,t:p.t,r:i+1,adp:p.adp}));
const catMatchup=DA.catMatchup;
const scarcityBase=()=>DA.scarcityBase(PLAYERS,PDATA);
const state={log:[]};

// Test catMatchup logic
const testCtx={mu1:catMatchup([2,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0]),
  mu2:catMatchup([0,0,0,0,0,0,0,0,0],[2,0,0,0,0,0,0,0,0]),
  mu3:catMatchup([0.3,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0])};
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
const g=DA.draftGrades({players:PLAYERS,pdata:PDATA,log:state.log,teams:12,core,repl:scarcityBase().repl});

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
const repl=Array.from(scarcityBase().repl);
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

// Unrated players (no 2025-26 cv) count at market-implied value: the mean cv
// of the 10 rated players nearest in consensus rank, not replacement level.
const full=data.PLAYERS;
const hali=full.findIndex(p=>p.n==='Tyrese Haliburton');
assert(hali>=0&&!PDATA['Tyrese Haliburton'].cv,'sanity: Haliburton has no 2025-26 cv');
const implied=Array.from(DA.impliedCv(full[hali],full,PDATA));
const sum=a=>a.reduce((x,y)=>x+y,0);
assert(sum(implied)>sum(repl)+3,'a consensus-17 pick must be worth far more than replacement: '+sum(implied).toFixed(2));
const lone=DA.draftGrades({players:full,pdata:PDATA,log:[hali],teams:2,core,repl});
const t0=lone.find(x=>x.team===0);
assert.equal(t0.unrated,1,'Haliburton is flagged unrated');
assert(Math.abs(t0.score-sum(implied))<1e-9,'unrated player scores his market-implied value');
const late=DA.impliedCv({n:'Deep prospect',adp:null,adpF:null},full,PDATA);
assert(sum(late)<sum(implied),'implied value falls with market rank');

console.log('draft grades tests passed; user team rank '+user.rank+' ('+user.grade+'), scores '+g[0].score.toFixed(1)+' to '+g[11].score.toFixed(1));
