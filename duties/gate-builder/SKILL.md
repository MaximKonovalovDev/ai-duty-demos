---
name: gate-builder
description: Use when a repo needs a quality gate that runs its tests and fails if a test fails or if the number of tests drops (a ratchet that only goes up), without hosted CI. Detects Node, Python, Rust and .NET test setups and writes one dependency-free gate.mjs.
---
# Gate builder (skill)

When to use: a repo has tests but nothing stops a change from deleting them; or the ad asks for CI/CD and the rule is local gates.

Steps:
1. `node duties/gate-builder/run.mjs <repo> --write <repo>/gate.mjs`
2. `node gate.mjs --init` once (creates `.gate-baseline.json`), then `node gate.mjs` before every commit.
3. A `ratchet: tests dropped A -> B` failure means a test went missing: restore it, never edit the baseline down.

Not for: lint or format rules (add them by hand), or deploy pipelines.
Test: `node --test duties/gate-builder/test.mjs`.
