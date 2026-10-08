// duties/data-cleaner/test.mjs: planted-defect test. The planted file files
// all 5 defect kinds, the clean file files nothing, the --clean output keeps
// only good rows and the source file is never touched.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { auditFile, auditRows, buildClean, kinds } from "./run.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (f) => join(here, "fixtures", f);
const expect = JSON.parse(readFileSync(fx("expect.json"), "utf8"));

const planted = auditFile(fx(join(expect.planted.dir, expect.planted.file)));
const clean = auditFile(fx(join(expect.clean.dir, expect.clean.file)));

test("planted file: 7 rows, all 5 planted defects found", () => {
  assert.equal(planted.rows, expect.planted.rows);
  assert.equal(planted.defects.length, expect.planted.defects);
  assert.deepEqual(kinds(planted), expect.planted.kinds);
});

test("planted file: one defect per kind on the planted rows", () => {
  const at = (kind) => planted.defects.filter((d) => d.kind === kind).map((d) => d.row);
  assert.deepEqual(at("exact-dupe"), [2]);
  assert.deepEqual(at("near-dupe"), [3]);
  assert.deepEqual(at("missing-field"), [4]);
  assert.deepEqual(at("bad-email"), [5]);
  assert.deepEqual(at("out-of-range"), [6]);
});

test("clean file: 0 findings (no false alarms)", () => {
  assert.equal(clean.rows, expect.clean.rows);
  assert.deepEqual(clean.defects, []);
});

test("near-dupe is case-insensitive but not exact", () => {
  const r = auditRows([
    { id: "1", name: "Ada", email: "ada@example.com", age: "36" },
    { id: "3", name: "Ada", email: "ADA@example.com", age: "36" },
  ]);
  assert.deepEqual(r.defects.map((d) => d.kind), ["near-dupe"]);
});

test("same email with other fields changed is near, never exact", () => {
  const r = auditRows([
    { id: "1", name: "Ada", email: "ada@example.com", age: "36" },
    { id: "9", name: "Other", email: "ada@example.com", age: "50" },
  ]);
  assert.ok(!r.defects.some((d) => d.kind === "exact-dupe"));
  assert.ok(r.defects.some((d) => d.kind === "near-dupe"));
});

test("age boundary: 120 passes, 121 is filed", () => {
  const ok = auditRows([{ id: "1", name: "A", email: "a@example.com", age: "120" }]);
  assert.deepEqual(ok.defects, []);
  const bad = auditRows([{ id: "1", name: "A", email: "a@example.com", age: "121" }]);
  assert.deepEqual(bad.defects.map((d) => d.kind), ["out-of-range"]);
});

test("empty email is missing-field, not bad-email", () => {
  const r = auditRows([{ id: "1", name: "A", email: "", age: "30" }]);
  assert.deepEqual(r.defects.map((d) => d.kind), ["missing-field"]);
});

test("details name rows and fields only, never values", () => {
  const text = JSON.stringify(planted.defects);
  assert.ok(!text.includes("Ada") && !text.includes("Mallory") && !text.includes("@"));
});

const tmpRoots = [];
after(() => { for (const d of tmpRoots) rmSync(d, { recursive: true, force: true }); });

test("--clean keeps only defect-free rows and leaves the source alone", () => {
  const d = mkdtempSync(join(tmpdir(), "dc-test-"));
  tmpRoots.push(d);
  const before = readFileSync(fx(join(expect.planted.dir, expect.planted.file)), "utf8");
  const out = join(d, "clean.csv");
  const r = spawnSync(process.execPath, [join(here, "run.mjs"), fx(join(expect.planted.dir, expect.planted.file)), "--clean", out], { encoding: "utf8" });
  assert.equal(r.status, 0);
  const kept = readFileSync(out, "utf8").split("\n").filter((l) => l.trim());
  assert.equal(kept.length - 1, 2); // header + rows 1 and 7
  assert.equal(readFileSync(fx(join(expect.planted.dir, expect.planted.file)), "utf8"), before);
});

test("a missing dataset file exits nonzero", () => {
  const r = spawnSync(process.execPath, [join(here, "run.mjs"), join(here, "fixtures", "no-such.csv"), "--json"], { encoding: "utf8" });
  assert.notEqual(r.status, 0);
});

test("buildClean drops every defective row", () => {
  const kept = buildClean(
    [{ a: 1 }, { a: 2 }],
    { defects: [{ kind: "missing-field", row: 2, detail: "x" }] },
  );
  assert.deepEqual(kept, [{ a: 1 }]);
});
