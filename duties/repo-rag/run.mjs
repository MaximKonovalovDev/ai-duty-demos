// duties/repo-rag/run.mjs: the deterministic core of the repo-rag duty.
// Ranks the files of a repo against a question with BM25 (Robertson/Sparck
// Jones): term frequency saturated (k1), length-normalized (b), inverse
// document frequency over the repo. No model, no embeddings, no network,
// read only. Files only: it ranks files, it never answers the question.
// Donor idea: center repomap.mjs (a ranked map over a repo so agents read
// less). Internal, ideas only: repomap ranks files by commit heat, this ranks
// them by query score; no donor code was read and none is copied.
// Usage: node duties/repo-rag/run.mjs <repo-dir> "<query>" [--top N] [--json]
//        node duties/repo-rag/run.mjs --real --json     (the real target of the receipt)
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REAL_DIR = "tools";
const K1 = 1.2;
const B = 0.75;
const MAX_FILE_BYTES = 300 * 1024;
const TEXT_EXTS = new Set([".md", ".mjs", ".js", ".cjs", ".json", ".txt", ".py", ".cs", ".rs", ".yaml", ".yml"]);
const SKIP_DIRS = new Set(["node_modules", ".git", "archive"]);

// Three reference queries over our own repo. Each names one file only the
// right tool file answers (distinctive terms checked against tools/:
// sourceHash lives in duty.mjs, fit/families scoring in match.mjs,
// the jh-fetch gate in check.mjs).
export const REAL_QUERIES = [
  { q: "which file checks the receipt sourceHash of a duty", top: "tools/duty.mjs" },
  { q: "which tool file matches weights across seven families sorted by score with reasons", top: "tools/match.mjs" },
  { q: "which file runs the fetch gate over the queue", top: "tools/check.mjs" },
];

/** Lowercase unicode word tokens. */
export function tokenize(text) {
  return String(text ?? "").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

function walk(dir, out = []) {
  for (const f of readdirSync(dir).sort()) {
    const full = join(dir, f);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(f)) walk(full, out);
    } else out.push(full);
  }
  return out;
}

/** Collect indexable text files under repoDir. -> [{rel, text}] sorted by rel. */
export function collectDocs(repoDir) {
  const root = resolve(repoDir);
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new Error(`not a repo dir: ${repoDir}`);
  const docs = [];
  for (const full of walk(root)) {
    const rel = full.slice(root.length + 1).replace(/\\/g, "/");
    const dot = rel.lastIndexOf(".");
    if (dot < 0 || !TEXT_EXTS.has(rel.slice(dot).toLowerCase())) continue;
    if (statSync(full).size > MAX_FILE_BYTES) continue;
    docs.push({ rel, text: readFileSync(full, "utf8") });
  }
  return docs.sort((a, b) => (a.rel < b.rel ? -1 : 1));
}

/** Index term stats over docs. -> {tf: Map rel -> Map term -> n, df: Map term -> n, lens, avg, n} */
export function buildIndex(docs) {
  const tf = new Map();
  const df = new Map();
  const lens = new Map();
  let total = 0;
  for (const d of docs) {
    const counts = new Map();
    const toks = tokenize(d.text);
    for (const t of toks) counts.set(t, (counts.get(t) ?? 0) + 1);
    tf.set(d.rel, counts);
    for (const t of counts.keys()) df.set(t, (df.get(t) ?? 0) + 1);
    lens.set(d.rel, toks.length);
    total += toks.length;
  }
  return { tf, df, lens, avg: docs.length ? total / docs.length : 0, n: docs.length };
}

const idf = (df, n) => Math.log(1 + (n - df + 0.5) / (df + 0.5));

/**
 * Rank docs against a query. -> [{file, score, hits}] sorted by score desc
 * (ties by file name), score > 0 only, at most top entries. hits are the
 * query terms present in the file, rare first.
 */
