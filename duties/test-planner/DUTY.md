# Duty: test-planner

The job duty: turn requirements into a test plan: cases that cover each requirement, the edge values around every limit,
the regression checks that must keep passing, and a list of requirements nobody can test as written.

Ads that ask for it: 17 of 34 real fit-60 ads at the survey (`node tools/duty.mjs map` recounts it). Words in the ads:
test plan, test case, test strategy, test scenario, regression.

## What the AI does

`node duties/test-planner/run.mjs <spec.md> [--json]`

1. Reads requirements: bullets, numbered lines, `REQ:` lines, or a table of IDs with a proof column (the way every board row
   and every finish-line bar here is written). `F2P:` and `P2P:` lines are carried into the plan as the runnable proof
   (fails before the change, keeps passing after).
2. Writes cases per requirement: positive, negative (empty, malformed or oversized input; precondition missing), boundary
   (below, at and above every number, with the right direction for "at most", "at least" and "exactly"), regression (when the
   requirement says existing, unchanged, keep, still).
3. Flags what cannot be tested yet: a vague word (fast, easy, user-friendly, robust...) with no number, example or proof, or a
   TBD. The positive case of a flagged requirement is written as "blocked: needs a measurable criterion", never as a guess.
4. Prints a plan (markdown table) and the counts (requirements, cases, flagged, uncovered).

## Proof

- Test: `node --test duties/test-planner/test.mjs`. Planted spec: 6 requirements, 2 vague ones flagged (and only those), 9
  boundary cases from 3 numbers with the right direction (at most 30 items: 29 and 30 accepted, 31 rejected), 1 regression case,
  21 cases, 0 uncovered. Clean spec: 5 measurable requirements, 0 flagged, "HTTP 200" is not treated as a limit.
- Receipt: a run on our real `FINISH-LINE.md` (the bars and rules of this repo), written by
  `node tools/duty.mjs check test-planner --write-receipt`.

## Honest limits

- It does not understand what a requirement means. Cases quote the requirement; the agent in `agent.md` adds the concrete
  inputs and the exact expected result.
- Vague-word detection is a word list. A vague requirement without one of those words passes; a measurable one that uses one
  of them with a number elsewhere in its proof passes too.
- Boundary values assume integer steps (or 0.1 for decimals); units are copied from the text.
- No model, no network. Donor idea: our board rows (F2P and P2P lines). No code was copied.
