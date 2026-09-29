// scripts/refresh-adp.js: CSV parsing, name matching, diff and PDATA rewrite.
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const R = require('./scripts/refresh-adp');
const { loadData, ROOT } = require('./scripts/load-data');

assert.equal(R.normalize('Moussa Diabaté'), R.normalize('Moussa Diabate'), 'diacritics fold');
assert.equal(R.normalize("Kel'el  Ware"), R.normalize('Kelel Ware'), 'apostrophes and spaces fold');
assert.equal(R.parseCsv('a,"b, c",d\n1,"say ""hi""",3\r\n').length, 2, 'quoted CSV parses');
assert.equal(R.parseCsv('a,"b, c",d\n')[0][1], 'b, c');

const players = Array.from(loadData().PLAYERS);
const csv = [
  'Player,Team,Pos,Yahoo ADP,Fantrax ADP,ESPN ADP',
  'Nikola Jokic,DEN,C,3.1,1.5,2.0',                  // Yahoo moves, Fantrax same
  'Alexandre Sarr,WSH,C,,50.0,40',                    // alias + team alias; Yahoo now blank
  '"Alperen Sengün",HOU,PF C,18.6,20.7,15',           // diacritics
  'Some Rookie,UTA,SG,99.0,120.0,',                   // add candidate
  'Tyrese Haliburton,IND,PG SG,17.2,11.6,',           // PDATA entry with no cv: starts with adp
].join('\n');
const d = R.diff(R.readTable(csv), players);
assert.equal(d.matched, 4);
assert.equal(d.unmatched.length, 1);
assert.equal(d.unmatched[0].name, 'Some Rookie');
assert.equal(d.absent.length, players.length - 4, 'every other pool player is flagged absent');
const jok = d.changes.filter(c => c.name === 'Nikola Jokic');
assert.equal(jok.length, 1, 'only the changed field is reported');
assert.equal(jok[0].field, 'adp');
assert.equal(jok[0].to, 3.1);
const sarr = d.changes.filter(c => c.name === 'Alex Sarr').map(c => c.field + ':' + c.to).sort();
assert.equal(sarr[0], 'adp:null', 'blank Yahoo cell nulls the value');
assert.equal(d.teamPos.filter(x => x.name === 'Alex Sarr').length, 0, 'WSH is the WAS alias, not a team change');
assert.match(R.report(d), /add candidates\): 1/);

// Apply rewrites PDATA only; the INJ block (same names as keys) is untouched.
const src = fs.readFileSync(ROOT + '/player-data.js', 'utf8');
const out = R.apply(src, d.changes);
const sb = {};
vm.createContext(sb);
vm.runInContext(out, sb);
assert.equal(sb.PDATA['Nikola Jokic'].adp, 3.1);
assert.equal(sb.PDATA['Nikola Jokic'].adpF, 1.5);
assert.equal(sb.PDATA['Alex Sarr'].adp, null);
assert.equal(sb.PDATA['Alex Sarr'].adpF, 50);
assert.equal(sb.PDATA['Tyrese Haliburton'].adp, 17.2, 'an entry whose first field is adp is rewritten');
assert.equal(sb.PDATA['Tyrese Haliburton'].adpF, 11.6);
assert.equal(out.slice(out.indexOf('var INJ=')), src.slice(src.indexOf('var INJ=')), 'INJ block unchanged');
assert.equal(R.apply(src, []), src, 'no changes, no rewrite');

console.log('refresh-adp tests passed');
