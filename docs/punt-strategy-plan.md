# Add punt advice to Draft Lab

Draft Lab should suggest a category punt when the roster and available players make it useful. The user decides whether to commit. Once committed, the board shows which available players gain value when that category is removed from player valuation.

## Build the scoring model

1. Reuse `PDATA[player].cv` and `CATS9` for all nine categories. Keep the existing grade as the nine-category baseline.
2. Add one pure function in `draft-core.js` or a small `punt-core.js` if the draft module becomes crowded. Given a roster, available players, and one punt category, return the team's category strengths and each available player's nine-category and punt-adjusted values.
3. Rank available players twice using the same pool. The baseline sums all nine category values. The punt rank excludes one category. Define `rankGain = baselineRank - puntRank`, so a positive number means the player moves up. Show the new rank alongside the gain. Do not describe this as a change in Yahoo ADP or a projection.
4. Keep players without `cv` visible but mark their punt value unknown. Do not infer their category values from ADP or the replacement-level grade fill. `TO` remains part of every valuation and cannot be punted.

## Suggest a punt during the draft

1. Add a small "Punt watch" section to Draft grades after the user's third pick. Before that, show "Too early to suggest a punt." Use the current roster's category values and compare its per-pick category strength with the other drafted teams. Per-pick comparison avoids treating a team with one extra selection as categorically stronger.
2. A weak category alone is not a recommendation. Consider only the eight eligible categories, excluding `TO`, where the user trails most teams. Then check whether the available board has meaningful players whose punt rank improves and who could be selected near the user's next pick. Show at most one suggested punt with the roster weakness and two concrete board examples. If the evidence is thin, show "No clear punt yet."
3. Calibrate the recommendation gate against seeded mock drafts, including teams with an early star, an injured player, and a weak category that is easy to repair. Do not hardcode a confidence label before these examples distinguish a useful punt from an ordinary roster gap.

## Let the user commit or change course

1. Add one reversible "Commit to punt" control beside the suggestion and a category selector for a deliberate choice. Offer only `PTS`, `REB`, `AST`, `STL`, `BLK`, `3PM`, `FG%`, and `FT%`. Persist only `puntCategory`, either one of those eight values or `null`, in the existing draft state. Derive suggestions from the current board on each render.
2. When committed, show a clear "Punting FT%" banner on Draft grades and the available-player board. List the strongest available players under the eight-category ranking, with their new rank and rank gain. Prioritize players who are both improved and useful near the next pick, rather than the largest rank gain in isolation.
3. Show the forfeited category as a loss in matchup context. Keep the existing nine-category grade visible and label the punt view as a strategy scenario. Do not silently replace the standard grade or Yahoo's actual standings.
4. The Pick Coach may refer to the committed punt, but the first release should not rewrite its market-based take, wait, and pass verdicts. Evaluate that integration after users can inspect the grade and player-rank changes.

## Verify before merging

1. Add behavior tests for rank changes, missing category data, `TO` never appearing as a suggestion or selectable punt, rejection of saved `puntCategory: "TO"`, undo, restart, state restore, and a Yahoo board containing an off-pool pick.
2. Walk a seeded mock draft through early, middle, and late picks. Confirm the suggestion changes when the roster or board changes, committing updates the player list, and clearing the punt restores the nine-category view.
3. Check the actual browser at desktop and phone widths. A user should understand why a punt is suggested, which players rise, and how to reverse the choice without opening documentation.
4. Compare the same mock draft before and after the change. The existing grade and Pick Coach verdicts must stay unchanged when no punt is committed.

## Scope for the first release

Support one punt category at a time, excluding `TO`. Use the existing historical 2025-26 per-game category values and label them as such. Multi-category punts, projected 2026-27 category values, and an automatic change to Pick Coach verdicts can wait until the single-punt view proves useful.

## Update: multi-category punts (shipped)

Users can now punt up to three categories at once (`PuntCore.MAX_PUNTS`), including `TO`. State is `puntCats` (array); older saves with a single `puntCategory` string are migrated on load. Rankings drop every punted category from the nine-category sum, and `PuntCore.suggest` skips committed punts and measures near-term risers for the combined set, so it can recommend a second or third punt. The standard grade and Pick Coach verdicts remain nine-category.
