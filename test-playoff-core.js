const assert = require('node:assert/strict');
const core = require('./playoff-core');
const data = require('./playoff-data.js');

// --- data snapshot integrity ---
assert.equal(data.season, '2026-27');
assert.equal(data.defaultStart, 21, 'standard playoff window starts week 21');
assert.deepEqual(data.weeks.map(w => w.week), [18, 19, 20, 21, 22, 23]);
const teams = Object.keys(data.teams);
assert.equal(teams.length, 30, 'all 30 teams present');
for (const t of teams) {
  const w = data.teams[t];
  assert.equal(w.length, 6, t + ' needs weeks 18-23');
  assert.ok(w.every(n => Number.isInteger(n) && n >= 0 && n <= 7), t + ' counts in range');
}
assert.ok(!('GS' in data.teams || 'NO' in data.teams || 'WAS' in data.teams), 'snapshot uses standard team codes');
// Week dates are Monday-Sunday Yahoo weeks
assert.deepEqual([data.weeks[0].start, data.weeks[0].end], ['2027-03-01', '2027-03-07']);
assert.deepEqual([data.weeks[3].start, data.weeks[3].end], ['2027-03-22', '2027-03-28']);
assert.deepEqual([data.weeks[5].start, data.weeks[5].end], ['2027-04-05', '2027-04-11']);

// --- counts ---
assert.deepEqual(core.counts(data, 'GSW', 21), data.teams.GSW.slice(3, 6));
assert.deepEqual(core.counts(data, 'GS', 21), data.teams.GSW.slice(3, 6), 'app code GS aliases to GSW');
assert.deepEqual(core.counts(data, 'NO', 21), data.teams.NOP.slice(3, 6), 'app code NO aliases to NOP');
assert.deepEqual(core.counts(data, 'WAS', 18), data.teams.WSH.slice(0, 3));
assert.equal(core.counts(data, 'GSW', 17), null, 'window before 18 rejected');
assert.equal(core.counts(data, 'GSW', 22), null, 'window after 21 rejected');
assert.equal(core.counts(data, 'XXX', 21), null, 'unknown team rejected');
assert.equal(core.counts(data, null, 21), null, 'null team rejected');

// --- total ---
assert.equal(core.total([4, 3, 4]), 11);
assert.equal(core.total(null), null);

// --- rating: 2 in any week = bad, 3 = ok, 4-5 = good ---
assert.equal(core.rating([4, 4, 4]), 'good');
assert.equal(core.rating([5, 4, 4]), 'good');
assert.equal(core.rating([4, 3, 4]), 'ok');
assert.equal(core.rating([3, 3, 3]), 'ok');
assert.equal(core.rating([4, 2, 5]), 'bad');
assert.equal(core.rating([2, 2, 2]), 'bad');
assert.equal(core.rating(null), null);
// real snapshot spot checks: NOP has a 2-game week in the default window
assert.equal(core.rating(core.counts(data, 'NOP', 21)), 'bad');
assert.equal(core.rating(core.counts(data, 'GSW', 21)), 'good');

// --- summary ---
const sum = core.summary(data, [{t: 'GSW'}, {t: 'NO'}, {t: 'XXX'}], 21);
assert.equal(sum.players, 3);
assert.equal(sum.unknown, 1);
const gsw = core.counts(data, 'GSW', 21), nop = core.counts(data, 'NOP', 21);
assert.deepEqual(sum.games, [gsw[0] + nop[0], gsw[1] + nop[1], gsw[2] + nop[2]]);
console.log('playoff-core: OK -', teams.length, 'teams, default window W21-23');
