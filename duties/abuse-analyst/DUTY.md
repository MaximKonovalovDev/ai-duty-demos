# Duty: abuse-analyst

The job duty: take a request or event log from our own local site or tool and
hand back the abuse and bot signals in it: rate bursts no human pace reaches,
machine-regular request rhythm, one template reused across time buckets,
clusters of denied requests and sweeps across many ids.

Ads that ask for it: 2 of 34 real fit-60 ads at the first survey (2026-10-04;
`node tools/duty.mjs map` recounts it live).

Words in the ads: abuse, bot detection, spam.

## What the AI does

`node duties/abuse-analyst/run.mjs <logfile> [--json]`

1. Files `rate-burst` when 12 or more timestamped lines land inside one
   60-second window (first window only).
2. Files `machine-rhythm` when 8 consecutive gaps are near-identical
   (coefficient of variation under 0.15): metronomic writers, not people.
3. Files `template-reuse` when one line shape repeats 5 or more times across
   2 or more minute buckets: a shared script, not one retry storm.
4. Files `auth-burst` when 4 or more denied lines (401, 403, unauthorized,
   forbidden, failed login, invalid token) land inside 5 minutes.
5. Files `sweep` when 8 or more distinct id tokens (digit runs) appear inside
   2 minutes: enumeration across many ids.

Five checks, one per signal above. Findings name line numbers, counts and
kinds only, never log values (no addresses, sessions, bodies or phones).

## Proof

- Test: `node --test duties/abuse-analyst/test.mjs` (planted log: 44 lines,
  all 5 planted signals found one per kind; clean log: 0 findings;
  thresholds hold on synthetic inputs: jittered gaps pass, 3 denies pass,
  one-bucket repetition passes, 7 ids pass).
- Receipt: `receipt.json`, a run on our real loop log
  `sprint/loop-keeper.log`, written by
  `node tools/duty.mjs check abuse-analyst --write-receipt`.

## Honest limits

- It reads shape, not intent: a cron loop ticks metronomically and a batch
  starter writes one shape many times, both benign here and both flagged
  when they cross the thresholds. The agent in `agent.md` judges intent.
- Thresholds are fixed, not learned: a slow bot under 12 lines a minute or
  with jittered gaps passes the scan.
- Digit runs are id-shaped, not ids: version numbers and counts in one
  window can read as a sweep; the finding says tokens, not accounts.
- Timestamped lines only for the time signals: lines without a leading UTC
  stamp still count for the template signal but not for bursts or rhythm.
- Own logs only, files only: it never probes a site, opens a socket or
  sends anything. A log from someone else's service is out of scope.
- No model: it is a deterministic core. The agent in `agent.md` adds the
  judgment (which signal blocks, what the smallest next check is).
- Donor named by the team design: fp-research `drill` (per-class detection
  table, human false-positive counting, dated ledger). Its idea was
  reimplemented for plain timestamped text logs here; 0 lines copied.
