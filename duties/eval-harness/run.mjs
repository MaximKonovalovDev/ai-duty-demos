// duties/eval-harness/run.mjs: the deterministic core of the eval-harness duty.
// Scores AI answers against a rubric (checks per case), over many runs: pass rate with a Wilson 95% interval,
// per-case consistency (flaky = sometimes passes, sometimes fails), a pass gate, and regression against a
// baseline that only fires when the two intervals do not overlap (a real drop, not noise).
// Donor ideas: skillworks eval gate (pass gate over cases), design-studio judge (rubric), promptfoo assertion
// kinds (contains, regex, max length), read only, nothing installed. No model, no network.
// Usage: node duties/eval-harness/run.mjs <cases.json> <answers.json> [--baseline b.json] [--save-baseline out.json] [--threshold 0.8] [--json]
//        node duties/eval-harness/run.mjs --real --json     (the real target of the receipt)
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DONE_DIR = "sprint/queue/done";

export function wilson(pass, n, z = 1.96) {
  if (!n) return { p: 0, low: 0, high: 0 };
  const p = pass / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return { p, low: Math.max(0, c - h), high: Math.min(1, c + h) };
}

/** One check against one answer text -> true or false. */
export function runCheck(check, text) {
  const t = String(text ?? "");
  const lines = t.split(/\r?\n/).filter((l) => l.trim());
  switch (check.kind) {
    case "contains": return t.includes(check.value);
    case "notContains": return !t.includes(check.value);
    case "regex": return new RegExp(check.value, check.flags ?? "").test(t);
    case "notRegex": return !new RegExp(check.value, check.flags ?? "").test(t);
    case "maxLines": return lines.length <= check.value;
    case "minLines": return lines.length >= check.value;
    case "json": try { JSON.parse(t); return true; } catch { return false; }
    default: throw new Error(`unknown check kind ${check.kind}`);
  }
}

/** cases: [{id, checks:[...]}], answers: [{case, run, text}] -> report */
export function evaluate(cases, answers, { threshold = 0.8 } = {}) {
  const byCase = new Map(cases.map((c) => [c.id, { id: c.id, runs: 0, pass: 0, failed: {} }]));
  const failedKinds = {};
  let n = 0;
  let pass = 0;
  for (const a of answers) {
    const c = cases.find((x) => x.id === a.case);
    if (!c) continue;
    const row = byCase.get(c.id);
    const failed = c.checks.filter((k) => !runCheck(k, a.text));
    row.runs++; n++;
    if (!failed.length) { row.pass++; pass++; } else for (const k of failed) { const key = k.name ?? k.kind; row.failed[key] = (row.failed[key] ?? 0) + 1; failedKinds[key] = (failedKinds[key] ?? 0) + 1; }
  }
  const perCase = [...byCase.values()].filter((r) => r.runs).map((r) => ({ ...r, rate: r.pass / r.runs, consistency: Math.max(r.pass, r.runs - r.pass) / r.runs, flaky: r.pass > 0 && r.pass < r.runs && r.runs > 1 }));
  const w = wilson(pass, n);
  return { n, pass, rate: w.p, low: w.low, high: w.high, threshold, gate: w.p >= threshold ? "PASS" : "FAIL", flaky: perCase.filter((r) => r.flaky).map((r) => r.id), perCase, failedKinds, baseline: { n, pass } };
}

/** Regression: the current interval lies entirely below the baseline's. */
export function compare(current, baseline) {
  const b = wilson(baseline.pass, baseline.n);
  const c = wilson(current.pass, current.n);
  const dropPts = Math.round((b.p - c.p) * 1000) / 10;
  const significant = c.high < b.low;
  return { baselineRate: b.p, currentRate: c.p, dropPts, significant, verdict: significant ? "REGRESSION" : "no significant change" };
}

const cleanReply = (t) => String(t).replace(/^[\s\S]*?<task_result>\s*/, "").replace(/\s*<\/task_result>[\s\S]*$/, "").trim();

// The real rubric: the judge reply contract of this repo's judge chain (chain/review.md): a verdict line, at most
// 15 lines, a revert line, a command, and no email address or phone number.
export const JUDGE_RUBRIC = [
  { name: "verdict-line", kind: "regex", value: "^\\s*\\**VERDICT\\**:?\\s*(PASS|FAIL|BLOCKED)", flags: "m" },
  { name: "max-15-lines", kind: "maxLines", value: 15 },
  { name: "revert-line", kind: "regex", value: "revert", flags: "i" },
  { name: "names-a-command", kind: "regex", value: "\\bnode |\\bnpm |\\bgit |\\bpytest\\b" },
  { name: "no-email", kind: "notRegex", value: "[\\w.+-]+@[\\w-]+\\.[\\w.-]+" },
];

