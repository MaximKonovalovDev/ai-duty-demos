// duties/repo-rag/test.mjs: planted-defect test. Every reference query ranks
// its file first, and a query with no vocabulary in the repo ranks nothing.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { buildIndex, collectDocs, retrieve } from "./run.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (f) => join(here, "fixtures", f);
const expect = JSON.parse(readFileSync(fx("expect.json"), "utf8"));
const queries = JSON.parse(readFileSync(fx(expect.planted.queries), "utf8"));

const plantedDocs = collectDocs(fx(expect.planted.dir));
const plantedIndex = buildIndex(plantedDocs);
const top1 = (q, opts) => retrieve(plantedDocs, plantedIndex, q, opts)[0]?.file ?? "(none)";

test("planted repo: all 5 reference queries rank their file first", () => {
  assert.equal(plantedDocs.length, expect.planted.files);
  assert.equal(queries.length, expect.planted.defects);
  const misses = queries.filter(({ q, top }) => top1(q) !== top).map(({ q, top }) => `${q} -> ${top1(q)} (want ${top})`);
  assert.deepEqual(misses, [], JSON.stringify(misses));
});

test("clean repo: a query with no vocabulary ranks nothing (no false alarm)", () => {
  const docs = collectDocs(fx(expect.clean.dir));
  const r = retrieve(docs, buildIndex(docs), "xylophone quantum badger");
  assert.equal(docs.length, 2);
  assert.deepEqual(r, []);
});

test("a rare term outranks a word every file shares", () => {
  // "file" is in every planted doc, "passport" only in auth.md.
  assert.equal(top1("passport file"), "auth.md");
});

test("matching is case-insensitive", () => {
  assert.equal(top1("PASSPORT LOGIN TOKEN"), "auth.md");
});

test("an empty query ranks nothing", () => {
  assert.deepEqual(retrieve(plantedDocs, plantedIndex, "   "), []);
});

test("the top cap is respected", () => {
  const r = retrieve(plantedDocs, plantedIndex, "file repo project", { top: 1 });
  assert.equal(r.length, 1);
});

test("scores are positive and sorted", () => {
  const r = retrieve(plantedDocs, plantedIndex, "file repo project");
  assert.ok(r.length > 1);
  assert.ok(r.every((x) => x.score > 0));
  assert.ok(r.every((x, i) => i === 0 || r[i - 1].score >= x.score));
  assert.ok(r[0].hits.length > 0);
});

test("a missing repo dir exits nonzero", () => {
  const r = spawnSync(process.execPath, [join(here, "run.mjs"), join(here, "fixtures", "no-such-dir"), "passport", "--json"], { encoding: "utf8" });
  assert.notEqual(r.status, 0);
});

// temp-dir case: the dir entry point reads what the index entry point reads.
const tmpRoots = [];
after(() => { for (const d of tmpRoots) rmSync(d, { recursive: true, force: true }); });

test("retrieve on a temp copy of the repo ranks the same", () => {
  const d = mkdtempSync(join(tmpdir(), "rr-test-"));
  tmpRoots.push(d);
  cpSync(fx(expect.planted.dir), join(d, "repo"), { recursive: true });
  const docs = collectDocs(join(d, "repo"));
  const index = buildIndex(docs);
  for (const { q, top } of queries) {
    assert.equal(retrieve(docs, index, q)[0]?.file, top, q);
  }
});
