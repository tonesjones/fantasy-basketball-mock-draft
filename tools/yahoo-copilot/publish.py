#!/usr/bin/env python3
"""Publish Yahoo draft sync boards to the Draft Lab site itself.

Transport v2 (Tony's call, 2026-09-22): no chat. This script polls Yahoo's
draftresults, encodes the board with sync.py, writes yh-sync.json into the
deploy directory, and redeploys via cf.py direct upload (only changed files
go up). The Draft Lab page in Yahoo Live mode fetches yh-sync.json from its
own origin every ~15s and auto-applies newer boards -- the phone never has
to leave the app.

Flow at draft time:
  1. Tony joins a Yahoo mock lobby, pastes the room URL + his slot in chat
     (one message, one time).
  2. Agent: copilot.py init --mock-url U --slot N  -> draft-state.json
  3. Agent: publish.py run --state draft-state.json --dir <repo> \
        --project tony-draft-lab-yahoo --account ACCT
     (runs until the draft completes, --max-mins, or Tony says stop)
  4. Tony opens the preview URL, loads the Yahoo board once, and watches it
     fill in by itself. He drafts in Yahoo; Draft Lab is board + advice.

One-time project setup (Pages:Edit token can create projects):
  publish.py create-project --project tony-draft-lab-yahoo --account ACCT

yh-sync.json contract (what the page reads):
  {"v":1,"league_key":..., "code":"yh1....", "picks":N, "total":M,
   "teams":T,"slot":S,"rounds":R, "updated_at":<epoch>}
The page only auto-applies when teams/slot/rounds match its current board
and picks is ahead of what it already shows.
"""
import argparse
import json
import os
import subprocess
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import copilot  # noqa: E402  (polling + name resolution)
import sync as synccodec  # noqa: E402

CF_PY = os.path.expanduser("~/workspace/skills/cloudflare/bin/cf.py")
CREATOR_BIN = "/opt/hatch/skills/skill-creator/bin"
sys.path.insert(0, CREATOR_BIN)
from dynamic_credentials import (  # noqa: E402
    DynamicCredentialError,
    add_surrogate_to_request,
    read_json_response,
)

CF_API = "https://api.cloudflare.com/client/v4"
ALLOWED = ("api.cloudflare.com",)


def cf_create_project(account, name):
    url = "%s/accounts/%s/pages/projects" % (CF_API, account)
    body = json.dumps({"name": name,
                       "production_branch": "main"}).encode()
    req = urllib.request.Request(
        url, data=body, method="POST",
        headers={"Content-Type": "application/json"})
    add_surrogate_to_request(req, "custom.cloudflare",
                             allowed_hosts=ALLOWED)
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = read_json_response(resp)
    if not data.get("success"):
        raise RuntimeError("project create failed: %s" %
                           json.dumps(data)[:300])
    return data["result"]


def cf_deploy(root, project, account):
    out = subprocess.run(
        [sys.executable, CF_PY, "deploy", root, "--project", project,
         "--account", account, "--branch", "main"],
        capture_output=True, text=True, timeout=300)
    if out.returncode != 0:
        raise RuntimeError("cf.py deploy failed: " +
                           (out.stderr or out.stdout)[-600:])
    # last line carries the live URL
    lines = [l for l in out.stdout.splitlines() if l.strip()]
    return lines[-1] if lines else ""


def write_sync_json(root, payload):
    path = os.path.join(root, "yh-sync.json")
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(payload, f)
    os.replace(tmp, path)
    return path


def cmd_create_project(a):
    try:
        r = cf_create_project(a.account, a.project)
    except DynamicCredentialError as e:
        print("error: %s" % e, file=sys.stderr)
        return 1
    print("project created: %s (%s)" %
          (r.get("name"), r.get("subdomain")))
    return 0


def cmd_run(a):
    state = json.load(open(a.state))
    key = state["league_key"]
    T, R = state["num_teams"], state["rounds"]
    total = T * R
    seen = {p["pick"] for p in state["picks"]}
    last_published = len(state["picks"])
    deadline = time.time() + a.max_mins * 60
    print("publishing %s -> project %s every %ds (pick %d of %d)..." %
          (key, a.project, a.interval, last_published + 1, total),
          flush=True)

    def publish(picks):
        sync_names_quiet(state)
        code = synccodec.sync_code_for_state(state)
        payload = {"v": 1, "league_key": key,
                   "league": state.get("league_name"),
                   "code": code, "picks": len(picks), "total": total,
                   "teams": T, "slot": state["my_slot"], "rounds": R,
                   "updated_at": int(time.time())}
        write_sync_json(a.dir, payload)
        url = cf_deploy(a.dir, a.project, a.account)
        print("published pick %d/%d -> %s" %
              (len(picks), total, url), flush=True)
        return len(picks)

    # publish whatever we have immediately so the page isn't waiting
    try:
        picks = copilot.fetch_picks(key)
    except Exception as e:
        print("initial poll error: %s" % e, flush=True)
        picks = []
    new = [p for p in picks if p["pick"] not in seen]
    if new or last_published == 0:
        state["picks"].extend(new)
        for p in new:
            seen.add(p["pick"])
        try:
            last_published = publish(state["picks"])
        except Exception as e:
            print("publish error: %s" % e, flush=True)

    while len(state["picks"]) < total and time.time() < deadline:
        time.sleep(a.interval)
        try:
            picks = copilot.fetch_picks(key)
        except Exception as e:
            print("poll error: %s" % e, flush=True)
            continue
        new = [p for p in picks if p["pick"] not in seen]
        if not new:
            continue
        state["picks"].extend(new)
        for p in new:
            seen.add(p["pick"])
        for p in new:
            nm = p.get("name", p["player_key"])
            print("Pick %d: %s" % (p["pick"], nm), flush=True)
        json.dump(state, open(a.state, "w"), indent=1)
        try:
            last_published = publish(state["picks"])
        except Exception as e:
            print("publish error: %s" % e, flush=True)
    print("publisher stopping (%d/%d picks)." %
          (len(state["picks"]), total))
    return 0


def sync_names_quiet(state):
    """copilot.sync_names but without per-name chatter."""
    import io
    from contextlib import redirect_stdout
    buf = io.StringIO()
    with redirect_stdout(buf):
        copilot.sync_names(state)
    out = buf.getvalue().strip()
    if out:
        print(out, flush=True)


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("create-project")
    c.add_argument("--project", required=True)
    c.add_argument("--account", required=True)
    r = sub.add_parser("run")
    r.add_argument("--state", required=True,
                   help="draft-state.json from copilot.py init")
    r.add_argument("--dir", required=True,
                   help="deploy dir (repo root); yh-sync.json lands here")
    r.add_argument("--project", required=True)
    r.add_argument("--account", required=True)
    r.add_argument("--interval", type=int, default=20)
    r.add_argument("--max-mins", type=int, default=180)
    a = ap.parse_args()
    try:
        return {"create-project": cmd_create_project,
                "run": cmd_run}[a.cmd](a)
    except RuntimeError as e:
        print("error: %s" % e, file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
