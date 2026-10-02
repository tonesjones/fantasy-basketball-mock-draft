const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = require('./draft-core');
const DA = require('./draft-analysis');
const PuntCore = require('./punt-core');
const data = require('./scripts/load-data').loadData();
const cats = ['PTS','REB','AST','STL','BLK','3PM','FG%','FT%','TO'];
let grades = Array.from({length:12}, (_,team) => ({team,score:team*2,cats:Array(9).fill(team),rated:3,unrated:0}));
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
assert(!context.mobilePuntHtml().includes('data-mobile-punt-explore='),'no early recommendation');
outlook={...outlook,ready:true};
outlook.rows.forEach(row=>{row.rank=8;row.gap=.3;row.status='weak';});
outlook.rows[0].rank=12;outlook.rows[0].gap=.8;
outlook.rows[1].rank=12;outlook.rows[1].gap=.4;
outlook.rows[2].rank=12;outlook.rows[2].gap=.8;outlook.rows[2].catchup='one-pick';
markup=context.mobilePuntHtml();
assert(markup.includes('data-mobile-punt-explore="PTS"'));
assert(!markup.includes('data-mobile-punt-explore="REB"'),'small deficit is not a recommendation');
assert(!markup.includes('data-mobile-punt-explore="AST"'),'recoverable deficit is not a recommendation');
state.puntCats=['FT%','TO','3PM'];assert(!context.mobilePuntHtml().includes('data-mobile-punt-explore='),'full strategy cannot recommend a fourth punt');
state.puntCats=[];grades[0].rated=1;grades[0].unrated=2;assert(!context.mobilePuntHtml().includes('data-mobile-punt-explore='),'imputed roster cannot support recommendation');
grades[0].rated=3;grades[0].unrated=0;
context.mobileRosterMode='picks';markup=context.mobileTeamHtml();assert(markup.includes('R1 P1'));assert(!markup.includes('NaN'));assert.equal((markup.match(/class="m-category /g)||[]).length,9);
markup=context.mobilePlayerStats(data.PLAYERS.find(p=>p.n==='Nikola Jokic'));
assert(markup.includes('Strengths')&&markup.includes('Weaknesses'));assert(markup.includes('6.1 / 7.4')&&markup.includes('9.9 / 17.4'));assert.equal((markup.match(/<dd>/g)||[]).length,9);
markup=context.mobilePlayerStats(data.PLAYERS.find(p=>p.n==='Tyrese Haliburton'));assert(markup.includes('No recorded 2025–26'));
assert.equal(data.PLAYERS.filter(p=>context.window.PlayerAverages.players[p.n]).length,253);
for(const stats of Object.values(context.window.PlayerAverages.players)){assert(stats.g>0);assert(stats.ftm<=stats.fta&&stats.fgm<=stats.fga);for(const value of Object.values(stats))assert(Number.isFinite(value)&&value>=0);}
console.log('mobile views: opponent order, nine categories, adaptive punts, roster picks and sourced stat lines passed');

let completedRenders=0;context.cancelPickCoach=()=>{};context.renderDraft=()=>completedRenders++;context.isMobileDraft=()=>true;
vm.runInContext(source.slice(source.indexOf("function renderDone(){"),source.indexOf("function playoffBadge(pl){")),context);
context.mobileView="grades";context.renderDone();assert.equal(context.mobileView,"grades");
context.mobileView="players";context.renderDone();assert.equal(context.mobileView,"players");assert.equal(completedRenders,2,"completed mobile views retain navigation");
