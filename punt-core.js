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
    if(!me||me.rated<3||me.unrated>0||nextPick<0)return null;
    var peers=teams.filter(function(t){return t.rated>=3&&t.unrated===0;});
    if(peers.length<4)return null;
    var choices=[];
    CATS.slice(0,8).forEach(function(cat,ci){
      var others=peers.filter(function(t){return t.team!==userTeam;});
      var below=others.filter(function(t){return t.cats[ci]/t.rated>me.cats[ci]/me.rated;}).length;
      if(below<Math.ceil(others.length*0.75))return;
      var rows=rankings(players,pdata,taken,cat);
      var useful=rows.filter(function(r){
        var p=players[r.pi],market=p.adp==null?p.r:p.adp;
        return r.gain>=3&&r.puntRank<=45&&market<=nextPick+25&&market>=nextPick-25;
      });
      if(useful.length>=2)choices.push({cat:cat,below:below,risers:useful.length});
    });
    choices.sort(function(a,b){return b.below-a.below||b.risers-a.risers||CATS.indexOf(a.cat)-CATS.indexOf(b.cat);});
    return choices[0]||null;
  }
  return {CATS:CATS,valid:valid,rankings:rankings,suggest:suggest};
});
