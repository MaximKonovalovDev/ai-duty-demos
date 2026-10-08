---
name: bug-triage
description: Use when someone gives you a log file after a failure and wants the real problems found, duplicates merged, new problems separated from known ones, and each one written up so an engineer can reproduce it. Runs the deterministic fingerprint tool in this folder.
---
# Bug triage (skill)

When to use: a log (build, server, editor, loop keeper) with hundreds of lines and a few real problems.

Steps:
1. `node duties/bug-triage/run.mjs <log> --json` gives `problems` (ranked, with first line, sample, lines before, stack) and `families`.
2. For a log you triaged before, keep a known list: `--save-known known.json` once, then `--known known.json` next time; only
   `status: "new"` problems are findings.
3. Write each new finding as: pattern, first line and time, sample, what came just before, the first thing to check.

Not for: finding bugs that never reach a log, or reproducing a bug (the repro line is a replay hint only).
Test: `node --test duties/bug-triage/test.mjs`.
