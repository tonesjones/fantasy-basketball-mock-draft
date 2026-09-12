/* Draft engine shared by the browser app and Node tests. */
(function(root, factory){
  var api=factory();
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  root.DraftCore=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  function teamForPick(index, teams){var round=Math.floor(index/teams), within=index%teams;return round%2===0?within:teams-1-within;}
  function validPlayerIndex(players, log, index){return Number.isInteger(index)&&index>=0&&index<players.length&&log.indexOf(index)<0;}
  function availableIndexes(players, log){var used={};log.forEach(function(i){used[i]=true;});return players.map(function(_,i){return i;}).filter(function(i){return !used[i];});}
  function slotOK(slot, positions){
    if(slot==="BN"||slot==="Util")return true;
    if(slot==="G")return positions.indexOf("PG")>=0||positions.indexOf("SG")>=0;
    if(slot==="F")return positions.indexOf("SF")>=0||positions.indexOf("PF")>=0;
    return positions.indexOf(slot)>=0;
  }
  function slotWeight(slot){return slot==="BN"?4:slot==="Util"?3:slot==="G"||slot==="F"?2:1;}
  /* Augmenting-path matching assigns every eligible player once, and reassigns
     earlier players when a later, less-flexible player needs their slot. */
  function assignRoster(playerEntries, slots){
    var filled=slots.map(function(slot){return {slot:slot,player:null};});
    var ordered=playerEntries.slice().sort(function(a,b){
      function choices(entry){return slots.filter(function(slot){return slotOK(slot,entry.player.p);}).length;}
      return choices(a)-choices(b);
    });
    function tryPlace(entry, seen){
      var candidates=[];
      for(var i=0;i<filled.length;i++)if(slotOK(filled[i].slot,entry.player.p))candidates.push(i);
      candidates.sort(function(a,b){return slotWeight(filled[a].slot)-slotWeight(filled[b].slot);});
      for(var j=0;j<candidates.length;j++){
        var si=candidates[j];if(seen[si])continue;seen[si]=true;
        if(!filled[si].player || tryPlace(filled[si].player,seen)){filled[si].player=entry;return true;}
      }
      return false;
    }
    var overflow=[];
    ordered.forEach(function(entry){if(!tryPlace(entry,{}))overflow.push(entry);});
    return {slots:filled,overflow:overflow};
  }
  function slotsForRounds(rounds, baseSlots){var slots=baseSlots.slice();while(slots.length<rounds)slots.push("BN");return slots;}
  function teamEntries(players, log, team, teams){var out=[];log.forEach(function(pi,index){if(teamForPick(index,teams)===team)out.push({player:players[pi],pi:pi,index:index});});return out;}
  function positionalNeed(entries, candidate, slots){
    var before=assignRoster(entries,slots).slots.filter(function(x){return x.player&&x.slot!=="BN"&&x.slot!=="Util";}).length;
    var after=assignRoster(entries.concat([{player:candidate,pi:-1,index:-1}]),slots).slots.filter(function(x){return x.player&&x.slot!=="BN"&&x.slot!=="Util";}).length;
    return after-before;
  }
  function cpuPickIndex(opts){
    var players=opts.players,log=opts.log,teams=opts.teams,team=teamForPick(log.length,teams),slots=opts.slots;
    var entries=teamEntries(players,log,team,teams), candidates=availableIndexes(players,log),random=opts.random||Math.random;
    /* Centered noise that widens as the draft goes on: about +/-2 at the top of
       round 1 (where ADP gaps are tiny) growing to about +/-8 in the last rounds
       (where real drafts are chaos). */
    var spread=4;
    if(opts.totalPicks)spread=2+6*(log.length/Math.max(1,opts.totalPicks-1));
    var best=-1,bestScore=Infinity;
    candidates.forEach(function(i){
      var player=players[i];
      var market=player.adp==null?(player.r||i+1)+45:player.adp;
      var need=positionalNeed(entries,player,slots);
      var score=market+((random()*2-1)*spread)-need*3;
      if(score<bestScore){bestScore=score;best=i;}
    });
    return best;
  }
  function seededRandom(seed){var state=(seed>>>0)||1;return {next:function(){state^=state<<13;state^=state>>>17;state^=state<<5;return ((state>>>0)/4294967296);},getState:function(){return state>>>0;}};}
  return {teamForPick:teamForPick,validPlayerIndex:validPlayerIndex,availableIndexes:availableIndexes,slotOK:slotOK,assignRoster:assignRoster,slotsForRounds:slotsForRounds,teamEntries:teamEntries,positionalNeed:positionalNeed,cpuPickIndex:cpuPickIndex,seededRandom:seededRandom};
});
