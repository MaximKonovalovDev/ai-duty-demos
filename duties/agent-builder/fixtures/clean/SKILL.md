---
name: helper
description: A small helper that answers from local notes only, using the read and grep tools.
---
# Helper (skill)

When to use: a question answered from the notes folder next to the runner.

Steps:
1. `node run.mjs "<question>"` prints the first matching note line.
2. Only the `read` and `grep` tools are used; nothing leaves the machine.

Not for: questions the notes do not answer.
Test: `node --test test.mjs`.
