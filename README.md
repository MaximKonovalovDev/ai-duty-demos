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

| Duty | What it does |
|---|---|
| `abuse-analyst` | Finds bot and abuse signals in a request log: bursts no human reaches, sweeps, machine rhythm. |
| `agent-builder` | Turns a repeated job into an agent or MCP server that someone else can run: a skill card and a bounded runner. |
| `bug-triage` | Reads failure logs, separates real, repeated and new problems, and writes each up so an engineer can reproduce it. |
| `campaign-builder` | Builds marketing campaigns as files only. Every link carries UTM tags. It never posts or sends. |
| `data-cleaner` | Finds exact and near duplicates and missing fields in a messy dataset, and writes a clean file. |
| `design-reviewer` | Reviews a page before it ships: accessibility gaps and design-token problems. |
| `doc-writer` | Turns technical work into documentation someone else can follow: plain words, short lines. |
| `eval-harness` | Measures an AI whose answers change from run to run: score against a rubric, consistency, pass or fail, and real regression versus noise. |
| `gate-builder` | Builds a local quality gate with a ratchet: counts may only go down. |
| `qa-web-tester` | Tests a page in a real browser and files what is broken: console errors, bad links, inputs without labels, sideways scrolling, missing `lang`, `dir` or title. |
| `repo-rag` | Answers "which file says X" with BM25 ranking and no model. |
| `sprint-producer` | Turns a roadmap into backlog rows. Each row has an owner and a plain definition of done. |
| `test-planner` | Turns requirements into a test plan: cases, edge values, regression checks, and a list of requirements nobody can test. |

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
