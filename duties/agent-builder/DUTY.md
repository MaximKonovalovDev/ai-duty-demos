# Duty: agent-builder

The job duty: turn a repeated job into an agent or an MCP server someone else can run
without reading its code: a skill card that says when to use it, a runner with a bounded
tool list, a test that proves it, and no hidden network, shell or secret inside.

Ads that ask for it: 15 of 34 real fit-60 ads at the first survey (2026-10-04;
`node tools/duty.mjs map` recounts it).
Words in the ads: agent, MCP, multi-agent, tool use, function calling.

## What the AI does

`node duties/agent-builder/run.mjs <dir> [--json]`

1. Checks the scaffold holds `SKILL.md`, `run.mjs`, `test.mjs` and `agent.md`
   (`missing-file` per gap).
2. Checks `SKILL.md` carries `name:` and `description:` front matter (`bad-frontmatter`).
3. Checks `agent.md` names its tools one by one; a wildcard (`tools: *`, allow shell,
   run any command) is `overbroad-scope`.
4. Reads the runner for a network, shell or eval capability (`fetch`, `http.request`,
   `WebSocket`, `child_process`, `execSync`, `eval(`, `rm -rf`); a localhost line is
   allowed, anything else is `unsafe-capability`.
5. Reads every `.md`, `.mjs` and `.json` for a key-like secret in the open (`secret-leak`).
6. Parses `mcp.json` / `package.json` / `manifest.json` when present (`broken-manifest`
   when the JSON does not parse).

## Proof

- Test: `node --test duties/agent-builder/test.mjs` (planted scaffold: 4 defects with
  the expected kinds; clean scaffold: 0 findings; temp scaffolds cover the manifest,
  secret and localhost cases).
- Receipt: `receipt.json`, a run on our real scaffold `duties/bug-triage`, written by
  `node tools/duty.mjs check agent-builder --write-receipt`.

## Honest limits

- It reads text, not behavior: a runner that builds a network call at runtime
  (string concatenation, dynamic import of a fetcher) passes the scan.
- Scope judgment is word-based (`tools: *`, allow shell). A polite-sounding agent card
  that still tells the model to "use whatever it needs" is read as bounded.
- It does not run the scaffold and does not judge tool quality: only that the files,
  the names and the limits are present and parse.
- No model: it is a deterministic core. The agent in `agent.md` adds the judgment
  (which defect blocks a release, what the smallest fix is).
- Donors named by the team design: skillworks MCP part, center `mcp/`
  (shape of a tool server, manifest habit). Their code was not read and none was
  copied; the checks here are the generic ones (files present, front matter parses,
  tools named, no exfiltration, no secret, manifest parses).
