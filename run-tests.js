/* Runs every test-*.js in the repo root; exits non-zero if any fails. */
"use strict";
var fs = require("fs"), path = require("path"), cp = require("child_process");
var files = fs.readdirSync(__dirname).filter(function (f) { return /^test-.*\.js$/.test(f); }).sort();
var failed = [];
files.forEach(function (f) {
  var r = cp.spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: "utf8" });
  var ok = r.status === 0;
  var last = ((r.stdout || "") + (r.stderr || "")).trim().split("\n").pop();
  console.log((ok ? "PASS " : "FAIL ") + f + (last ? "  - " + last : ""));
  if (!ok) { failed.push(f); process.stdout.write(r.stdout || ""); process.stderr.write(r.stderr || ""); }
});
console.log("\n" + (files.length - failed.length) + "/" + files.length + " test files passed");
process.exit(failed.length ? 1 : 0);
