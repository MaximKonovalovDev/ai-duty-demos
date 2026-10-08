// duties/gate-builder/run.mjs: the deterministic core of the gate-builder duty.
// The job ads say CI/CD; ours is a LOCAL gate with a ratchet (no hosted CI, by the author's rule): detect how a repo
// tests itself, write one dependency-free gate.mjs that runs those tests, fails when a test fails, and fails
// when the number of tests goes DOWN (the ratchet only moves up). Donor ideas: factory ratchet, forge
// quality_ratchet, our tools/check.mjs. No model, no network.
// Usage: node duties/gate-builder/run.mjs <repo> [--write <gate.mjs>] [--json]
//        node duties/gate-builder/run.mjs --real --json      (the real target of the receipt)
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const listFiles = (dir, re) => (existsSync(dir) ? readdirSync(dir).filter((f) => re.test(f)) : []);

/** Steps a repo needs: [{id, kind, ...}]. */
export function detect(repo) {
  const steps = [];
  for (const d of ["tests", "test"]) {
    if (listFiles(join(repo, d), /\.test\.m?js$/).length) { steps.push({ id: "node-test", kind: "node-test", dir: d, pattern: "\\.test\\.m?js$" }); break; }
  }
  if (listFiles(join(repo, "tests"), /^test_.*\.py$/).length || existsSync(join(repo, "pytest.ini"))) {
    steps.push({ id: "pytest", kind: "cmd", cmd: "python", args: ["-m", "pytest", "-q"], countRe: "(\\d+) passed", failRe: "(\\d+) failed" });
  }
  if (existsSync(join(repo, "Cargo.toml"))) steps.push({ id: "cargo-test", kind: "cmd", cmd: "cargo", args: ["test", "-q"], countRe: "test result: ok\\. (\\d+) passed", sum: true });
  if (readdirSync(repo).some((f) => /\.sln$/.test(f))) steps.push({ id: "dotnet-test", kind: "cmd", cmd: "dotnet", args: ["test", "--nologo"], countRe: "Passed!.*?Total:\\s+(\\d+)" });
  return steps;
}

/** The gate source: self-contained, no imports beyond node:*. */
export function makeGate(steps, { name = "repo" } = {}) {
  return `// gate.mjs: local quality gate for ${name} (written by duties/gate-builder, no hosted CI).
// Runs the repo's own tests; fails when a test fails or when the number of tests drops below the baseline
// (the ratchet only moves up). Usage: node gate.mjs [--init] [--baseline <file>]
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const STEPS = ${JSON.stringify(steps, null, 2)};
const args = process.argv.slice(2);
const cleanEnv = { ...process.env }; // a gate run from inside another node --test must still print its own summary
delete cleanEnv.NODE_TEST_CONTEXT;
const bi = args.indexOf("--baseline");
const BASE = bi >= 0 ? args[bi + 1] : join(process.cwd(), ".gate-baseline.json");
const num = (out, re, sum) => { const ms = [...out.matchAll(new RegExp(re, "g"))]; return ms.length ? (sum ? ms.reduce((a, m) => a + Number(m[1]), 0) : Number(ms[ms.length - 1][1])) : null; };
let tests = 0;
let unknown = 0;
const fails = [];
for (const s of STEPS) {
  let r;
  if (s.kind === "node-test") {
    const files = readdirSync(join(process.cwd(), s.dir)).filter((f) => new RegExp(s.pattern).test(f)).map((f) => join(s.dir, f));
    r = spawnSync(process.execPath, ["--test", ...files], { encoding: "utf8", env: cleanEnv });
    const out = r.stdout + r.stderr;
    const n = num(out, "ℹ tests (\\\\d+)");
    if (n === null) unknown++; else tests += n;
    if (r.status !== 0) fails.push(s.id + ": " + (num(out, "ℹ fail (\\\\d+)") ?? "?") + " failing");
  } else {
    r = spawnSync(s.cmd, s.args, { encoding: "utf8", shell: process.platform === "win32", env: cleanEnv });
    const out = (r.stdout ?? "") + (r.stderr ?? "");
    const n = num(out, s.countRe, s.sum);
    if (n === null) unknown++; else tests += n;
    if (r.status !== 0) fails.push(s.id + ": exit " + r.status);
  }
}
let baseline = null;
if (existsSync(BASE)) { try { baseline = JSON.parse(readFileSync(BASE, "utf8")).tests; } catch { baseline = null; } }
if (fails.length) { console.log("GATE FAIL: " + fails.join("; ")); process.exit(1); }
if (baseline !== null && tests < baseline && !unknown) { console.log("GATE FAIL: ratchet: tests dropped " + baseline + " -> " + tests + " (a test was deleted or skipped)"); process.exit(1); }
if (args.includes("--init") || baseline === null || tests > baseline) writeFileSync(BASE, JSON.stringify({ tests, at: new Date().toISOString() }) + "\\n");
console.log("GATE PASS (tests " + tests + ", baseline " + (baseline === null ? "new " : "") + Math.max(tests, baseline ?? 0) + (unknown ? ", " + unknown + " step(s) without a count" : "") + ")");
`;
}

