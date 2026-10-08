// duties/bug-triage/test.mjs: planted-defect test. Every planted pattern is found, nothing else is filed.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { decode, normalize, reportMarkdown, severity, triage } from "./run.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (f) => readFileSync(join(here, "fixtures", f));
const expect = JSON.parse(fx("expect.json").toString("utf8"));

test("planted log: duplicates collapse to the expected patterns", () => {
  const r = triage(decode(fx(expect.planted.file)));
  assert.equal(r.problems.length, expect.planted.problemPatterns);
  assert.deepEqual(r.problems.map((p) => p.count), expect.planted.counts);
  assert.deepEqual(r.problems.map((p) => p.severity), expect.planted.severities);
  assert.equal(r.newOnes.length, expect.planted.new);
  assert.ok(r.problems[0].stack.length >= 2, "stack lines are attached to the first error");
  assert.equal(r.problems[0].firstLine, 2);
  assert.deepEqual(r.families.map((g) => g.lines), [6, 3], "families group by the first two words");
});

test("clean log with its known pattern: zero new findings, zero false alarms", () => {
  const planted = triage(decode(fx(expect.planted.file)));
  const warnId = planted.problems.find((p) => p.severity === "warn").id;
  const r = triage(decode(fx(expect.clean.file)), { known: [warnId] });
  assert.equal(r.problems.length, expect.clean.problemPatterns);
  assert.equal(r.newOnes.length, expect.clean.new);
});

test("'0 errors' and 'errors=0' are not problems", () => {
  for (const l of ["checks done: 0 errors, 0 failures", "retries: 0 ok, errors=0", "error_count=0", "no failures found"]) assert.equal(severity(l), "info", l);
  for (const l of ["db connect failed", "ERROR boom", "WARN cache stale", "request timed out", "Traceback (most recent call last)"]) assert.notEqual(severity(l), "info", l);
});

test("normalize strips what varies and keeps what means something", () => {
  const a = normalize("2026-10-04T10:00:05Z ses_aaa111 ERROR db connect failed host=10.0.0.4 port=5432 attempt 1 (timeout 3000ms)");
  const b = normalize("2026-10-04T10:09:59Z ses_zzz999 ERROR db connect failed host=10.9.9.9 port=1 attempt 77 (timeout 5ms)");
  assert.equal(a, b);
  assert.notEqual(normalize("ERROR db connect failed"), normalize("ERROR cache write failed"));
});

test("UTF-16 logs (the Flax editor writes them) decode", () => {
  const text = "2026-10-04T10:00:05Z ERROR boom 1\n2026-10-04T10:00:06Z ERROR boom 2\n";
  const buf = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]);
  const r = triage(decode(buf));
  assert.equal(r.problems.length, 1);
  assert.equal(r.problems[0].count, 2);
});

test("report is repro-ready: line, pattern, sample, replay hint", () => {
  const md = reportMarkdown(triage(decode(fx("planted.log"))), "planted.log");
  assert.match(md, /first seen: line 2/);
  assert.match(md, /repro: open planted\.log at line 2/);
  assert.match(md, /\[error\] x6 \(new\)/);
});
