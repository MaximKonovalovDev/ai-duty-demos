---
name: agent-builder
description: Use when someone hands you an agent or MCP scaffold directory and wants to know if it is shippable: required files present, skill card front matter parses, tools named one by one, no hidden network or shell capability, no secret in the open, manifest parses. Runs the deterministic scaffold checker in this folder.
---
# Agent builder (skill)

When to use: a scaffold directory (ours or a donor-shaped one) before it is shared or released.

Steps:
1. `node duties/agent-builder/run.mjs <dir> --json` gives `defects` (each with kind, file and detail) plus file and check counts.
2. Fix in this order: `secret-leak` and `missing-file` first (block a release), then
   `unsafe-capability` and `overbroad-scope` (rewrite with named tools), then
   `bad-frontmatter` and `broken-manifest` (discovery).
3. A localhost line (`localhost`, `127.0.0.1`) is allowed; anything phoning an outside
   host is a finding, even in a comment.

Not for: judging what the agent does at runtime, or whether its tools are the right
ones (the scan reads text, not behavior).
Test: `node --test duties/agent-builder/test.mjs`.
