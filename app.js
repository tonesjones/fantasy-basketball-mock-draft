/* Draft Lab UI: state, rendering and event wiring. Data comes from player-pool.js;
   pure draft logic lives in draft-core.js and draft-analysis.js. */
(function(){
"use strict";
function injTitle(inj){return "INJURED — "+inj.injury+". "+inj.detail+" Expected return: "+inj.ret+". Source: "+inj.src+".";}
function injBadge(p){
  if(!p.inj)return "";
  var t=injTitle(p.inj);
  return '<button type="button" class="injtag" aria-expanded="false" aria-label="'+esc(t)+'">INJ</button><span class="injdetail" hidden>'+esc(t)+'</span>';
}
function wireInjToggles(root){
  if(!root)return;
  root.querySelectorAll(".injtag").forEach(function(btn){
    btn.addEventListener("click",function(e){
      e.preventDefault();e.stopPropagation();
      var det=btn.nextElementSibling;
      if(!det||!det.classList.contains("injdetail"))return;
      var willOpen=det.hidden;
      root.querySelectorAll(".injdetail").forEach(function(d){d.hidden=true;});
      root.querySelectorAll(".injtag").forEach(function(b){b.setAttribute("aria-expanded","false");});
      if(willOpen){det.hidden=false;btn.setAttribute("aria-expanded","true");}
    });
  });
}
var CATS9=["PTS","REB","AST","STL","BLK","3PM","FG%","FT%","TO"];
/* Category scarcity, BM-style: per-game category values (z-scores) aggregated
   across the available player pool. Replacement level per category = mean
   value of consensus ranks 150-170 (the end-of-draft tier). Each cell shows
   the share of draftable above-replacement value still on the board. */
var DA=window.DraftAnalysis;
var _scarcBase=null;
function scarcityBase(){return _scarcBase||(_scarcBase=DA.scarcityBase(PLAYERS,PDATA));}
function renderScarcity(){
  var nextPick=nextUserPickIdx();
  var outlook=DA.categoryOutlook({grades:draftGrades(),userTeam:userTeam(),players:PLAYERS,
    pdata:PDATA,log:state.log,nextPick:nextPick,
    followingPick:nextPick<0?-1:followingUserPickIdx(nextPick)});
  var base=scarcityBase(),taken={},i,c;
  for(i=0;i<state.log.length;i++)taken[state.log[i]]=1;
  var rem=[0,0,0,0,0,0,0,0,0],tops=[],pcts=[];
  for(c=0;c<9;c++)tops.push([]);
  base.idx.forEach(function(j){
    if(taken[j])return;
    var pl=PLAYERS[j],cv=PDATA[pl.n].cv;
    for(c=0;c<9;c++){var v=cv[c]-base.repl[c];if(v>0){rem[c]+=v;tops[c].push({n:pl.n,v:v});}}
  });
  CATS9.forEach(function(cat,ci){
    var pct=base.start[ci]>0?Math.round(rem[ci]/base.start[ci]*100):0;
    if(pct>100)pct=100;if(pct<0)pct=0;
    pcts.push({cat:cat,pct:pct,ci:ci});
  });
  var strong=outlook.rows.filter(function(x){return x.status==="strong"||x.status==="surplus";})
    .sort(function(a,b){return a.gap-b.gap;});
  var paths=outlook.rows.filter(function(x){return x.status==="weak"&&(x.catchup==="one-pick"||x.catchup==="two-pick");})
    .sort(function(a,b){return b.gap-a.gap;});
  var hard=outlook.rows.filter(function(x){return x.status==="weak"&&x.catchup==="hard-climb";})
    .sort(function(a,b){return b.gap-a.gap;});
  var quiet=outlook.ready
    ? (outlook.knownPicks<5?"Early read · ":"")+"Strong: "+(strong.slice(0,2).map(function(x){return CATS9[x.ci];}).join(", ")||"none yet")+
      (paths.length?" · Catch-up paths: "+paths.slice(0,2).map(function(x){return CATS9[x.ci];}).join(", "):"")+
      (hard.length?" · Hard climb: "+hard.slice(0,2).map(function(x){return CATS9[x.ci];}).join(", "):"")
    : "Your strengths, weak spots, and what remains";
  var h='<details class="scarcity" id="mdscarcity"'+(state.scarcityOpen?' open':'')+'>';
  h+='<summary><b>Category outlook</b> <span class="muted">'+quiet+'</span></summary>';
  h+='<section class="catprofile"><h3>Your roster vs the room</h3>';
  if(!outlook.ready){
    var reason=outlook.knownPicks<3?"It needs at least three of your picks."
      :outlook.mappedRoom/outlook.roomPicks<0.8||outlook.knownPicks/outlook.draftedPicks<0.8
        ?"Too many Yahoo picks are outside the player pool for a reliable comparison."
        :"It needs more drafted teams to compare.";
    h+='<p class="muted">Too early to compare. '+reason+'</p>';
  }else{
    h+='<p class="muted">'+(outlook.knownPicks<5?'Early read · ':'')+outlook.knownPicks+' of your picks mapped. Rank compares 2025–26 category value per picked player across the drafted teams.</p>';
    h+='<div class="catprofile-list">';
    outlook.rows.forEach(function(row){
      var label=({surplus:"Clear lead",strong:"Strong",weak:"Needs help","in-mix":"In the mix"})[row.status];
      h+='<div class="catprofile-row '+row.status+'"><b>'+CATS9[row.ci]+'</b><span class="catprofile-rank">#'+row.rank+'/'+TEAMS+'</span><span class="catprofile-status">'+label+'</span>';
      if(row.status==="weak"){
        var path=({"one-pick":"One-pick path","two-pick":"Two-pick path","hard-climb":"Hard climb now","no-picks":"No picks left"})[row.catchup];
        var names=row.near.slice(0,2).map(function(p){return esc(p.name);}).join(', ');
        h+='<span class="catprofile-detail">'+row.gap.toFixed(1)+' value per pick behind the room’s middle · '+path;
        if(names)h+=' · Near-pick options: '+names;
        h+='</span>';
      }
      h+='</div>';
    });
    h+='</div><p class="muted">Catch-up paths are optimistic: they assume those players remain available and other teams add middle-of-the-room picks. They are not punt recommendations.</p>';
  }
  h+='</section><section class="catpool"><h3>Player pool still available</h3><p class="muted">Share of draftable value left in each category. This describes supply, not your roster.</p>';
  h+='<div class="catgrid">';
  pcts.forEach(function(row){
    var cat=row.cat,ci=row.ci,pct=row.pct;
    var hue=Math.round(pct*1.2);
    tops[ci].sort(function(a,b){return b.v-a.v;});
    var tipRows=tops[ci].slice(0,3);
    var tip=tipRows.map(function(t){return t.n+" +"+t.v.toFixed(1);}).join(", ")||"nothing above replacement";
    var topsHtml=tipRows.length?tipRows.map(function(t){return esc(t.n)+" <b>+"+t.v.toFixed(1)+"</b>";}).join("<br>"):"nothing above replacement";
    h+='<div class="catchip'+(pct<=35?' hot':'')+'" tabindex="0" role="button" aria-expanded="false" aria-label="'+esc(cat)+' '+pct+' percent remaining. Most left: '+esc(tip)+'">';
    h+='<span class="catname">'+cat+'</span><span class="catnum" style="color:hsl('+hue+',62%,55%)">'+pct+'%</span><div class="catbar"><i style="width:'+pct+'%;background:hsl('+hue+',62%,45%)"></i></div>';
    h+='<div class="cattops" hidden><b>Top available</b><br>'+topsHtml+'</div></div>';
  });
  h+='</div><p class="muted">BM-style 2025-26 per-game category values (z-scores; FG%/FT% volume-weighted, TO inverted). Replacement = mean of consensus ranks 150&ndash;170. Tap a category chip to see top contributors. Roster values are historical or market-imputed, not 2026–27 projections.</p></section></details>';
  return h;
}
function wireScarcityToggles(root){
  if(!root)return;
  var panel=root.querySelector("#mdscarcity")||root;
  panel.querySelectorAll(".catchip").forEach(function(chip){
    function toggle(){
      var tops=chip.querySelector(".cattops");if(!tops)return;
      var willOpen=tops.hidden;
      panel.querySelectorAll(".cattops").forEach(function(d){d.hidden=true;});
      panel.querySelectorAll(".catchip").forEach(function(c){c.setAttribute("aria-expanded","false");});
      if(willOpen){tops.hidden=false;chip.setAttribute("aria-expanded","true");}
    }
    chip.addEventListener("click",function(e){e.preventDefault();toggle();});
    chip.addEventListener("keydown",function(e){if(e.key==="Enter"||e.key===" "){e.preventDefault();toggle();}});
  });
  var det=root.querySelector("#mdscarcity");
  if(det)det.addEventListener("toggle",function(){state.scarcityOpen=det.open;save();});
}

var TEAMS=12;
var CORE=window.DraftCore;
var BASE_SLOTS=["PG","SG","G","SF","PF","F","C","C","Util","Util","BN","BN","BN"];
var DATA_VERSION="2026-09-29b";
var STORAGE_KEY="fantasy-basketball-mock-draft.v2";
var HW=(typeof window!=="undefined"&&window.hatchWidget)?window.hatchWidget:null;
var DEFAULTS={phase:"setup",draftPos:6,rounds:13,log:[],q:"",f:"All",view:"team",sort:"cons",puntCats:[],playoffStart:20,page:0,seed:123456789,rngState:123456789,userTurns:[],filtersOpen:false,scarcityOpen:false,focusPi:null};
function freshState(){var seed=(Date.now()>>>0)||1;return Object.assign({},DEFAULTS,{seed:seed,rngState:seed,log:[],userTurns:[]});}
function cleanState(raw){
  var out=Object.assign({},DEFAULTS,raw||{}), used={};
  out.draftPos=Math.max(1,Math.min(TEAMS,parseInt(out.draftPos,10)||DEFAULTS.draftPos));
  out.rounds=Math.max(10,Math.min(15,parseInt(out.rounds,10)||DEFAULTS.rounds));
  out.log=Array.isArray(out.log)?out.log.filter(function(pi){if(!CORE.validPlayerIndex(PLAYERS,[],pi)||used[pi])return false;used[pi]=true;return true;}).slice(0,TEAMS*out.rounds):[];
  out.phase=out.log.length>=TEAMS*out.rounds?"done":(out.phase==="draft"?"draft":"setup");
  out.f=["All","PG","SG","SF","PF","C"].indexOf(out.f)>=0?out.f:"All";
  /* puntCats: up to PuntCore.MAX_PUNTS categories. Older saves stored one puntCategory string. */
  var rawPunt=(raw||{});out.puntCats=PuntCore.normalize(Array.isArray(rawPunt.puntCats)?rawPunt.puntCats:rawPunt.puntCategory);delete out.puntCategory;
  out.sort=["cons","rank","adp","last","lastTotal","punt"].indexOf(out.sort)>=0?out.sort:"cons";
  if(out.sort==="punt"&&!out.puntCats.length)out.sort="cons";
  out.view=["team","board","grades","coach"].indexOf(out.view)>=0?out.view:(out.view==="explore"?"coach":"team");
  out.focusPi=(out.focusPi==null||out.focusPi==="")?null:(parseInt(out.focusPi,10)>=0?parseInt(out.focusPi,10):null);
  out.filtersOpen=!!out.filtersOpen;
  out.scarcityOpen=!!out.scarcityOpen;
  out.playoffStart=[18,19,20,21].indexOf(out.playoffStart)>=0?out.playoffStart:20;
  out.page=Math.max(0,parseInt(out.page,10)||0);
  out.seed=(parseInt(out.seed,10)>>>0)||1;out.rngState=(parseInt(out.rngState,10)>>>0)||out.seed;
  out.userTurns=Array.isArray(out.userTurns)?out.userTurns.filter(function(x){return x&&Array.isArray(x.log);}).slice(-20):[];
  return out;
}
function loadStandalone(){try{var saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||"null");return saved&&saved.schema===2&&saved.dataVersion===DATA_VERSION?cleanState(saved.state):freshState();}catch(e){return freshState();}}
var state=HW?cleanState(HW.getState(DEFAULTS)):loadStandalone();
function save(){
  if(HW){try{HW.setState(state);}catch(e){}}
  else{try{localStorage.setItem(STORAGE_KEY,JSON.stringify({schema:2,dataVersion:DATA_VERSION,state:state}));}catch(e){}}
}
function clearSaved(){if(!HW){try{localStorage.removeItem(STORAGE_KEY);}catch(e){}}}
function cancelPickCoach(){
  if(typeof window.PickCoach!=="undefined"&&window.PickCoach.cancel)try{window.PickCoach.cancel();}catch(e){}
  _pcEvalSeq++;
}
function setState(patch){
  var prevView=state.view,prevPhase=state.phase;
  state=cleanState(Object.assign({},state,patch));
  save();
  if((prevView==="coach"&&state.view!=="coach")||state.phase==="done"||state.phase==="setup"||(prevPhase==="draft"&&state.phase!=="draft")){
    cancelPickCoach();
  }
  render();
}
window.addEventListener("hatch-widget-state",function(e){state=cleanState(e.detail.state);render();});
function el(id){return document.getElementById(id);}
function teamForPick(idx){return CORE.teamForPick(idx,TEAMS);}
function teamName(t){return t===state.draftPos-1?"You":"CPU "+(t+1);}
function totalPicks(){return TEAMS*state.rounds;}
function userTeam(){return state.draftPos-1;}
function isUserTurn(){return state.log.length<totalPicks()&&teamForPick(state.log.length)===userTeam();}
function draftSlots(){return CORE.slotsForRounds(state.rounds,BASE_SLOTS);}
function cpuPick(log,rng){return CORE.cpuPickIndex({players:PLAYERS,log:log,teams:TEAMS,slots:draftSlots(),totalPicks:totalPicks(),random:function(){return rng.next();}});}
function simulateToUser(log,rngState){
  var next=log.slice(),rng=CORE.seededRandom(rngState);
  while(next.length<totalPicks()&&teamForPick(next.length)!==userTeam()){
    var pi=cpuPick(next,rng);if(!CORE.validPlayerIndex(PLAYERS,next,pi))break;next.push(pi);
  }
  return {log:next,rngState:rng.getState()};
}
var _lastLive="";
var _pendingLive="";
function announceLive(msg){
  if(!msg||msg===_lastLive)return;
  _lastLive=msg;
  var n=el("mdlive");
  if(n){n.textContent="";n.textContent=msg;}
}
function advance(){
  var before=state.log.length;
  var next=simulateToUser(state.log,state.rngState);
  var n=next.log.length-before;
  if(n>0)_pendingLive=n+" CPU pick"+(n===1?"":"s")+" completed. ";
  setState({log:next.log,rngState:next.rngState,phase:next.log.length>=totalPicks()?"done":"draft"});
}
function userDraft(pi){
  if(!isUserTurn()||!CORE.validPlayerIndex(PLAYERS,state.log,pi))return;
  if(isMobileDraft())closeMobileSheet();
  var checkpoint={log:state.log.slice(),rngState:state.rngState};
  var name=PLAYERS[pi].n;
  var next=simulateToUser(state.log.concat([pi]),state.rngState);
  if(isMobileDraft()&&next.log.length>=totalPicks())mobileView="team";
  var cpu=next.log.length-(checkpoint.log.length+1);
  _pendingLive="You drafted "+name+". "+(cpu>0?cpu+" CPU pick"+(cpu===1?"":"s")+" followed. ":"");
  setState({log:next.log,rngState:next.rngState,userTurns:state.userTurns.concat([checkpoint]).slice(-20),phase:next.log.length>=totalPicks()?"done":"draft",page:isMobileDraft()?state.page:0});
  showPickMoment(name,checkpoint.log.length);
}
function showPickMoment(name,pickIndex){
  var old=el("mdpickmoment");if(old)old.remove();
  var panel=document.createElement("div");panel.id="mdpickmoment";panel.className="pick-moment";
  var grade=draftGrades().filter(function(g){return g.team===userTeam();})[0];
  var heading=document.createElement("strong");heading.textContent=isMobileDraft()?name+" drafted":"Your pick #"+(pickIndex+1);
  var player=document.createElement("span");player.textContent=name;
  var note=document.createElement("small");note.textContent=grade&&grade.rated?"Team grade "+grade.grade+" · historical 9-cat":"Added to your team";
  /* Phones: header-only toast; "Undo pick" stays reachable in the pick header. */
  if(isMobileDraft())panel.append(heading);else panel.append(heading,player,note);
  document.body.append(panel);
  setTimeout(function(){panel.remove();},2400);
}
function undoUserPick(){
  var moment=el("mdpickmoment");if(moment)moment.remove();
  var history=state.userTurns.slice(),checkpoint=history.pop();if(!checkpoint)return;
  setState({log:checkpoint.log,rngState:checkpoint.rngState,userTurns:history,phase:"draft",page:isMobileDraft()?state.page:0});
}
function restartDraft(){mobilePuntPreview=null;mobileRosterMode="slots";mobileView="players";clearSaved();state=freshState();save();render();}
/* Phone header Restart needs a second tap within 3s, so a stray tap can't wipe the draft. */
var restartArmTimer=null;
function onRestartClick(e){
  var b=e.currentTarget;
  if(!isMobileDraft()||b.classList.contains("armed")){clearTimeout(restartArmTimer);restartDraft();return;}
  b.classList.add("armed");b.textContent="Tap again to restart";announceLive("Tap Restart again to clear this draft.");
  restartArmTimer=setTimeout(function(){if(b.isConnected){b.classList.remove("armed");b.textContent="Restart";}},3000);
}
/* Escape ANY data interpolated into innerHTML strings (names, notes, anything from an API). Text from the network goes in via textContent. */
function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");}
function posBadges(p){return p.map(function(x){return x;}).join("/");}
function pickLabel(idx){var r=Math.floor(idx/TEAMS)+1;var w=idx%TEAMS+1;return "R"+r+" P"+w;}

var HEALTH=window.DataHealth.audit(PLAYERS,typeof PDATA!=="undefined"?PDATA:{},CATS);
function renderDataHealth(label){
  var h='<details class="setup-details"><summary><b>'+(label||'Data health')+'</b> &middot; '+(HEALTH.players-HEALTH.missingAdp.length)+'/'+HEALTH.players+' players with Yahoo ADP &middot; '+esc(DATA_VERSION)+'</summary>';
  h+='<p class="muted">Yahoo\'s 29 September workbook publishes All Drafts ADP for 190 players, ending at an average pick of 121.4. ADP is an average pick number, so several players can share the same range. Later entries show dashes. In this app\'s pool, '+HEALTH.missingAdp.length+' players have no Yahoo ADP. That reflects the source\'s limited coverage, rather than a failed import. Players absent from the workbook kept their previous Yahoo values.</p>';
  h+='<p class="muted">To cover later picks, computer teams use a Yahoo and Fantrax consensus, with Fantrax alone where Yahoo has no value. Crowded late-draft values carry less weight, and Fantrax ADPs above 200 are compressed. Players without either ADP follow all listed players, ordered by last season\'s rank. The Yahoo ADP column stays blank where Yahoo has no value; we do not invent Yahoo estimates.</p>';
  h+='<p class="muted">Fantrax ADP, teams and positions come from Hashtag Basketball\'s 25 September snapshot. Built-in Rank adjusts consensus by up to 20 places toward 2025-26 production. Players flagged INJ receive no production adjustment. Tap an INJ badge for the injury, return outlook and source.</p>';
  h+='<p class="muted">Category scarcity and player strength tags use last season\'s per-game stats. Role arrows compare ADP with last season\'s rank. Neither predicts this season\'s production. For selected players who changed teams, Pick coach also names former teammates who may gain minutes or touches. These notes are curated, and the app has no projected minutes or ranks.</p>';
  h+='<p class="muted">Other gaps: '+HEALTH.missingLast.length+' players without a prior-season rank; '+HEALTH.untagged.length+' without category labels; '+HEALTH.placeholderTeams.length+' with an unknown team. Unavailable historical ranks stay blank. Category labels are informational; scarcity uses the underlying stats. These checks verify consistency within the app, but do not establish that the pool includes every NBA player.</p>';
  if(HEALTH.errors.length||HEALTH.missingData.length||HEALTH.orphanData.length)h+='<p>Data consistency issues: '+(HEALTH.errors.length+HEALTH.missingData.length+HEALTH.orphanData.length)+'. Run node audit-data.js for details.</p>';
  return h+'</details>';
}


var _pcEvalSeq=0;
function viewTabsHtml(){
  var views=[["team","My team"],["board","Draft board"],["grades","Grades"],["coach","Pick coach"]];
  var h='<div class="viewtabs tabs" role="tablist" aria-label="Draft room views">';
  views.forEach(function(v){
    h+='<button class="segtab'+(state.view===v[0]?' sel':'')+'" data-view="'+v[0]+'" role="tab" aria-selected="'+(state.view===v[0]?'true':'false')+'">'+v[1]+'</button>';
  });
  return h+'</div>';
}
function visibleCandidateIndexes(){
  var taken={},i;for(i=0;i<state.log.length;i++)taken[state.log[i]]=1;
  var q=state.q.toLowerCase(),f=state.f,cands=[];
  for(i=0;i<PLAYERS.length;i++){
    if(taken[i])continue;var pl=PLAYERS[i];
    if(f!=="All"&&pl.p.indexOf(f)<0)continue;
    if(q&&pl.n.toLowerCase().indexOf(q)<0)continue;
    cands.push(i);
  }
  var srt=state.sort||"cons";
  var puntByPi={};
  if(srt==="punt"){
    var taken={};state.log.forEach(function(pi){taken[pi]=1;});
    PuntCore.rankings(PLAYERS,PDATA,taken,state.puntCats).forEach(function(row){puntByPi[row.pi]=row;});
  }
  function skey(x){return x==null?1e9:x;}
  if(srt==="punt")cands.sort(function(a,b){return (puntByPi[a]?puntByPi[a].puntRank:1e9)-(puntByPi[b]?puntByPi[b].puntRank:1e9)||consRank(PLAYERS[a])-consRank(PLAYERS[b]);});
  else if(srt==="adp")cands.sort(function(a,b){return skey(PLAYERS[a].adp)-skey(PLAYERS[b].adp);});
  else if(srt==="last")cands.sort(function(a,b){return skey(PLAYERS[a].last)-skey(PLAYERS[b].last);});
  else if(srt==="lastTotal")cands.sort(function(a,b){return skey(PLAYERS[a].lastTotal)-skey(PLAYERS[b].lastTotal);});
  else if(srt==="cons")cands.sort(function(a,b){return consRank(PLAYERS[a])-consRank(PLAYERS[b]);});
  else cands.sort(function(a,b){return PLAYERS[a].r-PLAYERS[b].r;});
  return cands;
}
function resolveFocusPi(){
  var cands=visibleCandidateIndexes();
  if(!cands.length)return null;
  if(state.focusPi!=null&&cands.indexOf(state.focusPi)>=0)return state.focusPi;
  return cands[0];
}
function setFocusPi(pi,opts){
  opts=opts||{};
  var next=(pi==null||pi==="")?null:parseInt(pi,10);
  if(state.focusPi===next){if(opts.force)refreshPickCoach();return;}
  state.focusPi=next;
  save();
  if(opts.rerenderList!==false){
    var list=el("mdplist");
    if(list){
      var keepScroll=list.scrollTop;
      list.querySelectorAll(".prow.pc-focus").forEach(function(n){n.classList.remove("pc-focus");});
      var row=list.querySelector('.prow[data-pi="'+next+'"]');
      if(row){
        row.classList.add("pc-focus");
        row.setAttribute("aria-pressed","true");
      }
      list.querySelectorAll(".prow[data-pi]").forEach(function(n){
        if(n!==row)n.setAttribute("aria-pressed","false");
      });
      list.scrollTop=keepScroll; /* coach-dock: preserve list scroll; do not scroll page to #pick-coach */
    }
  }
  refreshPickCoach();
}
function evaluatePlayer(pi){
  if(isMobileDraft()){
    rememberMobileScroll();
    mobileView="players";
    mobileSheetPlayer=pi;
    var mobileIndex=visibleCandidateIndexes().indexOf(pi),mobilePatch={view:"coach",focusPi:pi};
    if(mobileIndex<0){mobilePatch.q=PLAYERS[pi].n;mobilePatch.f="All";mobileIndex=0;}
    mobilePatch.page=Math.floor(mobileIndex/50);
    if(mobilePatch.page!==state.page)mobileScroll.players=0;
    setState(mobilePatch);
    return;
  }
  var cands=visibleCandidateIndexes(),index=cands.indexOf(pi),patch={focusPi:pi,view:"coach"};
  if(index<0){patch.q=PLAYERS[pi].n;patch.f="All";index=0;}
  patch.page=Math.floor(Math.max(0,index)/50);
  if(state.view==="coach"&&state.page===patch.page&&index>=0&&patch.q==null)setFocusPi(pi);
  else setState(patch);
  revealFocusedRow(pi);
}
function revealFocusedRow(pi){
  var list=el("mdplist"),row=list&&list.querySelector('.prow[data-pi="'+pi+'"]');
  /* Mobile coach dock: the whole .avail panel scrolls, not the list itself. */
  var pane=list&&list.closest(".cols.coach-dock .avail");
  if(row&&pane&&list.scrollHeight<=list.clientHeight+1){
    var pr=pane.getBoundingClientRect(),rr=row.getBoundingClientRect();
    if(rr.top<pr.top)pane.scrollTop+=rr.top-pr.top;
    else if(rr.bottom>pr.bottom)pane.scrollTop+=rr.bottom-pr.bottom;
    return;
  }
  if(row){var r=row.getBoundingClientRect(),box=list.getBoundingClientRect(),meta=list.querySelector('.listmeta'),top=box.top+(meta?meta.getBoundingClientRect().height:0);if(r.height>=box.bottom-top||r.top<top)list.scrollTop+=r.top-top;else if(r.bottom>box.bottom)list.scrollTop+=r.bottom-box.bottom;}
}
/* waitText: shown while it isn't your turn (a finished phone draft passes its own). */
function pickCoachShellHtml(waitText){
  return '<section id="pick-coach" class="pick-coach" aria-label="Pick coach">'
    +'<p class="pc-empty muted" hidden>Select a player to evaluate.</p>'
    +'<p class="pc-wait muted" hidden>'+(waitText||'Available on your turn.')+'</p>'
    +'<p class="pc-loading muted" hidden>Evaluating…</p>'
    +'<div class="pc-card" hidden>'
    +'<div class="pc-head"><div class="pc-identity"><div class="pc-name"></div><div class="pc-meta muted"></div><div class="pc-source muted" hidden></div></div><button class="draftbtn pc-draft" type="button" disabled>Draft</button></div>'
    +'<p class="pc-basis" hidden></p>'
    +'<div class="pc-suggest"><div class="pc-choice"></div><p class="pc-why muted"></p><p class="pc-conf muted"></p><p class="pc-score-quiet muted" hidden></p><div class="pc-score" hidden></div></div>'
    +'<div class="pc-lean" hidden><div class="pc-choice pc-choice-lean"></div><p class="pc-lean-sub muted">Soft lean \u2014 mid confidence</p><p class="pc-why muted"></p><p class="pc-conf muted"></p></div>'
    +'<div class="pc-pass" hidden><div class="pc-choice pc-choice-pass">Pass</div><p class="pc-pass-sub muted">Below value at this pick</p><p class="pc-why muted"></p><p class="pc-conf muted" hidden></p></div>'
    +'<div class="pc-uncertain"><p class="pc-uncertain-title">Not sure enough to suggest</p><p class="pc-uncertain-sub muted">Low confidence \u2014 your call</p><p class="pc-uncertain-why muted" hidden></p><p class="pc-conf muted" hidden></p></div>'
    +'<div class="pc-call" hidden><span class="pc-call-label"></span><span class="pc-call-why muted"></span><button type="button" class="pc-alt textlink" hidden></button></div>'
    +'<div class="pc-strengths" hidden></div>'
    +'<div class="pc-playoff muted" hidden></div>'
    +'<div class="pc-target muted" hidden></div>'
    +'</div></section>';
}
function pcShow(root, which){
  ["pc-empty","pc-wait","pc-loading"].forEach(function(c){
    var n=root.querySelector("."+c);if(n)n.hidden=which!==c;
  });
  var card=root.querySelector(".pc-card");
  if(card)card.hidden=which!=="pc-card";
}
function buildPickCoachPayload(pi){
  var pl=PLAYERS[pi];
  var pickNumber=state.log.length+1;
  var logLen=state.log.length;
  var nxt=nextUserPickIdx();
  var picksUntilNext=0;
  if(isUserTurn()){
    var nxt2=-1,tot2=totalPicks();
    for(var j=pickNumber;j<tot2;j++)if(teamForPick(j)===userTeam()){nxt2=j;break;}
    picksUntilNext=nxt2>=0?nxt2-(pickNumber-1):0;
  }else if(nxt>=0)picksUntilNext=nxt-state.log.length;
  var ros=myRoster();
  var open=[],filled=[],drafted=[];
  ros.slots.forEach(function(e){
    if(e.player){filled.push(e.slot);drafted.push({name:e.player.player.n,positions:e.player.player.p.slice(),pick:e.player.index+1});}
    else open.push(e.slot);
  });
  var rem=scarcityRemPcts();
  var thinCats=[];
  CATS9.forEach(function(cat){if(rem[cat]!=null&&rem[cat]<=35)thinCats.push(cat);});
  var priorityNeeds=[];
  open.forEach(function(s){if(["C","PF","SF","SG","PG"].indexOf(s)>=0&&priorityNeeds.indexOf(s)<0)priorityNeeds.push(s);});
  thinCats.forEach(function(c){if(priorityNeeds.indexOf(c)<0)priorityNeeds.push(c);});
  priorityNeeds=priorityNeeds.slice(0,6);
  var taken={},ti;for(ti=0;ti<state.log.length;ti++)taken[state.log[ti]]=1;
  var notable=[],ni;
  for(ni=0;ni<PLAYERS.length&&notable.length<6;ni++){
    if(taken[ni]||ni===pi)continue;
    var np=PLAYERS[ni];
    notable.push({name:np.n,adp:np.adp,positions:np.p.slice(),rank:np.r});
  }
  var recently=[],ri,from=Math.max(0,state.log.length-5);
  for(ri=from;ri<state.log.length;ri++){
    var rp=PLAYERS[state.log[ri]];
    if(rp)recently.push({name:rp.n,pick:ri+1});
  }
  return {
    player:pl.n,
    pickNumber:pickNumber,
    logLen:logLen,
    adp:pl.adp,
    rank:pl.r,
    positions:pl.p.slice(),
    team:pl.t,
    picksUntilNext:picksUntilNext,
    rosterNeeds:{filledSlots:filled,openSlots:open,alreadyDraftedByUser:drafted,priorityNeeds:priorityNeeds},
    notableAvailable:notable,
    recentlyTaken:recently,
    scarcityRem:rem,
    mover:!!pl.mover,
    roleDelta:pl.roleDelta||null,
    roleNote:pl.roleNote||null,
    teamPrev:pl.teamPrev||null,
    projMpg:pl.projMpg!=null?pl.projMpg:null,
    projRank:pl.projRank!=null?pl.projRank:null,
    signals:buildPickSignals(pl, pickNumber, nxt2 + 1, open, taken)
    // nxt2 is the zero-based draft index of the user's next pick;
    // buildPickSignals/PS.evaluate expect a one-based pick number.
  };
}
/* Deterministic pick signals for the coach. Computed locally from market data
 * + curated edges — Jev gives an independent second opinion, it doesn't vote. */
function buildPickSignals(pl, pickNumber, nextPick, openSlots, taken) {
  try {
    if (typeof window.PickSignals === "undefined") return null;
    var PS = window.PickSignals;
    var available = [];
    for (var i = 0; i < PLAYERS.length; i++) {
      if (!taken[i]) available.push(PLAYERS[i]);
    }
    // netVac is cached per page load (depends only on static data).
    if (!window._netVacCache && typeof MOVES !== "undefined" && typeof VACATED_USAGE !== "undefined") {
      window._netVacCache = PS.netVacated(PLAYERS, MOVES, VACATED_USAGE);
    }
    var ctx = {
      moves: (typeof MOVES !== "undefined") ? MOVES : {},
      netVac: window._netVacCache || {},
      playoffStart: (typeof state !== "undefined" && state.playoffStart) || 20
    };
    return PS.evaluate(pl, {
      pick: pickNumber,
      nextPick: nextPick > 0 ? nextPick : pickNumber + 23,
      available: available,
      openSlots: openSlots,
      ctx: ctx
    });
  } catch (e) { return null; }
}
function scarcityRemPcts(){
  var base=scarcityBase(),taken={},i,c;
  for(i=0;i<state.log.length;i++)taken[state.log[i]]=1;
  var rem=[0,0,0,0,0,0,0,0,0],out={};
  base.idx.forEach(function(j){
    if(taken[j])return;
    var cv=PDATA[PLAYERS[j].n].cv;
    for(c=0;c<9;c++){var v=cv[c]-base.repl[c];if(v>0)rem[c]+=v;}
  });
  CATS9.forEach(function(cat,ci){
    var pct=base.start[ci]>0?Math.round(rem[ci]/base.start[ci]*100):0;
    if(pct>100)pct=100;if(pct<0)pct=0;
    out[cat]=pct;
  });
  return out;
}
function rosterCoveredCats(){
  var covered={},ros=myRoster();
  ros.slots.forEach(function(e){
    if(!e.player||!e.player.player)return;
    (e.player.player.c||[]).forEach(function(cat){covered[cat]=true;});
  });
  return covered;
}
function pickCoachStrengthTags(pl){
  return (pl&&pl.c&&pl.c.length)?pl.c.slice(0,4):[];
}
function renderPickCoachStrengths(pl, remMap){
  var tags=pickCoachStrengthTags(pl);
  var mv=moverRoleChipHtml(pl, true);
  var catHtml=tags.map(function(cat){
    var pct=remMap&&remMap[cat]!=null?remMap[cat]:null;
    var tip=pct!=null?(cat+" · "+pct+"% left"):cat;
    return '<span class="pc-chip" title="'+esc(tip)+'">'+esc(cat)+'</span>';
  }).join("");
  return (mv||"")+(mv&&catHtml?" ":"")+catHtml;
}

function moverTeamLabel(pl){
  if(!pl)return "";
  var prev=String(pl.teamPrev||"").trim();
  var curr=String(pl.t||pl.teamCurr||"").trim();
  return prev&&curr&&prev!==curr?prev+"→"+curr:"";
}
function humanRoleNote(pl){
  if(!pl)return "";
  var note=String(pl.roleNote||"").trim();
  if(!note||note.length>60)return "";
  var team=moverTeamLabel(pl);
  if(team&&note.indexOf(team+" · ")==0)note=note.slice(team.length+3).trim();
  // These are generated ADP/team heuristics, not human-facing role copy.
  if(/^(?:ADP (?:ahead of|behind) last rank|team change(?:; ADP near last rank)?|role unclear)$/i.test(note))return "";
  return note;
}
function moverRolePhrase(pl){
  if(!pl)return "";
  var note=humanRoleNote(pl);
  if(note)return note;
  if(pl.roleDelta==="up")return "expanded role";
  if(pl.roleDelta==="down")return "smaller role";
  return "";
}
function moverRoleTooltip(pl){
  var team=moverTeamLabel(pl), phrase=moverRolePhrase(pl);
  if(team&&phrase)return team+" · "+phrase;
  if(phrase)return phrase;
  if(team)return team;
  return pl&&pl.mover?"new team":"";
}
function moverWhyClause(pl){
  if(!pl)return "";
  var phrase=moverRolePhrase(pl);
  if(pl.mover)return phrase?("new team · "+phrase):"new team";
  return phrase;
}
function moverRoleChipHtml(pl, asPcChip){
  if(!pl)return "";
  var tipBase=moverRoleTooltip(pl);
  var vacTip=vacatedWhyClause(pl);
  if(vacTip) tipBase=tipBase? (tipBase+" · "+vacTip) : vacTip;
  var tip=esc(tipBase);
  var cls=asPcChip?"pc-chip ":"";
  var parts=[];
  if(pl.mover){
    parts.push('<span class="'+cls+'mv-chip" title="'+tip+'">NEW</span>');
  }
  if(pl.roleDelta==="up"){
    parts.push('<span class="'+cls+'role-chip role-up" title="'+tip+'">↑ role</span>');
  }else if(pl.roleDelta==="down"){
    parts.push('<span class="'+cls+'role-chip role-down" title="'+tip+'">↓ role</span>');
  }
  return parts.join("");
}
function appendMoverWhy(pl, parts){
  var clause=moverWhyClause(pl);
  if(clause&&parts)parts.push(clause);
}
function vacatedWhyClause(pl){
  if(!pl||!pl.vacatedGainers||!pl.vacatedGainers.length)return "";
  var names=[];
  for(var i=0;i<pl.vacatedGainers.length&&i<3;i++){
    var g=pl.vacatedGainers[i];
    var nm=g&&g.name?String(g.name).trim():"";
    if(nm)names.push(nm);
  }
  if(!names.length)return "";
  return "Vacates usage → "+names.join(", ");
}
function appendVacatedWhy(pl, parts){
  var clause=vacatedWhyClause(pl);
  if(clause&&parts)parts.push(clause);
}
function softAdpClause(choice, pickNumber, adp){
  if(adp==null||!isFinite(Number(adp)))return "";
  if(choice==="pass")return ""; // deterministic reasons already carry the value statement
  var delta=pickNumber-Number(adp);
  if(choice==="take"){
    if(delta>=3)return "value vs ADP";
    if(delta<=-3)return "near ADP";
    return "near ADP";
  }
  if(choice==="reach")return "early vs ADP";
  if(choice==="wait")return "can wait vs ADP";
  if(Math.abs(delta)<=2)return "near ADP";
  if(delta>2)return "value vs ADP";
  return "early vs ADP";
}
function buildPickCoachWhy(pl, choice, pickNumber, jevWhy){
  var tags=pickCoachStrengthTags(pl);
  var rem=scarcityRemPcts();
  var covered=rosterCoveredCats();
  var parts=[],used={};
  var thin=[];
  tags.forEach(function(cat){
    var pct=rem[cat];
    if(pct!=null&&pct<=35){
      thin.push("fills thin "+cat+" ("+pct+"% left)");
      used[cat]=1;
    }
  });
  parts=parts.concat(thin);
  var elite=tags.filter(function(cat){return !used[cat];});
  if(choice==="wait"){
    var already=elite.filter(function(cat){return covered[cat];});
    var rest=elite.filter(function(cat){return !covered[cat];});
    if(already.length)parts.push(already.join(" · ")+" already covered");
    if(rest.length)parts.push(rest.length===1?("strong "+rest[0]):("elite "+rest.join(" · ")));
  }else if(elite.length){
    if(elite.length===1)parts.push("strong "+elite[0]);
    else parts.push("elite "+elite.join(" · "));
  }
  if(pl.inj){
    var injNote="INJ "+(pl.inj.injury||"listed");
    if(pl.inj.ret)injNote+=" · return "+pl.inj.ret;
    parts.push(injNote);
  }
  var adpBit=softAdpClause(choice, pickNumber, pl.adp);
  if(adpBit){
    if(choice==="reach"&&parts.length)parts.push("but "+adpBit);
    else parts.push(adpBit);
  }
  appendMoverWhy(pl, parts);
  appendVacatedWhy(pl, parts);
  var boardWhy=parts.join(" · ");
  var jw=(jevWhy||"").trim();
  if(jw){
    var opaque=/stub heuristic|scoreConfidence|choiceConfidence|model:|jev-|pick-quality/i.test(jw);
    var dup=boardWhy&&jw.toLowerCase().indexOf(boardWhy.toLowerCase().slice(0,24))>=0;
    if(!opaque&&!dup&&boardWhy){
      // append only if it adds something non-overlapping
      var jLow=jw.toLowerCase();
      var overlap=tags.some(function(t){return jLow.indexOf(t.toLowerCase())>=0;})||/adp|thin|inj/i.test(jw);
      if(!overlap)boardWhy=boardWhy+" · "+jw;
      else if(jw.length<120&&boardWhy.indexOf(jw)<0){/* prefer board vocab; skip opaque dup */}
    }else if(!boardWhy&&!opaque)boardWhy=jw;
    else if(!boardWhy)boardWhy="";
  }
  return boardWhy;
}
function fillPickCoachBoard(still, pl, payload){
  var rem=scarcityRemPcts();
  var strEl=still.querySelector(".pc-strengths");
  if(strEl){
    var chips=renderPickCoachStrengths(pl, rem);
    strEl.innerHTML=chips;
    strEl.hidden=!chips;
  }
  var poEl=still.querySelector(".pc-playoff");
  if(poEl){
    var badge=playoffBadge(pl);
    poEl.innerHTML=badge||"";
    poEl.hidden=!badge;
  }
}
/* Clear/Close call cue + punt warning. Close call = the verdict is marginal
 * (alternative within a few spots of value, or Jev split/disagrees), so the
 * user's own roster preference can break the tie; the alternative is one tap. */
function renderCoachCall(still,res){
  var basis=still.querySelector(".pc-basis");
  if(basis){
    var punt=(typeof state!=="undefined"&&state&&state.puntCats&&state.puntCats.length)?PuntCore.label(state.puntCats):"";
    basis.textContent=punt?("Heads up: you're punting "+punt+", but this verdict still counts all 9 categories"):"";
    basis.hidden=!punt;
  }
  var box=still.querySelector(".pc-call");
  if(!box)return;
  var call=window.PickCoach&&window.PickCoach.callStrength?window.PickCoach.callStrength(res):null;
  if(!call){box.hidden=true;return;}
  box.hidden=false;
  box.setAttribute("data-level",call.level);
  var lab=box.querySelector(".pc-call-label"),why=box.querySelector(".pc-call-why"),alt=box.querySelector(".pc-alt");
  if(lab)lab.textContent=call.level==="close"?"Close call":"Clear call";
  if(why){why.textContent=call.reason;why.hidden=!call.reason;}
  if(alt){
    var api=-1;
    if(call.alternative)for(var k=0;k<PLAYERS.length;k++)if(PLAYERS[k].n===call.alternative.n){api=k;break;}
    if(api>=0){
      var better=call.verdict==="pass"||call.verdict==="wait";
      alt.textContent=(better?"Better: ":"Compare: ")+call.alternative.n+" \u203a";
      alt.setAttribute("aria-label","Evaluate "+call.alternative.n+" in Pick coach");
      alt.dataset.pi=String(api);
      alt.hidden=false;
    }else{alt.textContent="";alt.hidden=true;}
  }
}
function refreshPickCoach(){
  var root=el("pick-coach");
  if(!root||typeof window.PickCoach==="undefined")return;
  if(!isUserTurn()){pcShow(root,"pc-wait");updateCoachDockPeek("");syncCoachDock();return;}
  var pi=resolveFocusPi();
  if(pi==null){pcShow(root,"pc-empty");updateCoachDockPeek("");return;}
  pcShow(root,"pc-loading");
  var seq=++_pcEvalSeq;
  var payload=buildPickCoachPayload(pi);
  window.PickCoach.evaluate(payload).then(function(res){
    if(seq!==_pcEvalSeq)return;
    if(!res||res.stale)return;
    var still=el("pick-coach");
    if(!still)return;
    if(!isUserTurn()){pcShow(still,"pc-wait");return;}
    var pl=PLAYERS[pi];
    var card=still.querySelector(".pc-card");
    var nameEl=still.querySelector(".pc-name");
    var metaEl=still.querySelector(".pc-meta");
    if(nameEl)nameEl.textContent=pl.n;
    var draftEl=still.querySelector(".pc-draft");
    if(draftEl){draftEl.setAttribute("aria-label","Draft "+pl.n+" from Pick coach");draftEl.dataset.pi=String(pi);draftEl.disabled=false;}
    updateCoachDockPeek(pl.n);
    if(metaEl){
      var adpTxt=pl.adp!=null?String(pl.adp):"—";
      var meta="Pick #"+payload.pickNumber+" · ADP "+adpTxt;
      if(pl.projMpg!=null)meta+=" · proj MPG "+pl.projMpg;
      if(pl.projRank!=null)meta+=" · proj #"+pl.projRank;
      metaEl.textContent=meta;
    }
    fillPickCoachBoard(still, pl, payload);
    renderCoachCall(still,res);
    var srcEl=still.querySelector(".pc-source");
    if(srcEl){
      var src=(window.PickCoach.sourceLabel&&window.PickCoach.sourceLabel(res))||"";
      if(!src){
        if(res.error)src="Unavailable";
        else if(res.fallback==="preview-softfail"||res.fallback==="preview-network")src="Stub";
        else if(res.model==="stub"||res.fallback)src="Stub · offline";
        else if(res.model)src=/^jev/i.test(String(res.model))?"Jev":String(res.model);
      }
      srcEl.textContent=src;
      srcEl.hidden=!src;
      srcEl.title=(res.jev&&window.PickCoach.jevOpinionLabel?window.PickCoach.jevOpinionLabel(res.jev)+" \u00b7 ":"")+(res.model?String(res.model):(res.error?String(res.error):""));
    }
    var suggest=still.querySelector(".pc-suggest");
    var lean=still.querySelector(".pc-lean");
    var passEl=still.querySelector(".pc-pass");
    var uncertain=still.querySelector(".pc-uncertain");
    // Soft API/network errors must never look like suggest or lean —
    // UNLESS deterministic signals computed a verdict locally. The engine's
    // numbers stand on their own; only Jev's explanation degrades.
    var softFail=!!res.error;
    var scN=res.scoreConfidence!=null?Number(res.scoreConfidence):NaN;
    var ccN=res.choiceConfidence!=null?Number(res.choiceConfidence):NaN;
    var isDet=!!(res.deterministic&&res.signals&&res.signals.verdict);
    var detVerdict=isDet?String(res.signals.verdict).toLowerCase():null;
    // Deterministic: verdict already computed from signals — honor it directly,
    // never reclassify via confidence gates. Jev's opinion is shown separately.
    // Fixture / leanDemo / forceConf: honor res.verdict — NEVER reclassify via confs
    // (confs can classify differently than the forced Soft lean / suggest paint).
    // Live: PickCoach.classifyVerdict uses TEMP max(scoreConf,choiceConf) + score/ADP floors.
    var verdict;
    if(isDet){
      // Native take|wait|pass|reach → display bands. take/reach are actions
      // (suggest band), wait is a hold (lean band), pass is its own band —
      // a confident pass is NOT "uncertain".
      verdict=detVerdict==="take"?"suggest":detVerdict==="wait"?"lean":detVerdict==="pass"?"pass":detVerdict==="reach"?"suggest":"uncertain";
    }else if(softFail){
      verdict="uncertain";
    }else if(res.fixture||res.fallback==="fixture"){
      // honor-res.verdict for fixtures (leanDemo / forceConf / coachFixture)
      verdict=(res.verdict==="suggest"||res.verdict==="lean"||res.verdict==="uncertain")?res.verdict:"uncertain";
    }else if(window.PickCoach&&typeof window.PickCoach.classifyVerdict==="function"){
      verdict=window.PickCoach.classifyVerdict(scN,ccN,{
        score:res.score,
        adp:payload.adp!=null?payload.adp:(pl&&pl.adp),
        rank:payload.rank!=null?payload.rank:(pl&&pl.r),
        pickNumber:payload.pickNumber
      });
    }else{
      // TEMP fallback: max banding 0.45/0.25 (match PickCoach.classifyVerdict)
      var maxC=(isFinite(scN)&&isFinite(ccN))?Math.max(scN,ccN):(isFinite(scN)?scN:ccN);
      verdict=(isFinite(maxC)&&maxC>=0.45)?"suggest":(isFinite(maxC)&&maxC>=0.25)?"lean":"uncertain";
      var scFloor=res.score!=null?Number(res.score):NaN;
      if(isFinite(scFloor)&&scFloor>=4)verdict="suggest";
      else if(isFinite(scFloor)&&scFloor>=3&&verdict==="uncertain")verdict="lean";
      var mAdp=payload.adp!=null?Number(payload.adp):(pl&&pl.adp!=null?Number(pl.adp):NaN);
      var mRank=payload.rank!=null?Number(payload.rank):(pl&&pl.r!=null?Number(pl.r):NaN);
      var mkt=isFinite(mAdp)?mAdp:(isFinite(mRank)?mRank:NaN);
      var pk=Number(payload.pickNumber);
      if(isFinite(mkt)&&mkt<=5&&isFinite(pk)&&pk<=mkt+3&&verdict==="uncertain")verdict="lean";
    }
    if(suggest)suggest.hidden=verdict!=="suggest";
    if(lean)lean.hidden=verdict!=="lean";
    if(passEl)passEl.hidden=verdict!=="pass";
    if(uncertain)uncertain.hidden=verdict!=="uncertain";
    function pcFmtConf(sc,cc,band){
      // TEMP: show max conf to match max() banding (live Jev often sc~0).
      var conf=isFinite(sc)&&isFinite(cc)?Math.max(sc,cc):isFinite(sc)?sc:cc;
      if(!isFinite(conf))return "";
      var b=band||"uncertain";
      return "Confidence "+Math.round(conf*100)+"% \u00b7 "+b;
    }
    var choice=res.choice||"";
    var choiceKind=choice==="take"?"take":choice==="reach"?"reach":choice==="pass"?"pass":"wait";
    // Deterministic target window: computed from the engine, but the V-8 / V /
    // ADP+4 heuristic is not yet validated as a survival estimate — keep the
    // UI element hidden until it is. (The verdict never came from a
    // confidence gate, so hide the conf line for deterministic results too;
    // it would imply the confidence drove the call.)
    var tgtEl=still.querySelector(".pc-target");
    if(tgtEl){
      tgtEl.textContent="";tgtEl.hidden=true;
    }
    if(verdict==="suggest"){
      var choiceEl=suggest?suggest.querySelector(".pc-choice"):null;
      var whyEl=suggest?suggest.querySelector(".pc-why"):null;
      var confEl=suggest?suggest.querySelector(".pc-conf"):null;
      var quietEl=suggest?suggest.querySelector(".pc-score-quiet"):null;
      if(choiceEl){
        choiceEl.className="pc-choice pc-choice-"+choiceKind;
        choiceEl.textContent=choiceKind==="take"?"Take":choiceKind==="reach"?"Reach":"Wait";
        choiceEl.hidden=false;
      }
      // Deterministic: the engine's reasons render
      // verbatim. The legacy board-vocab blender would misfire its overlap
      // filter on the deterministic text (e.g. "ADP" in the reasons) and eat
      // the explanation.
      var boardWhy=isDet?(res.why||""):buildPickCoachWhy(pl, choiceKind, payload.pickNumber, res.why||"");
      if(whyEl)whyEl.textContent=boardWhy||(res.why||"");
      if(confEl){
        if(isDet){confEl.textContent="";confEl.hidden=true;}
        else{confEl.textContent=pcFmtConf(scN,ccN,verdict);confEl.hidden=!confEl.textContent;}
      }
      if(quietEl){
        var label=(window.PickCoach.scoreWord&&window.PickCoach.scoreWord(res.score))||res.scoreLabel||"";
        if(label&&res.score!=null){quietEl.textContent=label;quietEl.hidden=false;}
        else{quietEl.textContent="";quietEl.hidden=true;}
      }
    }else if(verdict==="lean"){
      var leanChoice=lean?lean.querySelector(".pc-choice"):null;
      var leanWhy=lean?lean.querySelector(".pc-why"):null;
      var leanConf=lean?lean.querySelector(".pc-conf"):null;
      var leanSub=lean?lean.querySelector(".pc-lean-sub"):null;
      var detWait=isDet&&detVerdict==="wait";
      if(leanChoice){
        if(detWait){
          // Deterministic WAIT is a computed instruction, not a soft lean.
          leanChoice.className="pc-choice pc-choice-wait";
          leanChoice.textContent="Wait";
        }else{
          leanChoice.className="pc-choice pc-choice-lean pc-choice-lean-"+choiceKind;
          leanChoice.textContent=choiceKind==="take"?"Lean take":choiceKind==="reach"?"Lean reach":"Lean wait";
        }
        leanChoice.hidden=false;
      }
      if(leanSub)leanSub.textContent=detWait?"Acceptable here — but a better option won't survive":"Soft lean — mid confidence";
      var leanBoardWhy=isDet?(res.why||""):buildPickCoachWhy(pl, choiceKind, payload.pickNumber, res.why||"");
      if(leanWhy)leanWhy.textContent=leanBoardWhy||(res.why||"");
      if(leanConf){
        if(isDet){leanConf.textContent="";leanConf.hidden=true;}
        else{leanConf.textContent=pcFmtConf(scN,ccN,verdict);leanConf.hidden=!leanConf.textContent;}
      }
    }else if(verdict==="pass"){
      var passWhy=passEl?passEl.querySelector(".pc-why"):null;
      var passConf=passEl?passEl.querySelector(".pc-conf"):null;
      var passBoardWhy=isDet?(res.why||""):buildPickCoachWhy(pl, "pass", payload.pickNumber, res.why||"");
      if(passWhy)passWhy.textContent=passBoardWhy||(res.why||"");
      if(passConf){passConf.textContent="";passConf.hidden=true;}
    }else{
      var uTitle=still.querySelector(".pc-uncertain-title");
      var uSub=still.querySelector(".pc-uncertain-sub");
      var uWhy=still.querySelector(".pc-uncertain-why");
      if(softFail){
        if(uTitle)uTitle.textContent="Coach unavailable";
        if(uSub)uSub.textContent="Unavailable — not a low-confidence read · your call";
      }else{
        if(uTitle)uTitle.textContent="Not sure enough to suggest";
        if(uSub)uSub.textContent="Low confidence — your call";
      }
      // Always paint mover / vacated why on uncertain (incl. softFail / unavailable).
      var uBits=[];
      var moverWhy=moverWhyClause(pl);
      if(moverWhy)uBits.push(moverWhy);
      var vac=vacatedWhyClause(pl);
      if(vac)uBits.push(vac);
      if(uWhy){
        uWhy.textContent=uBits.join(" · ");
        uWhy.hidden=!uBits.length;
      }
      var uConf=still.querySelector(".pc-uncertain .pc-conf");
      if(uConf){
        // Soft-fail may keep error quiet — skip conf % line when unavailable.
        if(softFail){uConf.textContent="";uConf.hidden=true;}
        else{
          uConf.textContent=pcFmtConf(scN,ccN,verdict);
          uConf.hidden=!uConf.textContent;
        }
      }
    }
    pcShow(still,"pc-card");
  });
}

function renderSetup(){
  clearPlayoffHost();
  var h='<div class="season">Your draft room</div><h2>Build your next <span class="grad">contender.</span></h2>';
  var phone=mobileQuery.matches;
  h+='<div class="muted">'+(phone?'12 teams. Snake draft. Pick your spot. We draft the other teams.':'12 teams, snake draft. 270-player pool from early 2026-27 preseason rankings. You draft your slot; the other 11 teams auto-pick.')+'</div>';
  h+='<h3>Your draft position</h3><div class="setup-pos">';
  for(var i=1;i<=12;i++)h+='<button class="posbtn'+(state.draftPos===i?' sel':'')+'" data-pos="'+i+'">'+i+'</button>';
  h+='</div><h3>Rounds</h3><select id="mdrounds">';
  [10,11,12,13,14,15].forEach(function(r){h+='<option value="'+r+'"'+(state.rounds===r?' selected':'')+'>'+r+' rounds</option>';});
  h+='</select><div class="setup-actions"><button class="bigbtn" id="mdstart">'+(phone?'Start draft':'Start Mock Draft')+'</button></div>';
  h+='<div class="muted" style="margin-top:8px">Drafts save automatically in this browser. Data version: '+DATA_VERSION+'. · <button type="button" class="textlink" id="mdclear">Clear saved draft</button></div>';
  h+=playoffSettingsHtml();
  h+=renderDataHealth(phone?'Data &amp; sources':'');
  el("mdapp").innerHTML=h;
  el("mdapp").querySelectorAll(".posbtn").forEach(function(b){b.addEventListener("click",function(){setState({draftPos:parseInt(b.getAttribute("data-pos"),10)});});});
  el("mdrounds").addEventListener("change",function(e){setState({rounds:parseInt(e.target.value,10)});});
  el("mdstart").addEventListener("click",function(){
    var chosenPlayoff=state.playoffStart,chosenPos=state.draftPos,chosenRounds=parseInt(el("mdrounds").value,10);state=freshState();state.draftPos=chosenPos;state.rounds=chosenRounds;state.playoffStart=chosenPlayoff;state.phase="draft";save();advance();
  });
  el("mdclear").addEventListener("click",function(){restartDraft();});
  wirePlayoffSettings(el("mdapp"));
}
function nextUserPickIdx(){
  var tot=totalPicks();
  for(var i=state.log.length;i<tot;i++)if(teamForPick(i)===userTeam())return i;
  return -1;
}
function followingUserPickIdx(pick){
  for(var i=pick+1;i<totalPicks();i++)if(teamForPick(i)===userTeam())return i;
  return -1;
}
function consRank(p){return DA.consRank(p);}
function vBadge(pi,idx){var p=PLAYERS[pi];if(p.adp==null)return "";var d=Math.round(p.adp)-(idx+1);if(d===0)return "";return '<span class="vdelta '+(d>0?'g':'b')+'" title="'+(d>0?'Value':'Reach')+' vs ADP '+p.adp+'">'+(d>0?'+':'')+d+'</span>';}
function sortLabel(s){
  return ({cons:"Consensus",rank:"Rank",adp:"ADP",last:"Last · PER",lastTotal:"Last · TOT",punt:"Punt value"})[s]||"Consensus";
}

/* Mobile dock: coach collapsed to a compact strip by default so the player
 * list keeps most of the screen; the handle expands the full card. */
var coachDockOpen=false;
var mobileView=state.phase==="done"?"team":"players",mobileScroll={},mobileSheetPlayer=null,mobileReturnFocus=null;
var mobileQuery=window.matchMedia("(max-width:700px)");
function isMobileDraft(){return mobileQuery.matches&&(state.phase==="draft"||state.phase==="done");}
function rememberMobileScroll(){
  var pane=document.querySelector("[data-mobile-pane]");
  if(pane)mobileScroll[pane.dataset.mobilePane]=pane.scrollTop;
}
function closeMobileSheet(){
  var sheet=el("mdplayersheet");
  if(sheet&&sheet.open)sheet.close();
  mobileSheetPlayer=null;
  if(mobileReturnFocus&&mobileReturnFocus.isConnected)mobileReturnFocus.focus({preventScroll:true});
}
var mobileRosterMode="slots",mobileMatchSort="value",mobilePuntPreview=null,mobilePastAdpOpen=false;
/* Phone home for the desktop "Past ADP and still available" box: one collapsed row above the list. */
function mobilePastAdpHtml(){
  var rows=pastAdpRows();if(!rows.length)return '';
  var h='<details class="m-past-adp" id="mdpastadp"'+(mobilePastAdpOpen?' open':'')+'><summary>Past ADP <span class="muted">· '+rows.length+' still available</span></summary><div class="m-past-adp-panel"><ol>';
  rows.forEach(function(r){h+='<li><button type="button" data-past-adp-pi="'+r.pi+'"><b>'+esc(r.name)+'</b><span>ADP '+r.adp+' · value '+r.value.toFixed(1)+'</span></button></li>';});
  return h+'</ol><p class="muted">Consensus ADP is behind the current pick. Ranked by 2025–26 nine-category value, not a projection.</p></div></details>';
}
function mobileOutlook(grades){
  var next=nextUserPickIdx();
  return DA.categoryOutlook({grades:grades,userTeam:userTeam(),players:PLAYERS,pdata:PDATA,log:state.log,nextPick:next,followingPick:next<0?-1:followingUserPickIdx(next)});
}
function mobileSnapshot(grades){
  var outlook=mobileOutlook(grades);
  var h='<section class="m-snapshot"><h3>All nine categories</h3><p class="muted">Last season’s value per picked player. '+(outlook.ready?'Compared with the room.':'Early read — your roster is still forming.')+'</p>';
  outlook.rows.forEach(function(row){
    var label=outlook.ready?({surplus:'Clear lead',strong:'Strong',weak:'Needs help','in-mix':'In the mix'})[row.status]:'Early';
    h+='<div class="m-category '+row.status+'"><b>'+CATS9[row.ci]+'</b><span>'+label+(state.puntCats.indexOf(CATS9[row.ci])>=0?' · punted':'')+'</span><strong>'+(outlook.knownPicks?'#'+row.rank:'—')+'</strong></div>';
  });
  return h+'<p class="muted">Historical stats, not projections. Missing player data uses market-implied values. Lower turnovers rate higher.</p></section>';
}
function mobileTeamHtml(){
  var entries=CORE.teamEntries(PLAYERS,state.log,userTeam(),TEAMS),ros=myRoster();
  var h='<h3>My team <span class="muted">'+entries.length+'/'+state.rounds+'</span></h3>';
  if(state.phase==="done")h+=mobileGradeCard(draftGrades().filter(function(g){return g.team===userTeam();})[0])+'<button type="button" class="bigbtn m-run-back" id="mdmobilerunback">Run it back</button>';
  h+='<div class="m-roster-toggle" role="group" aria-label="Roster view">';
  [['slots','By position'],['picks','Pick order'],['board','Board']].forEach(function(v){h+='<button type="button" class="ghostbtn" data-mobile-roster="'+v[0]+'" aria-pressed="'+(mobileRosterMode===v[0])+'">'+v[1]+'</button>';});
  h+='</div><div class="rlist">';
  if(mobileRosterMode==='picks'){
    if(!entries.length)h+='<p class="muted">No picks yet.</p>';
    entries.forEach(function(e){h+='<div class="rrow"><span class="rpick">'+pickLabel(e.index)+'</span><span class="pname">'+esc(e.player.n)+injBadge(e.player)+'<small>'+esc(e.player.t)+' · '+esc(e.player.p.join('/'))+'</small></span></div>';});
  }else{
    ros.slots.forEach(function(e){h+='<div class="rrow"><span class="rpick">'+e.slot+'</span><span class="pname">'+(e.player?esc(e.player.player.n)+injBadge(e.player.player)+'<small>'+esc(e.player.player.t)+' · '+esc(e.player.player.p.join('/'))+'</small>':'<span class="muted">Open</span>')+'</span></div>';});
    ros.overflow.forEach(function(e){h+='<div class="rrow"><span class="rpick">Extra</span><span class="pname">'+esc(e.player.n)+injBadge(e.player)+'</span></div>';});
  }
  return h+'</div>'+mobileSnapshot(draftGrades())+playoffRoster(entries.map(function(e){return {pi:e.pi};}));
}
/* Your own grade: the phone views have no grades table, so show it on its own card. */
function mobileGradeCard(me){
  if(!me||!(me.rated+me.unrated))return '<p class="muted m-grade-empty">Your grade appears after your first pick.</p>';
  return '<section class="m-grade-card"><b class="gradebadge g-'+me.grade.charAt(0)+'">'+me.grade+'</b><span><strong>Your team · #'+me.rank+' of '+TEAMS+'</strong><small>Team value '+me.score.toFixed(1)+' · historical 9-cat, not a projection</small></span></section>';
}
function mobileMatchupHtml(){
  var grades=draftGrades(),me=grades.filter(function(g){return g.team===userTeam();})[0];
  var rows=grades.filter(function(g){return g.team!==userTeam();}).map(function(g){var mu=catMatchup(me.cats,g.cats);return {g:g,mu:mu,w:mu.filter(function(v){return v==='win';}).length,l:mu.filter(function(v){return v==='loss';}).length};});
  rows.sort(function(a,b){return mobileMatchSort==='number'?a.g.team-b.g.team:mobileMatchSort==='difficulty'?a.w-b.w||b.l-a.l||b.g.score-a.g.score:b.g.score-a.g.score;});
  var h='<h3>How you match up</h3><p class="muted">Your category score against every opponent. Historical value comparison — not weekly win probabilities.</p>'+mobileGradeCard(me);
  if(!(me.rated+me.unrated))return h+'<p class="muted m-match-empty">Matchups appear after your first pick.</p>';
  h+='<p class="m-strategy">'+(state.puntCats.length?'Punting '+esc(puntLabel())+'. All nine categories still count.':'Balanced · all nine categories count.')+'</p>';
  h+='<label class="m-sort">Sort by <select id="mdmatchsort">';
  [['value','Team value'],['difficulty','Toughest matchup'],['number','Team number']].forEach(function(v){h+='<option value="'+v[0]+'"'+(mobileMatchSort===v[0]?' selected':'')+'>'+v[1]+'</option>';});
  h+='</select></label><p class="muted">'+(mobileMatchSort==='value'?'Highest opponent value first.':'difficulty'===mobileMatchSort?'Fewest category edges for you first.':'Team number order.')+'</p>';
  rows.forEach(function(row){var g=row.g,ties=9-row.w-row.l;
    h+='<details class="m-matchup"><summary><span>'+esc(teamName(g.team))+'<small>Team value '+g.score.toFixed(1)+' · '+(g.rated+g.unrated)+' picks</small></span><b class="'+(row.w>row.l?'m-gain':row.w<row.l?'m-weak':'')+'">'+row.w+'–'+row.l+'</b><small>Your score'+(ties?' · '+ties+' even':'')+'</small></summary><div class="m-match-cats">';
    CATS9.forEach(function(cat,ci){h+='<div class="'+row.mu[ci]+'"><b>'+cat+'</b><span>'+({win:'Your edge',loss:'Their edge',even:'Even'})[row.mu[ci]]+'</span><small>'+me.cats[ci].toFixed(1)+' vs '+g.cats[ci].toFixed(1)+(state.puntCats.indexOf(cat)>=0?' · punted':'')+'</small></div>';});
    h+='</div>'+((g.unrated||me.unrated)?'<p class="muted">'+me.unrated+' of your players and '+g.unrated+' opponents lack category data; those players use market-implied values.</p>':'')+'</details>';
  });
  return h+'<details class="m-method"><summary>How scoring works</summary><p class="muted">Sum of last season’s per-game category z-scores across each roster. A difference above 0.5 is an edge; within ±0.5 is even. Scores are your category edges and losses, with ties shown separately. Missing data uses the mean of ten rated players nearest in consensus ADP. Starters and bench count equally; pick counts, injuries, schedules and role changes can affect the comparison. These are not forecast box scores or probabilities.</p></details>';
}
function mobilePuntHtml(){
  var grades=draftGrades(),cats=mobilePuntPreview==null?state.puntCats.slice():mobilePuntPreview;
  var taken={};state.log.forEach(function(pi){taken[pi]=true;});
  /* Same recommendation rule as the desktop Punt advice box (PuntCore.suggest). */
  var next=nextUserPickIdx(),choice=PuntCore.suggest(grades,userTeam(),PLAYERS,PDATA,taken,next,next<0?-1:followingUserPickIdx(next),state.puntCats);
  var h='<h3>Punt strategy</h3><p class="muted">Start with one category. Add another when the tradeoff helps.</p><p class="m-strategy">Committed: <b>'+(state.puntCats.length?esc(puntLabel()):'Balanced')+'</b></p><h4>Punts to consider</h4>';
  if(!choice)h+='<p class="muted">'+(state.puntCats.length>=PuntCore.MAX_PUNTS?'Three punts committed. Remove one to explore another.':next<0?'Draft complete. No remaining picks to guide.':state.puntCats.length?'No additional punt stands out: you are not trailing most teams in another category.':'No punt recommendation yet. It needs three picks, category data for at least two of yours, and a weak category against other teams.')+'</p>';
  else{
    h+='<button class="m-punt-recommend ghostbtn" data-mobile-punt-explore="'+choice.cat+'"><b>Explore '+choice.cat+'</b><span>Your per-pick value trails '+choice.below+' of '+choice.peers+' comparable teams.'+(choice.missing?' '+choice.missing+' of your picks lack category data.':'')+'</span></button>';
    if(choice.also.length)h+='<p class="muted">Also trailing: '+choice.also.slice(0,2).join(', ')+'.</p>';
  }
  h+='<p class="muted">Updates after every pick.</p><h4>Explore your options</h4><div class="m-punt-options" role="group" aria-label="Categories to punt">';
  CATS9.forEach(function(cat){var on=cats.indexOf(cat)>=0;h+='<button type="button" class="ghostbtn" data-mobile-punt="'+cat+'" aria-pressed="'+on+'"'+(!on&&cats.length>=PuntCore.MAX_PUNTS?' disabled':'')+'>'+cat+'</button>';});
  h+='</div><p class="muted">Exploring: '+(cats.length?esc(PuntCore.label(cats)):'Balanced')+'. '+(sameCats(cats,state.puntCats)?'Matches your committed strategy.':'Commit to apply these changes.')+'</p><div class="m-punt-actions"><button class="bigbtn" id="mdmobilepuntcommit"'+(sameCats(cats,state.puntCats)?' disabled':'')+'>'+(cats.length?'Commit '+esc(PuntCore.label(cats)):'Commit balanced')+'</button><button class="ghostbtn" id="mdmobilepuntclear">Clear punts</button></div>';
  if(cats.length===3)h+='<p class="muted">With three punts, you need five wins from the remaining six categories.</p>';
  /* Same two lists as the desktop Punt advice box: take now vs can likely wait. */
  var following=next<0?-1:followingUserPickIdx(next),card=function(row){var pl=PLAYERS[row.pi];return '<button class="m-punt-player" data-mobile-punt-player="'+row.pi+'"><span><b>'+esc(pl.n)+'</b><small>'+esc(pl.p.join('/'))+' · ADP '+consRank(pl).toFixed(1)+' · available rank #'+row.baseRank+' → #'+row.puntRank+'</small></span><strong class="'+(row.gain>0?'m-gain':row.gain<0?'m-weak':'')+'">'+(row.gain>0?'+':'')+row.gain+'<small>rank change</small></strong></button>';};
  h+='<h4>'+(next<0?'Draft complete':'Consider at pick #'+(next+1))+'</h4>';
  if(!cats.length)h+='<p class="muted">Select a punt to compare available-player ranks.</p>';
  else if(next>=0){
    var rows=PuntCore.rankings(PLAYERS,PDATA,taken,cats),near=PuntCore.nearTermRisers(rows,PLAYERS,next,following).slice(0,6),later=PuntCore.laterRisers(rows,PLAYERS,next,following).slice(0,4);
    h+='<p class="muted">Players who rise under this punt and are unlikely to last until your following pick.</p>';
    if(!near.length)h+='<p class="muted">No punt risers look urgent for this pick.</p>';
    near.forEach(function(row){h+=card(row);});
    if(later.length){h+='<h4>Watch for later</h4><p class="muted">Rising players whose ADP suggests they may still be there at pick #'+(following+1)+'. ADP is not a guarantee.</p>';later.forEach(function(row){h+=card(row);});}
  }
  return h+'<details class="m-method"><summary>How punt value works</summary><p class="muted">A category is recommended when your per-pick value trails more than half of the comparable teams (teams with at least two rated players). Phone and desktop use the same rule. Ties go to the punt that lifts more players near your next picks. Value uses existing historical category values, excluding all selected punts. Rank changes compare rated, available players. Up to three punts; TO values are inverted so fewer turnovers rate higher. Coach verdicts still count all nine categories. Missing category data cannot support a punt ranking.</p></details>';
}
function wireMobileSide(root){
  var sort=root.querySelector('#mdmatchsort');if(sort)sort.addEventListener('change',function(){mobileMatchSort=sort.value;rememberMobileScroll();renderSide();el('mdside').scrollTop=mobileScroll[mobileView]||0;});
  root.querySelectorAll('[data-mobile-roster]').forEach(function(b){b.addEventListener('click',function(){mobileRosterMode=b.dataset.mobileRoster;if(mobileRosterMode==='board'){mobileView='board';setState({view:'board'});}else{mobileView='team';setState({view:'team'});}});});
  root.querySelectorAll('[data-mobile-punt]').forEach(function(b){b.addEventListener('click',function(){var cat=b.dataset.mobilePunt,cats=mobilePuntPreview==null?state.puntCats.slice():mobilePuntPreview.slice(),i=cats.indexOf(cat);if(i>=0)cats.splice(i,1);else if(cats.length<PuntCore.MAX_PUNTS)cats.push(cat);mobilePuntPreview=PuntCore.normalize(cats);var top=root.scrollTop;renderSide();root.scrollTop=top;var again=root.querySelector('[data-mobile-punt="'+cat+'"]');if(again)again.focus({preventScroll:true});});});
  root.querySelectorAll('[data-mobile-punt-explore]').forEach(function(b){b.addEventListener('click',function(){mobilePuntPreview=PuntCore.normalize(state.puntCats.concat([b.dataset.mobilePuntExplore]));renderSide();});});
  var commit=root.querySelector('#mdmobilepuntcommit');if(commit)commit.addEventListener('click',function(){var cats=mobilePuntPreview||state.puntCats;mobilePuntPreview=null;setState({puntCats:cats,sort:!cats.length&&state.sort==='punt'?'cons':state.sort});});
  var clear=root.querySelector('#mdmobilepuntclear');if(clear)clear.addEventListener('click',function(){mobilePuntPreview=null;setState({puntCats:[],sort:state.sort==='punt'?'cons':state.sort});});
  var runBack=root.querySelector('#mdmobilerunback');if(runBack)runBack.addEventListener('click',restartDraft);
  root.querySelectorAll('[data-mobile-punt-player]').forEach(function(b){b.addEventListener('click',function(){evaluatePlayer(Number(b.dataset.mobilePuntPlayer));});});
  wireInjToggles(root);
}
/* player-averages.js (81 KB, display-only) loads the first time a phone opens a player sheet; desktop never fetches it.
   averagesLoad: null (not started or done), "loading", or "failed" (the next sheet open retries). */
var averagesLoad=null;
function loadPlayerAverages(onDone){
  if(window.PlayerAverages||averagesLoad==="loading")return;
  averagesLoad="loading";
  var tag=document.createElement("script");tag.src="player-averages.js";
  tag.onload=function(){averagesLoad=null;onDone();};
  tag.onerror=function(){averagesLoad="failed";tag.remove();onDone();};
  document.head.append(tag);
}
function mobilePlayerStats(pl){
  var cv=PDATA[pl.n]&&PDATA[pl.n].cv;
  var h='<section class="m-player-profile"><h4>Category profile</h4>';
  if(cv){var ranked=CATS9.map(function(cat,ci){return {cat:cat,value:cv[ci]};}).sort(function(a,b){return b.value-a.value;});
    h+='<div class="m-strength-pair"><div><small>Strengths</small><b>'+(ranked.filter(function(v){return v.value>0;}).slice(0,2).map(function(v){return v.cat;}).join(' · ')||'None above average')+'</b></div><div><small>Weaknesses</small><b class="m-weak">'+(ranked.filter(function(v){return v.value<0;}).slice(-2).map(function(v){return v.cat;}).join(' · ')||'None below average')+'</b></div></div><p class="muted">Last season’s category values. TO is inverted; lower turnovers is better.</p>';
  }else h+='<p class="muted">Category strengths and weaknesses unavailable: no historical category data.</p>';
  var data=window.PlayerAverages,stats=data&&data.players[pl.n];
  h+='<h4>Per-game averages</h4>';
  if(!data)h+='<p class="muted m-avg-wait">'+(averagesLoad==="failed"?'Per-game averages unavailable right now.':'Loading per-game averages…')+'</p>';
  else if(stats){h+='<p class="muted">'+esc(data.season)+' actuals · not a season forecast. '+stats.g+' games.</p><dl class="m-per-game">';
    [['FT · made / attempted',stats.ftm.toFixed(1)+' / '+stats.fta.toFixed(1)],['FG · made / attempted',stats.fgm.toFixed(1)+' / '+stats.fga.toFixed(1)],['3PM',stats.threes],['Points',stats.pts],['Rebounds',stats.reb],['Assists',stats.ast],['Steals',stats.stl],['Blocks',stats.blk],['Turnovers',stats.to]].forEach(function(stat){h+='<div><dt>'+stat[0]+'</dt><dd>'+(typeof stat[1]==='number'?stat[1].toFixed(1):stat[1])+'</dd></div>';});
    h+='</dl><p class="muted"><a href="'+esc(data.source)+'" target="_blank" rel="noopener">Stat source</a> · Season averages; not projected production.</p>';
  }else h+='<p class="muted">No recorded 2025–26 NBA season averages available.</p>';
  return h+'<p class="m-strategy">'+(state.puntCats.length?'Punting '+esc(puntLabel())+' · Coach verdict counts all nine categories.':'Balanced · all nine categories count.')+'</p><button class="ghostbtn m-manage-punts" id="mdsheetpunts">Manage punts</button></section>';
}
function wireMobileDraft(){
  var root=el("md"),avail=document.querySelector("#md .avail"),side=el("mdside");
  root.dataset.mobileView=mobileView;
  var pane=mobileView==="players"?el("mdplist"):side;
  pane.dataset.mobilePane=mobileView;
  pane.scrollTop=mobileScroll[mobileView]||0;
  var nav=document.createElement("nav");nav.className="mobile-nav";nav.setAttribute("aria-label","Draft navigation");
  [["players","Players"],["team","My team"],["grades","Analysis"],["punt","Punts"]].forEach(function(v){
    var b=document.createElement("button");b.type="button";b.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="'+({players:'M3 3h18v18H3zM3 12h18M9 3v5h6V3',team:'M5 21v-3a7 7 0 0 1 14 0v3M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',grades:'M4 20V10M12 20V4M20 20v-7',punt:'M4 21V3m0 0h15l-4 5 4 5H4'})[v[0]]+'"/></svg><span>'+v[1]+'</span>';b.setAttribute("aria-current",(mobileView===v[0]||mobileView==='board'&&v[0]==='team')?"page":"false");
    b.addEventListener("click",function(){rememberMobileScroll();closeMobileSheet();mobileView=v[0];if(v[0]==='team'&&mobileRosterMode==='board')mobileRosterMode='slots';setState({view:(v[0]==="players"||v[0]==="punt")?"coach":v[0]});});nav.append(b);
  });el("mdapp").append(nav);

  var pastAdp=el("mdpastadp");
  if(pastAdp){
    pastAdp.addEventListener("toggle",function(){mobilePastAdpOpen=pastAdp.open;});
    pastAdp.querySelectorAll("[data-past-adp-pi]").forEach(function(b){b.addEventListener("click",function(){mobilePastAdpOpen=false;evaluatePlayer(Number(b.dataset.pastAdpPi));});});
  }
  var filters=el("mdfilters"),filterClose=document.createElement("button");
  filterClose.type="button";filterClose.className="ghostbtn mobile-filter-close";filterClose.textContent="Done";
  filterClose.addEventListener("click",function(){filters.open=false;el("mdq").focus();});filters.append(filterClose);
  if(mobileView!=="players")return;
  var sheet=document.createElement("dialog");sheet.id="mdplayersheet";sheet.className="mobile-player-sheet";sheet.setAttribute("aria-label","Player details and draft advice");
  var grip=document.createElement("div");grip.className="mobile-sheet-grip";grip.setAttribute("aria-hidden","true");grip.innerHTML="<span></span>";
  var head=document.createElement("div");head.className="mobile-sheet-head";
  var titleBox=document.createElement("div");titleBox.className="mobile-sheet-titlebox mobile-player-info";
  var close=document.createElement("button");close.type="button";close.className="mobile-sheet-close";close.textContent="Close";close.setAttribute("aria-label","Close player details");
  close.addEventListener("click",closeMobileSheet);head.append(titleBox,close);
  var drag=document.createElement("div");drag.className="mobile-sheet-drag";drag.append(grip,head);
  sheet.append(drag,side);el("mdapp").append(sheet);
  (function(){var y0=null,dy=0;
    function reset(){sheet.style.transition="";sheet.style.transform="";}
    drag.addEventListener("pointerdown",function(e){if(e.target.closest("button"))return;y0=e.clientY;dy=0;sheet.style.transition="none";try{drag.setPointerCapture(e.pointerId);}catch(_){}});
    drag.addEventListener("pointermove",function(e){if(y0==null)return;dy=Math.max(0,e.clientY-y0);sheet.style.transform="translateY("+dy+"px)";});
    function end(){if(y0==null)return;var d=dy;y0=null;dy=0;if(d>80){reset();closeMobileSheet();}else{sheet.style.transition="transform 180ms ease-out";sheet.style.transform="translateY(0)";setTimeout(reset,200);}}
    drag.addEventListener("pointerup",end);drag.addEventListener("pointercancel",end);
  })();
  sheet.addEventListener("cancel",function(e){e.preventDefault();closeMobileSheet();});
  sheet.addEventListener("click",function(e){if(e.target===sheet){var r=sheet.getBoundingClientRect();if(e.clientY<r.top||e.clientY>r.bottom||e.clientX<r.left||e.clientX>r.right)closeMobileSheet();}});
  if(mobileSheetPlayer!=null){
    var pl=PLAYERS[mobileSheetPlayer],info=document.createElement("div");info.className="mobile-player-extra";
    titleBox.innerHTML='<h3 class="mobile-sheet-name">'+esc(pl.n)+'</h3><p class="mobile-sheet-sub"><span>'+esc(pl.t)+'</span><span>'+esc(pl.p.join("/"))+'</span><span>ADP '+(pl.adp==null?'—':pl.adp)+'</span></p>'+(pl.inj?'<p class="mobile-injury m-injury-alert">'+esc(pl.inj.injury)+' · '+esc(pl.inj.ret)+'</p>':'');
    sheet.setAttribute("aria-label",pl.n+" details and draft advice");
    var sheetPi=mobileSheetPlayer,fillInfo=function(){
      info.innerHTML=mobilePlayerStats(pl)+(pl.inj?'<p class="mobile-injury">'+esc(injTitle(pl.inj))+'</p>':'');
      var manage=el('mdsheetpunts');if(manage)manage.addEventListener('click',function(){closeMobileSheet();mobileView='punt';setState({view:'coach'});});
    };
    side.append(info);fillInfo();
    /* Refresh only the stats block once the averages arrive, so sheet scroll and focus stay put. */
    loadPlayerAverages(function(){if(mobileSheetPlayer===sheetPi&&info.isConnected)fillInfo();});
    var draftButton=side.querySelector(".pc-draft");
    if(draftButton)draftButton.textContent="Draft "+pl.n;
    mobileReturnFocus=avail.querySelector('.prow[data-pi="'+mobileSheetPlayer+'"]')||el("mdq");
    sheet.showModal();
  }
}
function syncMobileViewport(){el('md').style.setProperty('--mobile-height',(window.visualViewport?window.visualViewport.height:window.innerHeight)+'px');}
if(window.visualViewport)window.visualViewport.addEventListener('resize',syncMobileViewport);
window.addEventListener('resize',syncMobileViewport);syncMobileViewport();
mobileQuery.addEventListener("change",function(){rememberMobileScroll();closeMobileSheet();render();});
function setCoachDockOpen(open){
  coachDockOpen=!!open;
  var root=document.getElementById("md");
  if(root)root.classList.toggle("coach-dock-open",coachDockOpen);
  var h=document.getElementById("pc-dock-handle");
  if(h){
    h.setAttribute("aria-expanded",coachDockOpen?"true":"false");
    var more=h.querySelector(".pc-dock-more");
    if(more)more.textContent=coachDockOpen?"Less":"More";
  }
}
function syncCoachDock(){
  var on=!isMobileDraft()&&state.phase==="draft"&&state.view==="coach"&&isUserTurn();
  var root=document.getElementById("md");
  var cols=document.querySelector("#md .cols");
  if(root){
    root.classList.toggle("coach-dock-active",!!on);
    root.classList.toggle("coach-dock-open",!!on&&coachDockOpen);
    if(!on)root.classList.remove("coach-dock-active");
  }
  if(cols){
    cols.classList.toggle("coach-dock",!!on);
    if(!on)cols.classList.remove("coach-dock");
  }
  /* Leaving coach/board/grades/team or non-user-turn clears dock immediately */
  if(!on&&root){
    root.querySelectorAll(".cols.coach-dock").forEach(function(n){n.classList.remove("coach-dock");});
  }
}
function updateCoachDockPeek(name){
  var lab=document.querySelector("#md .pc-dock-label");
  if(!lab)return;
  lab.textContent=name?("Pick coach \u00b7 "+name):"Pick coach";
}
function renderDraft(){
  rememberMobileScroll();
  if(isMobileDraft())state.view=(mobileView==="players"||mobileView==="punt")?"coach":mobileView;
  var idx=state.log.length,round=Math.floor(idx/TEAMS)+1,team=idx<totalPicks()?teamForPick(idx):-1;
  var h='<div class="turnbar">';
  var liveCore="";
  var totRounds=Math.round(totalPicks()/TEAMS);
  if(state.phase==="done"){h+='<span><b>Draft complete.</b></span>';liveCore="Draft complete.";}
  else if(isUserTurn()){h+='<span class="pickhead on"><span class="pknum">Pick '+(idx+1)+'</span><span class="pkline"><span class="you">'+(isMobileDraft()?'Your pick':'You\'re on the clock')+'</span><span class="muted">Round '+round+' of '+totRounds+'</span></span></span>';liveCore="Your pick. Round "+round+", overall pick "+(idx+1)+" of "+totalPicks()+".";}
  else{h+='<span class="pickhead"><span class="pknum">Pick '+(idx+1)+'</span><span class="pkline"><span><b>'+esc(teamName(team))+'</b> is picking...</span><span class="muted">Round '+round+' of '+totRounds+'</span></span></span>';liveCore=teamName(team)+" is picking. Round "+round+", overall pick "+(idx+1)+".";}
  var nxt=nextUserPickIdx();
  if(nxt>=0&&!isUserTurn())h+='<span class="nextpick">Your next pick: <b>#'+(nxt+1)+'</b> ('+(nxt-idx)+' picks away)</span>';
  if(nxt>=0&&isUserTurn()){var nxt2=-1,tot2=totalPicks();for(var j=nxt+1;j<tot2;j++)if(teamForPick(j)===userTeam()){nxt2=j;break;}
    if(nxt2>=0)h+='<span class="nextpick">Your next pick: <b>#'+(nxt2+1)+'</b> ('+(nxt2-nxt)+' picks away)</span>';}
  h+='<span class="turnbar-spacer" style="flex:1"></span>';
  if(state.userTurns.length)h+='<button class="ghostbtn" id="mdundo">'+(isMobileDraft()?'Undo pick':'Undo my last pick')+'</button>';
  if(state.phase!=="done"&&!isUserTurn())h+='<button class="ghostbtn" id="mdsim">Sim to my pick</button>';
  h+='<button class="ghostbtn" id="mdnew">Restart</button></div>';
  if(!isMobileDraft())h+=renderScarcity(); /* scarcity is desktop-only: no room for it on phones */
  h+=viewTabsHtml();
  var glance=state.view==="board"||state.view==="grades"||state.view==="coach";
  h+='<div class="cols'+(glance?' glance':'')+'"><div class="avail">';
  h+='<h3>Available players</h3><p class="muted list-hint">Select a player for advice. Draft adds them to your team.</p><input type="text" id="mdq" aria-label="Search available players" placeholder="Search players..." value="'+esc(state.q)+'">';
  var filterSummary=(state.f==="All"?"All positions":state.f)+" · "+sortLabel(state.sort||"cons");
  h+='<details class="filters-disclose" id="mdfilters"'+(state.filtersOpen?' open':'')+'>';
  h+='<summary>Filters &amp; sort <span class="muted">'+esc(filterSummary)+'</span></summary>';
  h+='<div class="filters">';
  ["All","PG","SG","SF","PF","C"].forEach(function(f){h+='<button class="fchip'+(state.f===f?' sel':'')+'" data-f="'+f+'">'+f+'</button>';});
  h+='</div><div class="filters"><span class="muted">Sort:</span>';
  var sorts=[["cons","Consensus","Yahoo + Fantrax ADP blend (each platform's thin late-draft tail counts less); what CPU teams draft from"],["rank","Rank","Draft Lab rank: consensus ADP nudged toward 2025-26 nine-cat production (up to 20 spots)"],["adp","ADP","Yahoo All Drafts ADP (29 Sep 2026 workbook)"],["last","Last · PER","2025-26 nine-category per-game rank (Basketball Monster / Hashtag)"],["lastTotal","Last · TOT","2025-26 nine-category TOTALS rank — derived from Basketball-Reference season totals, not a published rank"]];
  if(state.puntCats.length)sorts.push(["punt","Punt value","Historical "+puntCatCount()+"-category value, excluding "+puntLabel()]);
  sorts.forEach(function(s){h+='<button class="fchip'+((state.sort||"cons")===s[0]?' sel':'')+'" data-sort="'+s[0]+'" title="'+s[2]+'">'+s[1]+'</button>';});
  h+='</div></details>';
  if(isMobileDraft()&&state.phase==="draft")h+=mobilePastAdpHtml();
  h+='<div class="plist" id="mdplist"></div><div id="mdpager"></div></div>';
  h+='<div class="side" id="mdside"></div></div>';
  el("mdapp").innerHTML=h;
  announceLive((_pendingLive||"")+liveCore);
  _pendingLive="";
  el("mdapp").querySelectorAll("[data-view]").forEach(function(b){b.addEventListener("click",function(){setState({view:b.getAttribute("data-view")});});});
  el("mdapp").querySelectorAll("[data-f]").forEach(function(b){b.addEventListener("click",function(){setState({f:b.getAttribute("data-f"),page:0,filtersOpen:true});});});
  el("mdapp").querySelectorAll("[data-sort]").forEach(function(b){b.addEventListener("click",function(){setState({sort:b.getAttribute("data-sort"),page:0,filtersOpen:true});});});
  var fd=el("mdfilters");
  if(fd)fd.addEventListener("toggle",function(){state.filtersOpen=fd.open;save();});
  if(!isMobileDraft())wireScarcityToggles(el("mdapp"));
  var q=el("mdq");q.addEventListener("input",function(){state.q=q.value;state.page=0;save();renderList();if(state.view==="coach"){var fp=resolveFocusPi();if(fp!==state.focusPi)setFocusPi(fp,{rerenderList:true});else refreshPickCoach();}});
  q.addEventListener("keydown",function(e){e.stopPropagation();});
  var sim=el("mdsim");if(sim)sim.addEventListener("click",advance);
  var undo=el("mdundo");if(undo)undo.addEventListener("click",undoUserPick);
  el("mdnew").addEventListener("click",onRestartClick);
  renderList();renderSide();
  syncCoachDock();
  if(isMobileDraft())wireMobileDraft();
  if(state.view==="coach"&&!isMobileDraft())revealFocusedRow(state.focusPi);
  if(state.view==="coach")refreshPickCoach();
}
function renderList(){
  var taken={},i;for(i=0;i<state.log.length;i++)taken[state.log[i]]=1;
  var puntRows=state.puntCats.length?PuntCore.rankings(PLAYERS,PDATA,taken,state.puntCats):[];
  var puntByPi={};puntRows.forEach(function(row){puntByPi[row.pi]=row;});
  var q=state.q.toLowerCase(),f=state.f,ut=isUserTurn(),cands=[];
  for(i=0;i<PLAYERS.length;i++){
    if(taken[i])continue;var pl=PLAYERS[i];
    if(f!=="All"&&pl.p.indexOf(f)<0)continue;
    if(q&&pl.n.toLowerCase().indexOf(q)<0)continue;
    cands.push(i);
  }
  var srt=state.sort||"cons";
  function skey(x){return x==null?1e9:x;}
  if(srt==="punt")cands.sort(function(a,b){return (puntByPi[a]?puntByPi[a].puntRank:1e9)-(puntByPi[b]?puntByPi[b].puntRank:1e9)||consRank(PLAYERS[a])-consRank(PLAYERS[b]);});
  else if(srt==="adp")cands.sort(function(a,b){return skey(PLAYERS[a].adp)-skey(PLAYERS[b].adp);});
  else if(srt==="last")cands.sort(function(a,b){return skey(PLAYERS[a].last)-skey(PLAYERS[b].last);});
  else if(srt==="lastTotal")cands.sort(function(a,b){return skey(PLAYERS[a].lastTotal)-skey(PLAYERS[b].lastTotal);});
  else if(srt==="cons")cands.sort(function(a,b){return consRank(PLAYERS[a])-consRank(PLAYERS[b]);});
  function tierKey(i){var p=PLAYERS[i];if(srt==="adp")return p.adp==null?1e9:p.adp;return consRank(p);}
  function disp(x){return x==null?'—':x;}
  var pageSize=50,pageCount=Math.max(1,Math.ceil(cands.length/pageSize));
  if(state.page>=pageCount)state.page=pageCount-1;
  var from=state.page*pageSize,to=Math.min(cands.length,from+pageSize),rows=[];
  var focusNow=resolveFocusPi();
  rows.push('<div class="listmeta"><span class="muted">'+cands.length+' available · showing '+(cands.length?from+1:0)+'–'+to+'</span><span class="muted">Page '+(state.page+1)+'/'+pageCount+'</span></div>');
  for(var k=from;k<to;k++){
    if((srt==="adp"||srt==="cons")&&k>0){var kk=tierKey(cands[k]),pk=tierKey(cands[k-1]);if(pk<1e9&&kk-pk>=4)rows.push('<div class="tierbreak" title="Talent cliff"></div>');}
    i=cands[k];var pl2=PLAYERS[i];
    var pr=puntByPi[i];
    var rlabel=srt==="punt"?(pr?pr.puntRank:"—"):(srt==="cons"?consRank(pl2).toFixed(1):pl2.r);
    var sub='<span>ADP '+disp(pl2.adp)+'</span><span>Last '+disp(pl2.last)+'</span><span>Tot '+disp(pl2.lastTotal)+'</span><span>MPG '+(pl2.mpg==null?'—':pl2.mpg.toFixed(1))+'</span><span>'+posBadges(pl2.p)+'</span>'+playoffBadge(pl2)+'<span class="rt">'+esc(pl2.t)+'</span>';
    var mvRow=moverRoleChipHtml(pl2, false);if(mvRow)sub+=mvRow;
    if(pl2.c.length)sub+='<span>'+pl2.c.slice(0,4).join(" · ")+'</span>';
    if(state.puntCats.length)sub+=pr?'<span title="Historical available-player ranks, nine-category vs excluding '+puntLabel()+'">Punt '+state.puntCats.join('+')+': #'+pr.baseRank+' → #'+pr.puntRank+(pr.gain>0?' (+'+pr.gain+')':'')+'</span>':'<span>Punt value: unknown (no 2025-26 category data)</span>';
    var focusCls=(focusNow===i)?' pc-focus':'';
    rows.push('<div class="prow'+focusCls+'" data-pi="'+i+'" role="button" tabindex="0" aria-label="Evaluate '+esc(pl2.n)+'" aria-pressed="'+(focusNow===i?'true':'false')+'"><div class="l1"><span class="prank">'+rlabel+'</span><span class="pname">'+esc(pl2.n)+' <span class="teamtag">'+esc(pl2.t)+'</span>'+injBadge(pl2)+'</span><button class="draftbtn" data-pi="'+i+'" aria-label="Draft '+esc(pl2.n)+'"'+(ut?'':' disabled')+'>Draft</button></div><div class="l2">'+sub+'</div></div>');
  }
  if(!cands.length)rows.push('<div class="prow"><div class="l1"><span class="muted">No players match.</span></div></div>');
  el("mdplist").innerHTML=rows.join("");
  var pager='<div class="pager"><button class="ghostbtn" id="mdprev" '+(state.page?"":"disabled")+'>Previous</button><button class="ghostbtn" id="mdnext" '+(state.page+1<pageCount?"":"disabled")+'>Next</button></div>';
  el("mdpager").innerHTML=pager;
  el("mdplist").querySelectorAll(".draftbtn").forEach(function(b){b.addEventListener("click",function(e){e.stopPropagation();userDraft(parseInt(b.getAttribute("data-pi"),10));});});
  el("mdplist").querySelectorAll(".prow[data-pi]").forEach(function(row){
    row.addEventListener("click",function(e){
      if(e.target.closest&&e.target.closest(".draftbtn"))return;
      if(e.target.closest&&e.target.closest(".injtag"))return;
      evaluatePlayer(parseInt(row.getAttribute("data-pi"),10));
    });
    row.addEventListener("keydown",function(e){
      if(e.target.closest&&e.target.closest("button"))return;
      if(e.key==="Enter"||e.key===" "){e.preventDefault();evaluatePlayer(parseInt(row.getAttribute("data-pi"),10));}
    });
  });
  wireInjToggles(el("mdplist"));
  el("mdprev").addEventListener("click",function(){state.page=Math.max(0,state.page-1);save();renderList();if(state.view==="coach")refreshPickCoach();});
  el("mdnext").addEventListener("click",function(){state.page=Math.min(pageCount-1,state.page+1);save();renderList();if(state.view==="coach")refreshPickCoach();});
  // Keep focus valid against current filter; default first visible row.
  var fp=resolveFocusPi();
  if(fp!==state.focusPi){state.focusPi=fp;save();}
}
function myRoster(){
  var entries=CORE.teamEntries(PLAYERS,state.log,userTeam(),TEAMS);
  return CORE.assignRoster(entries,draftSlots());
}
function renderSide(){
  var s=el("mdside");if(!s)return;
  if(isMobileDraft()&&mobileView!=="players"&&mobileView!=="board"){
    s.innerHTML=mobileView==='punt'?mobilePuntHtml():mobileView==='grades'?mobileMatchupHtml():mobileTeamHtml();wireMobileSide(s);return;
  }
  if(state.view==="coach"){
    s.innerHTML='<button type="button" class="pc-dock-handle" id="pc-dock-handle" aria-controls="pick-coach" aria-expanded="'+(coachDockOpen?'true':'false')+'"><span class="pc-dock-grip" aria-hidden="true"></span><span class="pc-dock-label">Pick coach</span><span class="pc-dock-more muted">'+(coachDockOpen?'Less':'More')+'</span></button><h3 class="pc-side-title">Pick coach</h3><p class="muted pc-advisory">Advice only. Drafting always takes a separate click.</p>'+pickCoachShellHtml(isMobileDraft()&&state.phase==="done"?'Draft complete. Undo a pick to resume drafting.':'')+(isMobileDraft()?"":renderPastAdp()+renderPuntStrategy(draftGrades()));
    s.querySelector('#pc-dock-handle').addEventListener('click',function(){setCoachDockOpen(!coachDockOpen);});
    s.querySelector('.pc-alt').addEventListener('click',function(e){var pi=parseInt(e.currentTarget.dataset.pi,10);if(isFinite(pi))evaluatePlayer(pi);});
    s.querySelector('.pc-draft').addEventListener('click',function(e){var pi=parseInt(e.currentTarget.dataset.pi,10);if(isUserTurn()&&pi===resolveFocusPi())userDraft(pi);});
    wirePuntControls(s);
    refreshPickCoach();
    return;
  }
  if(state.view==="grades"){s.innerHTML=renderGrades();wireInjToggles(s);return;}
  if(state.view==="board"){
    var h='<h3>Draft board</h3><div class="boardwrap"><table class="board"><tr><th>Rd</th>';
    for(var t=0;t<TEAMS;t++)h+='<th>'+esc(teamName(t))+(isMobileDraft()&&t===userTeam()?'<small>Your team</small>':'')+'</th>';
    h+='</tr>';
    for(var r=0;r<state.rounds;r++){
      h+='<tr><td><b>'+(r+1)+'</b></td>';
      for(t=0;t<TEAMS;t++){
        var idx=r*TEAMS+(r%2===0?t:TEAMS-1-t);
        var cell='&nbsp;',cls=(t===userTeam()?'you':'');
        if(idx<state.log.length){var pl=PLAYERS[state.log[idx]];cell=esc(pl.n)+' <span class="teamtag">'+esc(pl.t)+'</span>'+injBadge(pl)+vBadge(state.log[idx],idx);}
        else if(t===userTeam()){cls+=' future-you';}
        h+='<td class="'+cls+'">'+cell+'</td>';
      }
      h+='</tr>';
    }
    s.innerHTML=h+'</table></div><p class="muted"><span class="vdelta g">+12</span> value: picked 12 spots later than ADP &nbsp;·&nbsp; <span class="vdelta b">-8</span> reach: picked 8 spots earlier than ADP &nbsp;·&nbsp; no number: picked at ADP or no ADP data</p>';
    if(isMobileDraft()){var back=document.createElement('button');back.type='button';back.className='ghostbtn';back.textContent='Back to roster';back.addEventListener('click',function(){mobileRosterMode='slots';mobileView='team';setState({view:'team'});});s.prepend(back);
      /* Phones show ~2 team columns: start the board on your column. */
      var wrap=s.querySelector('.boardwrap'),heads=wrap.querySelectorAll('tr:first-child th'),mine=heads[userTeam()+1];
      if(mine)wrap.scrollLeft=Math.max(0,mine.offsetLeft-heads[0].offsetWidth);}
    wireInjToggles(s);return;
  }else{
    var mine=[];state.log.forEach(function(pi,idx){if(teamForPick(idx)===userTeam())mine.push({pi:pi,idx:idx});});
    var ros=myRoster();
    var h2='<h3>Roster</h3><div class="rlist">';
    ros.slots.forEach(function(e){
      h2+='<div class="rrow"><span class="rpick">'+e.slot+'</span><span class="pname">'+(e.player?esc(e.player.player.n)+' <span class="teamtag">'+esc(e.player.player.t)+'</span>'+injBadge(e.player.player):'<span class="muted">empty</span>')+'</span>'+(e.player?'<span class="ppos">'+posBadges(e.player.player.p)+'</span>':'')+'</div>';});
    h2+='</div>';
    if(ros.overflow.length){h2+='<h3>Overflow</h3><div class="rlist">';ros.overflow.forEach(function(e){h2+='<div class="rrow"><span class="pname">'+esc(e.player.n)+'</span></div>';});h2+='</div>';}
    h2+='<h3>My team ('+mine.length+'/'+state.rounds+')</h3><div class="rlist">';
    if(!mine.length)h2+='<div class="rrow"><span class="muted">No picks yet.</span></div>';
    mine.forEach(function(m){var pl=PLAYERS[m.pi];
      h2+='<div class="rrow"><span class="rpick">'+pickLabel(m.idx)+'</span><span class="pname">'+esc(pl.n)+' <span class="teamtag">'+esc(pl.t)+'</span>'+injBadge(pl)+vBadge(m.pi,m.idx)+'</span><span class="ppos">'+posBadges(pl.p)+'</span></div>';});
    h2+='</div>'+playoffRoster(mine);
    s.innerHTML=h2;
  }
  wireInjToggles(s);
}
/* Available players whose consensus ADP is behind the current pick, best 2025-26 value first. */
function pastAdpRows(){
  var taken={};state.log.forEach(function(pi){taken[pi]=true;});
  var rows=PLAYERS.map(function(p,pi){
    var cv=PDATA[p.n]&&PDATA[p.n].cv,adp=consRank(p);
    if(taken[pi]||!Array.isArray(cv)||cv.length!==9||!isFinite(adp))return null;
    var value=cv.reduce(function(sum,n){return sum+n;},0);
    return {pi:pi,name:p.n,adp:Math.round(adp*10)/10,value:Math.round(value*10)/10,late:state.log.length+1>adp};
  }).filter(Boolean);
  return rows.filter(function(r){return r.late;}).sort(function(a,b){return b.value-a.value;}).slice(0,8);
}
function renderPastAdp(){
  var best=pastAdpRows();
  var h='<section class="past-adp"><h3>Past ADP and still available</h3><p class="muted">Available players whose consensus ADP is behind the current pick, ranked by 2025–26 nine-category value. Historical value is not a 2026–27 projection.</p>';
  if(best.length)h+='<ol class="value-leaders">'+best.map(function(r){return '<li>'+esc(r.name)+' · ADP '+r.adp+' · value '+r.value.toFixed(1)+'</li>';}).join('')+'</ol>';
  else h+='<p class="muted">No players past ADP yet.</p>';
  return h+'</section>';
}
function draftGrades(){return DA.draftGrades({players:PLAYERS,pdata:typeof PDATA!=="undefined"?PDATA:{},log:state.log,teams:TEAMS,core:CORE,repl:scarcityBase().repl});}
function catMatchup(u,o){return DA.catMatchup(u,o);}
function renderGrades(){
  var g=draftGrades();
  var me=g.filter(function(x){return x.team===userTeam();})[0];
  var muOrder=[6,7,5,0,1,2,3,4,8]; // FG% FT% 3PM Pts REB AST STL BLK TO
  var h='<h3>Draft grades</h3><div class="muted">Score = sum of 2025-26 per-game category values (9-cat z-scores) across the full roster. Higher is better. Historical production only — not a projection of 2026-27 totals. Punt advice is in Pick coach.</div>';
  h+='<div class="muted" style="margin:6px 0">Category matchup = historical category-value comparison vs your team (2025-26 z-scores, not projected category totals). <span class="catmu win">PTS</span> = you win the category <span class="catmu even">PTS</span> = even <span class="catmu loss">PTS</span> = they win it. Tally is your wins-losses vs that team.</div>';
  h+='<div class="boardwrap"><table class="board"><thead><tr><th>#</th><th>Team</th><th>Score</th><th>Grade</th><th>Category matchup</th></tr></thead><tbody>';
  g.forEach(function(x){
    var you=x.team===userTeam();
    var unrated=x.unrated>0?' <span class="unrated" title="'+x.unrated+' player(s) without 2025-26 category data, counted at market-implied value (mean of the 10 rated players nearest in consensus ADP)">&#8224;'+x.unrated+'</span>':'';
    h+='<tr'+(you?' class="you"':'')+'><td><b>'+x.rank+'</b></td><td>'+esc(teamName(x.team))+(you?' (you)':'')+'</td><td>'+x.score.toFixed(1)+unrated+'</td><td><b class="gradebadge g-'+x.grade.charAt(0)+'">'+x.grade+'</b></td><td>';
    if(!you&&me){
      var mu=catMatchup(me.cats,x.cats);
      var w=0,l=0;
      mu.forEach(function(m){if(m==='win')w++;else if(m==='loss')l++;});
      h+='<b>'+w+'-'+l+'</b> ';
      muOrder.forEach(function(c){
        var diff=me.cats[c]-x.cats[c];
        h+='<span class="catmu '+mu[c]+'" title="'+CATS9[c]+': you '+me.cats[c].toFixed(1)+' vs '+x.cats[c].toFixed(1)+'">'+CATS9[c]+'</span>';
      });
    }else if(you){
      h+='<span class="muted">—</span>';
    }
    h+='</td></tr>';
  });
  h+='</tbody></table></div><p class="muted"><span class="unrated">&#8224;N</span> = N rostered players had no 2025-26 category data (injured stars, prospects) and were counted at market-implied value: the average of the 10 rated players nearest them in consensus ADP. Bench and starters weighted equally; playoff schedule, injuries, and projected 2026-27 role changes are not factored in.</p>';
  return h;
}
function puntLabel(cats){return PuntCore.label(cats||state.puntCats);}
function puntCatCount(cats){return 9-PuntCore.normalize(cats||state.puntCats).length;}
function sameCats(a,b){return PuntCore.normalize(a).join()===PuntCore.normalize(b).join();}
/* previewCats: the chip selection being explored (not yet committed). */
function renderPuntStrategy(grades,previewCats,expanded){
  var taken={};state.log.forEach(function(pi){taken[pi]=1;});
  var have=state.puntCats,full=have.length>=PuntCore.MAX_PUNTS;
  var next=nextUserPickIdx(),following=next<0?-1:followingUserPickIdx(next);
  var choice=PuntCore.suggest(grades,userTeam(),PLAYERS,PDATA,taken,next,following,have);
  var cats=previewCats!=null?PuntCore.normalize(previewCats):(have.length?have.slice():(choice?[choice.cat]:[]));
  var previewing=previewCats!=null&&!sameCats(cats,have);
  var h='<section class="puntbox"><h3>Punt advice</h3>';
  if(have.length)h+='<p><b>Punting '+esc(puntLabel())+'.</b> The player board can sort by '+puntCatCount()+'-category value. Your regular grade and Pick Coach verdicts remain nine-category.</p>';
  if(previewing&&cats.length)h+='<p><b>Previewing '+esc(puntLabel(cats))+'.</b> '+(have.length?'Your committed punt is still '+esc(puntLabel())+' until you select Update punt.':'Nothing is committed until you select Commit punt.')+'</p>';
  if(choice&&!previewing){
    var alsoTxt=choice.also&&choice.also.length?' Also trailing: '+choice.also.slice(0,2).join(', ')+'.':'';
    h+='<p><b>'+(have.length?'Consider also punting ':'Consider punting ')+choice.cat+'.</b> Your per-pick value trails '+choice.below+' of '+choice.peers+' comparable teams.'+(choice.missing?' '+choice.missing+' of your picks lack category data, so treat this as tentative.':'')+alsoTxt+' This is advice, not an automatic commitment.</p>';
  }else if(!have.length&&!choice&&!cats.length)h+='<p class="muted">No punt recommendation yet. It needs three picks, category data for at least two of yours, and a weak category against other teams.</p>';
  else if(have.length&&!choice&&!previewing&&!full)h+='<p class="muted">No additional punt stands out: you are not trailing most teams in another category.</p>';
  h+='<details'+(expanded?' open':'')+'><summary>Explore punt values and choices</summary><p class="muted">Based on 2025-26 per-game values, not a 2026-27 projection. Pick up to '+PuntCore.MAX_PUNTS+' categories. TO is scored so fewer turnovers rate higher, so punting TO lifts high-usage players.</p>';
  h+='<div class="filters puntchips" role="group" aria-label="Categories to punt">';
  PuntCore.CATS.forEach(function(c){
    var on=cats.indexOf(c)>=0,blocked=!on&&cats.length>=PuntCore.MAX_PUNTS;
    h+='<button type="button" class="fchip'+(on?' sel':'')+'" data-punt-cat="'+c+'" aria-pressed="'+on+'"'+(blocked?' disabled title="Up to '+PuntCore.MAX_PUNTS+' punts"':'')+'>'+c+'</button>';
  });
  h+='</div><div class="puntcontrols">';
  h+='<button class="ghostbtn" id="mdpuntcommit"'+(cats.length&&!sameCats(cats,have)?'':' disabled')+'>'+(have.length?'Update punt':'Commit punt')+'</button>';
  if(have.length)h+='<button class="ghostbtn" id="mdpuntclear">Clear punt</button>';
  h+='</div>';
  if(cats.length===PuntCore.MAX_PUNTS)h+='<p class="muted">With '+cats.length+' punts you still need to win 5 of the remaining '+(9-cats.length)+' categories each week.</p>';
  h+=puntRadarHtml(grades,cats);
  if(cats.length){
    var lbl=puntLabel(cats),rows=PuntCore.rankings(PLAYERS,PDATA,taken,cats);
    var near=PuntCore.nearTermRisers(rows,PLAYERS,next,following);
    var later=PuntCore.laterRisers(rows,PLAYERS,next,following);
    h+='<p class="muted">Punt '+esc(lbl)+': historical '+puntCatCount(cats)+'-category value. Coach advice above still uses all 9 categories.</p>';
    h+='<b>'+(next<0?'Draft complete':'Consider at pick #'+(next+1)+' if you punt '+esc(lbl))+'</b>';
    if(!near.length&&next>=0)h+='<p class="muted">No available punt risers look urgent for this pick. The watches below are for later, not for this turn.</p>';
    if(near.length||later.length){
      var groups=PuntCore.groupRisers(near,PLAYERS,2);
      var laterGroups=PuntCore.groupRisers(later,PLAYERS,1);
      [["guards","Guards"],["frontcourt","Frontcourt (PF/C)"],["wings","Wings"]].forEach(function(g){
        h+='<h4>'+g[1]+'</h4>';
        if(groups[g[0]].length){h+='<ol>';groups[g[0]].forEach(function(r){var p=PLAYERS[r.pi],market=consRank(p);h+='<li>'+esc(p.n)+' · Consensus ADP '+market.toFixed(1)+' · punt rank #'+r.baseRank+' → #'+r.puntRank+' (+'+r.gain+') <button type="button" class="textlink punt-eval" data-punt-eval="'+r.pi+'">Evaluate</button></li>';});h+='</ol>';}
        else if(laterGroups[g[0]].length){var watch=laterGroups[g[0]][0],wp=PLAYERS[watch.pi];h+='<p class="muted">None for this pick. Watch for later, not a pick-now target: '+esc(wp.n)+' · Consensus ADP '+consRank(wp).toFixed(1)+' · punt rank #'+watch.baseRank+' → #'+watch.puntRank+' (+'+watch.gain+'). <button type="button" class="textlink punt-eval" data-punt-eval="'+watch.pi+'">Evaluate</button></p>';}
        else h+='<p class="muted">No '+g[0]+' gain value near your next two picks. Do not force the position.</p>';
      });
    }else h+='<p class="muted">'+(next<0?'No picks remain.':'No qualifying position options near your next two picks. Use Punt value sort to explore the full board.')+'</p>';
    h+='<p class="muted">These are position alternatives, not a ranking to draft in order. Each player appears once by eligible position. Pick-now targets use consensus ADP before the midpoint to your following pick; later watches stop about one round after it. Ranks compare available players with category data only.</p>';
  }
  return h+'</details></section>';
}
function puntRadarHtml(grades,cats){
  var me=grades.filter(function(g){return g.team===userTeam();})[0];
  if(!me||!me.rated)return '<p class="muted">Draft a player with category data to see your build shape.</p>';
  var points=CATS9.map(function(_,i){
    var mine=me.cats[i]/me.rated;
    var peers=grades.filter(function(g){return g.team!==userTeam()&&g.rated;});
    var below=peers.filter(function(g){return g.cats[i]/g.rated<mine;}).length;
    return peers.length?(0.18+0.78*below/peers.length):0.5;
  });
  var x=120,y=120,r=82;
  var vertices=points.map(function(v,i){var a=-Math.PI/2+i*2*Math.PI/9,d=cats.indexOf(CATS9[i])>=0?0.1:v;return {x:x+Math.cos(a)*r*d,y:y+Math.sin(a)*r*d};});
  var polygon=vertices.map(function(p){return p.x.toFixed(1)+','+p.y.toFixed(1);}).join(' ');
  var spokes=CATS9.map(function(_,i){var a=-Math.PI/2+i*2*Math.PI/9;return '<line x1="120" y1="120" x2="'+(x+Math.cos(a)*r).toFixed(1)+'" y2="'+(y+Math.sin(a)*r).toFixed(1)+'"/>';}).join('');
  var dots=vertices.map(function(p,i){return '<circle class="radar-point'+(cats.indexOf(CATS9[i])>=0?' punt-point':'')+'" cx="'+p.x.toFixed(1)+'" cy="'+p.y.toFixed(1)+'" r="3.5"><title>'+CATS9[i]+': '+(cats.indexOf(CATS9[i])>=0?'punted':Math.round(points[i]*100)+'% chart radius')+'</title></circle>';}).join('');
  var labels=CATS9.map(function(c,i){var a=-Math.PI/2+i*2*Math.PI/9;return '<text x="'+(x+Math.cos(a)*106).toFixed(1)+'" y="'+(y+Math.sin(a)*106).toFixed(1)+'" text-anchor="middle" dominant-baseline="middle" class="'+(cats.indexOf(c)>=0?'punt-muted':'')+'">'+c+'</text>';}).join('');
  return '<div class="punt-radar" aria-label="Your nine-category build shape. Each point aligns with its category spoke."><svg viewBox="0 0 240 240" role="img" aria-label="Nine-category build shape, with labeled spokes and category points"><g class="radar-grid"><circle cx="120" cy="120" r="82"/><circle cx="120" cy="120" r="41"/>'+spokes+'</g><polygon points="'+polygon+'"/>'+dots+labels+'</svg><p class="muted">Each point sits on its labeled category spoke. Inward points are weaker; selected punts fold toward the center. Based on 2025–26 per-game category values.</p></div>';
}
function wirePuntControls(root){
  var box=root.querySelector('.puntbox');if(!box)return;
  function selected(){return Array.prototype.map.call(box.querySelectorAll('[data-punt-cat].sel'),function(b){return b.getAttribute('data-punt-cat');});}
  box.querySelectorAll('[data-punt-cat]').forEach(function(b){b.addEventListener('click',function(){
    var cat=b.getAttribute('data-punt-cat'),sel=selected(),i=sel.indexOf(cat);
    if(i>=0)sel.splice(i,1);else if(sel.length<PuntCore.MAX_PUNTS)sel.push(cat);
    box.outerHTML=renderPuntStrategy(draftGrades(),sel,true);
    wirePuntControls(root);
    var again=root.querySelector('[data-punt-cat="'+cat+'"]');if(again)again.focus();
  });});
  var commit=box.querySelector('#mdpuntcommit'),clear=box.querySelector('#mdpuntclear');
  if(commit)commit.addEventListener('click',function(){var sel=PuntCore.normalize(selected());if(sel.length)setState({puntCats:sel});});
  if(clear)clear.addEventListener('click',function(){setState({puntCats:[],sort:state.sort==='punt'?'cons':state.sort});});
  box.querySelectorAll('[data-punt-eval]').forEach(function(b){b.addEventListener('click',function(){evaluatePlayer(parseInt(b.getAttribute('data-punt-eval'),10));});});
}
function renderDone(){
  cancelPickCoach();
  if(isMobileDraft()){renderDraft();return;}
  var h='<h2>Draft complete</h2><div class="muted">Final roster from pick #'+state.draftPos+' ('+state.rounds+' rounds, 12 teams)</div>';
  h+='<button class="bigbtn" id="mdnew2">Run it back</button>';
  if(state.userTurns.length)h+='<button class="ghostbtn" id="mdundo2" style="margin-left:8px">Undo my last pick</button>';
  h+=viewTabsHtml()+'<div id="mdside"></div>';
  el("mdapp").innerHTML=h;
  announceLive((_pendingLive||"")+"Draft complete.");
  _pendingLive="";
  el("mdnew2").addEventListener("click",restartDraft);
  var undo=el("mdundo2");if(undo)undo.addEventListener("click",undoUserPick);
  el("mdapp").querySelectorAll("[data-view]").forEach(function(b){b.addEventListener("click",function(){setState({view:b.getAttribute("data-view")});});});
  renderSide();
}
function playoffBadge(pl){
 var v=window.PlayoffCore.counts(window.PlayoffData,pl.t,state.playoffStart);
 if(!v)return '<span class="playoffbadge">Playoffs \u2014 team unknown</span>';
 var r=window.PlayoffCore.rating(v);
 function pw(i){return '<span class="pw g'+Math.min(4,v[i])+'"><span class="pwk">W'+(i+1)+' </span><span class="pwn">'+v[i]+'</span></span>';}
 return '<span class="playoffbadge '+r+'" title="Schedule quality: '+r+' (2 games in a week = bad, 3 = ok, 4+ = good)"><span class="pwx">Playoffs </span>'+pw(0)+'<span class="pwx"> \u00b7 </span>'+pw(1)+'<span class="pwx"> \u00b7 </span>'+pw(2)+'<span class="pwx"> = '+window.PlayoffCore.total(v)+'</span></span>';
}
function playoffRoster(mine){
 var sum=window.PlayoffCore.summary(window.PlayoffData,mine.map(function(m){return PLAYERS[m.pi];}),state.playoffStart);
 var quiet=sum.games.map(function(n,i){return 'W'+(i+1)+' '+n;}).join(' \u00b7 ');
 var h='<details class="setup-details" id="mdplayoffroster"><summary><b>Playoff games \u00b7 your roster</b> <span class="muted">'+quiet+'</span></summary>';
 h+='<div class="catgrid">';
 sum.games.forEach(function(n,i){h+='<div class="catchip"><span class="catname">'+(sum.unknown?'KNOWN ':'')+'WEEK '+(i+1)+'</span><span class="catnum">'+n+'</span></div>';});
 h+='</div><p class="muted">'+sum.players+' players, including bench. '+sum.unknown+' unknown team schedules. These are scheduled opportunities, not guaranteed starts.</p>';
 if(mine.length){h+='<div class="boardwrap"><table class="playofftable"><thead><tr><th>Player / team</th><th>W1</th><th>W2</th><th>W3</th><th>Total</th></tr></thead><tbody>';
 mine.forEach(function(m){var p=PLAYERS[m.pi],v=window.PlayoffCore.counts(window.PlayoffData,p.t,state.playoffStart),r=v?window.PlayoffCore.rating(v):null;
 h+='<tr'+(r?' class="'+r+'"':'')+'><td>'+esc(p.n)+' <span class="teamtag">'+esc(p.t)+'</span></td>';
 [0,1,2].forEach(function(i){h+='<td>'+(v?v[i]:'\u2014')+'</td>';});
 h+='<td>'+(v?window.PlayoffCore.total(v):'\u2014')+'</td></tr>';});h+='</tbody></table></div>';}
 return h+'</details>';
}
function clearPlayoffHost(){
  var host=el("mdplayoffhost");
  if(host){host.innerHTML="";host.style.display="none";}
}
function playoffSettingsHtml(){
  var d=window.PlayoffData;
  var label="W"+state.playoffStart+"\u2013"+(state.playoffStart+2)+(state.playoffStart===20?" \u00b7 Yahoo default":"");
  var h='<details class="setup-details" id="mdplayoff"><summary><b>Fantasy playoff schedule</b> <span class="muted">'+label+'</span></summary>';
  h+='<div class="muted" style="margin:8px 0">Three-week window</div><div class="filters">';
  [18,19,20,21].forEach(function(w){h+='<button class="fchip'+(state.playoffStart===w?' sel':'')+'" data-pw="'+w+'">W'+w+'\u2013'+(w+2)+(w===20?' \u00b7 Yahoo default':'')+'</button>';});
  h+='</div><div class="catgrid">';
  d.weeks.slice(state.playoffStart-18,state.playoffStart-15).forEach(function(w,i){h+='<div class="catchip"><b>W'+(i+1)+' \u00b7 Yahoo '+w.week+'</b><div class="muted">'+w.start+' \u2013 '+w.end+'</div></div>';});
  h+='</div><p class="muted playoffnote">2 games in a week = bad \u00b7 3 = ok \u00b7 4\u20135 = good. Scheduled NBA team games, based on the displayed team. Team assignments may be outdated; injuries, rest, byes and lineup limits are not deducted. Confirm your league dates. Snapshot '+d.checked+'. <a href="'+d.source+'" target="_blank" rel="noopener">Schedule source</a> \u00b7 <a href="'+d.defaultSource+'" target="_blank" rel="noopener">Yahoo dates</a></p></details>';
  return h;
}
function wirePlayoffSettings(root){
  if(!root)return;
  root.querySelectorAll("[data-pw]").forEach(function(b){b.addEventListener("click",function(){setState({playoffStart:Number(b.getAttribute("data-pw")),page:0});});});
}
function render(){
  clearPlayoffHost();
  document.body.classList.toggle("mobile-drafting",isMobileDraft());
  el("md").classList.toggle("mobile-draft",isMobileDraft());
  document.body.classList.toggle("dl-on-clock",state.phase==="draft"&&isUserTurn());
  if(state.phase==="setup")renderSetup();
  else if(state.phase==="done")renderDone();
  else renderDraft();
  /* Every view/phase change: clear or restore dock (tabs must stay reachable) */
  syncCoachDock();
}
render();
})();