export function retrieve(docs, index, query, { top = 5, k1 = K1, b = B } = {}) {
  const terms = [...new Set(tokenize(query))];
  if (!terms.length || !docs.length) return [];
  const out = [];
  for (const d of docs) {
    const counts = index.tf.get(d.rel);
    const len = index.lens.get(d.rel) || 1;
    let score = 0;
    const hits = [];
    for (const t of terms) {
      const f = counts.get(t) ?? 0;
      if (!f) continue;
      const w = idf(index.df.get(t) ?? 0, index.n);
      score += w * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * len) / index.avg)));
      hits.push([t, w]);
    }
    if (score > 0) out.push({ file: d.rel, score, hits: hits.sort((x, y) => y[1] - x[1]).map(([t]) => t) });
  }
  out.sort((a, b) => b.score - a.score || (a.file < b.file ? -1 : 1));
  return out.slice(0, Math.max(1, top)).map((r) => ({ ...r, score: Math.round(r.score * 1000) / 1000 }));
}

/** Index a dir and rank one query. */
export function queryDir(repoDir, query, opts = {}) {
  const docs = collectDocs(repoDir);
  return { docs: docs.length, results: retrieve(docs, buildIndex(docs), query, opts) };
}

function reportText(repo, query, r) {
  const out = [`# Retrieval: "${query}" over ${repo}`, "", `${r.docs} file(s) indexed, ${r.results.length} ranked.`];
  r.results.forEach((x, i) => out.push(`${i + 1}. ${x.file} (score ${x.score}; hits: ${x.hits.join(", ")})`));
  if (!r.results.length) out.push("No file in the repo uses the query vocabulary: no ranking, no guess.");
  return out.join("\n");
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h") || !argv.length) {
    console.log("Usage: node duties/repo-rag/run.mjs <repo-dir> \"<query>\" [--top N] [--json]\n       node duties/repo-rag/run.mjs --real --json");
    return;
  }
  const json = argv.includes("--json");
  if (argv.includes("--real")) {
    const docs = collectDocs(join(ROOT, REAL_DIR));
    const index = buildIndex(docs);
    let top1 = 0;
    const ranks = [];
    for (const { q, top } of REAL_QUERIES) {
      const res = retrieve(docs, index, q, { top: 5 });
      const rank = res.findIndex((r) => `${REAL_DIR}/${r.file}` === top || r.file === top.replace(/^tools\//, ""));
      if (rank === 0) top1 += 1;
      ranks.push(`${q} -> ${res[0]?.file ?? "(none)"} (rank ${rank < 0 ? "miss" : rank + 1})`);
    }
    const out = {
      target: { kind: "retrieval", path: REAL_DIR, sha256: createHash("sha256").update(docs.map((d) => d.rel).join("\n")).digest("hex").slice(0, 16) },
      numbers: { files: docs.length, terms: index.df.size, queries: REAL_QUERIES.length, top1 },
      summary: `real repo ${REAL_DIR}/: ${docs.length} files, ${index.df.size} terms, ${REAL_QUERIES.length} reference queries, ${top1} at rank 1`,
      ranks,
    };
    console.log(json ? JSON.stringify(out, null, 2) : out.summary);
    return;
  }
  const topIdx = argv.indexOf("--top");
  const top = topIdx < 0 ? 5 : Number(argv[topIdx + 1]);
  if (!Number.isFinite(top) || top < 1) { console.error("--top needs a positive number"); process.exit(1); }
  const positional = argv.filter((a, i) => !a.startsWith("--") && (topIdx < 0 || i !== topIdx + 1));
  const [repo, query] = positional;
  if (!repo || !query) { console.error("need a repo dir and a query"); process.exit(1); }
  let r;
  try {
    r = queryDir(repo, query, { top });
  } catch (e) {
    console.error(String(e.message ?? e));
    process.exit(1);
  }
  console.log(json ? JSON.stringify({ repo, query, files: r.docs, results: r.results }, null, 2) : reportText(repo, query, r));
}

if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("duties/repo-rag/run.mjs")) main();
