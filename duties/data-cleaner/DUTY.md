# Duty: data-cleaner

The job duty: take a messy applicant or posting dataset and hand back what is
wrong with it plus a clean file: exact and near dupes found, missing fields,
bad emails and out-of-range numbers filed per row, never deleting the source.

Ads that ask for it: 4 of 34 real fit-60 ads at the first survey (2026-10-04;
`node tools/duty.mjs map` recounts it).
Words in the ads: data quality, data clean, dataset.

## What the AI does

`node duties/data-cleaner/run.mjs <dataset.csv|jsonl> [--json] [--clean <out>]`

1. Files `exact-dupe` for every row that repeats an earlier row exactly
   (case, punctuation and space-insensitive).
2. Files `near-dupe` once for a row that shares an earlier row's email, or the
   same company+title, or the same name: same person or posting, other case or
   other id.
3. Files `missing-field` once per empty required field (`id`, `name`, `email`
   for generic datasets; `id`, `title`, `company`, `url` for the jobs real target).
4. Files `bad-email` for an email that is not shaped like one.
5. Files `out-of-range` for an `age` outside 0-120 (negative `pay.min`/`pay.max`
   on the jobs real target).
6. `--clean <out>` writes the defect-free rows to a new file; the source file
   is never changed or deleted.

Five checks, one per rule group above.

## Proof

- Test: `node --test duties/data-cleaner/test.mjs` (planted file: 7 rows, all
  5 planted defects found one per kind; clean file: 0 findings; temp files cover
  the 120/121 age boundary, case-insensitive near match, empty-email exemption
  and source-untouched clean write).
- Receipt: `receipt.json`, a run on our real dataset `data/jobs.jsonl` (6543
  rows: exact id/url dupes already removed upstream, near company+title groups
  kept by design), written by
  `node tools/duty.mjs check data-cleaner --write-receipt`.

## Honest limits

- It reads shape, not truth: a well-formed row with a wrong-but-valid email or
  age passes the scan.
- Near match is key-based, not fuzzy: a renamed applicant with a new email is
  not linked, and two different people sharing one mailbox are grouped.
- CSV parsing is header-plus-commas: quoted commas inside a cell are not
  supported (JSONL has no such limit).
- The jobs real target keeps near dupes on purpose (same title+company recurs
  across teams with distinct postings, JH-81): the report counts them, the
  clean file drops only defective rows.
- No model: it is a deterministic core. The agent in `agent.md` adds the judgment
  (which finding blocks the import, what the smallest fix is).
- Donor named by the team design: our `tools/fetch.mjs` dedupeJobs
  (exact-remove + near-detect, JH-81). Its idea was reimplemented for generic
  datasets here; 0 lines copied.
