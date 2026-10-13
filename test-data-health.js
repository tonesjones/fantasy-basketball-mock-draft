'use strict';
const assert=require('node:assert/strict');
const {audit}=require('./data-health');
const {loadBundledData}=require('./audit-data');
const player=['Example',['PG'],'BOS'];
let report=audit([player],{Example:{adp:2,last:3}},{Example:['AST']});
assert.equal(report.errors.length,0);
assert.equal(report.missingAdp.length,0);
report=audit([player,[' example ',['INVALID'],'—']],{Example:{adp:-1,last:2.5},Extra:{adp:1,last:1}},{Example:['AST','AST']});
assert.equal(report.errors.length,5,'duplicate name, position, ADP, last rank and tags must be detected');
assert.deepEqual(report.missingData,[' example ']);
assert.deepEqual(report.orphanData,['Extra']);
assert.equal(report.placeholderTeams.length,1);
report=audit([player],{Example:{adp:null,last:null}},{});
assert.equal(report.errors.length,0,'explicit missing values are limitations, not malformed data');
assert.deepEqual(report.missingAdp,['Example']);
assert.deepEqual(report.missingLast,['Example']);
assert.deepEqual(report.untagged,['Example']);
report=audit([player],{Example:{adp:80,last:1}},{Example:['AST']});
assert.equal(report.rankDivergence[0].gap,-79);
report=audit([player],{Example:{adp:80,adpF:4,last:1}},{Example:['AST']},()=>42);
assert.equal(report.rankDivergence[0].gap,-41,'rank gap is measured against the market function when given');
assert.equal(audit([player],{Example:{adp:null,adpF:null}},{},()=>250).rankDivergence.length,0,'unlisted players have no market gap');
const bundle=loadBundledData();
report=audit(bundle.players,bundle.data,bundle.tags);
assert.deepEqual(report.errors,[]);
assert.deepEqual(report.missingData,[]);
assert.deepEqual(report.orphanData,[]);
const injuryBundle=require('./scripts/load-data').loadData();
assert.equal(injuryBundle.PLAYERS.find(p=>p.n==='Brandon Miller').inj,null,'cleared player should not receive the Pick coach injury hard pass');
assert.ok(injuryBundle.PLAYERS.find(p=>p.n==='Dereck Lively II').inj,'uncleared player stays flagged');
assert.ok(injuryBundle.PLAYERS.find(p=>p.n==='Kristaps Porzingis').inj,'indefinite absence stays flagged');
assert.ok(injuryBundle.PLAYERS.find(p=>p.n==='Kon Knueppel').inj,'unresolved opening-night availability stays flagged');
assert.ok(injuryBundle.PLAYERS.find(p=>p.n==='Brandon Ingram').inj,'confirmed opening-night absence stays flagged');
assert.ok(injuryBundle.PLAYERS.find(p=>p.n==='Tobias Harris').inj,'unresolved calf injury stays flagged');
for(const name of ['Coby White','Max Strus','Nic Claxton','Grant Williams']) {
  assert.ok(injuryBundle.PLAYERS.find(p=>p.n===name).inj, name+' has a current injury flag');
}
for(const name of ['Jalen Suggs','Cam Whitmore']) {
  assert.equal(injuryBundle.PLAYERS.find(p=>p.n===name).inj,null,name+' has no supported ongoing injury flag');
}
assert.equal(Object.keys(injuryBundle.INJ).length,17);
/* The setup screen's panel must return HTML. A bad merge once nested a second renderDataHealth inside the first, so it returned undefined. */
{
  const src=require('fs').readFileSync(__dirname+'/app.js','utf8');
  const start=src.indexOf('function renderDataHealth(');
  assert.equal(src.indexOf('function renderDataHealth(',start+1),-1,'renderDataHealth is declared once');
  let i=src.indexOf('{',start),depth=0;
  for(;i<src.length;i++){if(src[i]==='{')depth++;else if(src[i]==='}'&&--depth===0)break;}
  const sandbox={window:{DataHealth:{freshness:()=>[]}},HEALTH:{players:2,missingAdp:[],missingLast:[],untagged:[],placeholderTeams:[],errors:[],missingData:[],orphanData:[]},DATA_VERSION:'v',esc:String};
  require('node:vm').runInNewContext(src.slice(start,i+1),sandbox);
  const html=sandbox.renderDataHealth('Data &amp; sources');
  assert.equal(typeof html,'string');
  assert.ok(html.startsWith('<details')&&html.endsWith('</details>'),'panel is one closed details block');
  assert.ok(html.includes('<b>Data &amp; sources</b>'),'the label argument reaches the summary');
}
for(const [name,rec] of Object.entries(injuryBundle.INJ)){
  assert.ok(['questionable','out','out-indefinitely','season-out'].includes(rec.status),name+' has a valid status');
  assert.match(rec.reviewedAt,/^\d{4}-\d{2}-\d{2}$/,name+' has reviewedAt');
}
const {freshness}=require('./data-health');
const now=Date.parse('2026-10-12T12:00:00Z');
const fresh={A:{reviewedAt:'2026-10-05'}};
assert.deepEqual(freshness('2026-10-05',fresh,now),[],'exactly 7 days old is not stale');
let fw=freshness('2026-10-04',fresh,now);
assert.equal(fw.length,1);assert.match(fw[0],/ADP data is 8 days old/);
fw=freshness('2026-10-12',{A:{reviewedAt:'2026-10-04'},B:{reviewedAt:'2026-10-11'}},now);
assert.equal(fw.length,1);assert.match(fw[0],/A \(8d\)/);assert.ok(!/B \(/.test(fw[0]));
assert.equal(freshness('2026-10-04',{A:{reviewedAt:'2026-09-01'}},now).length,2,'both warnings can show');
assert.equal(freshness(null,{},now).length,1,'missing ADP date warns');
assert.equal(typeof injuryBundle.ADP_DATE,'string','bundled ADP_DATE present');
console.log(`Data health tests passed; ${report.players} bundled players have matching data records.`);
