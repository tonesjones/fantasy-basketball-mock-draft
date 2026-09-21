'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const health = require('./data-health');
const auditMod = require('./audit-data');

const audit = health.audit || health;
const loadBundledData = auditMod.loadBundledData || auditMod.loadBundledData;

const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('player-data.js', 'utf8'), ctx);
vm.runInContext(fs.readFileSync('movers-outlook.js', 'utf8'), ctx);
vm.runInContext(fs.readFileSync('vacated-usage.js', 'utf8'), ctx);

assert.ok(ctx.VACATED_USAGE);
const keys = Object.keys(ctx.VACATED_USAGE);
assert.ok(keys.length >= 15 && keys.length <= 25, 'expected ~15–25 annotated, got ' + keys.length);

for (const name of keys) {
  const d = ctx.PDATA[name];
  assert.ok(d, 'PDATA missing ' + name);
  assert.equal(d.mover, true, name + ' must be a mover');
  assert.ok(d.teamPrev, name + ' needs teamPrev');
  assert.ok(Array.isArray(d.vacatedGainers) && d.vacatedGainers.length >= 1);
  assert.ok(d.vacatedGainers.length <= 3, name + ' max 3 gainers');
  for (const g of d.vacatedGainers) {
    assert.equal(typeof g.name, 'string');
    assert.ok(g.name.trim());
    assert.ok(ctx.PDATA[g.name], 'gainer not in pool: ' + g.name + ' (for ' + name + ')');
    assert.equal(typeof g.reason, 'string');
  }
}

const g = ctx.PDATA['Giannis Antetokounmpo'];
assert.ok(g.vacatedGainers.some((x) => /Turner/.test(x.name)));

const html = fs.readFileSync('index.html', 'utf8');
assert.ok(html.includes('vacated-usage.js'));
assert.ok(html.includes('vacatedWhyClause'));
assert.ok(html.includes('appendVacatedWhy'));
assert.ok(/Vacates usage/.test(html));
assert.ok(html.includes('2026-09-20-vacated'));

const m = html.match(/function vacatedWhyClause\(pl\)\{[\s\S]*?\n\}/);
assert.ok(m, 'vacatedWhyClause missing');
vm.runInContext(m[0], ctx);
const clause = ctx.vacatedWhyClause(g);
assert.ok(clause.indexOf('Vacates usage') === 0, clause);
assert.ok(clause.indexOf('Turner') >= 0, clause);
assert.equal(ctx.vacatedWhyClause({}), '');

const bundle = loadBundledData();
const report = audit(bundle.players, bundle.data, bundle.tags);
assert.deepEqual(report.errors, []);
const covered = report.withVacatedGainers || report.withVacatedGainers;
assert.ok(covered, 'health missing withVacatedGainers');
assert.equal(covered.length, keys.length);

console.log(
  'Vacated usage tests passed; annotated=' +
    keys.length +
    ' health.withVacatedGainers=' +
    covered.length
);
