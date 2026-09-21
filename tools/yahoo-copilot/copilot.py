#!/usr/bin/env python3
"""Yahoo draft copilot (test branch tool).

Polls a Yahoo snake draft's draftresults, detects Tony's turns, and
recommends via Draft Lab's headless deterministic engine (recommend.js).

Subcommands:
  init   --league-key K | --mock-url U  --slot N   -> writes state file
  poll   --state S [--interval 15]                     -> live draft loop
  replay --league-key K --slot N                       -> dry-run on a completed draft

Auth: imports the dynamic_credentials helper from the yahoo skill
(~/workspace/skills/yahoo/bin); the OAuth token never leaves the vault.
"""
import argparse
import json
import os
import re
import subprocess
import sys
import time
import unicodedata
import urllib.parse
import urllib.request

SKILL_BIN = os.path.expanduser("~/workspace/skills/yahoo/bin")
sys.path.insert(0, SKILL_BIN)
from dynamic_credentials import (  # noqa: E402
    DynamicCredentialError,
    add_surrogate_to_request,
    read_json_response,
)

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
ALLOWED = ("fantasysports.yahooapis.com",)
BASE = "https://fantasysports.yahooapis.com"
NODE = os.path.expanduser("~/workspace/tools/node-22/bin/node")


def yahoo_get(path):
    url = BASE + path
    if "format=" not in url:
        url += ("&" if "?" in url else "?") + "format=json"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    add_surrogate_to_request(req, "custom.yahoo", allowed_hosts=ALLOWED)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return read_json_response(resp)


def league_sub(path, sub):
    """Return the named sub-resource dict from a league response."""
    lg = yahoo_get(path)["fantasy_content"]["league"]
    items = lg if isinstance(lg, list) else [lg]
    for it in items:
        if isinstance(it, dict) and sub in it:
            return it[sub]
    raise RuntimeError("sub-resource %r not found in %s" % (sub, path))


def _dicts(node):
    if isinstance(node, dict):
        yield node
    elif isinstance(node, list):
        for x in node:
            for d in _dicts(x):
                yield d


def first(node, key):
    """First dict containing key, searching nested lists (Yahoo's JSON
    nests player/team entries inconsistently between single and batch)."""
    for d in _dicts(node):
        if key in d:
            return d[key]
    return None


