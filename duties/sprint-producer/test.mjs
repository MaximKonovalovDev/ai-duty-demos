// duties/sprint-producer/test.mjs: planted-defect test. Every planted gap is filed, nothing else is.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { auditFile, auditText, kinds } from "./run.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (f) => join(here, "fixtures", f);
const expect = JSON.parse(readFileSync(fx("expect.json"), "utf8"));

const readFx = (dir) => readFileSync(fx(`${dir}/${expect[dir].file}`), "utf8");

test("planted board: all 6 defects found, each of the expected kind", () => {
  const r = auditText(readFx("planted"));
  assert.equal(r.rows, expect.planted.rows, JSON.stringify(r.defects));
  assert.equal(r.defects.length, expect.planted.defects, JSON.stringify(r.defects));
  assert.deepEqual(kinds(r), expect.planted.kinds);
});

test("clean board: zero findings (no false alarm)", () => {
  const r = auditText(readFx("clean"));
  assert.equal(r.rows, expect.clean.rows, JSON.stringify(r.defects));
  assert.equal(r.defects.length, expect.clean.defects, JSON.stringify(r.defects));
});

test("the planted board differs from the clean one by exactly the planted cells", () => {
  const planted = readFx("planted");
  const clean = readFx("clean");
  assert.ok(planted.includes("JH-A2") && clean.includes("JH-B1"));
  assert.ok(!planted.includes("JH-B1") && !clean.includes("JH-A2"));
  // the clean fixture proves the rules, not the data: same markers, no gaps
  assert.ok(clean.includes("F2P:") && clean.includes("P2P:"));
});

test("a row missing only F2P files exactly missing-f2p", () => {
  const r = auditText("| ID | Status | Scorecard row | What | Done when | Owner role | Evidence |\n|---|---|---|---|---|---|---|\n| JH-T1 | READY | Match quality | Thing | P2P: `node tools/check.mjs` green | builder | |\n");
  assert.deepEqual(kinds(r), ["missing-f2p"]);
});

test("a row missing only P2P files exactly missing-p2p", () => {
  const r = auditText("| ID | Status | Scorecard row | What | Done when | Owner role | Evidence |\n|---|---|---|---|---|---|---|\n| JH-T1 | READY | Match quality | Thing | F2P: `node tools/x.mjs` prints 1 | builder | |\n");
  assert.deepEqual(kinds(r), ["missing-p2p"]);
});

test("empty owner and scorecard cells are filed one by one", () => {
  const r = auditText("| ID | Status | Scorecard row | What | Done when | Owner role | Evidence |\n|---|---|---|---|---|---|---|\n| JH-T1 | READY |  | Thing | F2P: x. P2P: y |  | |\n");
  assert.deepEqual(kinds(r), ["missing-owner", "missing-scorecard"]);
});

test("DONE needs evidence, BLOCKED needs a next step; READY needs neither", () => {
  const done = auditText("| ID | Status | Scorecard row | What | Done when | Owner role | Evidence |\n|---|---|---|---|---|---|---|\n| JH-T1 | DONE | Match quality | Thing | F2P: x. P2P: y | builder | |\n");
  assert.deepEqual(kinds(done), ["done-without-evidence"]);
  const blocked = auditText("| ID | Status | Scorecard row | What | Done when | Owner role | Evidence |\n|---|---|---|---|---|---|---|\n| JH-T1 | BLOCKED | Match quality | Thing | F2P: x. P2P: y | builder | |\n");
  assert.deepEqual(kinds(blocked), ["blocked-without-next"]);
  const ready = auditText("| ID | Status | Scorecard row | What | Done when | Owner role | Evidence |\n|---|---|---|---|---|---|---|\n| JH-T1 | READY | Match quality | Thing | F2P: x. P2P: y | builder | |\n");
  assert.deepEqual(ready.defects, []);
});

test("prose lines outside the table are not audited", () => {
  const r = auditText("# notes\nPARKED as BLOCKED, back to TOP when decided.\nF2P talk without a row.\n");
  assert.equal(r.rows, 0);
  assert.deepEqual(r.defects, []);
});

// temp-file case: the file entry point reads what the text entry point reads.
const tmpRoots = [];
after(() => { for (const d of tmpRoots) rmSync(d, { recursive: true, force: true }); });

test("auditFile on a temp copy matches auditText", () => {
  const d = mkdtempSync(join(tmpdir(), "sp-test-"));
  tmpRoots.push(d);
  const p = join(d, "board.md");
  writeFileSync(p, readFx("clean"));
  const r = auditFile(p);
  assert.equal(r.rows, expect.clean.rows);
  assert.deepEqual(r.defects, []);
});
