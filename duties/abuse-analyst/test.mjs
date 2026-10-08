// duties/abuse-analyst/test.mjs: planted-defect test. The planted log files
// all 5 abuse signals, the clean log files nothing, thresholds hold on
// synthetic inputs and details never carry log values.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { auditFile, auditLines, kinds, parseLog } from "./run.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (f) => join(here, "fixtures", f);
const expect = JSON.parse(readFileSync(fx("expect.json"), "utf8"));

const planted = auditFile(fx(join(expect.planted.dir, expect.planted.file)));
const clean = auditFile(fx(join(expect.clean.dir, expect.clean.file)));

test("planted log: 44 lines, all 5 abuse signals found", () => {
  assert.equal(planted.rows, expect.planted.rows);
  assert.equal(planted.defects.length, expect.planted.defects);
  assert.deepEqual(kinds(planted), expect.planted.kinds);
});

test("planted log: one signal per kind on the planted rows", () => {
  const at = (kind) => planted.defects.filter((d) => d.kind === kind).map((d) => d.row);
  assert.deepEqual(at("machine-rhythm"), [1]);
  assert.deepEqual(at("rate-burst"), [11]);
  assert.deepEqual(at("template-reuse"), [25]);
  assert.deepEqual(at("auth-burst"), [31]);
  assert.deepEqual(at("sweep"), [36]);
});

test("clean log: 0 findings (no false alarms)", () => {
  assert.equal(clean.rows, expect.clean.rows);
  assert.deepEqual(clean.defects, []);
});

const BASE = Date.parse("2026-10-04T10:00:00.000Z");
const ev = (n, sec, text) => ({ n, ts: BASE + sec * 1000, line: `2026-10-04T10:00:00.000Z ${text}` });
const quiet = (i) => `quiet marker word number ${["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta", "iota"][i]}`;

test("metronomic gaps fire, jittered gaps do not", () => {
  const steady = auditLines(Array.from({ length: 9 }, (_, i) => ev(i + 1, i * 2, quiet(i))));
  assert.ok(steady.defects.some((d) => d.kind === "machine-rhythm"));
  const gaps = [0, 2, 11, 14, 28, 32, 53, 58, 88];
  const jittered = auditLines(gaps.map((s, i) => ev(i + 1, s, quiet(i))));
  assert.deepEqual(jittered.defects, []);
});

test("auth-burst needs 4 denies in 5 minutes", () => {
  const three = auditLines([0, 20, 40].map((s, i) => ev(i + 1, s, "403 forbidden for session")));
  assert.deepEqual(three.defects, []);
  const four = auditLines([0, 20, 40, 55].map((s, i) => ev(i + 1, s, "403 forbidden for session")));
  assert.deepEqual(four.defects.map((d) => d.kind), ["auth-burst"]);
});

test("template-reuse needs repetition across two minute buckets", () => {
  const one = auditLines([2, 9, 21, 33, 47].map((s, i) => ev(i + 1, s, "GET /inbox from client")));
  assert.deepEqual(one.defects, []);
  const two = auditLines([2, 21, 44, 75, 102, 140].map((s, i) => ev(i + 1, s, "GET /inbox from client")));
  assert.deepEqual(two.defects.map((d) => d.kind), ["template-reuse"]);
});

test("sweep needs 8 distinct id tokens in 2 minutes", () => {
  const seven = auditLines(Array.from({ length: 7 }, (_, i) => ev(i + 1, i * 7, `GET /user/${301 + i}/profile`)));
  assert.deepEqual(seven.defects, []);
  const eight = auditLines(Array.from({ length: 8 }, (_, i) => ev(i + 1, i * 7, `GET /user/${301 + i}/profile`)));
  assert.deepEqual(eight.defects.map((d) => d.kind), ["sweep"]);
});

test("details name lines and kinds only, never log values", () => {
  const text = JSON.stringify(planted.defects);
  assert.ok(!text.includes("@") && !text.includes("/user/") && !text.includes("heartbeat"));
});

test("a missing log file exits nonzero", () => {
  const r = spawnSync(process.execPath, [join(here, "run.mjs"), join(here, "fixtures", "no-such.log"), "--json"], { encoding: "utf8" });
  assert.notEqual(r.status, 0);
});

test("parseLog counts non-empty lines and keeps row numbers", () => {
  const lines = parseLog("2026-10-04T10:00:00.000Z a\n\n2026-10-04T10:00:01.000Z b\n");
  assert.deepEqual(lines.map((l) => l.n), [1, 2]);
});
