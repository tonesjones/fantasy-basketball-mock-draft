'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {audit} = require('./data-health');
const {loadBundledData} = require('./audit-data');

const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('player-data.js','utf8'), ctx);
vm.runInContext(fs.readFileSync('movers-outlook.js','utf8'), ctx);
assert.ok(ctx.PDATA['Giannis Antetokounmpo'].mover === true);
assert.equal(ctx.PDATA['Giannis Antetokounmpo'].teamPrev, 'MIL');
assert.equal(ctx.PDATA['Giannis Antetokounmpo'].teamCurr, 'MIA');
assert.ok(['up','down','flat','unknown'].includes(ctx.PDATA['Giannis Antetokounmpo'].roleDelta));
assert.equal(ctx.PDATA['Nikola Vucevic'].mover, false);
assert.equal(ctx.PDATA['Nikola Vucevic'].teamPrev, 'BOS');
assert.equal(ctx.PDATA['Stephen Curry'].mover, false);
assert.ok(!('projMpg' in ctx.PDATA['Nikola Jokic']) || ctx.PDATA['Nikola Jokic'].projMpg == null);

const bundle = loadBundledData();
const report = audit(bundle.players, bundle.data, bundle.tags);
assert.deepEqual(report.errors, []);
assert.ok(report.movers.length >= 60, 'expected ~71 movers, got '+report.movers.length);
assert.equal(report.withProjMpg.length, 0);
assert.equal(report.withProjRank.length, 0);
assert.ok(report.roleDeltaUp.length + report.roleDeltaDown.length + report.roleDeltaFlat.length + report.roleDeltaUnknown.length === report.players);

console.log('Movers outlook tests passed; movers='+report.movers.length+
  ' role↑='+report.roleDeltaUp.length+' role↓='+report.roleDeltaDown.length+
  ' flat='+report.roleDeltaFlat.length+' unknown='+report.roleDeltaUnknown.length+
  ' teamPrev='+(report.players-report.missingTeamPrev.length)+'/'+report.players);
