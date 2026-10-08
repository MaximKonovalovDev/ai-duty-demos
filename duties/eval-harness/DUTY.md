# Duty: eval-harness

The job duty: measure an AI system whose answers change from run to run: score each answer against a rubric, say how
consistent the system is, decide pass or fail, and tell a real regression from noise.

Ads that ask for it: 8 of 34 real fit-60 ads at the survey (`node tools/duty.mjs map` recounts it). Words in the ads:
evaluation, evals, benchmark, rubric, LLM-as-a-judge, red-team. The NICE ad names it twice (golden-set evaluation,
statistical confidence thresholds).

## What the AI does

`node duties/eval-harness/run.mjs <cases.json> <answers.json> [--baseline b.json] [--save-baseline out.json] [--threshold 0.8] [--json]`

1. Cases carry checks (contains, notContains, regex, notRegex, maxLines, minLines, json). An answer passes when every check passes;
   each failed check is counted by name.
2. Over many runs per case it reports the pass rate with a Wilson 95% interval, per-case consistency, and the flaky cases
   (sometimes pass, sometimes fail).
3. The pass gate fails below the threshold (exit 1).
4. With a baseline (`--save-baseline` writes one) it calls a regression only when the current interval lies entirely below the
   baseline's: a real drop, not a lucky or unlucky sample.

## Proof

- Test: `node --test duties/eval-harness/test.mjs`. Fixtures: 10 cases x 5 runs of a stable system (48 of 50 pass), a degraded
  version (33 of 50: the harness calls REGRESSION, fails the gate, names 9 flaky cases) and a second sample of the stable system
  (46 of 50: no regression, gate passes, no false alarm). Also the Wilson math against known values and every check kind.
- Receipt: a run on the real judge replies our loops already produced (20 records in `sprint/queue/done`), scored against the
  judge reply contract of this repo (verdict line, at most 15 lines, a revert line, a command, no email or phone), older half
  against newer half. Written by `node tools/duty.mjs check eval-harness --write-receipt`.

## Honest limits

- It scores answers that already exist; it does not call a model. To evaluate a live system, record its answers over N runs into
  the answers file first.
- Checks are structural (format, length, required or forbidden text). It does not judge whether an answer is correct unless a
  case encodes the right answer as a check. An LLM-as-a-judge step would be a second, separate duty.
- The interval test is conservative: small samples (n under about 20) rarely show a regression even when one is real.
- Donor ideas: skillworks eval gate, design-studio judge, promptfoo assertion kinds. No code was copied, nothing installed.
