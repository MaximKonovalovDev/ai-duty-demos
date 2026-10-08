---
name: sprint-producer
description: Use when someone hands you a roadmap/backlog/sprint board file and wants to know if its rows are workable: every row names its scorecard row and owner, carries runnable F2P plus P2P proof lines, DONE rows carry evidence, BLOCKED rows carry a reason or next step. Runs the deterministic board checker in this folder.
---
# Sprint producer (skill)

When to use: a board file (ours or a donor-shaped one) before the sprint starts or before a DONE is claimed.

Steps:
1. `node duties/sprint-producer/run.mjs <board.md> --json` gives `defects` (each with kind, row and detail) plus row and check counts.
2. Fix in this order: `done-without-evidence` and `blocked-without-next` first (claims
   and blocks), then `missing-f2p` and `missing-p2p` (a row without both proofs is
   not workable), then `missing-owner` and `missing-scorecard` (ownership and direction).
3. An OWNER row whose Done-when is only "the owner's word" still needs F2P/P2P lines:
   the scan files it, it is not exempt.

Not for: judging whether a proof command proves the right thing, or whether the
roadmap order is sane (the scan reads cells, not planning quality).
Test: `node --test duties/sprint-producer/test.mjs`.