function real() {
  const dir = join(ROOT, DONE_DIR);
  const files = readdirSync(dir).filter((f) => /^\d+-judge.*\.md$/.test(f)).map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs })).sort((a, b) => a.t - b.t || a.f.localeCompare(b.f));
  const replies = files.map(({ f }) => ({ f, text: cleanReply(readFileSync(join(dir, f), "utf8").split(/## Result/)[1] ?? "") })).filter((r) => /VERDICT/i.test(r.text));
  const cases = replies.map((r, i) => ({ id: `r${i + 1}`, checks: JUDGE_RUBRIC }));
  const answers = replies.map((r, i) => ({ case: `r${i + 1}`, run: 1, text: r.text }));
  const rep = evaluate(cases, answers, { threshold: 0.6 });
  const half = Math.floor(replies.length / 2);
  const older = evaluate(cases.slice(0, half), answers.slice(0, half));
  const newer = evaluate(cases.slice(half), answers.slice(half));
  const cmp = compare(newer, older.baseline);
  return {
    target: { kind: "dir", path: DONE_DIR, note: "the judge replies our loops already produced (local queue records), scored against the judge reply contract; names and text stay out of the receipt" },
    numbers: { replies: rep.n, passed: rep.pass, ratePct: Math.round(rep.rate * 100), ciLowPct: Math.round(rep.low * 100), ciHighPct: Math.round(rep.high * 100), olderRatePct: Math.round(older.rate * 100), newerRatePct: Math.round(newer.rate * 100), regression: cmp.significant, ...Object.fromEntries(Object.entries(rep.failedKinds).map(([k, v]) => [`fail_${k.replace(/-/g, "_")}`, v])) },
    summary: `real judge replies: ${rep.pass} of ${rep.n} meet the whole contract (${Math.round(rep.rate * 100)}%, 95% interval ${Math.round(rep.low * 100)}-${Math.round(rep.high * 100)}%); older half ${Math.round(older.rate * 100)}%, newer half ${Math.round(newer.rate * 100)}%: ${cmp.verdict}; most missed check: ${Object.entries(rep.failedKinds).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "none"}`,
  };
}

function main() {
  const argv = process.argv.slice(2);
  const get = (k) => { const i = argv.indexOf(`--${k}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : ""; };
  if (argv.includes("--help") || argv.includes("-h") || !argv.length) {
    console.log("Usage: node duties/eval-harness/run.mjs <cases.json> <answers.json> [--baseline b.json] [--save-baseline out.json] [--threshold 0.8] [--json]\n       node duties/eval-harness/run.mjs --real --json");
    return;
  }
  if (argv.includes("--real")) {
    const r = real();
    console.log(argv.includes("--json") ? JSON.stringify(r, null, 2) : r.summary);
    return;
  }
  const files = argv.filter((a, i) => !a.startsWith("--") && !["--baseline", "--save-baseline", "--threshold"].includes(argv[i - 1]));
  const cases = JSON.parse(readFileSync(resolve(files[0]), "utf8")).cases;
  const answers = JSON.parse(readFileSync(resolve(files[1]), "utf8")).answers;
  const rep = evaluate(cases, answers, { threshold: Number(get("threshold") || 0.8) });
  let cmp = null;
  if (get("baseline")) cmp = compare(rep, JSON.parse(readFileSync(resolve(get("baseline")), "utf8")));
  if (get("save-baseline")) writeFileSync(resolve(get("save-baseline")), JSON.stringify(rep.baseline) + "\n");
  if (argv.includes("--json")) console.log(JSON.stringify({ ...rep, compare: cmp }, null, 2));
  else {
    console.log(`eval: ${rep.pass}/${rep.n} pass (${Math.round(rep.rate * 100)}%, 95% interval ${Math.round(rep.low * 100)}-${Math.round(rep.high * 100)}%), gate ${rep.gate} at ${rep.threshold}`);
    if (rep.flaky.length) console.log(`flaky cases: ${rep.flaky.join(", ")}`);
    for (const [k, v] of Object.entries(rep.failedKinds)) console.log(`missed check ${k}: ${v}`);
    if (cmp) console.log(`vs baseline: ${Math.round(cmp.baselineRate * 100)}% -> ${Math.round(cmp.currentRate * 100)}% (${cmp.dropPts} points): ${cmp.verdict}`);
  }
  if (rep.gate === "FAIL" || cmp?.significant) process.exitCode = 1;
}

if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("duties/eval-harness/run.mjs")) main();
