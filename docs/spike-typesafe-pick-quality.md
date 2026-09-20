# Spike: TypeSafe (Jev) pick-quality

**Status:** spike only — not wired into `index.html`, not production.

Minimal path to try **one** TypeSafe System One call that scores a fantasy
basketball pick and recommends `take` | `wait` | `reach`.

## What it does

`scripts/pick_quality_jev.py` builds a JSON `state` (candidate + ADP/rank +
roster needs / already drafted + board context) and asks Jev:

1. **score** — ordered pick-quality levels (poor → excellent)
2. **choice** — `take` | `wait` | `reach`

If **both** answer confidences are ≥ **0.7**, the script prints an auto
**SUGGEST**; otherwise it prints **UNCERTAIN** (surface for human review).

API: `POST https://api.typesafe.ai/v1/systemone`, model `jev-latest`, via
the official Python SDK (`typesafe-sdk`).

## Run it (Tony)

```bash
cd fantasy-basketball-mock-draft
python3 -m venv .venv-typesafe
source .venv-typesafe/bin/activate
pip install -r scripts/requirements-typesafe.txt
export TYPESAFE_API_KEY=...   # from TypeSafe dashboard / secret store

python scripts/pick_quality_jev.py
python scripts/pick_quality_jev.py --player "Domantas Sabonis" --pick-number 24 --adp 21.0
python scripts/pick_quality_jev.py --dump-state   # no API call
```

Optional overrides: `--player`, `--pick-number`, `--adp`, `--rank`.

## Confidence gate

- Threshold: `CONFIDENCE_THRESHOLD = 0.7` in the script
- Auto-suggest only when **choice** and **score** confidences are both ≥ 0.7
- Below that: print uncertainty; do not treat as an automated draft action

## Out of scope (this spike)

- No changes to the draft UI (`index.html`)
- No deploy, no merge-to-main expectation beyond the PR review
- Hardcoded demo state is enough; wiring live board state is a follow-up
