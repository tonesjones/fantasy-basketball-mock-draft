const ESPN_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries";
const ROTOWIRE_URL = "https://www.rotowire.com/rss/news.php?sport=NBA";
const MINUTE = 60_000;
const INLINE_REFRESH_MINUTES = 40;
const MAX_BYTES = 5 * 1024 * 1024;
const TEAMS = { PHX: "PHO", UTAH: "UTA", WSH: "WAS", GSW: "GS", NOP: "NO", NYK: "NY", SAS: "SA", BRK: "BKN" };
const string = (value) => typeof value === "string" ? value.trim() : "";

function iso(value) {
  const time = typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

export function parseEspn(data) {
  if (!Array.isArray(data?.injuries)) throw new Error("Invalid ESPN injuries body.");
  return data.injuries.flatMap((team) => (Array.isArray(team?.injuries) ? team.injuries : []).map((entry) => {
    const name = string(entry?.athlete?.displayName);
    const abbreviation = string(entry?.athlete?.team?.abbreviation).toUpperCase();
    return {
      name,
      team: TEAMS[abbreviation] || abbreviation,
      position: string(entry?.athlete?.position?.abbreviation),
      status: string(entry?.status),
      comment: string(entry?.shortComment).slice(0, 280),
      date: iso(entry?.date),
      returnDate: string(entry?.details?.returnDate) || null,
      injury: [string(entry?.details?.side), string(entry?.details?.type)].filter(Boolean).join(" "),
    };
  }).filter((entry) => entry.name));
}

export function decodeXml(value) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, code) => {
    const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    if (code[0] !== "#") return named[code.toLowerCase()];
    const point = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : Number(code.slice(1));
    return point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : entity;
  });
}

export function parseNewsDate(value) {
  const match = /^(?:[A-Za-z]{3},\s*)?(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)?\s+(PDT|PST|EDT|EST|CDT|CST|MDT|MST|GMT|UTC)$/i.exec(value.trim());
  if (!match) return null;
  const [, day, month, year, hour, minute, second, period, zone] = match;
  const monthIndex = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(month.toLowerCase());
  if (monthIndex < 0 || +day < 1 || +hour > (period ? 12 : 23) || (period && +hour < 1) || +minute > 59 || +second > 59) return null;
  const hours = period ? +hour % 12 + (period.toUpperCase() === "PM" ? 12 : 0) : +hour;
  const date = new Date(Date.UTC(+year, monthIndex, +day, hours, +minute, +second));
  if (date.getUTCMonth() !== monthIndex || date.getUTCDate() !== +day) return null;
  const offsets = { PDT: 7, PST: 8, EDT: 4, EST: 5, CDT: 5, CST: 6, MDT: 6, MST: 7, GMT: 0, UTC: 0 };
  return new Date(date.getTime() + offsets[zone.toUpperCase()] * 60 * MINUTE).toISOString();
}

export function parseRss(xml) {
  if (!/<rss\b[^>]*>[\s\S]*<channel\b[^>]*>[\s\S]*<\/channel>\s*<\/rss>\s*$/i.test(xml)) throw new Error("Invalid RotoWire RSS body.");
  return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map((match) => {
    const field = (tag) => decodeXml(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i").exec(match[1])?.[1] || "").trim();
    const title = field("title");
    const split = title.indexOf(": ");
    return {
      guid: field("guid"),
      player: split < 0 ? title : title.slice(0, split),
      headline: split < 0 ? "" : title.slice(split + 2),
      text: field("description").replace(/\s*Visit RotoWire\.com for more analysis on this update\.\s*$/i, "").replace(/\s+/g, " ").trim(),
      link: field("link"),
      at: parseNewsDate(field("pubDate")),
    };
  }).filter((item) => item.guid && item.at);
}

export function mergeNews(previous, incoming, now = Date.now()) {
  const items = new Map();
  for (const item of [...previous, ...incoming]) {
    if (item?.guid && Date.parse(item.at) >= now - 48 * 60 * MINUTE) items.set(item.guid, item);
  }
  return [...items.values()].sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || a.guid.localeCompare(b.guid)).slice(0, 150);
}

async function fetchBody(url, fetchImpl) {
  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(10000),
    headers: { "User-Agent": "Mozilla/5.0 (compatible; YahooDraftNews/1.0)", Accept: "application/json, application/rss+xml, text/xml" },
  });
  if (response.status !== 200) throw new Error(`News HTTP ${response.status}.`);
  if (Number(response.headers.get("Content-Length")) > MAX_BYTES) {
    await response.body?.cancel();
    throw new Error("News body too large.");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Missing news body.");
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new Error("News body too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(bytes);
}

async function readSnapshot(env, source) {
  try {
    return JSON.parse(await env.YAHOO_SESSIONS.get(`news:${source}`));
  } catch (error) {
    console.warn(`News ${source} read failed.`, error);
    return null;
  }
}

function stale(snapshot, minutes, now) {
  const time = Date.parse(snapshot?.fetchedAt);
  return !Number.isFinite(time) || now - time >= minutes * MINUTE;
}

export async function refreshNews(source, env, fetchImpl, previous, now = Date.now()) {
  try {
    const body = await fetchBody(source === "espn" ? ESPN_URL : ROTOWIRE_URL, fetchImpl);
    const field = source === "espn" ? "players" : "items";
    const content = source === "espn" ? parseEspn(JSON.parse(body)) : mergeNews(Array.isArray(previous?.items) ? previous.items : [], parseRss(body), now);
    const snapshot = { fetchedAt: new Date(now).toISOString(), [field]: content };
    if (JSON.stringify(previous?.[field]) !== JSON.stringify(content) || stale(previous, 30, now)) {
      await env.YAHOO_SESSIONS.put(`news:${source}`, JSON.stringify(snapshot));
      return snapshot;
    }
    return previous;
  } catch (error) {
    console.warn(`News ${source} refresh failed.`, error);
    return previous || null;
  }
}

export async function pollNews(env, fetchImpl, now = Date.now()) {
  await Promise.all(["espn", "rotowire"].map(async (source) => {
    const previous = await readSnapshot(env, source);
    if (source === "rotowire" || stale(previous, 10, now)) await refreshNews(source, env, fetchImpl, previous, now);
  }));
}

export async function loadNews(env, fetchImpl, guid, now = Date.now()) {
  const rotowireAllowed = String(env.NEWS_OWNER_GUIDS || "").split(",").map((value) => value.trim()).filter(Boolean).includes(guid);
  const [espn, rotowire] = await Promise.all(["espn", "rotowire"].map(async (source) => {
    if (source === "rotowire" && !rotowireAllowed) return null;
    const previous = await readSnapshot(env, source);
    /* Past the 30-minute timestamp refresh, so a running cron never triggers this. */
    return stale(previous, INLINE_REFRESH_MINUTES, now) ? refreshNews(source, env, fetchImpl, previous, now) : previous;
  }));
  return { espn, rotowire, rotowireAllowed };
}
