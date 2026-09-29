// scripts/hashtag-adp-to-csv.js: reads only Yahoo (adp-col-y) and Fantrax
// (adp-col-f) cells; ESPN (adp-col-e) and BLEND are never used.
const assert = require('node:assert/strict');
const { parse, toCsv } = require('./scripts/hashtag-adp-to-csv');
const { readTable } = require('./scripts/refresh-adp');

function row(name, team, y, e, f, blend) {
  const grp = (cls, pos, adp, ord) =>
    `<td class="psg-sep ${cls}"></td><td class="adp-pos-col ${cls}"><span class="pos-pill"><span>${pos}</span></span></td>` +
    `<td class="${cls}">${adp}</td><td class="${cls}">${ord}</td>`;
  return `<tr><td><a class="d-none d-sm-inline" href="/1/player">${name}</a><a class="d-inline d-sm-none">X.Y</a></td><td>${team}</td>` +
    grp('adp-col-y', y[0], y[1], y[2]) + grp('adp-col-e', e[0], e[1], e[2]) + grp('adp-col-f', f[0], f[1], f[2]) +
    `<td class="psg-sep adp-col-b"></td><td class="adp-col-b">${blend}</td><td class="adp-col-b">1</td></tr>`;
}
const page = '<div>Updated: 25 September 2026</div><table id="rawDataTable"><tr><th>NAME</th></tr>' +
  row('Nikola Jokic', 'DEN', ['C', '1.9', '2'], ['C', '1.6', '1'], ['C', '1.5', '1'], '1.7') +
  row('Alperen Seng&#252;n', 'HOU', ['PF C', '18.2', '19'], ['C', '15.0', '14'], ['PF C', '20.6', '22'], '17.9') +
  row('Espn Only', 'UTA', ['SG', '', ''], ['SG', '88.0', '80'], ['SG', '', ''], '88.0') +
  '</table>';

const out = parse(page);
assert.equal(out.stamp, '25 September 2026');
assert.equal(out.rows.length, 3);
assert.deepEqual({ ...out.rows[0] }, { name: 'Nikola Jokic', team: 'DEN', pos: 'C', yahoo: '1.9', fantrax: '1.5' });
assert.equal(out.rows[1].name, 'Alperen Sengün', 'HTML entities decode');
assert.equal(out.rows[1].pos, 'PF C', 'position is the Yahoo eligibility');
assert.equal(out.rows[2].yahoo, '', 'an ESPN-only value never leaks into Yahoo');
assert.equal(out.rows[2].fantrax, '', 'or into Fantrax');

const table = readTable(toCsv(out.rows));
assert.equal(table[0].yahoo, 1.9);
assert.equal(table[0].fantrax, 1.5);
assert.equal(table[2].yahoo, null);
assert.throws(() => parse('<html>no table</html>'), /rawDataTable not found/);

console.log('hashtag-adp-to-csv tests passed');
