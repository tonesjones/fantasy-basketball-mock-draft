(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.DataHealth=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var categories=['PTS','REB','AST','STL','BLK','3PM','FG%','FT%','TO'];
  var positions=['PG','SG','SF','PF','C'];
  var roleDeltas=['up','down','flat','unknown'];
  function positive(value){return typeof value==='number'&&isFinite(value)&&value>0;}
  function audit(players,data,tags){
    data=data||{};tags=tags||{};
    var out={players:players.length,errors:[],missingData:[],orphanData:[],missingAdp:[],missingAdpF:[],missingLast:[],missingLastTotal:[],missingCv:[],missingMpg:[],untagged:[],placeholderTeams:[],rankDivergence:[],
      movers:[],roleDeltaUp:[],roleDeltaDown:[],roleDeltaFlat:[],roleDeltaUnknown:[],missingTeamPrev:[],withProjMpg:[],withProjRank:[],missingProjMpg:[],missingProjRank:[]};
    var names=Object.create(null),normalized=Object.create(null);
    players.forEach(function(p,index){
      var name=p.n||p[0],pos=p.p||p[1],team=p.t||p[2],rank=p.r||index+1;
      if(typeof name!=='string'||!name.trim()){out.errors.push('Invalid player name at index '+index);return;}
      var key=name.trim().toLowerCase();
      if(normalized[key])out.errors.push('Duplicate player name: '+name);
      normalized[key]=true;names[name]=true;
      if(!Array.isArray(pos)||!pos.length||pos.some(function(x){return positions.indexOf(x)<0;}))out.errors.push('Invalid position: '+name);
      if(!team||['—','-','FA','TBD','N/A'].indexOf(String(team).toUpperCase())>=0)out.placeholderTeams.push(name);
      var d=Object.prototype.hasOwnProperty.call(data,name)?data[name]:null;
      if(!d)out.missingData.push(name);
      var missingKey={adp:'missingAdp',adpF:'missingAdpF',last:'missingLast',lastTotal:'missingLastTotal'};
      ['adp','adpF','last','lastTotal'].forEach(function(field){
        var value=d&&d[field];
        if(value==null)out[missingKey[field]].push(name);
        else if(!positive(value)||(field!=='adp'&&field!=='adpF'&&!Number.isInteger(value)))out.errors.push('Invalid '+field+': '+name);
      });
      var cv=d&&d.cv;
      if(cv==null)out.missingCv.push(name);
      else if(!Array.isArray(cv)||cv.length!==9||cv.some(function(x){return typeof x!=='number'||!isFinite(x);}))out.errors.push('Invalid cv (need 9 finite numbers): '+name);
      var mpg=d&&d.mpg;
      if(mpg==null)out.missingMpg.push(name);
      else if(typeof mpg!=='number'||!isFinite(mpg)||mpg<0||mpg>48)out.errors.push('Invalid mpg (need 0-48): '+name);
      var cats=tags[name];
      if(!cats||!cats.length)out.untagged.push(name);
      if(cats&&(!Array.isArray(cats)||cats.some(function(c){return categories.indexOf(c)<0;})||new Set(cats).size!==cats.length))out.errors.push('Invalid or duplicate category tag: '+name);
      if(d&&positive(d.adp)&&Math.abs(rank-d.adp)>=40)out.rankDivergence.push({name:name,rank:rank,adp:d.adp,gap:Math.round((rank-d.adp)*10)/10});
      // Movers / outlook coverage (optional fields; missing proj is expected in v1)
      var mover=d&&d.mover;
      var role=d&&d.roleDelta;
      var teamPrev=d&&d.teamPrev;
      if(mover)out.movers.push(name);
      if(role==='up')out.roleDeltaUp.push(name);
      else if(role==='down')out.roleDeltaDown.push(name);
      else if(role==='flat')out.roleDeltaFlat.push(name);
      else out.roleDeltaUnknown.push(name);
      if(role!=null&&roleDeltas.indexOf(role)<0)out.errors.push('Invalid roleDelta: '+name);
      if(mover&&typeof mover!=='boolean'&&mover!==0&&mover!==1)out.errors.push('Invalid mover: '+name);
      if(!teamPrev)out.missingTeamPrev.push(name);
      if(d&&d.projMpg!=null){
        out.withProjMpg.push(name);
        if(typeof d.projMpg!=='number'||!isFinite(d.projMpg)||d.projMpg<0||d.projMpg>48)out.errors.push('Invalid projMpg: '+name);
      }else out.missingProjMpg.push(name);
      if(d&&d.projRank!=null){
        out.withProjRank.push(name);
        if(!positive(d.projRank)||!Number.isInteger(d.projRank))out.errors.push('Invalid projRank: '+name);
      }else out.missingProjRank.push(name);
    });
    Object.keys(data).forEach(function(name){if(!names[name])out.orphanData.push(name);});
    out.rankDivergence.sort(function(a,b){return Math.abs(b.gap)-Math.abs(a.gap);});
    return out;
  }
  return {audit:audit};
});
