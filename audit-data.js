'use strict';
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const health=require('./data-health');
function loadBundledData(){
  const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
  const players=html.match(/var PLAYERS=([\s\S]*?\r?\n\];)\r?\nPLAYERS\.forEach/);
  const tags=html.match(/var CATS=([\s\S]*?\r?\n};)\r?\nPLAYERS\.forEach/);
  if(!players||!tags)throw new Error('Cannot locate player pool/category tags in index.html');
  const context={};vm.createContext(context);
  vm.runInContext('var PLAYERS='+players[1]+'\nvar CATS='+tags[1],context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'player-data.js'),'utf8'),context);
  return {players:context.PLAYERS,data:context.PDATA,tags:context.CATS};
}
if(require.main===module){
  const {players,data,tags}=loadBundledData();
  const report=health.audit(players,data,tags);
  if(process.argv.includes('--json'))console.log(JSON.stringify(report,null,2));
  else {
    console.log('Bundled data audit — internal consistency only; does not verify source accuracy or NBA pool completeness.');
    console.log('Players: '+report.players);
    ['errors','missingData','orphanData','missingAdp','missingLast','missingLastTotal','missingCv','missingMpg','untagged','placeholderTeams'].forEach(key=>{
      console.log(key+': '+report[key].length+(report[key].length?'\n  '+report[key].join(', '):''));
    });
    console.log('Largest built-in rank / ADP gaps (40+ picks; review signals, not proven errors):');
    report.rankDivergence.slice(0,15).forEach(p=>console.log(`  ${p.name}: rank ${p.rank}, ADP ${p.adp}, gap ${p.gap}`));
  }
  process.exitCode=report.errors.length||report.missingData.length||report.orphanData.length?1:0;
}
module.exports={loadBundledData};
