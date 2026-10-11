const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = require('./draft-core');
const DA = require('./draft-analysis');
const PuntCore = require('./punt-core');
const data = require('./scripts/load-data').loadData();
const cats = ['PTS','REB','AST','STL','BLK','3PM','FG%','FT%','TO'];
let grades = Array.from({length:12}, (_,team) => ({team,score:team*2,cats:Array(9).fill(team),rated:3,unrated:0,rank:12-team,grade:team>8?'A':'C'}));
let outlook = {ready:false,knownPicks:1,rows:cats.map((cat,ci)=>({ci,status:'early',rank:12,gap:1,catchup:'hard-climb'}))};
const state = {log:[0],rounds:13,puntCats:[]};
const context = {window:{},state,PLAYERS:data.PLAYERS,PDATA:data.PDATA,CATS9:cats,CORE:core,DA:{...DA,categoryOutlook:()=>outlook},PuntCore,TEAMS:12,
 userTeam:()=>0,nextUserPickIdx:()=>24,followingUserPickIdx:()=>47,isUserTurn:()=>false,
 draftGrades:()=>grades,catMatchup:DA.catMatchup,consRank:DA.consRank,
 esc:s=>String(s),teamName:n=>n===0?'You':'CPU '+(n+1),puntLabel:()=>PuntCore.label(state.puntCats),sameCats:(a,b)=>PuntCore.normalize(a).join()===PuntCore.normalize(b).join(),
 myRoster:()=>core.assignRoster(core.teamEntries(data.PLAYERS,state.log,0,12),['PG','SG','SF','PF','C']),pickLabel:i=>'R'+(Math.floor(i/12)+1)+' P'+(i%12+1),injBadge:()=>'',playoffRoster:()=>''};
