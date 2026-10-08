// duties/gate-builder/test.mjs: planted-defect test. The generated gate catches a deleted test (ratchet) and a failing
// test, and never cries wolf on the clean repo.
import assert from "node:assert/strict";
import { copyFileSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import { detect, makeGate, runGate } from "./run.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (f) => join(here, "fixtures", f);
const expect = JSON.parse(readFileSync(fx("expect.json"), "utf8"));
let tmp;
before(() => { tmp = mkdtempSync(join(tmpdir(), "gate-test-")); });
after(() => rmSync(tmp, { recursive: true, force: true }));

function freshRepo(name) {
  const repo = join(tmp, name);
  cpSync(fx("repo-good"), repo, { recursive: true });
  const gate = join(tmp, `${name}-gate.mjs`);
  writeFileSync(gate, makeGate(detect(repo), { name }));
  return { repo, gate, base: join(tmp, `${name}-base.json`) };
}

test("detect finds how a repo tests itself", () => {
  const { repo } = freshRepo("detect-node");
  assert.deepEqual(detect(repo).map((s) => s.id), ["node-test"]);
  const py = join(tmp, "py"); cpSync(fx("repo-good"), py, { recursive: true });
  writeFileSync(join(py, "tests", "test_x.py"), "def test_x():\n    assert True\n");
  assert.deepEqual(detect(py).map((s) => s.id), ["node-test", "pytest"]);
  const rs = join(tmp, "rs"); cpSync(fx("repo-good"), rs, { recursive: true });
  writeFileSync(join(rs, "Cargo.toml"), "[package]\nname = \"x\"\n");
  assert.ok(detect(rs).some((s) => s.id === "cargo-test"));
  const empty = join(tmp, "empty"); cpSync(fx("repo-good"), empty, { recursive: true }); rmSync(join(empty, "tests"), { recursive: true });
  assert.deepEqual(detect(empty), []);
});

test("clean repo: gate passes, baseline is 3, a new test raises it to 4 and it still passes", () => {
  const { repo, gate, base } = freshRepo("clean");
  const a = runGate(gate, repo, base);
  assert.ok(a.ok, a.out); assert.equal(a.tests, 3);
  const b = runGate(gate, repo, base);
  assert.ok(b.ok, b.out);
  copyFileSync(fx("extra-good.test.mjs"), join(repo, "tests", "extra.test.mjs"));
  const c = runGate(gate, repo, base);
  assert.ok(c.ok, c.out); assert.equal(c.tests, 4);
  assert.equal(JSON.parse(readFileSync(base, "utf8")).tests, 4, "the ratchet moved up");
});

test("planted defect 1: a deleted test file trips the ratchet", () => {
  const { repo, gate, base } = freshRepo("ratchet");
  assert.ok(runGate(gate, repo, base).ok);
  rmSync(join(repo, "tests", "b.test.mjs"));
  const r = runGate(gate, repo, base);
  assert.equal(r.ok, false);
  assert.match(r.out, /ratchet: tests dropped 3 -> 2/);
});

test("planted defect 2: a failing test fails the gate", () => {
  const { repo, gate, base } = freshRepo("failing");
  assert.ok(runGate(gate, repo, base).ok);
  copyFileSync(fx("planted-failing.test.mjs"), join(repo, "tests", "bad.test.mjs"));
  const r = runGate(gate, repo, base);
  assert.equal(r.ok, false);
  assert.match(r.out, /GATE FAIL: node-test: \d+ failing/);
});

test("the gate is dependency-free and local: no hosted CI, no network", () => {
  const src = makeGate(detect(freshRepo("src").repo));
  assert.ok(!/https?:\/\//.test(src));
  assert.ok(!/github\.com|actions|workflow/i.test(src));
  assert.deepEqual([...src.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort(), ["node:child_process", "node:fs", "node:path"]);
  assert.equal(expect.planted.defects, 2);
});
