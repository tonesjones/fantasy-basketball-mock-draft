#!/usr/bin/env python3
"""Spike: one TypeSafe (Jev) pick-quality call for fantasy basketball drafts.

Not production. Calls POST https://api.typesafe.ai/v1/systemone via
typesafe-sdk with a Score (pick quality) + Choice (take | wait | reach).

Requires:
  pip install -r scripts/requirements-typesafe.txt
  export TYPESAFE_API_KEY=...

Usage:
  python scripts/pick_quality_jev.py
  python scripts/pick_quality_jev.py --player "Tyrese Maxey"
  python scripts/pick_quality_jev.py --pick-number 24 --adp 18.5
"""

from __future__ import annotations

import argparse
import json
import os
import sys

CONFIDENCE_THRESHOLD = 0.7

# Ordered Score levels (low → high). Index becomes the numeric score axis.
SCORE_CRITERIA = [
    "Poor — clear reach or wrong positional fit given roster needs",
    "Below average — better options likely available at similar ADP",
    "Average — fair market pick; neither strong value nor costly reach",
    "Good — solid fit for current needs and reasonable vs ADP",
    "Excellent — high-confidence value or must-draft fit right now",
]

CHOICE_CRITERIA = {
    "take": "Draft this player now; waiting risks losing them without a better replacement",
    "wait": "Prefer to wait; similar or better value should remain for a later pick",
    "reach": "Picking now would be an early reach relative to ADP and available alternatives",
}


def demo_state(player: str, pick_number: int, adp: float | None, rank: int | None) -> dict:
    """Hardcoded mid-draft sample context; CLI can override player / pick / ADP."""
    return {
        "league": {
            "format": "9-category H2H (PTS REB AST STL BLK 3PM FG% FT% TO)",
            "teams": 12,
            "rounds": 13,
            "scoring": "Yahoo-style snake draft",
        },
        "draft": {
            "pick_number": pick_number,
            "round": (pick_number - 1) // 12 + 1,
            "user_slot": 1,
            "picks_until_user_next": 22,
        },
        "candidate": {
            "name": player,
            "positions": ["PG", "SG"],
            "team": "PHI",
            "built_in_rank": rank if rank is not None else 22,
            "yahoo_adp": adp if adp is not None else 19.4,
            "notes": "Strong per-game guard; solid AST/3PM/PTS; lighter REB/BLK",
        },
        "roster_needs": {
            "filled_slots": ["PG"],
            "open_slots": ["SG", "G", "SF", "F", "PF", "C", "UTIL", "UTIL", "BN", "BN", "BN", "BN"],
            "priority_needs": ["C", "PF", "STL", "BLK"],
            "already_drafted_by_user": [
                {"name": "Shai Gilgeous-Alexander", "pick": 1, "positions": ["PG", "SG"]},
            ],
        },
        "board_context": {
            "notable_available": [
                {"name": "Domantas Sabonis", "adp": 21.0, "positions": ["PF", "C"]},
                {"name": "Desmond Bane", "adp": 24.5, "positions": ["SG", "SF"]},
                {"name": "Scottie Barnes", "adp": 26.0, "positions": ["SF", "PF"]},
            ],
            "recently_taken": [
                {"name": "Anthony Edwards", "pick": 20},
                {"name": "Karl-Anthony Towns", "pick": 21},
            ],
        },
    }


def build_questions():
    from typesafe_sdk import Choice, Score

    return {
        "score": Score(
            instructions=(
                "How good is drafting `candidate` at this pick right now, given "
                "`roster_needs`, ADP/rank vs `draft.pick_number`, and `board_context`? "
                "Use the ordered levels in criteria (lowest to highest)."
            ),
            criteria=SCORE_CRITERIA,
        ),
        "choice": Choice(
            instructions=(
                "Should the user take this player now, wait for a later pick, or "
                "treat drafting them now as a reach? Consider ADP vs pick number, "
                "positional/category needs, and who else is available."
            ),
            criteria=CHOICE_CRITERIA,
        ),
    }


