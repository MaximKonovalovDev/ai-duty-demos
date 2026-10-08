---
name: test-planner
description: Use when a spec, a ticket or a list of requirements needs a test plan: cases per requirement, boundary values around every limit, regression checks, and a list of requirements that are too vague to test. Runs the deterministic planner in this folder.
---
# Test planner (skill)

When to use: before building or reviewing a change; when a requirement list arrives and nobody has said how to test it.

Steps:
1. `node duties/test-planner/run.mjs <spec.md>` prints the plan; `--json` for another tool.
2. Fix the flagged requirements first (add a number or an example), then re-run.
3. Make each case concrete, and finish with an F2P line (fails before, passes after) and a P2P line (keeps passing).

Not for: deciding what the product should do, or generating test code.
Test: `node --test duties/test-planner/test.mjs`.
