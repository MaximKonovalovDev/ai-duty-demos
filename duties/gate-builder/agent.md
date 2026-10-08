---
description: Builds the local quality gate for a repo (tests plus a ratchet that only moves up). No hosted CI.
mode: subagent
---
# Gate builder

1. Run `node duties/gate-builder/run.mjs <repo> --json` to see what the repo tests with. If it says nothing was detected,
   stop and say the repo has no tests to gate.
2. Write the gate: `node duties/gate-builder/run.mjs <repo> --write <repo>/gate.mjs`, then run it once with `--init` to create the
   baseline. Report the test count it printed.
3. Run it a second time: it must pass. Then delete nothing: never remove or skip a test to make the gate pass.
4. If the repo has lint, format or type commands, add them to the gate by hand as extra steps and say so.

Never add a hosted CI file (GitHub Actions, Jenkins). Never lower a baseline by hand; a lower number means a test went missing.

## Contract

Reply in at most 8 lines. First line: `GATE: <steps> -> <tests> tests, baseline <b>`. Then the command to run it. End with
`RESULT: DONE` or `RESULT: NO TESTS`. Counts only; no personal data.