def normalize(name):
    s = unicodedata.normalize("NFKD", name or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower()
    s = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b\.?", "", s)
    s = re.sub(r"[^a-z0-9 ]", "", s)
    return re.sub(r"\s+", " ", s).strip()


def load_pool():
    """[(name, [positions])] from index.html PLAYERS literal."""
    html = open(os.path.join(REPO_ROOT, "index.html")).read()
    m = re.search(r"var PLAYERS=\[([\s\S]*?)\n\];", html)
    out = []
    for nm, pos in re.findall(r'\["((?:[^"\\]|\\.)+?)",\[([^\]]*)\]', m.group(1)):
        positions = re.findall(r"'([A-Z]+)'", pos)
        out.append((nm, positions))
    return out


POOL = load_pool()
POOL_NORM = {normalize(n): n for n, _ in POOL}
POOL_POS = {n: pos for n, pos in POOL}


def crosswalk(yahoo_name):
    return POOL_NORM.get(normalize(yahoo_name))


def snake_slot(pick, teams):
    r, pos = divmod(pick - 1, teams)
    return pos + 1 if r % 2 == 0 else teams - pos


def my_pick_numbers(teams, slot, rounds):
    return [n for n in range(1, teams * rounds + 1)
            if snake_slot(n, teams) == slot]


def game_key_for(code="nba"):
    g = yahoo_get("/fantasy/v2/game/%s" % code)["fantasy_content"]["game"]
    g0 = g[0] if isinstance(g, list) else g
    return g0["game_key"]


def league_key_from_mock_url(url):
    m = re.search(r"/draftclient/\w+/(\d+)", url)
    if not m:
        raise RuntimeError("no draft id found in mock URL")
    return "%s.l.%s" % (game_key_for("nba"), m.group(1))


def resolve_names(league_key, player_keys):
    """player_key -> Yahoo display name (batched, 25/call)."""
    out = {}
    keys = list(dict.fromkeys(player_keys))
    for i in range(0, len(keys), 25):
        chunk = keys[i:i + 25]
        sub = league_sub(
            "/fantasy/v2/league/%s/players;player_keys=%s"
            % (league_key, ",".join(chunk)), "players")
        for k, v in sub.items():
            if k == "count":
                continue
            p = v["player"]
            name = first(p, "name")["full"]
            out[first(p, "player_key")] = name
    return out


def roster_slots(league_key):
    s = league_sub("/fantasy/v2/league/%s/settings" % league_key,
                   "settings")
    s0 = s[0] if isinstance(s, list) else s
    slots = []
    for rp in s0.get("roster_positions", []):
        r = rp["roster_position"]
        if r["position"] == "IL":
            continue
        slots += [r["position"].upper()] * int(r.get("count", 1))
    return slots, s0


def open_slots_for(slots, my_drafted):
    """Greedy: assign each drafted player to first eligible starter slot."""
    open_ = list(slots)
    for name in my_drafted:
        pos = POOL_POS.get(name, [])
        prefs = list(pos)
        if any(p in ("PG", "SG") for p in pos):
            prefs.append("G")
        if any(p in ("SF", "PF") for p in pos):
            prefs.append("F")
        prefs.append("UTIL")
        for pref in prefs:
            for i, s in enumerate(open_):
                if s == pref:
                    open_.pop(i)
                    break
            else:
                continue
            break
    return open_


def run_recommend(drafted, pick, next_pick, open_slots):
    state = {"pick": pick, "nextPick": next_pick, "drafted": drafted,
             "openSlots": open_slots}
    with open("/tmp/copilot-rec.json", "w") as f:
        json.dump(state, f)
    out = subprocess.run([NODE, os.path.join(HERE, "recommend.js"),
                          "/tmp/copilot-rec.json"],
                         capture_output=True, text=True, timeout=120)
    if out.returncode != 0:
        raise RuntimeError("recommend.js failed: " + out.stderr[-500:])
    return json.loads(out.stdout)


def init_state(league_key, slot):
    meta = yahoo_get("/fantasy/v2/league/%s" % league_key
                     )["fantasy_content"]["league"]
    meta0 = meta[0] if isinstance(meta, list) else meta
    slots, settings = roster_slots(league_key)
    if settings.get("is_auction_draft") == "1":
        raise RuntimeError("auction drafts not supported in v1 (snake only)")
    teams = int(meta0["num_teams"])
    rounds = len(slots)
    # slot -> team name sanity check
    team_names = {}
    try:
        tm = league_sub("/fantasy/v2/league/%s/teams" % league_key, "teams")
        for k, v in tm.items():
            if k == "count":
                continue
            t = v["team"]
            dp = first(t, "draft_position")
            if dp:
                team_names[int(dp)] = first(t, "name")
    except Exception as e:
        print("warn: teams lookup failed: %s" % e)
    state = {
        "league_key": league_key,
        "league_name": meta0.get("name"),
        "draft_status": meta0.get("draft_status"),
        "my_slot": slot,
        "my_team": team_names.get(slot),
        "num_teams": teams,
        "rounds": rounds,
        "slots": slots,
        "picks": [],
        "my_drafted": [],
        "alerted": {},
    }
    print("league: %s | %d teams x %d rounds | you: slot %d (%s)" % (
        state["league_name"], teams, rounds, slot, state["my_team"]))
    return state


def fetch_picks(league_key):
    dr = league_sub("/fantasy/v2/league/%s/draftresults" % league_key,
                    "draft_results")
    picks = []
    for k, v in dr.items():
        if k == "count":
            continue
        r = v["draft_result"]
        picks.append({"pick": int(r["pick"]), "round": int(r["round"]),
                      "team_key": r["team_key"],
                      "player_key": r["player_key"]})
    return sorted(picks, key=lambda x: x["pick"])


def sync_names(state):
    missing = [p["player_key"] for p in state["picks"] if "name" not in p]
    if not missing:
        return
    names = resolve_names(state["league_key"], missing)
    by_key = {p["player_key"]: p for p in state["picks"]}
    for k, name in names.items():
        by_key[k]["name"] = name
        pool = crosswalk(name)
        by_key[k]["pool"] = pool
        if pool is None:
            print("  (no pool match: %s)" % name)


def on_new_picks(state, new_picks):
    """Process picks in order; returns list of directive strings."""
    directives = []
    T, slot = state["num_teams"], state["my_slot"]
    my_nums = my_pick_numbers(T, slot, state["rounds"])
    for p in new_picks:
        n = p["pick"]
        nm = p.get("name", p["player_key"])
        print("Pick %d (Rd %d): %s" % (n, p["round"], nm), flush=True)
        if snake_slot(n, T) == slot and p.get("pool"):
            state["my_drafted"].append(p["pool"])
    sync_open = None
    made = len(state["picks"])
    nxt = made + 1
    if nxt <= T * state["rounds"]:
        nxt_slot = snake_slot(nxt, T)
        until = min([m for m in my_nums if m > made], default=None)
        if until is not None:
            away = until - made
            if away <= 2 and str(until) not in state["alerted"]:
                drafted = [p["pool"] for p in state["picks"] if p.get("pool")]
                following = [m for m in my_nums if m > until]
                next_pick = following[0] if following else until + 2 * T
                rec = run_recommend(
                    drafted, until, next_pick,
                    open_slots_for(state["slots"], state["my_drafted"]))
                pr = rec["primary"]
                if away == 1:
                    msg = ("ON THE CLOCK at %d: TAKE %s (%s, %+g value). " %
                           (until, pr["name"], pr["verdict"], pr["valueAtPick"]))
                else:
                    msg = ("LEAN for pick %d (you're up in %d): %s (%s). " %
                           (until, away, pr["name"], pr["verdict"]))
                msg += "Alt: " + ", ".join(
                    "%s (%s)" % (a["name"], a["verdict"])
                    for a in rec["alternatives"])
                state["alerted"][str(until)] = True
                directives.append(msg)
                print(msg, flush=True)
    return directives


def cmd_init(a):
    key = a.league_key or league_key_from_mock_url(a.mock_url)
    state = init_state(key, a.slot)
    # verify the key actually reads (mock readability check)
    picks = fetch_picks(key)
    print("draftresults readable: %d picks so far" % len(picks))
    path = a.out or "draft-state.json"
    json.dump(state, open(path, "w"), indent=1)
    print("state -> %s" % path)


def cmd_poll(a):
    state = json.load(open(a.state))
    key, T = state["league_key"], state["num_teams"]
    total = T * state["rounds"]
    print("polling %s every %ds (pick %d of %d)..." %
          (key, a.interval, len(state["picks"]) + 1, total), flush=True)
    while len(state["picks"]) < total:
        try:
            picks = fetch_picks(key)
        except Exception as e:
            print("poll error: %s" % e, flush=True)
            time.sleep(a.interval)
            continue
        seen = {p["pick"] for p in state["picks"]}
        new = [p for p in picks if p["pick"] not in seen]
        if new:
            state["picks"].extend(new)
            sync_names(state)
            on_new_picks(state, new)
            json.dump(state, open(a.state, "w"), indent=1)
        time.sleep(a.interval)
    print("draft complete.")


def cmd_replay(a):
    """Dry-run: replay a completed draft through the turn/recommend loop."""
    state = init_state(a.league_key, a.slot)
    picks = fetch_picks(a.league_key)
    print("replaying %d picks..." % len(picks))
    sync_needed = [p["player_key"] for p in picks]
    names = resolve_names(a.league_key, sync_needed)
    t0 = time.time()
    rec_times = []
    for p in picks:
        p["name"] = names.get(p["player_key"], p["player_key"])
        p["pool"] = crosswalk(p["name"])
        state["picks"].append(p)
        if snake_slot(p["pick"], state["num_teams"]) == state["my_slot"] \
                and p.get("pool"):
            state["my_drafted"].append(p["pool"])
        made = len(state["picks"])
        nxt = made + 1
        my_nums = my_pick_numbers(state["num_teams"], state["my_slot"],
                                  state["rounds"])
        until = min([m for m in my_nums if m > made], default=None)
        if until is not None and until - made <= 2 \
                and str(until) not in state["alerted"]:
            drafted = [q["pool"] for q in state["picks"] if q.get("pool")]
            following = [m for m in my_nums if m > until]
            np_ = following[0] if following else until + 2 * state["num_teams"]
            r0 = time.time()
            rec = run_recommend(
                drafted, until, np_,
                open_slots_for(state["slots"], state["my_drafted"]))
            rec_times.append(time.time() - r0)
            pr = rec["primary"]
            state["alerted"][str(until)] = True
            print("  [pick %d] %s (%s, %+g)" %
                  (until, pr["name"], pr["verdict"], pr["valueAtPick"]))
    unmatched = [p["name"] for p in picks if not p.get("pool")]
    print("done in %.1fs | recs: %d | avg rec time: %.2fs | unmatched: %d" % (
        time.time() - t0, len(rec_times),
        sum(rec_times) / max(1, len(rec_times)), len(unmatched)))
    for u in unmatched[:10]:
        print("  unmatched: %s" % u)


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    i = sub.add_parser("init")
    i.add_argument("--league-key")
    i.add_argument("--mock-url")
    i.add_argument("--slot", type=int, required=True)
    i.add_argument("--out")
    p = sub.add_parser("poll")
    p.add_argument("--state", required=True)
    p.add_argument("--interval", type=int, default=15)
    r = sub.add_parser("replay")
    r.add_argument("--league-key", required=True)
    r.add_argument("--slot", type=int, required=True)
    a = ap.parse_args()
    try:
        {"init": cmd_init, "poll": cmd_poll, "replay": cmd_replay}[a.cmd](a)
    except (DynamicCredentialError, RuntimeError) as e:
        print("error: %s" % e, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
