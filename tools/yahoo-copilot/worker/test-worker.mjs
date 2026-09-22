import assert from "node:assert/strict";
import { createWorker, mlidFromInput, parseWatchInput } from "./src/index.mjs";

class MemoryKV {
  constructor() { this.values = new Map(); }
  async get(key) { return this.values.get(key) || null; }
  async put(key, value) { this.values.set(key, value); }
}

function yahooEnvelope(resource, value) {
  return { fantasy_content: { league: [{ league_key: "478.l.2440822", num_teams: 12 }, { [resource]: value }] } };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const calls = [];
async function fakeFetch(url) {
  calls.push(String(url));
  if (String(url).includes("/fantasy/v2/game/nba")) {
    return jsonResponse({ fantasy_content: { game: [{ game_key: "478" }] } });
  }
  if (String(url).includes("/settings")) {
    return jsonResponse(yahooEnvelope("settings", [{ is_auction_draft: "0", roster_positions: [
      { roster_position: { position: "PG", count: 1 } },
      { roster_position: { position: "C", count: 1 } },
      { roster_position: { position: "BN", count: 1 } },
    ] }]));
  }
  if (String(url).includes("/teams")) {
    return jsonResponse(yahooEnvelope("teams", {
      0: { team: [{ team_key: "478.l.2440822.t.1" }, { name: "Tony", draft_position: 1 }] },
      count: 1,
    }));
  }
  if (String(url).includes("/draftresults")) {
    return jsonResponse(yahooEnvelope("draft_results", {
      0: { draft_result: { pick: "1", round: "1", team_key: "478.l.2440822.t.1", player_key: "478.p.1" } },
      1: { draft_result: { pick: "2", round: "1", team_key: "478.l.2440822.t.2" } },
      count: 2,
    }));
  }
  if (String(url).includes("/players;player_keys=")) {
    return jsonResponse(yahooEnvelope("players", {
      0: { player: [{ player_key: "478.p.1" }, { name: { full: "Victor Wembanyama" } }] },
      count: 1,
    }));
  }
  if (String(url).includes("/fantasy/v2/league/")) {
    return jsonResponse({ fantasy_content: { league: [{ league_key: "478.l.2440822", num_teams: 12, name: "Mock" }] } });
  }
  throw new Error(`Unexpected URL ${url}`);
}

const env = {
  PAGE_ORIGIN: "https://tony-draft-lab-yahoo.pages.dev",
  WATCH_TOKEN: "test-watch-token",
  YAHOO_ACCESS_TOKEN: "test-yahoo-token",
  YAHOO_SESSIONS: new MemoryKV(),
  AUTH_LIMITER: { async limit() { return { success: true }; } },
};
const worker = createWorker(fakeFetch);

assert.equal(mlidFromInput("2440822"), "2440822");
assert.equal(mlidFromInput("https://basketball.fantasysports.yahoo.com/draftclient/f1/2440822"), "2440822");
assert.equal(parseWatchInput({ roomUrl: "https://basketball.fantasysports.yahoo.com/mock_waiting?mlid=2440822", slot: 1 }).slot, 1);
assert.throws(() => mlidFromInput("https://example.com/?mlid=2440822"), /yahoo\.com/);

const origin = "https://tony-draft-lab-yahoo.pages.dev";
let response = await worker.fetch(new Request("https://worker.example/api/board", { headers: { Origin: origin } }), env);
assert.equal(response.status, 401, "board rejects a missing watch token");

response = await worker.fetch(new Request("https://worker.example/api/watch", {
  method: "POST",
  headers: { Origin: origin, Authorization: "Bearer test-watch-token", "Content-Type": "application/json" },
  body: JSON.stringify({ roomUrl: "https://basketball.fantasysports.yahoo.com/mock_waiting?mlid=2440822", slot: 1 }),
}), env);
assert.equal(response.status, 201);
const watch = await response.json();
assert.equal(watch.draftId, "478.l.2440822");
assert.equal(watch.teams, 12);
assert.equal(watch.rounds, 3);
assert.equal(watch.pickCount, 1);

response = await worker.fetch(new Request("https://worker.example/api/board", {
  headers: { Origin: origin, Authorization: "Bearer test-watch-token" },
}), env);
assert.equal(response.status, 200);
const board = await response.json();
assert.equal(board.pickCount, 1, "unmade Yahoo slots are excluded from completed picks");
assert.equal(board.picks[0].playerName, "Victor Wembanyama");
assert.equal(board.picks[0].playerIndex, null);
assert.match(board.boardHash, /^[a-f0-9]{64}$/);
assert.equal(board.complete, false);
assert.ok(calls.some((url) => url.includes("/draftresults")));

console.log("yahoo worker tests passed");
