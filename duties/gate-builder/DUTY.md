# Duty: gate-builder

The job duty: build the quality gate a change must pass before it ships, and keep it from rotting. The ads call it CI/CD
(pipelines, GitHub Actions, Jenkins). Ours is a local gate with a ratchet: no hosted CI (a rule of this repo), the same
discipline.

Ads that ask for it: 21 of 34 real fit-60 ads at the survey (the biggest duty; `node tools/duty.mjs map` recounts it).
Words in the ads: CI/CD, continuous integration, GitHub Actions, Jenkins, pipeline.

## What the AI does

`node duties/gate-builder/run.mjs <repo> [--write <gate.mjs>] [--json]`

1. Detects how the repo tests itself: Node (`tests/*.test.mjs` or `test/`), Python (pytest files or `pytest.ini`), Rust
   (`Cargo.toml`), .NET (`*.sln`). Nothing detected: it says so and writes nothing.
2. Writes one dependency-free `gate.mjs`: runs those tests, counts them, and
   - FAILs when a test fails;
   - FAILs when the number of tests goes down against `.gate-baseline.json` (a deleted or skipped test: the ratchet only moves up);
   - raises the baseline when the number goes up.
   It prints `GATE PASS (tests N, baseline B)` or `GATE FAIL: <reason>`.

## Proof

- Test: `node --test duties/gate-builder/test.mjs`. A repo with 3 tests and a baseline of 3: planted defect 1 (one test file
  deleted, 3 -> 2) is caught by the ratchet, planted defect 2 (a failing test added) is caught by the test step, the clean repo
  passes and a new test raises the baseline to 4. The gate source has no URL, no hosted-CI word and only `node:` imports.
- Receipt: a run on this repo's own test suite (jobhunt), gate written to a temp folder, baseline in a temp file, written by
  `node tools/duty.mjs check gate-builder --write-receipt`.

## Honest limits

- It gates tests only. No lint, format or type step is invented; add them by hand when the repo has them.
- Test counts are read from the runner's summary line (node, pytest, cargo, dotnet). A step without a count is reported and
  the ratchet is skipped for it, never guessed.
- A baseline file is state: delete it and the ratchet starts over. It belongs in version control with the gate.
- Donor ideas: factory ratchet, forge quality_ratchet, our tools/check.mjs. No code was copied.
