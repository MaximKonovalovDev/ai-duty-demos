// duties/campaign-builder/test.mjs: planted-defect test. Every planted gap is filed, nothing else is.
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { auditDir, extractLinks, isPiiLine, kinds, linkUtm } from "./run.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (...p) => join(here, "fixtures", ...p);
const expect = JSON.parse(readFileSync(fx("expect.json"), "utf8"));

test("planted campaign: all 5 defects found, each of the expected kind", () => {
  const r = auditDir(fx(expect.planted.dir));
  assert.equal(r.files, expect.planted.files, JSON.stringify(r.defects));
  assert.equal(r.links, expect.planted.links, JSON.stringify(r.defects));
  assert.equal(r.defects.length, expect.planted.defects, JSON.stringify(r.defects, null, 2));
  assert.deepEqual(kinds(r), expect.planted.kinds);
});

test("clean campaign: zero findings (no false alarm), join counted", () => {
  const r = auditDir(fx(expect.clean.dir));
  assert.equal(r.files, expect.clean.files, JSON.stringify(r.defects));
  assert.equal(r.links, expect.clean.links, JSON.stringify(r.defects));
  assert.equal(r.defects.length, expect.clean.defects, JSON.stringify(r.defects));
  assert.equal(r.join.visits_joined, expect.clean.joined.visits);
  assert.equal(r.join.sales_joined, expect.clean.joined.sales);
});

test("one link with no UTM files exactly one missing-utm defect", () => {
  assert.deepEqual(kinds({ defects: auditDir(fx("planted")).defects.filter((d) => /example\.com\/duties/.test(d.detail)) }), ["missing-utm"]);
});

test("uppercase UTM param names and values are bad-utm, lowercase passes", () => {
  const bad = linkUtm("https://example.com/x?utm_source=NEWSLETTER&utm_medium=email&utm_campaign=c");
  assert.equal(bad.utm_source.value, "NEWSLETTER");
  const upper = linkUtm("https://example.com/x?UTM_Source=newsletter&utm_medium=email&utm_campaign=c");
  assert.ok(upper.utm_source && upper.utm_source.name !== "utm_source");
});

test("relative links and anchors need no UTM", () => {
  assert.deepEqual(extractLinks("See [docs](/docs/x) and [top](#top)."), []);
});

test("a post date is not personal data, an email and a phone are", () => {
  assert.equal(isPiiLine("Dated 2026-10-04, files only."), false);
  assert.equal(isPiiLine("Write to hello@example.com for the file."), true);
  assert.equal(isPiiLine("Call 050-1234567 for the file."), true);
});

test("a campaign.json missing two fields files two missing-field defects", () => {
  const d = mkdtempSync(join(tmpdir(), "cb-test-"));
  tmpRoots.push(d);
  cpSync(fx("clean"), join(d, "c"), { recursive: true });
  writeFileSync(join(d, "c", "campaign.json"), JSON.stringify({ name: "t", utm_source: "a" }));
  const r = auditDir(join(d, "c"));
  assert.equal(r.defects.filter((x) => x.kind === "missing-field").length, 2);
});

// temp-dir case: the dir entry point reads what the fixture reads.
const tmpRoots = [];
after(() => { for (const d of tmpRoots) rmSync(d, { recursive: true, force: true }); });

test("auditDir on a temp copy matches the fixture", () => {
  const d = mkdtempSync(join(tmpdir(), "cb-test-"));
  tmpRoots.push(d);
  cpSync(fx("clean"), join(d, "c"), { recursive: true });
  const r = auditDir(join(d, "c"));
  assert.equal(r.files, expect.clean.files);
  assert.deepEqual(r.defects, []);
});
