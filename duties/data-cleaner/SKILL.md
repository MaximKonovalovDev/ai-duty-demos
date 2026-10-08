---
name: data-cleaner
description: Use when someone hands you a messy applicant or posting dataset and wants to know what is wrong before it is imported: exact plus near dupes, missing fields, bad emails, out-of-range numbers, with a clean file written beside the untouched source. Runs the deterministic data cleaner in this folder.
---

# Data cleaner (skill)

When to use: a CSV or JSONL dataset (ours or a donor-shaped one) before it is imported or before a DONE is claimed.

Steps:

1. `node duties/data-cleaner/run.mjs <dataset.csv|jsonl> --json` gives `defects` (each with kind, row and detail) plus row and check counts.
2. Fix in this order: `missing-field` first (a row without its key fields cannot
   be used), then `exact-dupe` (keep the first, drop the repeat), then
   `near-dupe` (same email, company+title or name: confirm before dropping),
   then `bad-email` (ask again), then `out-of-range` (check against the source).
3. Write the fix with `--clean <out>`: only defect-free rows land there, the
   source file is never changed.
4. A near-dupe group on postings data may be real (same role across teams):
   count, do not auto-drop.

Not for: judging whether a well-formed value is true, consented or fresh (the scan reads shape, not truth).
Test: `node --test duties/data-cleaner/test.mjs`.
