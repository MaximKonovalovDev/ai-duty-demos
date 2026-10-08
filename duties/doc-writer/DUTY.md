# Duty: doc-writer

The job duty: turn technical work into documentation someone else can run
without asking what a word means or wrapping a line: plain words, short
lines, and runbooks with Purpose, Steps and Rollback sections.

Ads that ask for it: 15 of 34 real fit-60 ads at the first survey (2026-10-04;
`node tools/duty.mjs map` recounts it).
Words in the ads: documentation, technical writing, runbook.

## What the AI does

`node duties/doc-writer/run.mjs <doc.md> [--json]`

1. Files `jargon` for every line that uses a banned corporate filler word
   (leverage, utilize, synergy, paradigm, seamless, robust, cutting-edge,
   state-of-the-art, circle back, deep dive, bandwidth, move the needle,
   learnings, ideate, disruptive), case-insensitive, one defect per word per line.
2. Files `long-line` for every line over 120 characters (wrappable, RTL-safe).
3. Files `missing-section` once per missing heading when the doc says runbook:
   the runbook must carry `## Purpose`, `## Steps` and `## Rollback`.

Three checks, one per rule group above.

## Proof

- Test: `node --test duties/doc-writer/test.mjs` (planted runbook: 4 defects
  of the expected kinds; clean runbook: 0 findings; temp docs cover the
  120/121 boundary, case-insensitivity, non-runbook exemption and per-section filing).
- Receipt: `receipt.json`, a run on our real doc `team/fetch.md`, written by
  `node tools/duty.mjs check doc-writer --write-receipt`. The real note keeps
  over-long status lines, so the receipt honestly records open defects instead
  of a clean sheet.

## Honest limits

- It reads words, not writing quality: a plain-worded doc that still explains
  nothing passes the scan.
- Jargon is list-based: a filler word outside the banned list is not filed,
  and a banned word used in a quoted error string is still filed.
- It does not judge whether the runbook steps are correct or complete, whether
  the order is sane, or whether the Hebrew reads well: only that the words are
  plain, the lines are short and the sections are present.
- No model: it is a deterministic core. The agent in `agent.md` adds the judgment
  (which finding blocks a release, what the smallest rewrite is).
- Text-only gate, no rewrite: it files findings, it never rewrites a sentence.
  Donors named by the team design: forge `plain_english_check`, center `repomap`
  (ranked-map idea). Their code was not read and none was copied; the checks
  here are the generic ones (banned words absent, lines short, sections present).
