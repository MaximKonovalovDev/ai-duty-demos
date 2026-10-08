---
name: repo-rag
description: Use when someone asks which file of a repo says something and you want the ranked answer without a model: BM25 over the repo's text files, top files with score and matched terms. Runs the deterministic retriever in this folder.
---

# Repo RAG (skill)

When to use: a "where in the repo" question (ours or a donor-shaped one) before reading big files: rank first, read the top file, quote the passage.

Steps:

1. `node duties/repo-rag/run.mjs <repo-dir> "<query>" --json` gives `results` (each with file, score and hits) plus the indexed file count.
2. Read in rank order: rank 1 first; stop at the first file that answers,
   quote at most 5 lines with file and line.
3. An empty ranking means the vocabulary is wrong, not that the answer is
   absent: rephrase with the repo's own words and rank again.

Not for: answering from the ranking alone (ranks are word overlap, not
understanding), comparing scores across repos or queries, or files the
indexer skips (node_modules, .git, archive, over 300 KB).
Test: `node --test duties/repo-rag/test.mjs`.
