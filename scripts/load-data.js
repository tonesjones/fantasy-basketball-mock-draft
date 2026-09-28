/* Shared loader for Node tests and audit-data.js: evaluates the same browser data scripts
   index.html loads, in order, inside a vm sandbox. */
"use strict";
var fs = require("fs"), path = require("path"), vm = require("vm");
var ROOT = path.join(__dirname, "..");
var DATA_SCRIPTS = ["player-data.js", "movers-outlook.js", "vacated-usage.js", "player-pool.js"];

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}
/* Returns a sandbox with PDATA, INJ, MOVES, VACATED_USAGE, PLAYERS, CATS ... */
function loadData(extra) {
  var sandbox = { console: console };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  DATA_SCRIPTS.concat(extra || []).forEach(function (f) {
    vm.runInContext(read(f), sandbox, { filename: f });
  });
  return sandbox;
}
module.exports = { ROOT: ROOT, read: read, loadData: loadData };
