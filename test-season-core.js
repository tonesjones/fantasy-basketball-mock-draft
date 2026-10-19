/* In-season hold/drop logic: a drop is suggested only with a clear pickup. */
const assert = require("node:assert/strict");
const Season = require("./season-core");
const { loadData } = require("./scripts/load-data");

function cv(total, cat) {
  const v = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  v[cat == null ? 0 : cat] = total;
  return v;
}
const players = [
  { n: "Star", adp: 5, adpF: 5 },
  { n: "Early Slump", adp: 60, adpF: 60, last: 200 },
  { n: "Bench Guy", adp: 140, adpF: 150 },
  { n: "Big Man", adp: 130, adpF: 140 },
  { n: "Rookie", adp: 120, adpF: 120 },
  { n: "Done For Year", adp: 135, adpF: 135, inj: { status: "season-out" } },
  { n: "Hot Pickup", adp: 180, adpF: 190 },
  { n: "Small Upgrade", adp: 190, adpF: 200 },
  { n: "Hurt Pickup", adp: 185, adpF: 195 },
  { n: "Rehab Pickup", adp: 186, adpF: 196, inj: { status: "out", retBy: "2027-01-01" } },
  { n: "Blocks Pickup", adp: 200, adpF: 210 },
];
const pdata = {
  Star: { cv: cv(9) },
  "Early Slump": { cv: cv(-1) },
  "Bench Guy": { cv: cv(0.5) },
  "Big Man": { cv: cv(1, 1) },
  "Done For Year": { cv: cv(3) },
  "Hot Pickup": { cv: cv(3) },
  "Small Upgrade": { cv: cv(1) },
  "Hurt Pickup": { cv: cv(6) },
  "Rehab Pickup": { cv: cv(7) },
  "Blocks Pickup": { cv: cv(3.5, 4) },
};
/* The bench-guy filler gives every rated player the same scale; Rookie has no cv. */
for (let i = 0; i < 12; i++) {
  players.push({ n: `Filler ${i}`, adp: 110 + i, adpF: 110 + i });
  pdata[`Filler ${i}`] = { cv: cv(0.2) };
}
const index = (name) => players.findIndex((p) => p.n === name);
const yp = (name, positions, extra) => ({ name, positions: positions || ["PG", "G", "Util"], nbaTeam: "BOS", status: "", ...extra });

const league = {
  categories: ["FG%", "FT%", "3PTM", "PTS", "REB", "AST", "ST", "BLK", "TO"],
  positions: [
    { position: "PG", count: 1 },
    { position: "C", count: 1 },
    { position: "Util", count: 2 },
    { position: "BN", count: 2 },
    { position: "IL", count: 1 },
  ],
  scoringType: "head",
};
const mine = [
  yp("Star"),
  yp("Early Slump"),
  yp("Bench Guy"),
  yp("Big Man", ["C", "Util"]),
  yp("Rookie"),
  yp("Done For Year", null, { status: "INJ" }),
  yp("Unknown Yahoo Guy"),
];
const available = [
  yp("Hot Pickup", null, { availability: "W" }),
  yp("Small Upgrade", null, { availability: "FA" }),
  yp("Hurt Pickup", null, { availability: "FA", status: "O" }),
  yp("Rehab Pickup", null, { availability: "FA" }),
  yp("Blocks Pickup", ["C", "Util"], { availability: "FA" }),
  yp("Not In Pool", null, { availability: "FA" }),
];

const NOW = Date.parse("2026-10-20T00:00:00Z");
const result = Season.analyze({ players, pdata, index, league, mine, available, opponent: null, now: NOW });
const verdict = (name) => result.roster.find((r) => r.name === name);

assert.deepEqual(result.cats, Season.CATS, "Yahoo's display names map onto the nine categories");
assert.equal(verdict("Star").verdict, "hold");
assert.equal(verdict("Early Slump").verdict, "hold", "a top-100 pick is never a drop suggestion");
assert.match(verdict("Early Slump").reason, /Early-round/);
assert.equal(verdict("Rookie").verdict, "hold", "no 2025-26 stats: held at draft value");
assert.equal(verdict("Unknown Yahoo Guy").verdict, "hold");
assert.match(verdict("Unknown Yahoo Guy").reason, /player pool/);

