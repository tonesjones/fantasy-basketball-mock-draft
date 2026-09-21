/* Server-side rendered Pick Coach verification.
 * The leased browser VM has no route to this host, so instead of a live
 * browser we run the REAL coach-card paint code extracted verbatim from
 * index.html (the refreshPickCoach .then() body) plus the REAL
 * buildPickCoachWhy/moverWhyClause/vacatedWhyClause helpers, inside a vm
 * sandbox with a minimal DOM shim. Signals come from the REAL
 * pick-signals.js engine over the branch's 270-player data, and res comes
 * from the REAL pick-coach.js normalizeApiResult.
 * Run with: bun test-pick-coach-render.js
 */
var assert = require("assert");
var fs = require("fs");
var vm = require("vm");

var DIR = __dirname;
var html = fs.readFileSync(DIR + "/index.html", "utf8");

var sandbox = { console: console };
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
function loadInto(file) {
  vm.runInNewContext(fs.readFileSync(DIR + "/" + file, "utf8"), sandbox);
}
["player-data.js", "movers-outlook.js", "vacated-usage.js",
 "playoff-data.js", "playoff-core.js", "pick-signals.js", "pick-coach.js"].forEach(loadInto);

// PLAYERS literal + enrichment, exactly as index.html builds it.
var lit = html.match(/var PLAYERS=\[[\s\S]*?\n\];/);
assert.ok(lit, "PLAYERS literal not found in index.html");
vm.runInNewContext(lit[0], sandbox);
vm.runInNewContext(
  'PLAYERS.forEach(function(p,i){p.r=i+1;p.n=p[0];p.p=p[1];p.t=p[2]||"\\u2014";});' +
  'PLAYERS.forEach(function(p){var d=(typeof PDATA!=="undefined"&&PDATA[p.n])||null;' +
  'p.adp=d&&d.adp!=null?d.adp:null;p.adpF=d&&d.adpF!=null?d.adpF:null;' +
  'p.last=d&&d.last!=null?d.last:null;p.lastTotal=d&&d.lastTotal!=null?d.lastTotal:null;' +
  'p.mpg=d&&d.mpg!=null?d.mpg:null;p.inj=(typeof INJ!=="undefined"&&INJ[p.n])||null;' +
  'p.teamPrev=d&&d.teamPrev||null;p.teamCurr=(d&&d.teamCurr)||p.t;p.mover=!!(d&&d.mover);' +
  'p.roleDelta=(d&&d.roleDelta)||"unknown";p.roleNote=(d&&d.roleNote)||null;' +
  'p.projMpg=d&&d.projMpg!=null?d.projMpg:null;p.projRank=d&&d.projRank!=null?d.projRank:null;' +
  'p.vacatedGainers=(d&&d.vacatedGainers)||null;});',
  sandbox
);

var S = sandbox.PickSignals;
var PickCoach = sandbox.PickCoach;
assert.ok(S && PickCoach, "engine + coach loaded");
var PLAYERS = sandbox.PLAYERS;
assert.strictEqual(PLAYERS.length, 270, "270 players");

var byName = {};
PLAYERS.forEach(function (p) { byName[p.n] = p; });
function P(n) { var p = byName[n]; assert.ok(p, "player missing: " + n); return p; }

var ctx = {
  moves: sandbox.MOVES,
  netVac: S.netVacated(PLAYERS, sandbox.MOVES, sandbox.VACATED_USAGE),
  playoffStart: 20,
};
var OPEN = ["PG", "SG", "G", "SF", "PF", "C", "UTIL", "UTIL", "BN", "BN", "BN", "BN", "BN"];
function availAt(pick) {
  var sorted = PLAYERS.filter(function (p) { return !p.inj; })
    .sort(function (a, b) { return S.consensus(a) - S.consensus(b); });
  var drafted = {};
  sorted.slice(0, pick - 1).forEach(function (p) { drafted[p.n] = 1; });
  return PLAYERS.filter(function (p) { return !drafted[p.n] && !p.inj; });
}
function evaluate(name, pick, nextPick) {
  var pl = P(name);
  var sig = S.evaluate(pl, { pick: pick, nextPick: nextPick, available: availAt(pick), openSlots: OPEN, ctx: ctx });
  return { pl: pl, sig: sig };
}

