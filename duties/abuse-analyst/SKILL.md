---
name: abuse-analyst
description: Use when someone hands you a request or event log from our own local site or tool and wants the abuse and bot signals in it: rate bursts, machine-regular rhythm, shared templates, deny clusters and id sweeps. Runs the deterministic abuse analyst in this folder; files only, never probes a site.
---

# Abuse analyst (skill)

When to use: a timestamped text log from our own loop, fetcher or local
site before a DONE is claimed, or when an ad asks for abuse or bot proof.

Steps:

1. `node duties/abuse-analyst/run.mjs <logfile> --json` gives `defects`
   (each with kind, line and detail) plus line, event and check counts.
2. Read in this order: `auth-burst` and `sweep` first (attack shapes), then
   `template-reuse` across buckets (one script, many lines), then
   `rate-burst` with `machine-rhythm` (together they mean automation;
   either alone may be a benign cron or batch).
3. A clean scan still proves nothing about slow bots, valid credentials or
   off-log activity: say so, do not invent a signal.
4. Findings name lines and kinds only, never log values.

Not for: anyone else's service, live probing, or judging intent from shape
alone (the scan flags shape; the agent judges intent).
Test: `node --test duties/abuse-analyst/test.mjs`.
