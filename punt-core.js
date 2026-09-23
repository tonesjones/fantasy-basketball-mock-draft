(function(root,factory){
  var api=factory();
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  if(root)root.PuntCore=api;
})(typeof window!=="undefined"?window:null,function(){
  "use strict";
  var CATS=["PTS","REB","AST","STL","BLK","3PM","FG%","FT%","TO"];
  function valid(cat){return CATS.indexOf(cat)>=0&&cat!=="TO";}
  function rankings(players,pdata,taken,cat){
    if(!valid(cat))return [];
    var omit=CATS.indexOf(cat),rows=[];
    players.forEach(function(p,pi){
      if(taken[pi])return;
      var cv=pdata[p.n]&&pdata[p.n].cv;
      if(!Array.isArray(cv)||cv.length!==9||!cv.every(Number.isFinite))return;
      var base=cv.reduce(function(a,b){return a+b;},0);
      rows.push({pi:pi,base:base,punt:base-cv[omit],gain:0});
    });
    rows.sort(function(a,b){return b.base-a.base||a.pi-b.pi;});
    rows.forEach(function(row,i){row.baseRank=i+1;});
    rows.sort(function(a,b){return b.punt-a.punt||a.pi-b.pi;});
    rows.forEach(function(row,i){row.puntRank=i+1;row.gain=row.baseRank-row.puntRank;});
    return rows;
  }
  function suggest(teams,userTeam,players,pdata,taken,nextPick){
    var me=teams.filter(function(t){return t.team===userTeam;})[0];
    if(!me||me.rated<2||me.rated+me.unrated<3||nextPick<0)return null;
    var peers=teams.filter(function(t){return t.team!==userTeam&&t.rated>=2;});
    if(peers.length<3)return null;
    var choices=[];
    CATS.slice(0,8).forEach(function(cat,ci){
      var mine=me.cats[ci]/me.rated;
      var below=peers.filter(function(t){return t.cats[ci]/t.rated>mine;}).length;
      if(below<=peers.length/2)return;
      var rows=rankings(players,pdata,taken,cat);
      var useful=rows.filter(function(r){
        var p=players[r.pi],market=p.adp==null?p.r:p.adp;
        return r.gain>0&&r.puntRank<=50&&Math.abs(market-(nextPick+1))<=30;
      });
      choices.push({cat:cat,below:below,peers:peers.length,risers:useful.length,missing:me.unrated});
    });
    choices.sort(function(a,b){return b.below-a.below||b.risers-a.risers||CATS.indexOf(a.cat)-CATS.indexOf(b.cat);});
    return choices[0]||null;
  }
  return {CATS:CATS,valid:valid,rankings:rankings,suggest:suggest};
});