// ---- extract real functions from index.html ----
function extractFn(name) {
  var idx = html.indexOf("function " + name + "(");
  assert.ok(idx >= 0, "fn not found: " + name);
  var i = html.indexOf("{", idx), depth = 0;
  for (; i < html.length; i++) {
    if (html[i] === "{") depth++;
    else if (html[i] === "}") { depth--; if (depth === 0) break; }
  }
  assert.ok(depth === 0, "brace mismatch in " + name);
  return html.slice(idx, i + 1);
}
["pickCoachShellHtml", "pcShow", "moverWhyClause", "vacatedWhyClause",
 "appendMoverWhy", "appendVacatedWhy", "softAdpClause", "buildPickCoachWhy",
 "fillPickCoachBoard"].forEach(function (n) {
  vm.runInNewContext(extractFn(n), sandbox);
});

// ---- extract the real paint block (refreshPickCoach .then body) ----
var startMarker = 'window.PickCoach.evaluate(payload).then(function(res){';
var si = html.indexOf(startMarker);
assert.ok(si >= 0, "paint block start not found");
var endMarker = '    pcShow(still,"pc-card");\n  });\n}';
var ei = html.indexOf(endMarker, si);
assert.ok(ei >= 0, "paint block end not found");
var body = html.slice(si + startMarker.length, ei);
body = body.replace("if(seq!==_pcEvalSeq)return;", "");
body = body.replace('var still=el("pick-coach");', "");
body = body.replace("var pl=PLAYERS[pi];", ""); // pl comes in as a param; page resolves it from closure pi
vm.runInNewContext("function __paint(still,res,pl,payload){" + body + "\n    pcShow(still,\"pc-card\");\n}", sandbox);

// ---- stubs for paint-block deps (kept minimal; why-clauses stay real) ----
vm.runInNewContext([
  "function pickCoachStrengthTags(){return [];}",
  "function scarcityRemPcts(){return {};}",
  "function rosterCoveredCats(){return {};}",
  "function moverRolePhrase(){return \"\";}",
  "function esc(s){return String(s);}",
  "function renderPickCoachStrengths(){return \"\";}",
  "function playoffBadge(){return \"\";}",
  "function isUserTurn(){return true;}",
  "function updateCoachDockPeek(){}",
].join("\n"), sandbox);

// ---- minimal DOM shim ----
function newNode(tag, cls, id, hidden) {
  var node = {
    tag: tag, classes: cls.slice(), id: id || null, children: [], text: "",
    hidden: !!hidden, className: (cls || []).join(" "),
    querySelector: function (sel) { return qsa(this, sel)[0] || null; },
    querySelectorAll: function (sel) { return qsa(this, sel); },
  };
  Object.defineProperty(node, "textContent", {
    get: function () { return this.text; },
    set: function (v) { this.text = String(v); this.children = []; },
  });
  return node;
}
function qsa(root, sel) {
  var parts = sel.trim().split(/\s+/);
  var out = [];
  function matchPart(n, part) {
    if (part[0] === ".") return n.classes && n.classes.indexOf(part.slice(1)) >= 0;
    if (part[0] === "#") return n.id === part.slice(1);
    return n.tag === part;
  }
  (function walk(n, anc) {
    var last = parts[parts.length - 1];
    if (matchPart(n, last)) {
      var ai = anc.length - 1, pi = parts.length - 2, ok = true;
      while (pi >= 0) {
        while (ai >= 0 && !matchPart(anc[ai], parts[pi])) ai--;
        if (ai < 0) { ok = false; break; }
        ai--; pi--;
      }
      if (ok && n !== root) out.push(n);
    }
    (n.children || []).forEach(function (c) { walk(c, anc.concat([n])); });
  })(root, []);
  return out;
}
function parseShell(src) {
  var root = newNode("root", [], null, false);
  var stack = [root];
  var re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[a-zA-Z-]+(?:="[^"]*")?)*)\s*(\/?)>|([^<]+)/g, m;
  while ((m = re.exec(src))) {
    if (m[5] !== undefined) {
      var t = m[5];
      if (t.trim()) stack[stack.length - 1].text += t;
    } else {
      if (m[1] === "/") { if (stack.length > 1) stack.pop(); continue; }
      var attrs = m[3] || "";
      var cls = (attrs.match(/class="([^"]*)"/) || [])[1] || "";
      var id = (attrs.match(/id="([^"]*)"/) || [])[1] || null;
      var hidden = /(?:^|\s)hidden(?:\s|=|$)/.test(attrs);
      var node = newNode(m[2], cls.split(/\s+/).filter(Boolean), id, hidden);
      stack[stack.length - 1].children.push(node);
      if (m[4] !== "/") stack.push(node);
    }
  }
  return root;
}
function paintCard(res, pl, pickNumber) {
  var shellSrc = vm.runInNewContext("pickCoachShellHtml()", sandbox);
  var root = parseShell(shellSrc);
  var still = root.querySelector("#pick-coach");
  assert.ok(still, "shell has #pick-coach");
  var fn = vm.runInNewContext("__paint", sandbox);
  fn(still, res, pl, { pickNumber: pickNumber, adp: pl.adp, rank: pl.r });
  return still;
}

var pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log("ok - " + name); }
  catch (e) { fail++; console.log("FAIL - " + name + "\n    " + String(e.message).split("\n")[0]); }
}
function vis(still, sel) { var n = still.querySelector(sel); assert.ok(n, "missing " + sel); return !n.hidden; }
function hid(still, sel) { var n = still.querySelector(sel); assert.ok(n, "missing " + sel); return !!n.hidden; }
function txt(still, sel) { var n = still.querySelector(sel); assert.ok(n, "missing " + sel); return n.textContent; }
function api(data, player, pickNumber, sig) {
  return PickCoach.normalizeApiResult(data, { player: player, pickNumber: pickNumber, signals: sig });
}

// ---------- A. Wembanyama @1: TAKE, Jev prose appended ----------
var w = evaluate("Victor Wembanyama", 1, 24);
t("wemby engine verdict is take", function () { assert.strictEqual(w.sig.verdict, "take"); });
var resA = api(
  { score: 4, scoreConfidence: 0.7, choice: "take", choiceConfidence: 0.65,
    why: "Jev: the board math says take on Victor Wembanyama — value lines up with the slot.",
    model: "jev-1.13.0" },
  "Victor Wembanyama", 1, w.sig);
var sA = paintCard(resA, w.pl, 1);
t("wemby: suggest band visible, others hidden", function () {
  assert.ok(vis(sA, ".pc-suggest"));
  assert.ok(hid(sA, ".pc-lean") && hid(sA, ".pc-pass") && hid(sA, ".pc-uncertain"));
});
t("wemby: chip reads Take", function () {
  assert.strictEqual(txt(sA, ".pc-suggest .pc-choice"), "Take");
});
t("wemby: agreeing Jev prose appended", function () {
  assert.ok(/Jev:/.test(txt(sA, ".pc-suggest .pc-why")), "why=" + txt(sA, ".pc-suggest .pc-why"));
});
t("wemby: conf line hidden (deterministic)", function () { assert.ok(hid(sA, ".pc-suggest .pc-conf")); });
t("wemby: target window hidden", function () { assert.ok(hid(sA, ".pc-target")); });
t("wemby: source labeled Jev", function () { assert.strictEqual(txt(sA, ".pc-source"), "Jev"); });

// ---------- B. Luka @1: PASS, contradicting Jev prose dropped ----------
var l = evaluate("Luka Doncic", 1, 24);
t("luka engine verdict is pass", function () { assert.strictEqual(l.sig.verdict, "pass"); });
var resB = api(
  { score: 4, scoreConfidence: 0.8, choice: "take", choiceConfidence: 0.8,
    why: "Jev: take Luka — first-round talent, don't overthink it.",
    model: "jev-1.13.0" },
  "Luka Doncic", 1, l.sig);
