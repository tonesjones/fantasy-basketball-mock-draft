(function(r){
'use strict';
// Playoff schedule helpers. data = window.PlayoffData (see playoff-data.js).
// Team codes are normalized: the app uses Yahoo-style codes (GS, NO, NY,
// PHO, SA, WAS); the schedule snapshot uses standard codes.
var aliases={GS:'GSW',NO:'NOP',NOR:'NOP',NY:'NYK',PHO:'PHX',SA:'SAS',WAS:'WSH'};
function counts(data,team,start){
 team=aliases[team]||team;
 if(!Number.isInteger(start)||start<18||start>21||!Object.prototype.hasOwnProperty.call(data.teams,team))return null;
 return data.teams[team].slice(start-18,start-15);
}
function total(values){return values?values.reduce(function(a,b){return a+b;},0):null;}
// Schedule quality for a 3-week window: 2 games in any week = bad,
// 3 games in a week = ok, 4-5 every week = good.
function rating(values){
 if(!values)return null;
 var min=Math.min.apply(null,values);
 if(min<=2)return 'bad';
 if(min===3)return 'ok';
 return 'good';
}
function summary(data,players,start){var sums=[0,0,0],unknown=0;players.forEach(function(p){var v=counts(data,p.t,start);if(!v){unknown++;return;}v.forEach(function(n,i){sums[i]+=n;});});return {games:sums,unknown:unknown,players:players.length};}
var api={counts:counts,total:total,rating:rating,summary:summary};if(typeof module!=='undefined'&&module.exports)module.exports=api;else r.PlayoffCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
