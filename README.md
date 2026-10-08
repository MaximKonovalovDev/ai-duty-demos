# AI duty demos

Thirteen small, working demos of duties that job ads for AI-quality, QA-automation and agent-builder roles ask for.

Each demo is one folder in `duties/`. Each one has a tool you can run and a test that proves it works.

## How the proof works

Every test uses **planted defects**. The sample input has a known set of problems hidden in it. The test passes only if the tool:

1. finds every planted problem, of the right kind, and
2. raises **zero** findings on the clean version of the same input.

So a tool that says "all good" about everything fails. So does a tool that flags everything.

## Run it

You need Node.js 20 or newer. There is nothing to install.

```
npm test
```

or `node scripts/test-all.mjs`, or one duty: `node duties/bug-triage/test.mjs`.

`qa-web-tester` drives a real browser, so it needs Microsoft Edge or Google Chrome installed. If it cannot find one, set `DEMO_BROWSER` to the browser's path. It only opens local files and `localhost`, never anyone else's site.

## The duties

<!-- duties:start -->
| Duty | What it does | Demo |
|---|---|---|
| `abuse-analyst` | Finds bot and abuse signals in a request log: bursts no human reaches, sweeps, machine rhythm. | [`duties/abuse-analyst/`](duties/abuse-analyst/) |
| `agent-builder` | Turns a repeated job into an agent or MCP server that someone else can run: a skill card and a bounded runner. | [`duties/agent-builder/`](duties/agent-builder/) |
| `bug-triage` | Fingerprints and clusters the errors in a log, separates new from known, files repro-ready findings. | [`duties/bug-triage/`](duties/bug-triage/) |
| `campaign-builder` | Builds marketing campaigns as files only; every link carries UTM tags; it never posts or sends. | [`duties/campaign-builder/`](duties/campaign-builder/) |
| `data-cleaner` | Finds exact and near duplicates and missing fields in a messy dataset, and writes a clean file. | [`duties/data-cleaner/`](duties/data-cleaner/) |
| `design-reviewer` | Reviews a page before it ships: accessibility gaps and design-token problems. | [`duties/design-reviewer/`](duties/design-reviewer/) |
| `doc-writer` | Turns technical work into documentation someone else can follow: plain words, short lines. | [`duties/doc-writer/`](duties/doc-writer/) |
| `eval-harness` | Scores AI answers against a rubric over many runs, measures consistency, and flags a statistically real drop against a baseline. | [`duties/eval-harness/`](duties/eval-harness/) |
| `gate-builder` | Writes a local gate script for any repo (detects its tests, runs them, ratchets the test count so it can only go up); no hosted CI. | [`duties/gate-builder/`](duties/gate-builder/) |
| `qa-web-tester` | Drives a real browser over a page and files console errors, bad requests, broken links, missing labels and RTL overflow. | [`duties/qa-web-tester/`](duties/qa-web-tester/) |
| `repo-rag` | Answers which file says X, with BM25 ranking and no model. | [`duties/repo-rag/`](duties/repo-rag/) |
| `sprint-producer` | Turns a roadmap into backlog rows; each row has an owner and a plain definition of done. | [`duties/sprint-producer/`](duties/sprint-producer/) |
| `test-planner` | Turns a requirement list into test cases (happy, negative, boundary, regression) and flags requirements nobody can test. | [`duties/test-planner/`](duties/test-planner/) |
<!-- duties:end -->

## What is in each folder

- `DUTY.md` — the duty in plain words, and what the test proves.
- `run.mjs` — the tool.
- `test.mjs` — the planted-defect test.
- `fixtures/` — the sample inputs. All of it is invented: made-up names, `example.com`, made-up companies.
- `SKILL.md` and `agent.md` — instructions that let an AI coding agent do the same duty.
- `receipt.json` — a record of one run on the author's own private project. It holds counts and a hash only. The files it ran on are not included, so a few lines in `DUTY.md` point at paths you will not find here.

## How these were made

They were written and run with AI coding agents (Claude Code and OpenCode), and checked by their own tests. They are small by design. They are not production software, and nothing here claims real users or real traffic.

## License

MIT, see `LICENSE`.
