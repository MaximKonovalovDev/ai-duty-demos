---
name: doc-writer
description: Use when someone hands you a markdown doc or runbook and wants to know if it is shippable: plain words with no banned jargon, lines at most 120 characters, runbooks carry Purpose plus Steps plus Rollback sections. Runs the deterministic doc checker in this folder.
---

# Doc writer (skill)

When to use: a doc or runbook draft (ours or a donor-shaped one) before it ships or before a DONE is claimed.

Steps:

1. `node duties/doc-writer/run.mjs <doc.md> --json` gives `defects` (each with kind, line and detail) plus line and check counts.
2. Fix in this order: `missing-section` first (a runbook without Purpose, Steps
   and Rollback is not runnable), then `jargon` (one plain word per hit), then
   `long-line` (wrap under 120 characters).
3. A doc that never says runbook needs no sections: only runbooks are held to
   the three headings.

Not for: judging whether the steps are correct, whether the order is sane, or
whether the Hebrew reads well (the scan reads words, lines and headings, not quality).
Test: `node --test duties/doc-writer/test.mjs`.