/* Clear upgrades only: Done For Year (0) and Bench Guy (0.5) lose to Blocks
   Pickup (3.5) and Hot Pickup (3). Small Upgrade (1) is never clear; Hurt
   Pickup (6) is out. */
assert.deepEqual(
  result.moves.map((m) => [m.drop, m.add]).sort(),
  [["Bench Guy", "Hot Pickup"], ["Done For Year", "Blocks Pickup"]].sort(),
);
assert.ok(result.moves.every((m) => m.gain >= Season.CLEAR_GAIN));
assert.ok(!result.moves.some((m) => m.add === "Hurt Pickup"), "an injured free agent is never the pickup");
assert.ok(!result.watch.some((w) => w.name === "Rehab Pickup"), "nor one whose sourced return date is still ahead");
const later = Season.analyze({ players, pdata, index, league, mine, available, now: Date.parse("2027-01-02T00:00:00Z") });
assert.ok(later.moves.some((m) => m.add === "Rehab Pickup"), "once the return date passes and Yahoo lists him active, he counts");
assert.equal(result.moves.find((m) => m.add === "Hot Pickup").availability, "W", "waiver pickups are labeled");
assert.equal(verdict("Bench Guy").verdict, "drop");
assert.match(verdict("Bench Guy").reason, /Hot Pickup/);
assert.equal(verdict("Big Man").verdict, "hold");
assert.match(verdict("Big Man").reason, /No clear upgrade/, "a hold names the best option and its margin");
assert.deepEqual(result.watch.map((w) => w.name), ["Small Upgrade"], "unused rated pickups stay on the watch list");
assert.equal(result.unmatchedAvailable, 1);

/* The lineup check: dropping the only center for a guard would leave C empty. */
const lineup = Season.analyze({
  players,
  pdata,
  index,
  league,
  mine: [yp("Star"), yp("Big Man", ["C", "Util"]), yp("Bench Guy"), yp("Filler 1")],
  available: [yp("Hot Pickup", null, { availability: "FA" })],
});
assert.ok(!lineup.moves.some((m) => m.drop === "Big Man"), "a swap that empties a starting slot is skipped");
assert.equal(lineup.moves.length, 1);

/* This week's matchup: a pickup that only helps a category already won by a
   mile is not worth it when the roster's cheapest player helps a close one. */
const matchup = Season.analyze({
  players,
  pdata,
  index,
  league: { ...league, categories: ["PTS", "REB"] },
  mine: [yp("Star"), yp("Big Man", ["C", "Util"])],
  opponent: [yp("Filler 2")],
  available: [yp("Hot Pickup", ["C", "Util"], { availability: "FA" })],
});
assert.equal(matchup.moves.length, 0, "+2 in a won category doesn't pay for -1 in a close one");
assert.match(matchup.roster[1].reason, /matchup/);
assert.deepEqual(matchup.cats, ["PTS", "REB"], "only the league's categories count");
assert.equal(matchup.matchup.result[0], "win");
assert.equal(matchup.matchup.result[1], "swing", "REB is close");
assert.equal(matchup.matchup.result[2], null, "categories the league doesn't use are left out");

/* Punts drop a category from every value. */
const punted = Season.analyze({ players, pdata, index, league, mine, available, punts: ["PTS"] });
assert.ok(!punted.cats.includes("PTS"));
assert.ok(punted.moves.every((m) => m.add !== "Hot Pickup"), "a PTS-only pickup is worthless when punting PTS");

/* Points leagues get no suggestions. */
const points = Season.analyze({ players, pdata, index, league: { ...league, scoringType: "headpoint" }, mine, available });
assert.equal(points.points, true);
assert.equal(points.moves.length, 0);

