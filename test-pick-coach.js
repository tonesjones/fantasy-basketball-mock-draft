/* Smoke: PickCoach stub biases UNCERTAIN; rare large ADP value can SUGGEST. */
var assert = require("assert");
var path = require("path");
var fs = require("fs");
var vm = require("vm");
var code = fs.readFileSync(path.join(__dirname, "pick-coach.js"), "utf8");
var sandbox = { setTimeout: setTimeout, clearTimeout: clearTimeout, console: console };
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.runInNewContext(code, sandbox);
var PC = sandbox.PickCoach;
assert.ok(PC, "PickCoach exported");

var mid = PC.pickCoachEvaluate({ player: "X", pickNumber: 50, adp: 48, rank: 50 });
assert.strictEqual(mid.verdict, "uncertain", "near-ADP should be uncertain");
assert.ok(mid.scoreConfidence < 0.7);

var value = PC.pickCoachEvaluate({ player: "Y", pickNumber: 80, adp: 40, rank: 40 });
assert.strictEqual(value.verdict, "suggest", "large ADP fall should suggest");
assert.strictEqual(value.choice, "take");
assert.ok(value.scoreConfidence >= 0.7 && value.choiceConfidence >= 0.7);
assert.strictEqual(PC.scoreWord(value.score), "Excellent");

var reach = PC.pickCoachEvaluate({ player: "Z", pickNumber: 20, adp: 55, rank: 55 });
assert.strictEqual(reach.choice, "reach");
assert.strictEqual(reach.verdict, "uncertain", "reach without huge gap stays uncertain");

PC.evaluate({ player: "A", pickNumber: 10, adp: 10 }).then(function (r) {
  assert.ok(r.verdict === "suggest" || r.verdict === "uncertain");
  assert.ok(!r.stale);
  console.log("test-pick-coach: ok");
});