def suggestion_from_answers(choice_ans, score_ans) -> tuple[str, str]:
    """Return (mode, text). mode is 'suggest' or 'uncertain'."""
    choice_conf = float(choice_ans.confidence)
    score_conf = float(score_ans.confidence)
    # Gate auto-suggest on both answers being confident enough.
    if choice_conf >= CONFIDENCE_THRESHOLD and score_conf >= CONFIDENCE_THRESHOLD:
        level = int(round(float(score_ans.score)))
        level = max(0, min(level, len(SCORE_CRITERIA) - 1))
        return (
            "suggest",
            f"SUGGEST: {choice_ans.choice} "
            f"(pick quality level {score_ans.score:.2f} ≈ {SCORE_CRITERIA[level]!r})",
        )
    reasons = []
    if choice_conf < CONFIDENCE_THRESHOLD:
        reasons.append(f"choice confidence {choice_conf:.3f} < {CONFIDENCE_THRESHOLD}")
    if score_conf < CONFIDENCE_THRESHOLD:
        reasons.append(f"score confidence {score_conf:.3f} < {CONFIDENCE_THRESHOLD}")
    return (
        "uncertain",
        "UNCERTAIN: " + "; ".join(reasons) + " — surface for human review, do not auto-act",
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="TypeSafe Jev pick-quality spike (one call)")
    parser.add_argument("--player", default="Tyrese Maxey", help="Candidate player name")
    parser.add_argument("--pick-number", type=int, default=23, help="Overall pick number")
    parser.add_argument("--adp", type=float, default=None, help="Yahoo ADP override")
    parser.add_argument("--rank", type=int, default=None, help="Built-in rank override")
    parser.add_argument(
        "--dump-state",
        action="store_true",
        help="Print the state JSON and exit without calling the API",
    )
    args = parser.parse_args(argv)

    state = demo_state(args.player, args.pick_number, args.adp, args.rank)

    if args.dump_state:
        print(json.dumps(state, indent=2))
        return 0

    if not os.environ.get("TYPESAFE_API_KEY"):
        print(
            "ERROR: TYPESAFE_API_KEY is not set.\n"
            "  export TYPESAFE_API_KEY=...\n"
            "  pip install -r scripts/requirements-typesafe.txt\n"
            "Then re-run this script.",
            file=sys.stderr,
        )
        return 2

    try:
        from typesafe_sdk import TypeSafeClient
    except ImportError:
        print(
            "ERROR: typesafe-sdk not installed.\n"
            "  pip install -r scripts/requirements-typesafe.txt",
            file=sys.stderr,
        )
        return 2

    questions = build_questions()
    print("=== TypeSafe pick-quality spike (jev-latest) ===")
    print(f"player={state['candidate']['name']!r} pick={state['draft']['pick_number']} "
          f"adp={state['candidate']['yahoo_adp']} rank={state['candidate']['built_in_rank']}")
    print(f"confidence_threshold={CONFIDENCE_THRESHOLD}")
    print()

    with TypeSafeClient(model="jev-latest") as client:
        response = client.system_one(state=state, questions=questions)

    score_ans = response.answers["score"]
    choice_ans = response.answers["choice"]

    print(f"model: {getattr(response, 'model', None)}")
    print(f"request_id: {getattr(response, 'request_id', None)}")
    if getattr(response, "usage", None):
        print(f"usage: {response.usage}")
    print()
    print("--- score ---")
    print(f"  score={score_ans.score}")
    print(f"  confidence={score_ans.confidence}")
    print(f"  probabilities={dict(score_ans.probabilities)}")
    print(f"  legend={dict(score_ans.legend)}")
    print()
    print("--- choice ---")
    print(f"  choice={choice_ans.choice}")
    print(f"  confidence={choice_ans.confidence}")
    print(f"  probabilities={dict(choice_ans.probabilities)}")
    print()
    mode, text = suggestion_from_answers(choice_ans, score_ans)
    print(f"=== {mode.upper()} ===")
    print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
