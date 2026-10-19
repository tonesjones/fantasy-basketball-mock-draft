import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { createWorker, sha256 } from "./src/index.mjs";
import { decodeXml, parseEspn, parseNewsDate, parseRss, mergeNews, pollNews, refreshNews } from "./src/news.mjs";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

class MemoryKV {
  constructor() { this.values = new Map(); this.writes = []; }
  async get(key) { return this.values.get(key) || null; }
  async put(key, value) { this.values.set(key, value); this.writes.push(key); }
  async delete(key) { this.values.delete(key); }
}

const now = Date.parse("2026-10-19T01:00:00Z");
const espn = { injuries: [{ injuries: [null, {}, { athlete: { displayName: "Test Player", team: { abbreviation: "phx" }, position: { abbreviation: "C" } }, status: "Out", shortComment: "x".repeat(300), date: "2026-10-18T20:00Z", details: { side: "Right", type: "Knee", returnDate: "2026-10-25" } }, { athlete: { displayName: "Other Player" } }] }, null] };
const players = parseEspn(espn);
assert.equal(players.length, 2);
assert.deepEqual(players[0], { name: "Test Player", team: "PHO", position: "C", status: "Out", comment: "x".repeat(280), date: "2026-10-18T20:00:00.000Z", returnDate: "2026-10-25", injury: "Right Knee" });
assert.deepEqual(players[1], { name: "Other Player", team: "", position: "", status: "", comment: "", date: null, returnDate: null, injury: "" });
for (const [input, expected] of Object.entries({ UTAH: "UTA", WSH: "WAS", GSW: "GS", NOP: "NO", NYK: "NY", SAS: "SA", BRK: "BKN", bos: "BOS" })) {
  assert.equal(parseEspn({ injuries: [{ injuries: [{ athlete: { displayName: "Test", team: { abbreviation: input } } }] }] })[0].team, expected);
}
assert.throws(() => parseEspn({}));
assert.equal(parseNewsDate("Sun, 18 Oct 2026 4:45:00 PM PDT"), "2026-10-18T23:45:00.000Z");
assert.equal(parseNewsDate("Sun, 18 Oct 2026 12:05:00 AM PST"), "2026-10-18T08:05:00.000Z");
assert.equal(parseNewsDate("Sun, 18 Oct 2026 12:05:00 PM UTC"), "2026-10-18T12:05:00.000Z");
assert.equal(parseNewsDate("31 Feb 2026 4:45:00 PM PDT"), null);
assert.equal(parseNewsDate("nonsense"), null);
assert.equal(decodeXml("&amp; &lt; &gt; &quot; &#39; &apos; &#65; &#x42;"), "& < > \" ' ' A B");
const rss = `<rss version="2.0"><channel><item><guid>test1</guid><title><![CDATA[Test Player: Ankle &amp; knee: update]]></title><link>https://example.com/?a=1&amp;b=2</link><description><![CDATA[A made-up update.\n  More invented text.\n\nVisit RotoWire.com for more analysis on this update.]]></description><pubDate>Sun, 18 Oct 2026 4:45:00 PM PDT</pubDate></item></channel></rss>`;
const items = parseRss(rss);
assert.deepEqual(items, [{ guid: "test1", player: "Test Player", headline: "Ankle & knee: update", text: "A made-up update. More invented text.", link: "https://example.com/?a=1&b=2", at: "2026-10-18T23:45:00.000Z" }]);
assert.throws(() => parseRss("not RSS"));
const many = Array.from({ length: 160 }, (_, i) => ({ guid: String(i), at: new Date(now - i * 1000).toISOString() }));
assert.equal(mergeNews([], many, now).length, 150);
assert.equal(mergeNews([{ guid: "old", at: new Date(now - 49 * 3600_000).toISOString() }], [], now).length, 0);
assert.equal(mergeNews(items, [{ ...items[0], headline: "Changed" }], now)[0].headline, "Changed");
assert.equal(mergeNews([], [{ guid: "boundary", at: new Date(now - 48 * 3600_000).toISOString() }], now).length, 1);

