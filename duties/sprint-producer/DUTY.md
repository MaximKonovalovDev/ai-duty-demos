# Duty: sprint-producer

The job duty: turn a roadmap into backlog and sprint rows someone else can work
without asking what "done" means: every row names its scorecard row, its owner,
and a runnable F2P (fails before the change) plus P2P (keeps passing) proof, so
a DONE row without evidence and a BLOCKED row without a next step both stand out.

Ads that ask for it: 16 of 34 real fit-60 ads at the first survey (2026-10-04;
`node tools/duty.mjs map` recounts it).
Words in the ads: roadmap, stakeholder, backlog, sprint, product owner, release.

## What the AI does

`node duties/sprint-producer/run.mjs <board.md> [--json]`

1. Parses the board table rows (`| ID | Status | Scorecard | What | Done when | Owner | Evidence |`).
2. Files `missing-f2p` when the Done-when cell has no `F2P` proof line.
3. Files `missing-p2p` when the Done-when cell has no `P2P` proof line.
4. Files `missing-owner` when the owner cell is empty.
5. Files `missing-scorecard` when the scorecard cell is empty.
6. Files `done-without-evidence` when Status is DONE but Evidence is empty.
7. Files `blocked-without-next` when Status is BLOCKED but Evidence is empty
   (no reason or next step recorded).

Six checks, one per rule group above (F2P/P2P count as one check each).

## Proof

- Test: `node --test duties/sprint-producer/test.mjs` (planted board: 6 defects
  of the expected kinds; clean board: 0 findings; temp boards cover each kind;
  the planted board differs from the clean one by exactly the planted cells).
- Receipt: `receipt.json`, a run on our real board `sprint/board.md`, written by
  `node tools/duty.mjs check sprint-producer --write-receipt`. The real board
  keeps OWNER rows whose Done-when is "the owner's word" with no F2P/P2P lines, so
  the receipt honestly records open defects instead of a clean sheet.

## Honest limits

- It reads text, not planning quality: a row with an F2P line that proves
  nothing still passes the scan.
- Table-shaped only: rows outside the `| ... |` table (prose notes, PARKED
  lines) are not audited.
- It does not judge whether the proof command is the right one, whether the
  owner role fits, or whether the roadmap order is sane: only that the cells
  are present and the proof markers exist.
- No model: it is a deterministic core. The agent in `agent.md` adds the judgment
  (which row blocks the sprint, what the smallest row fix is).
- Donors named by the team design: center `loopkit_new`, vision-check (board
  rows carry F2P/P2P proof lines). Their code was not read and none was
  copied; the checks here are the generic ones (proof markers present, owner
  named, DONE evidenced, BLOCKED explained).