vm.createContext(context);
vm.runInContext(fs.readFileSync('./player-averages.js','utf8'),context);
const source=fs.readFileSync('./app.js','utf8');
vm.runInContext(source.slice(source.indexOf('var mobileRosterMode='),source.indexOf('function wireMobileDraft(){')),context);
let markup=context.mobileMatchupHtml();
assert(markup.indexOf('CPU 12')<markup.indexOf('CPU 2'),'highest team value appears first');
assert.equal((markup.match(/class="m-matchup"/g)||[]).length,11);
assert.equal((markup.match(/Their edge/g)||[]).length,99,'all opponents expose all nine categories');
assert(markup.includes('0–9'),'score is from your perspective');
context.mobileMatchSort='number';
markup=context.mobileMatchupHtml();assert(markup.indexOf('CPU 2')<markup.indexOf('CPU 12'));
assert(markup.includes('gradebadge g-C')&&markup.includes('#12 of 12'),'your own grade is shown');
grades[0].rated=0;grades[0].unrated=0;markup=context.mobileMatchupHtml();assert(markup.includes('Your grade appears after your first pick'),'no grade before your first pick');
assert(markup.includes('Matchups appear after your first pick')&&!markup.includes('m-matchup')&&!markup.includes('mdmatchsort'),'no opponent cards before your first pick');
grades[0].rated=3;
// Punt advice must come from PuntCore.suggest, the same rule the desktop Punt advice box uses.
const taken={};state.log.forEach(pi=>{taken[pi]=true;});
const expected=PuntCore.suggest(grades,0,data.PLAYERS,data.PDATA,taken,24,47,[]);
assert(expected,'fixture qualifies for a desktop punt suggestion');
markup=context.mobilePuntHtml();
assert.equal((markup.match(/data-mobile-punt-explore=/g)||[]).length,1,'one recommendation, like desktop');
assert(markup.includes('data-mobile-punt-explore="'+expected.cat+'"'),'phone recommends the desktop category');
assert(markup.includes('trails '+expected.below+' of '+expected.peers));
let suggestArgs=null;context.PuntCore={...PuntCore,suggest:(...a)=>{suggestArgs=a;return null;}};
state.puntCats=['FT%'];markup=context.mobilePuntHtml();
assert.deepEqual([suggestArgs[5],suggestArgs[6],suggestArgs[7]],[24,47,['FT%']],'next picks and committed punts are passed through');
assert(!markup.includes('data-mobile-punt-explore=')&&markup.includes('No additional punt stands out'));
state.puntCats=[];assert(context.mobilePuntHtml().includes('No punt recommendation yet'));
context.PuntCore={...PuntCore,suggest:()=>({cat:'BLK',below:8,peers:11,risers:2,missing:1,also:['REB','AST','STL']})};
markup=context.mobilePuntHtml();assert(markup.includes('data-mobile-punt-explore="BLK"')&&markup.includes('Also trailing: REB, AST.')&&markup.includes('1 of your picks lack category data'));
context.PuntCore=PuntCore;
state.puntCats=['FT%','TO','3PM'];markup=context.mobilePuntHtml();assert(!markup.includes('data-mobile-punt-explore='),'full strategy cannot recommend a fourth punt');assert(markup.includes('Three punts committed'));
state.puntCats=[];
// Riser lists must be the desktop ones (PuntCore.nearTermRisers / laterRisers), not a separate window.
context.mobilePuntPreview=['FT%'];markup=context.mobilePuntHtml();
const puntRows=PuntCore.rankings(data.PLAYERS,data.PDATA,taken,['FT%']);
const near=PuntCore.nearTermRisers(puntRows,data.PLAYERS,24,47).slice(0,6),later=PuntCore.laterRisers(puntRows,data.PLAYERS,24,47).slice(0,4);
assert(near.length+later.length>0,'fixture has punt risers');
assert.deepEqual([...markup.matchAll(/data-mobile-punt-player="(\d+)"/g)].map(m=>Number(m[1])),near.concat(later).map(r=>r.pi),'phone lists the desktop risers in order');
assert(markup.includes('Consider at pick #25'));if(later.length)assert(markup.includes('Watch for later')&&markup.includes('pick #48'));
context.mobilePuntPreview=null;
grades[0].rated=3;grades[0].unrated=0;
context.mobileRosterMode='picks';markup=context.mobileTeamHtml();assert(!markup.includes('mdmobilerunback'),'no Run it back mid-draft');assert(markup.includes('R1 P1'));assert(!markup.includes('NaN'));assert.equal((markup.match(/class="m-category /g)||[]).length,9);
markup=context.mobilePlayerStats(data.PLAYERS.find(p=>p.n==='Nikola Jokic'));
assert(markup.includes('Strengths')&&markup.includes('Weaknesses'));assert(markup.includes('6.1 / 7.4')&&markup.includes('9.9 / 17.4'));assert.equal((markup.match(/<dd>/g)||[]).length,9);
markup=context.mobilePlayerStats(data.PLAYERS.find(p=>p.n==='Tyrese Haliburton'));assert(markup.includes('No recorded 2025–26'));
// Averages load on demand: before they arrive the sheet says so, and a failed load says so instead of claiming no data.
const averages=context.window.PlayerAverages;delete context.window.PlayerAverages;
markup=context.mobilePlayerStats(data.PLAYERS.find(p=>p.n==='Nikola Jokic'));assert(markup.includes('Loading per-game averages')&&!markup.includes('<dd>')&&!markup.includes('No recorded'));
context.averagesLoad='failed';assert(context.mobilePlayerStats(data.PLAYERS.find(p=>p.n==='Nikola Jokic')).includes('unavailable right now'));
context.averagesLoad=null;context.window.PlayerAverages=averages;
assert(!fs.readFileSync('./index.html','utf8').includes('player-averages.js'),'index.html does not load the averages up front');
assert.equal(data.PLAYERS.filter(p=>context.window.PlayerAverages.players[p.n]).length,257);
for(const stats of Object.values(context.window.PlayerAverages.players)){assert(stats.g>0);assert(stats.ftm<=stats.fta&&stats.fgm<=stats.fga);for(const value of Object.values(stats))assert(Number.isFinite(value)&&value>=0);}
state.phase='done';markup=context.mobileTeamHtml();assert(markup.includes('id="mdmobilerunback"')&&markup.includes('gradebadge'),'finished draft shows grade and Run it back');state.phase='draft';
// Past ADP on phones: same rows as the desktop box, as tappable buttons.
vm.runInContext(source.slice(source.indexOf('function pastAdpRows(){'),source.indexOf('function renderPastAdp(){')),context);
const savedLog=state.log;state.log=Array.from({length:30},(_,i)=>i+40);
const past=context.pastAdpRows();
assert(past.length>0&&past.length<=8,'past-ADP rows found');
past.forEach((r,i)=>{assert(!state.log.includes(r.pi));assert(r.adp<state.log.length+1);if(i)assert(past[i-1].value>=r.value);});
markup=context.mobilePastAdpHtml();
assert.deepEqual([...markup.matchAll(/data-past-adp-pi="(\d+)"/g)].map(m=>Number(m[1])),Array.from(past,r=>r.pi));
assert(markup.includes('· '+past.length+' still available')&&!markup.includes(' open>'),'collapsed by default');
context.mobilePastAdpOpen=true;assert(context.mobilePastAdpHtml().includes('id="mdpastadp" open'),'remembers open state');context.mobilePastAdpOpen=false;
state.log=[];assert.equal(context.mobilePastAdpHtml(),'','hidden when nobody is past ADP');
state.log=savedLog;
console.log('mobile views: opponent order, nine categories, adaptive punts, roster picks and sourced stat lines passed');

let completedRenders=0;context.cancelPickCoach=()=>{};context.renderDraft=()=>completedRenders++;context.isMobileDraft=()=>true;
vm.runInContext(source.slice(source.indexOf("function renderDone(){"),source.indexOf("function playoffBadge(pl){")),context);
context.mobileView="grades";context.renderDone();assert.equal(context.mobileView,"grades");
context.mobileView="players";context.renderDone();assert.equal(context.mobileView,"players");assert.equal(completedRenders,2,"completed mobile views retain navigation");
