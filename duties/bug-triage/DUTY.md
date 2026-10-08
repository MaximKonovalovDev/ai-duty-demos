# Duty: bug-triage

The job duty: read the logs after a failure or an incident, work out which problems are real, which are repeats and which
are new, and write each one up so an engineer can reproduce it without a follow-up question.

Ads that ask for it: 18 of 34 real fit-60 ads at the first survey (2026-10-04; `node tools/duty.mjs map` recounts it).
Words in the ads: bug, defect, triage, root cause, incident.

## What the AI does (and what replaces which human step)

1. Reads a log (UTF-8 or UTF-16, the Flax editor writes UTF-16) and fingerprints every line: timestamps, session ids, hex ids,
   ip addresses, paths, durations and numbers are stripped, so 6 "db connect failed" lines with different hosts are one pattern.
2. Ranks the problem patterns (error before warn, then by count), groups them into families (the first two words),
   and separates new from known (`--known known.json`).
3. Writes a repro-ready finding per pattern: first line number and time, last time, a sample line, the lines just before it,
   the stack lines under it, and a replay hint.

`node duties/bug-triage/run.mjs <log> [--known known.json] [--save-known out.json] [--json]`

## Proof

- Test: `node --test duties/bug-triage/test.mjs` (planted log: 9 problem lines collapse to exactly 2 patterns, counts 6 and 3,
  "0 errors" lines are not problems, stack lines attach to the first error; clean log with its known pattern: 0 new).
- Receipt: `receipt.json`, a run on our real keeper log `sprint/loop-keeper.log` (846 lines), written by
  `node tools/duty.mjs check bug-triage --write-receipt`.

## Honest limits

- Severity is word-based (error, fatal, failed, warn, stale, timeout, refused...). It does not understand meaning:
  a log that never says "error" for an error is read as info.
- It cannot reproduce a bug. The repro line is a replay hint (where to look and what came before), not a script.
- Timestamps not at the start of a line are not stripped; a fingerprint can split in two for that reason.
- No model: it is a deterministic core. The agent in `agent.md` adds the judgment (which finding matters, what to try).
- Donor named by the team design: forge `log_triage` (fingerprint, dedupe, repro-ready report). Its code was not read and none was copied; the approach here is the generic one (strip what varies, hash the rest, count).