var sB = paintCard(resB, l.pl, 1);
t("luka: pass band visible, uncertain hidden", function () {
  assert.ok(vis(sB, ".pc-pass"));
  assert.ok(hid(sB, ".pc-uncertain") && hid(sB, ".pc-suggest") && hid(sB, ".pc-lean"));
});
t("luka: chip reads Pass", function () {
  assert.strictEqual(txt(sB, ".pc-pass .pc-choice"), "Pass");
});
t("luka: contradicting 'take Luka' prose absent", function () {
  assert.ok(!/take Luka/.test(txt(sB, ".pc-pass .pc-why")), "why=" + txt(sB, ".pc-pass .pc-why"));
});
t("luka: deterministic numeric reasons present", function () {
  assert.ok(/below value/.test(txt(sB, ".pc-pass .pc-why")));
});
function subtreeText(n) {
  var s = n.text || "";
  (n.children || []).forEach(function (c) { s += " " + subtreeText(c); });
  return s;
}
t("luka: visible pass band never shows the uncertain title", function () {
  assert.ok(vis(sB, ".pc-pass") && hid(sB, ".pc-uncertain"));
  assert.ok(subtreeText(sB.querySelector(".pc-pass")).indexOf("Not sure enough") < 0);
});
t("luka: target window hidden", function () { assert.ok(hid(sB, ".pc-target")); });

// ---------- C. Luka @1: PASS + Jev wait -> safe prose retained ----------
var resC = api(
  { score: 2, scoreConfidence: 0.7, choice: "wait", choiceConfidence: 0.7,
    why: "Jev: not worth it here.", model: "jev-1.13.0" },
  "Luka Doncic", 1, l.sig);
var sC = paintCard(resC, l.pl, 1);
t("luka pass + jev-wait: pass band still visible", function () { assert.ok(vis(sC, ".pc-pass")); });
t("luka pass + jev-wait: safe Jev prose retained", function () {
  assert.ok(/Jev: not worth it here\./.test(txt(sC, ".pc-pass .pc-why")), "why=" + txt(sC, ".pc-pass .pc-why"));
});

// ---------- D. Real WAIT case at pick 40 ----------
var waitCase = null;
availAt(40).forEach(function (p) {
  if (waitCase) return;
  var sig = S.evaluate(p, { pick: 40, nextPick: 64, available: availAt(40), openSlots: OPEN, ctx: ctx });
  if (sig && sig.verdict === "wait") waitCase = { pl: p, sig: sig };
});
t("engine finds a real wait case at pick 40", function () {
  assert.ok(waitCase, "no wait verdict at pick 40");
  console.log("    wait candidate: " + waitCase.pl.n + " V=" + waitCase.sig.V);
});
var resD = api(
  { score: 3, scoreConfidence: 0.5, choice: "wait", choiceConfidence: 0.5,
    why: "Jev: wait.", model: "jev-1.13.0" },
  waitCase.pl.n, 40, waitCase.sig);
var sD = paintCard(resD, waitCase.pl, 40);
t("wait: lean band visible with chip 'Wait' (not 'Lean wait')", function () {
  assert.ok(vis(sD, ".pc-lean"));
  assert.strictEqual(txt(sD, ".pc-lean .pc-choice"), "Wait");
});
t("wait: sub-line explains urgency", function () {
  assert.strictEqual(txt(sD, ".pc-lean-sub"), "Acceptable here — but a better option won't survive");
});
t("wait: conf line hidden (deterministic)", function () { assert.ok(hid(sD, ".pc-lean .pc-conf")); });

// ---------- E. Jev down: deterministic TAKE survives ----------
var resE = api(
  { score: null, scoreConfidence: 0, choice: null, choiceConfidence: 0, why: "",
    model: "jev-1.13.0", error: "TYPESAFE_API_KEY not configured" },
  "Victor Wembanyama", 1, w.sig);
var sE = paintCard(resE, w.pl, 1);
t("jev-down: take band still renders", function () {
  assert.strictEqual(resE.verdict, "take");
  assert.ok(vis(sE, ".pc-suggest"));
  assert.ok(hid(sE, ".pc-uncertain"));
});
t("jev-down: source labeled 'Deterministic · Jev unavailable'", function () {
  assert.strictEqual(txt(sE, ".pc-source"), "Deterministic · Jev unavailable");
});

console.log("\nrender-verify: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
