"""Compact draft-board sync codes for Draft Lab's Yahoo Live mode.

The chat is the transport: the agent polls Yahoo, encodes the board as a short
string, and sends it (or a #link carrying it) in chat. The Draft Lab page
decodes it and hydrates the board -- no tunnel, no feed server, works on the
phone today.

Format: yh1.<teams>.<slot>.<rounds>.<pick>,<pick>,...
  each pick = "~" + base64url(yahoo display name), e.g. "~Tmlrb2xhIEpva2nEhw"
The page maps names to its pool itself (diacritic-insensitive), so off-pool
Yahoo picks just ride along as names.
"""
import base64

VERSION = "yh1"


def _b64e(name):
    return base64.urlsafe_b64encode(name.encode("utf-8")).decode().rstrip("=")


def _b64d(tok):
    return base64.urlsafe_b64decode(tok + "=" * (-len(tok) % 4)).decode("utf-8")


def encode_sync(teams, slot, rounds, yahoo_names):
    """yahoo_names: ordered list of Yahoo display names (pick 1 first)."""
    toks = ["~" + _b64e(n) for n in yahoo_names]
    return "%s.%d.%d.%d.%s" % (VERSION, teams, slot, rounds, ",".join(toks))


def decode_sync(code):
    """Inverse of encode_sync. Tolerates a full link (takes the #fragment)."""
    code = code.strip()
    if "#" in code:
        code = code.split("#", 1)[1]
    if not code.startswith(VERSION + "."):
        raise ValueError("not a draft sync code (want yh1....)")
    _, teams, slot, rounds, payload = code.split(".", 4)
    names = [_b64d(t[1:] if t.startswith("~") else t)
             for t in payload.split(",")] if payload else []
    return {"teams": int(teams), "slot": int(slot),
            "rounds": int(rounds), "names": names}


def sync_link(base_url, teams, slot, rounds, yahoo_names):
    return base_url.rstrip("/") + "/#" + encode_sync(teams, slot, rounds,
                                                    yahoo_names)


def sync_code_for_state(state):
    """Build a sync code from a copilot poll state (picks carry 'name')."""
    picks = sorted(state["picks"], key=lambda p: p["pick"])
    names = [p.get("name") or "?" for p in picks]
    return encode_sync(state["num_teams"], state["my_slot"],
                       state["rounds"], names)
