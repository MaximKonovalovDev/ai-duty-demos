---
name: eval-harness
description: Use when AI answers need to be measured, not eyeballed: score recorded answers against a rubric over many runs, get the pass rate with a confidence interval, find flaky cases, enforce a pass gate, and detect a statistically real regression against a baseline.
---
# Eval harness (skill)

When to use: a prompt, agent or model changed and you need to know if it got worse; or a judge or agent reply must keep a format.

Steps:
1. Write cases (`id` and `checks`) and record N answers per case: `answers.json` is `{"answers":[{"case","run","text"}]}`.
2. `node duties/eval-harness/run.mjs cases.json answers.json --save-baseline base.json` once for the good version.
3. After a change: `... --baseline base.json`. REGRESSION means the new interval is entirely below the old one.
4. Fix flaky cases first: a case that sometimes passes is a rubric or prompt problem, not noise.

Not for: judging correctness without a written-down right answer, or calling a live model.
Test: `node --test duties/eval-harness/test.mjs`.
