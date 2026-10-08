// duties/eval-harness/test.mjs: planted-defect test. A real drop is a regression, the same system sampled again is not,
// flaky cases are named, and the judge rubric of the real target catches what it should.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { compare, evaluate, JUDGE_RUBRIC, runCheck, wilson } from "./run.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (f) => JSON.parse(readFileSync(join(here, "fixtures", f), "utf8"));
const expect = fx("expect.json");
const cases = fx("cases.json").cases;
const run = (file) => evaluate(cases, fx(file).answers);

test("baseline sample is what the fixture says", () => {
  const b = run(expect.baseline.file);
  assert.equal(b.n, expect.baseline.n);
  assert.equal(b.pass, expect.baseline.pass);
  assert.equal(b.gate, "PASS");
});

test("planted degradation: regression called, gate fails, flaky cases named", () => {
  const e = expect.planted;
  const r = run(e.file);
  assert.equal(r.pass, e.pass);
  assert.equal(r.gate, e.gate);
  const c = compare(r, run(expect.baseline.file).baseline);
  assert.equal(c.significant, e.regression);
  assert.equal(c.verdict, "REGRESSION");
  assert.ok(r.flaky.length >= 5, `flaky: ${r.flaky}`);
  assert.deepEqual(Object.keys(r.failedKinds).sort(), ["max-8-lines", "no-email", "revert-line", "verdict-line"].sort());
});

test("clean resample of the same system: no regression, no false alarm", () => {
  const e = expect.clean;
  const r = run(e.file);
  assert.equal(r.pass, e.pass);
  assert.equal(r.gate, e.gate);
  assert.equal(compare(r, run(expect.baseline.file).baseline).significant, e.regression);
});

test("wilson interval matches known values and handles the edges", () => {
  const w = wilson(48, 50);
  assert.ok(Math.abs(w.low - 0.865) < 0.01 && Math.abs(w.high - 0.989) < 0.01, JSON.stringify(w));
  assert.deepEqual(wilson(0, 0), { p: 0, low: 0, high: 0 });
  assert.equal(wilson(10, 10).high, 1);
});

test("check kinds", () => {
  assert.ok(runCheck({ kind: "contains", value: "ab" }, "xabx"));
  assert.ok(runCheck({ kind: "json" }, '{"a":1}') && !runCheck({ kind: "json" }, "{a"));
  assert.ok(runCheck({ kind: "minLines", value: 2 }, "a\nb") && !runCheck({ kind: "maxLines", value: 1 }, "a\nb"));
  assert.throws(() => runCheck({ kind: "nope" }, "x"), /unknown check kind/);
});

test("the real rubric (judge reply contract) passes a good reply and catches four bad ones", () => {
  const ok = (t) => JUDGE_RUBRIC.every((k) => runCheck(k, t));
  assert.ok(ok("VERDICT: PASS\nchanged: x\ncheck: node --test a -> 6/6\nRevert: git restore a.mjs"));
  assert.ok(!ok("Looks good.\ncheck: node --test a\nRevert: git restore a"), "no verdict line");
  assert.ok(!ok(`VERDICT: PASS\n${"line\n".repeat(16)}node x\nrevert: y`), "over 15 lines");
  assert.ok(!ok("VERDICT: FAIL\nnode x -> red\nsee someone@example.test"), "email and no revert");
  assert.ok(!ok("VERDICT: PASS\nchanged x\nRevert: restore it"), "no command");
});
