const assert = require('node:assert/strict');
const DA = require('./draft-analysis');

function grade(team, picks, pts, reb) {
  const cats = Array(9).fill(0);
  cats[0] = pts * picks;
  cats[1] = reb * picks;
  return { team, cats, rated: picks, unrated: 0 };
}

const grades = [grade(0, 3, -0.5, -1.5)];
for (let team = 1; team < 12; team++) grades.push(grade(team, 4, 0.5, 0.5));
const players = Array.from({ length: 39 }, (_, i) => ({ n: 'Player ' + i, adp: i < 36 ? i + 1 : 43 }));
const pdata = {};
players.forEach(p => { pdata[p.n] = { cv: Array(9).fill(0) }; });
pdata['Player 36'].cv[0] = 4;
pdata['Player 36'].cv[1] = 2;
pdata['Player 37'].cv[0] = 2;
pdata['Player 37'].cv[1] = 2;
pdata['Player 38'].cv[0] = 1;
pdata['Player 38'].cv[1] = 1;
const log = Array.from({ length: 36 }, (_, i) => i);
const opts = { grades, userTeam: 0, players, pdata, log, nextPick: 41, followingPick: 55 };

const outlook = DA.categoryOutlook(opts);
assert.equal(outlook.ready, true);
assert.equal(outlook.rows.length, 9);
assert.equal(outlook.rows[0].rank, 12);
assert.equal(outlook.rows[0].status, 'weak');
assert.equal(outlook.rows[0].catchup, 'one-pick');
assert.equal(outlook.rows[0].near[0].name, 'Player 36');
assert.equal(outlook.rows[1].catchup, 'hard-climb');
assert.equal(outlook.rows[0].gap.toFixed(1), '1.0');

const twoPicks = DA.categoryOutlook({ ...opts, grades: [grade(0, 3, -0.5, -0.4), ...grades.slice(1)] });
assert.equal(twoPicks.rows[1].catchup, 'two-pick');

players[36].inj = { injury: 'test injury' };
const withoutInjured = DA.categoryOutlook(opts);
assert.equal(withoutInjured.rows[0].catchup, 'hard-climb', 'injured player must not create a catch-up path');
delete players[36].inj;

const early = DA.categoryOutlook({ ...opts, grades: [grade(0, 2, -0.5, -1.5), ...grades.slice(1)] });
assert.equal(early.ready, false);
assert.equal(early.rows[0].status, 'early');

const uneven = DA.categoryOutlook({ ...opts, grades: [grade(0, 3, 1, 0), ...grades.slice(1)] });
assert.equal(uneven.rows[0].rank, 1, 'compare per-pick averages, not raw roster totals');
assert.equal(uneven.rows[0].status, 'strong');

const missing = DA.categoryOutlook({ ...opts, log: log.map((pi, i) => i === 0 || i === 23 ? -1 : pi) });
assert.equal(missing.ready, false, 'do not claim strength with too many off-pool picks');

const empty = DA.categoryOutlook({ ...opts, log: [], grades: [grade(0, 0, 0, 0), ...grades.slice(1)] });
assert.equal(empty.ready, false);
assert.equal(empty.rows.length, 9);

console.log('category outlook: early, uneven picks, catch-up, and missing Yahoo picks passed');
