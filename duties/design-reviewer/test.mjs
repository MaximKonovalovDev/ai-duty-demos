// duties/design-reviewer/test.mjs: planted-defect test. Every planted gap is
// filed once, the clean page files nothing, token and logical CSS pass.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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

test("planted page: all 6 defects found, each of the expected kind", () => {
  const r = auditText(readFx("planted"));
  assert.equal(r.lines, expect.planted.lines, JSON.stringify(r.defects));
  assert.equal(r.defects.length, expect.planted.defects, JSON.stringify(r.defects));
  assert.deepEqual(kinds(r), expect.planted.kinds);
});

test("planted page: one defect per kind on the planted lines", () => {
  const r = auditText(readFx("planted"));
  const at = (kind) => r.defects.filter((d) => d.kind === kind).map((d) => d.line ?? 0);
  assert.deepEqual(at("missing-alt"), [7]);
  assert.deepEqual(at("missing-label"), [9]);
  assert.deepEqual(at("hardcoded-color"), [10]);
  assert.deepEqual(at("physical-css"), [10]);
});

test("clean page: zero findings (no false alarm)", () => {
  const r = auditText(readFx("clean"));
  assert.equal(r.lines, expect.clean.lines, JSON.stringify(r.defects));
  assert.deepEqual(r.defects, []);
});

test("a Hebrew page without dir=rtl is filed, he+rtl and en are not", () => {
  const noDir = auditText('<html lang="he"><head><title>t</title></head><body></body></html>');
  assert.deepEqual(kinds(noDir), ["missing-dir"]);
  assert.deepEqual(auditText('<html lang="he" dir="rtl"><head><title>t</title></head><body></body></html>').defects, []);
  assert.deepEqual(auditText('<html lang="en"><head><title>t</title></head><body></body></html>').defects, []);
});

test("alt present (even empty) passes, alt missing is filed", () => {
  const ok = auditText('<html lang="en"><head><title>t</title></head><body><img src="a.jpg" alt=""></body></html>');
  assert.deepEqual(ok.defects, []);
});

test("labelled inputs pass, a placeholder-only input is filed", () => {
  const ok = auditText('<html lang="en"><head><title>t</title></head><body><label for="a">A</label><input id="a"><label>B <input name="b"></label><input aria-label="C"><input type="submit"></body></html>');
  assert.deepEqual(ok.defects, []);
  const bad = auditText('<html lang="en"><head><title>t</title></head><body><input type="text" placeholder="name"></body></html>');
  assert.deepEqual(kinds(bad), ["missing-label"]);
});

test("var(--*) colors and logical properties pass, hex and margin-left are filed", () => {
  const ok = auditText('<html lang="en"><head><title>t</title></head><body><p style="color:var(--ink); margin-inline-start:4px">x</p></body></html>');
  assert.deepEqual(ok.defects, []);
  const bad = auditText('<html lang="en"><head><title>t</title></head><body><p style="color:rgb(0,0,0); float:left">x</p></body></html>');
  assert.deepEqual(kinds(bad), ["hardcoded-color", "physical-css"]);
});

test("a css file argument is scanned too", () => {
  const r = auditText('<html lang="en"><head><title>t</title></head><body><p>x</p></body></html>', "p { color: #fff; }");
  assert.deepEqual(kinds(r), ["hardcoded-color"]);
  const ok = auditText('<html lang="en"><head><title>t</title></head><body><p>x</p></body></html>', "p { color: var(--ink); margin-inline: 0; }");
  assert.deepEqual(ok.defects, []);
});

test("details name lines and kinds only, never values", () => {
  const text = JSON.stringify(auditText(readFx("planted")).defects);
  assert.ok(!text.includes("Nickname") && !text.includes("777777") && !text.includes("team-photo"));
});

// temp-file case: the file entry point reads what the text entry point reads.
const tmpRoots = [];
after(() => { for (const d of tmpRoots) rmSync(d, { recursive: true, force: true }); });

test("auditFile on a temp copy matches auditText", () => {
  const d = mkdtempSync(join(tmpdir(), "dr-test-"));
  tmpRoots.push(d);
  const p = join(d, "page.html");
  writeFileSync(p, readFx("clean"));
  const r = auditFile(p);
  assert.equal(r.lines, expect.clean.lines);
  assert.deepEqual(r.defects, []);
});

test("a missing page file exits nonzero", () => {
  const r = spawnSync(process.execPath, [join(here, "run.mjs"), join(here, "fixtures", "no-such.html"), "--json"], { encoding: "utf8" });
  assert.notEqual(r.status, 0);
});

test("the real target runs as json with pages and checks", () => {
  const r = spawnSync(process.execPath, [join(here, "run.mjs"), "--real", "--json"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.ok(out.target?.path && out.numbers?.pages === 2 && out.numbers?.checks > 0);
});