/* Bipartite lineup check. */
assert.equal(Season.fillsStarters([{ positions: ["PG", "C"] }, { positions: ["PG"] }], [{ position: "PG" }, { position: "C" }]), true);
assert.equal(Season.fillsStarters([{ positions: ["PG"] }, { positions: ["PG"] }], [{ position: "PG" }, { position: "C" }]), false);

/* Real data: the bundled pool loads and values real names. */
const data = loadData(["draft-core.js"]);
const real = Season.analyze({
  players: data.PLAYERS,
  pdata: data.PDATA,
  index: (name) => data.PLAYERS.findIndex((p) => p.n === name),
  league,
  mine: [yp("Nikola Jokic", ["C", "Util"]), yp("Tyrese Maxey")],
  available: [yp("Victor Wembanyama", ["C", "Util"], { availability: "FA" })],
});
assert.equal(real.roster.find((r) => r.name === "Nikola Jokic").verdict, "hold", "stars are protected");
assert.equal(real.watch[0].name, "Victor Wembanyama");

/* Opportunity watch: a good player is out, so an available teammate at his
   position is worth watching. Star is out for BOS; Big Man for UTA. */
const team = (name, nbaTeam, positions, extra) => ({ name, nbaTeam, positions, status: "", ...extra });
const injured = [
  team("Star", "BOS", ["PG", "SG", "G", "Util"], { status: "O", fantasyTeam: "Rival" }),
  team("Blocks Pickup", "LAL", ["PG", "Util"], { status: "INJ", fantasyTeam: "Other" }),
  team("Unknown Starter", "NY", ["SF", "Util"], { status: "O", fantasyTeam: "Other" }),
];
const pool = [
  team("Small Upgrade", "BOS", ["SG", "G", "Util"], { availability: "FA" }),
  team("Hot Pickup", "BOS", ["PG", "G", "Util"], { availability: "W" }),
  team("Deep Backup", "BOS", ["PG", "G", "Util"], { availability: "A", hot: true }),
  team("Wing Backup", "BOS", ["SF", "F", "Util"], { availability: "FA" }),
  team("Center Backup", "BOS", ["C", "Util"], { availability: "FA" }),
  team("Hurt Backup", "BOS", ["PG", "Util"], { availability: "FA", status: "INJ" }),
  team("Laker Backup", "LAL", ["PG", "Util"], { availability: "FA" }),
];
const opp = Season.analyze({ players, pdata, index, league, mine: [], available: pool, injured, previousInjured: null });
assert.equal(opp.openings.length, 1, "only good players open minutes (Blocks Pickup ranks past 150; Unknown Starter isn't in the pool)");
const opening = opp.openings[0];
assert.equal(opening.injured, "Star");
assert.equal(opening.isNew, false, "nothing is new on the first check");
assert.deepEqual(
  opening.beneficiaries.map((b) => b.name),
  ["Deep Backup", "Hot Pickup", "Small Upgrade"],
  "same position first, hot last week next, then value; the hurt backup and other teams are left out",
);
assert.equal(opening.beneficiaries[0].value, null, "a player outside the pool shows no value");
assert.equal(opening.beneficiaries[1].value, 3);
assert.ok(!opening.beneficiaries.some((b) => b.name === "Center Backup"), "a center doesn't replace a guard");
assert.equal(opp.moves.length, 0, "the watch never makes a move on its own");

const again = Season.analyze({ players, pdata, index, league, mine: [], available: pool, injured, previousInjured: ["Big Man"] });
assert.equal(again.openings[0].isNew, true, "an injury since the last check is flagged new");

assert.equal(Season.positionFit(["PG"], ["SG", "G"]), 1);
assert.equal(Season.positionFit(["PF", "C"], ["C"]), 2);
assert.equal(Season.positionFit(["PG"], ["C"]), 0);
assert.equal(Season.positionFit(["Util"], ["Util"]), 0, "Util and IL aren't real positions");

console.log("season core tests passed");
