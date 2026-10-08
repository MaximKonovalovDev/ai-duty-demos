# Duty: repo-rag

The job duty: answer "which file of this repo says X" without a model:
rank the repo's text files against the question with BM25 and read the
top file first instead of the whole repo.

Ads that ask for it: 9 of 34 real fit-60 ads at the first survey (2026-10-04;
`node tools/duty.mjs map` recounts it).
Words in the ads: rag, retrieval, vector, embedding.

## What the AI does

`node duties/repo-rag/run.mjs <repo-dir> "<query>" [--top N] [--json]`

1. Indexes the repo's text files (md, mjs, js, json, txt, py, cs, rs, yaml;
   skips node_modules, .git, archive and files over 300 KB).
2. Scores every file against the query with BM25 (k1 1.2, b 0.75, standard
   IDF over the repo) and reports the top files with score and matched
   terms, rare terms first.
3. Ranks nothing when the repo has none of the query vocabulary: an empty
   ranking, never a guess.

Three behaviors, one per rule group above.

## Proof

- Test: `node --test duties/repo-rag/test.mjs` (5 reference queries over a
  6-file planted repo each rank their own file first; a query with no
  vocabulary in the repo ranks nothing; plus the rare-beats-common,
  case-insensitivity, empty-query, top-cap, score-order and temp-copy cases).
- Receipt: `receipt.json`, a run over our real `tools/` dir (24 files,
  3 reference queries, each naming one tool file only it answers), written by
  `node tools/duty.mjs check repo-rag --write-receipt`.

## Honest limits

- It matches words, not meaning: "car" never finds "automobile", a paraphrase
  with no shared vocabulary ranks nothing.
- No stemming and no stop-word list: "refresh" does not match "refreshes";
  common words count only through low IDF, not removal.
- It ranks files, not answers: the top file still has to be read, and a file
  that mentions the words without answering outranks a short file that does
  when the vocabulary overlaps badly.
- Scores are comparable only inside one repo and one query: a 14.6 on one
  query means nothing next to a 0.2 on another.
- No model, no embeddings, no network: the agent in `agent.md` adds the
  judgment (read the top file, quote the passage, say when to ask the owner).
  Donor named by the team design: center `repomap` (a ranked map over a repo
  so agents read less). Its code was not read and none was copied; repomap
  ranks files by commit heat, this ranks them by query score.
