#!/usr/bin/env node
'use strict';
/** Regenerate movers-outlook.js from git prior teams + DOC_PRIOR + PDATA ADP/last. */
const fs = require('fs');
const path = require('path');
const {execSync} = require('child_process');
const vm = require('vm');
const ROOT = path.join(__dirname, '..', '..', '..');
const ALIAS = {SAS:'SA',SA:'SA',NYK:'NY',NY:'NY',PHX:'PHO',PHO:'PHO',NOP:'NO',NO:'NO',WSH:'WAS',WAS:'WAS',GSW:'GS',GS:'GS',BRK:'BKN',BKN:'BKN',CHO:'CHA',CHA:'CHA',UTA:'UTA'};
function norm(t){if(!t||['—','-','FA','TBD','N/A','–'].includes(t))return null;t=String(t).toUpperCase().trim();return ALIAS[t]||t;}
function extractPlayers(blob){const m=blob.match(/var PLAYERS=\[(.*?)\];\s*\nPLAYERS\.forEach/s);const players={};for(const mm of m[1].matchAll(/\["([^"]+)",\[[^\]]*\],(?:"([^"]*)")?\]/g))players[mm[1]]=mm[2]||null;return players;}
const DOC_PRIOR={'Luke Kennard':'LAL','CJ McCollum':'WAS','Sandro Mamukelashvili':'TOR','Al Horford':'BOS','Andre Drummond':'PHI','Duncan Robinson':'MIA','Kelly Oubre Jr.':'PHI','Peyton Watson':'DEN','Collin Sexton':'UTA','Jonathan Kuminga':'GS','Jrue Holiday':'BOS','Damian Lillard':'MIL','Ty Jerome':'CLE','Nikola Vucevic':'BOS'};
const pre=execSync('git show 47c17da^:index.html',{cwd:ROOT,encoding:'utf8'});
const pPre=extractPlayers(pre);
const pCur=extractPlayers(fs.readFileSync(path.join(ROOT,'index.html'),'utf8'));
const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(ROOT,'player-data.js'),'utf8'),ctx);
const pdata=ctx.PDATA;const out={};const counts={movers:0,roleUp:0,roleDown:0,roleFlat:0,roleUnknown:0,withPrev:0,projMpg:0,projRank:0,players:0};
for(const name of Object.keys(pCur).sort()){
  const tc=norm(pCur[name]);
  const tpRaw=Object.prototype.hasOwnProperty.call(DOC_PRIOR,name)?DOC_PRIOR[name]:pPre[name];
  const tp=tpRaw?norm(tpRaw):null;const d=pdata[name]||{};
  const market=d.adp!=null?d.adp:d.adpF;const last=d.last;
  const mover=!!(tp&&tc&&tp!==tc);let roleDelta='unknown';
  if(market!=null&&last!=null&&isFinite(market)&&isFinite(last)){const gap=Number(last)-Number(market);const thr=mover?12:20;if(gap>=thr)roleDelta='up';else if(gap<=-thr)roleDelta='down';else roleDelta='flat';}
  const bits=[];if(mover)bits.push(tp+'\u2192'+tc);
  if(roleDelta==='up'&&market!=null&&last!=null)bits.push('ADP ahead of last rank');
  else if(roleDelta==='down'&&market!=null&&last!=null)bits.push('ADP behind last rank');
  else if(mover&&roleDelta==='unknown')bits.push('team change; role unclear');
  else if(mover&&roleDelta==='flat')bits.push('team change; ADP near last rank');
  let roleNote=bits.length?bits.join(' · '):undefined;if(roleNote&&roleNote.length>72)roleNote=roleNote.slice(0,69)+'\u2026';
  const rec={teamCurr:tc,mover,roleDelta};if(tp){rec.teamPrev=tp;counts.withPrev++;}if(roleNote)rec.roleNote=roleNote;
  out[name]=rec;counts.players++;if(mover)counts.movers++;
  counts['role'+roleDelta.charAt(0).toUpperCase()+roleDelta.slice(1)]++;
}
function esc(s){return String(s).replace(/\\/g,'\\\\').replace(/"/g,'\\"');}
const items=[];for(const name of Object.keys(out).sort()){const rec=out[name];const parts=[];if(rec.teamPrev)parts.push('teamPrev:"'+rec.teamPrev+'"');if(rec.teamCurr)parts.push('teamCurr:"'+rec.teamCurr+'"');parts.push('mover:'+(rec.mover?'true':'false'));parts.push('roleDelta:"'+rec.roleDelta+'"');if(rec.roleNote)parts.push('roleNote:"'+esc(rec.roleNote)+'"');items.push('"'+esc(name)+'":{'+parts.join(',')+'}');}
const js=`// movers-outlook.js — team-change + role outlook overlay for PDATA/PLAYERS.
//
// teamPrev / mover: sourced from pre-2026-09-12 bundled PLAYERS teams
//   (git 47c17da^) with Yahoo/Hashtag abbrev normalization, plus documented
//   priors in docs/adp-additions-2026-09-13.md for add-candidates.
// roleDelta / roleNote: HEURISTIC from Yahoo/Fantrax ADP vs 2025-26 last
//   (per-game) rank — not vacated-usage and not published projections.
// projMpg / projRank: omitted (no Hashtag projection snapshot in repo).
// See docs/movers-outlook.md and scripts/data-provenance/2026-09-20-movers-outlook/.
//
// Generated 2026-09-20. Regenerate: node scripts/data-provenance/2026-09-20-movers-outlook/generate.js
var MOVES={
${items.join(',\n')}
};
(function(){
  if(typeof PDATA==="undefined")return;
  Object.keys(MOVES).forEach(function(n){
    if(!Object.prototype.hasOwnProperty.call(PDATA,n))return;
    var m=MOVES[n],d=PDATA[n];
    if(m.teamPrev!=null)d.teamPrev=m.teamPrev;
    if(m.teamCurr!=null)d.teamCurr=m.teamCurr;
    d.mover=!!m.mover;
    d.roleDelta=m.roleDelta||"unknown";
    if(m.roleNote)d.roleNote=m.roleNote;
  });
})();
`;
fs.writeFileSync(path.join(ROOT,'movers-outlook.js'),js);
fs.writeFileSync(path.join(__dirname,'movers.json'),JSON.stringify({meta:{generated:'2026-09-20',counts,thresholds:{mover_gap:12,non_mover_gap:20}},players:out},null,2)+'\n');
console.log(JSON.stringify(counts,null,2));
