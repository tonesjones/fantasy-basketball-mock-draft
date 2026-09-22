var assert = require("assert");
var fs = require("fs");
var vm = require("vm");

var html = fs.readFileSync(__dirname + "/index.html", "utf8").replace(/\r\n/g, "\n");

function extractFn(name) {
  var start = html.indexOf("function " + name + "(");
  assert.ok(start >= 0, "function not found: " + name);
  var i = html.indexOf("{", start), depth = 0;
  for (; i < html.length; i++) {
    if (html[i] === "{") depth++;
    else if (html[i] === "}" && --depth === 0) break;
  }
  return html.slice(start, i + 1);
}

var now = Date.now();
var sandbox = {
  Date: Date,
  isFinite: isFinite,
  PLAYERS: [{ n: "Victor Wembanyama" }, { n: "Nikola Jokic" }],
  _yahooNameMap: null,
  state: { view: "team", q: "", f: "All", sort: "cons", playoffStart: 20 },
  freshState: function () { return { view: "team", q: "", f: "All", sort: "cons", playoffStart: 20 }; },
  cancelPickCoach: function () { sandbox.cancelled = true; },
  setState: function (next) { sandbox.state = Object.assign({}, sandbox.state, next); },
  save: function () { sandbox.saved = true; },
};

["yahooNorm", "yahooPoolIndex", "yahooBoardFresh", "yahooApplySnapshot"].forEach(function (name) {
  vm.runInNewContext(extractFn(name), sandbox);
});

var board = {
  ok: true,
  draftId: "478.l.2440822",
  fetchedAt: new Date(now).toISOString(),
  teams: 12,
  rounds: 13,
  userSlot: 6,
  teamNames: { "6": "Tony" },
  boardHash: "board-1",
  complete: false,
  picks: [
    { overallPick: 1, playerName: "Victor Wembanyama" },
    { overallPick: 2, playerName: "Outside Pool Player" },
  ],
};

assert.equal(sandbox.yahooApplySnapshot(board), true);
assert.deepEqual(Array.from(sandbox.state.log), [0, -1]);
assert.deepEqual(Array.from(sandbox.state.yahooNames), [null, "Outside Pool Player"]);
assert.equal(sandbox.state.yahooLive.worker, true);
assert.equal(sandbox.yahooBoardFresh(), true);
assert.equal(sandbox.cancelled, true);

sandbox.state.yahooLive.fetchedAt = new Date(now - 26000).toISOString();
assert.equal(sandbox.yahooBoardFresh(), false, "advice stops on a stale board");
assert.equal(sandbox.yahooApplySnapshot({ ...board, fetchedAt: new Date().toISOString() }), false);
assert.equal(sandbox.yahooBoardFresh(), true, "an unchanged refresh resumes advice");

var olderBoard = { ...board, boardHash: "older", picks: board.picks.slice(0, 1) };
assert.throws(function () { sandbox.yahooApplySnapshot(olderBoard); }, /older board/);

var missingPick = { ...board, boardHash: "board-2", picks: [{ overallPick: 2, playerName: "Nikola Jokic" }] };
assert.throws(function () { sandbox.yahooApplySnapshot(missingPick); }, /missing pick/);

console.log("yahoo live client tests passed");
