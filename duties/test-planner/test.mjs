// duties/test-planner/test.mjs: planted-defect test. Untestable requirements are flagged, limits get boundary cases,
// the clean spec is not flagged.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseRequirements, plan, planMarkdown } from "./run.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (f) => readFileSync(join(here, "fixtures", f), "utf8");
const expect = JSON.parse(fx("expect.json"));

test("planted spec: flags the 2 untestable requirements, builds boundary and regression cases", () => {
  const p = plan(fx(expect.planted.file));
  const e = expect.planted;
  assert.equal(p.stats.requirements, e.requirements);
  assert.equal(p.stats.flagged, e.flagged);
  assert.deepEqual([...new Set(p.flags.map((f) => f.req))], e.flaggedReqs);
  assert.equal(p.stats.boundaryCases, e.boundaryCases);
  assert.equal(p.stats.regressionCases, e.regressionCases);
  assert.equal(p.stats.cases, e.cases);
  assert.equal(p.stats.uncovered, e.uncovered);
  assert.equal(p.proofs.length, 2, "the F2P and P2P lines are carried");
});

test("boundary values follow the relation: at most 30 -> 29 ok, 30 ok, 31 rejected", () => {
  const p = plan(fx(expect.planted.file));
  const b = p.cases.filter((c) => c.req === "R1" && c.type === "boundary");
  assert.deepEqual(b.map((c) => c.expect), ["accepted", "accepted", "rejected or flagged"]);
  assert.match(b[2].check, /31 items/);
  const up = p.cases.filter((c) => c.req === "R3" && c.type === "boundary");
  assert.match(up[2].check, /6 MB/);
});

test("flagged requirement has a blocked positive case, not a made-up expectation", () => {
  const p = plan(fx(expect.planted.file));
  assert.match(p.cases.find((c) => c.id === "T2.1").expect, /^blocked/);
});

test("clean spec: zero flags, HTTP 200 is not a limit", () => {
  const p = plan(fx(expect.clean.file));
  assert.equal(p.stats.requirements, expect.clean.requirements);
  assert.equal(p.stats.flagged, expect.clean.flagged);
  assert.equal(p.stats.uncovered, expect.clean.uncovered);
  assert.equal(p.cases.filter((c) => c.req === "R1" && c.type === "boundary").length, 0);
  assert.equal(p.cases.filter((c) => c.req === "R2" && c.type === "boundary").length, 6, "2 seconds and 1000 rows");
});

test("a table of bars with proofs parses, and TBD is flagged as incomplete", () => {
  const { requirements } = parseRequirements("| ID | Bar | Proof |\n|---|---|---|\n| J1 | Five real kits are ready | `json it.n >= 5` |\n| J2 | Reply time TBD | none |\n");
  assert.deepEqual(requirements.map((r) => r.id), ["J1", "J2"]);
  assert.equal(requirements[0].proof, "json it.n >= 5");
  const p = plan("| J2 | Reply time TBD | none |");
  assert.equal(p.flags[0].kind, "incomplete");
});

test("the markdown plan lists flags first and every case", () => {
  const md = planMarkdown(plan(fx("planted-spec.md")), "planted-spec.md");
  assert.match(md, /Flagged \(fix the requirement before testing it\)/);
  assert.match(md, /R5 \[untestable\]/);
  assert.equal((md.match(/^\| T\d/gm) || []).length, 21);
});
