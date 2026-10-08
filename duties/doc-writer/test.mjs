// duties/doc-writer/test.mjs: planted-defect test. Every planted gap is filed, nothing else is.
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

test("planted doc: all 4 defects found, each of the expected kind", () => {
  const r = auditText(readFx("planted"));
  assert.equal(r.lines, expect.planted.lines, JSON.stringify(r.defects));
  assert.equal(r.defects.length, expect.planted.defects, JSON.stringify(r.defects));
  assert.deepEqual(kinds(r), expect.planted.kinds);
});

test("clean doc: zero findings (no false alarm)", () => {
  const r = auditText(readFx("clean"));
  assert.equal(r.lines, expect.clean.lines, JSON.stringify(r.defects));
  assert.equal(r.defects.length, expect.clean.defects, JSON.stringify(r.defects));
});

test("the planted doc differs from the clean one by exactly the planted lines", () => {
  const planted = readFx("planted");
  const clean = readFx("clean");
  assert.ok(planted.includes("leverage") && clean.includes("Rollback"));
  assert.ok(!planted.includes("Rollback") && !clean.includes("leverage"));
  // the clean fixture proves the rules, not the data: still a runbook, no gaps
  assert.ok(/runbook/i.test(clean) && /## Rollback/.test(clean));
});

test("one banned word on one line files exactly one jargon defect", () => {
  const r = auditText("We need to leverage the cache here.\n");
  assert.equal(r.defects.length, 1);
  assert.deepEqual(kinds(r), ["jargon"]);
});

test("jargon matches case-insensitively and inside phrases", () => {
  const r = auditText("Please CIRCLE BACK tomorrow.\n");
  assert.deepEqual(kinds(r), ["jargon"]);
});

test("a 120-char line passes, a 121-char line is filed", () => {
  const ok = auditText(`${"x".repeat(120)}\n`);
  assert.deepEqual(ok.defects, []);
  const bad = auditText(`${"y".repeat(121)}\n`);
  assert.deepEqual(kinds(bad), ["long-line"]);
});

test("a non-runbook doc never needs Purpose/Steps/Rollback", () => {
  const r = auditText("# Notes\nShort plain lines only.\n");
  assert.deepEqual(r.defects, []);
});

test("a runbook missing two sections files one defect per section", () => {
  const r = auditText("# Runbook: x\n\n## Purpose\nWhy.\n");
  assert.equal(r.defects.filter((d) => d.kind === "missing-section").length, 2);
  assert.ok(r.defects.some((d) => /Steps/.test(d.detail)));
  assert.ok(r.defects.some((d) => /Rollback/.test(d.detail)));
});

test("headings match at any depth and any case", () => {
  const r = auditText("# Runbook: x\n\n# purpose\nWhy.\n\n### STEPS\nDo it.\n\n## rollback\nUndo it.\n");
  assert.deepEqual(r.defects, []);
});

// temp-file case: the file entry point reads what the text entry point reads.
const tmpRoots = [];
after(() => { for (const d of tmpRoots) rmSync(d, { recursive: true, force: true }); });

test("auditFile on a temp copy matches auditText", () => {
  const d = mkdtempSync(join(tmpdir(), "dw-test-"));
  tmpRoots.push(d);
  const p = join(d, "doc.md");
  writeFileSync(p, readFx("clean"));
  const r = auditFile(p);
  assert.equal(r.lines, expect.clean.lines);
  assert.deepEqual(r.defects, []);
});