export function runGate(gatePath, cwd, baseline) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const r = spawnSync(process.execPath, [gatePath, "--baseline", baseline], { cwd, encoding: "utf8", timeout: 300000, env });
  const out = (r.stdout ?? "").trim();
  return { ok: r.status === 0, out, tests: Number((out.match(/tests (\d+)/) ?? [])[1] ?? NaN) };
}

function real() {
  const steps = detect(ROOT);
  const dir = mkdtempSync(join(tmpdir(), "gate-real-"));
  try {
    const gate = join(dir, "gate.mjs");
    writeFileSync(gate, makeGate(steps, { name: "jobhunt" }));
    const base = join(dir, "baseline.json");
    const first = runGate(gate, ROOT, base);
    const second = runGate(gate, ROOT, base);
    if (!first.ok || !second.ok) throw new Error(`gate on the real repo failed: ${first.out} | ${second.out}`);
    return {
      target: { kind: "repo", path: "tests", note: "jobhunt's own node tests, gate written to a temp folder, baseline in a temp file" },
      numbers: { steps: steps.length, tests: first.tests, secondRunTests: second.tests, ratchetBaseline: first.tests },
      summary: `real repo jobhunt: detected ${steps.map((s) => s.id).join("+")}, gate PASS with ${first.tests} tests, second run PASS against the new baseline`,
    };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

function main() {
  const argv = process.argv.slice(2);
  const get = (k) => { const i = argv.indexOf(`--${k}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : ""; };
  if (argv.includes("--help") || argv.includes("-h") || !argv.length) {
    console.log("Usage: node duties/gate-builder/run.mjs <repo> [--write <gate.mjs>] [--json]\n       node duties/gate-builder/run.mjs --real --json");
    return;
  }
  if (argv.includes("--real")) {
    const r = real();
    console.log(argv.includes("--json") ? JSON.stringify(r, null, 2) : r.summary);
    return;
  }
  const repo = resolve(argv.find((a, i) => !a.startsWith("--") && argv[i - 1] !== "--write"));
  const steps = detect(repo);
  if (!steps.length) { console.log("no tests detected: nothing to gate (write tests first)"); process.exitCode = 1; return; }
  const src = makeGate(steps, { name: repo.split(/[\\/]/).pop() });
  if (get("write")) { writeFileSync(resolve(get("write")), src); console.log(`wrote ${get("write")} (${steps.map((s) => s.id).join(", ")}); run: node ${get("write")} --init`); }
  else console.log(argv.includes("--json") ? JSON.stringify({ steps }, null, 2) : src);
}

if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("duties/gate-builder/run.mjs")) main();