const env = { YAHOO_SESSIONS: new MemoryKV() };
const calls = [];
let failure = "";
let oversized = false;
const fakeFetch = async (url, options) => {
  assert.ok(options.signal instanceof AbortSignal);
  assert.match(options.headers["User-Agent"], /Mozilla/);
  const source = url.includes("espn") ? "espn" : "rotowire";
  calls.push(source);
  if (source === failure) throw new Error("Synthetic network failure");
  if (oversized) return new Response("x", { headers: { "Content-Length": String(6 * 1024 * 1024) } });
  return new Response(source === "espn" ? JSON.stringify(espn) : rss);
};
const kv = env.YAHOO_SESSIONS;
const originalWarn = console.warn;
const warnings = [];
console.warn = (...args) => warnings.push(args);
try {
  await pollNews(env, fakeFetch, now);
  assert.deepEqual(kv.writes.sort(), ["news:espn", "news:rotowire"]);
  kv.writes = [];
  calls.length = 0;
  await pollNews(env, fakeFetch, now + 5 * 60_000);
  assert.deepEqual(calls, ["rotowire"], "fresh ESPN skipped");
  assert.equal(kv.writes.length, 0);
  await pollNews(env, fakeFetch, now + 10 * 60_000);
  assert.equal(kv.writes.length, 0, "unchanged content does not write");
  await pollNews(env, fakeFetch, now + 30 * 60_000);
  assert.equal(kv.writes.length, 2, "timestamps refresh after 30 minutes");

  const previous = await kv.get("news:espn");
  failure = "espn";
  kv.values.delete("news:rotowire");
  kv.writes = [];
  await createWorker(fakeFetch).scheduled({}, env, {});
  assert.equal(await kv.get("news:espn"), previous);
  assert.deepEqual(kv.writes, ["news:rotowire"], "one source failure preserves the other write");
  failure = "";
  const snapshot = JSON.parse(previous);
  for (const fetchImpl of [async () => new Response("bad", { status: 503 }), async () => new Response("bad"), async () => new Response("x".repeat(5 * 1024 * 1024 + 1))]) {
    assert.deepEqual(await refreshNews("espn", env, fetchImpl, snapshot, now), snapshot);
  }
  oversized = true;
  assert.deepEqual(await refreshNews("espn", env, fakeFetch, snapshot, now), snapshot);
  oversized = false;

  async function signIn(guid) {
    const code = `login-${guid}`;
    await kv.put(`user:${guid}`, "{}");
    await kv.put(`login:${code}`, JSON.stringify({ guid }));
    const response = await worker.fetch(new Request("https://worker.example/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) }), env);
    assert.equal(response.status, 201);
    const { token } = await response.json();
    assert.ok(await kv.get(`session:${await sha256(token)}`));
    return token;
  }
  const worker = createWorker(fakeFetch);
  const owner = await signIn("OWNER");
  const other = await signIn("OTHER");
  const api = (path, token) => worker.fetch(new Request(`https://worker.example${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }), env);
  assert.equal((await api("/api/news")).status, 401);
  assert.deepEqual(await (await api("/api/me", owner)).json(), { ok: true, signedIn: true, guid: "OWNER" });
  env.NEWS_OWNER_GUIDS = " ANOTHER, OWNER ,";
  kv.values.delete("news:espn");
  kv.values.delete("news:rotowire");
  calls.length = 0;
  let body = await (await api("/api/news", other)).json();
  assert.equal(body.ok, true);
  assert.equal(body.rotowire, null);
  assert.equal(body.rotowireAllowed, false);
  assert.deepEqual(calls, ["espn"]);
  body = await (await api("/api/news", owner)).json();
  assert.equal(body.rotowireAllowed, true);
  assert.ok(body.rotowire);
  for (const source of ["espn", "rotowire"]) await kv.put(`news:${source}`, JSON.stringify({ ...JSON.parse(await kv.get(`news:${source}`)), fetchedAt: new Date(Date.now() - 25 * 60_000).toISOString() }));
  calls.length = 0;
  body = await (await api("/api/news", owner)).json();
  assert.deepEqual(calls, [], "a snapshot inside the cron's 30-minute refresh is served as is");
  for (const source of ["espn", "rotowire"]) await kv.put(`news:${source}`, JSON.stringify({ ...JSON.parse(await kv.get(`news:${source}`)), fetchedAt: new Date(Date.now() - 41 * 60_000).toISOString() }));
  calls.length = 0;
  body = await (await api("/api/news", owner)).json();
  assert.deepEqual(calls.sort(), ["espn", "rotowire"], "a snapshot past 40 minutes (cron not running) refreshes inline");
  assert.ok(body.espn);
  failure = "espn";
  kv.values.delete("news:espn");
  body = await (await api("/api/news", owner)).json();
  assert.equal(body.ok, true);
  assert.equal(body.espn, null);
  assert.ok(warnings.length >= 5);
} finally {
  console.warn = originalWarn;
}
console.log("news tests passed");
