// duties/test-planner/run.mjs: the deterministic core of the test-planner duty.
// Reads a requirement list (bullets, numbered lines, or a table of bars with proofs), writes test cases for each
// requirement (positive, negative, boundary values around every number, regression), carries the spec's own
// F2P/P2P proof lines, and flags requirements nobody can test as written (vague words with no number or example).
// Donor idea: our board rows (every row carries an F2P and a P2P line). No model, no network, read only.
// Usage: node duties/test-planner/run.mjs <spec.md> [--json]
//        node duties/test-planner/run.mjs --real --json     (the real target of the receipt)
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REAL_TARGET = "FINISH-LINE.md";

const VAGUE = /\b(fast|quick(?:ly)?|slow|easy|easily|simple|user[- ]friendly|intuitive|robust|scalable|flexible|appropriate(?:ly)?|reasonable|as needed|if necessary|etc\.?|and so on|some|several|many|few|good|better|best|efficient(?:ly)?|seamless(?:ly)?|modern|clean|properly|correctly|sufficient|minimal|every day|regularly|soon)\b/i;
const INCOMPLETE = /\b(tbd|todo|to be decided|to be defined|fill me)\b/i;
const INPUTY = /\b(input|enter|submit|upload|accept|validate|create|add|set|type|paste|select|import|send|login|log in|search|filter|name|value|field|form|file)\b/i;
const REGRESS = /\b(existing|still|unchanged|keep|keeps|retain|preserve|without breaking|no longer|stay|stays|remains?)\b/i;
const ATMOST = /\b(at most|no more than|up to|max(?:imum)?|not exceed|under|below|within|less than|fewer than|<=?|≤)\b/i;
const ATLEAST = /\b(at least|no fewer than|min(?:imum)?|more than|over|above|greater than|>=?|≥)\b/i;
const EXACT = /\b(exactly|only|precisely)\b/i;

const clean = (s) => String(s).replace(/`/g, "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();

/** Requirements: [{id, text, line, proof}] from bullets, numbered lines, `REQ:` lines or a table of IDs with a proof column. */
export function parseRequirements(text) {
  const out = [];
  const lines = String(text).split(/\r?\n/);
  const proofs = [];
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line || /^#{1,6}\s/.test(line)) return;
    const p = /^(?:[-*•]\s*)?(F2P|P2P)\s*:\s*(.+)$/i.exec(line);
    if (p) { proofs.push({ kind: p[1].toUpperCase(), text: clean(p[2]), line: i + 1 }); return; }
    if (/^\|/.test(line)) {
      const cells = line.split("|").slice(1, -1).map((c) => c.trim());
      if (cells.length >= 2 && /^[A-Z]{1,4}-?\d+$/.test(cells[0])) out.push({ id: cells[0], text: clean(cells[1]), line: i + 1, proof: cells[2] ? clean(cells[2]) : "" });
      return;
    }
    const b = /^(?:[-*•]|\d+[.)]|REQ[-\w]*:|Requirement:)\s*(.+)$/i.exec(line);
    if (b) { out.push({ id: `R${out.length + 1}`, text: clean(b[1]), line: i + 1, proof: "" }); return; }
  });
  return { requirements: out, proofs };
}

function boundaryValues(req) {
  const vals = [];
  for (const m of req.matchAll(/(\d+(?:\.\d+)?)\s*(%|[A-Za-z]{1,12})?/g)) {
    const n = Number(m[1]);
    if (!Number.isFinite(n) || (n > 1900 && n < 2100 && !m[2])) continue; // a year
    if (/(?:http|status|code|error|version|v|id|#)\s*$/i.test(req.slice(Math.max(0, m.index - 8), m.index))) continue; // a label, not a limit
    const unit = m[2] && /^(mb|kb|gb|ms|s|sec|seconds?|minutes?|min|hours?|h|days?|items?|times|rows?|chars?|characters|%|px|pages?|retries|attempts|users?|files?|lines?)$/i.test(m[2]) ? ` ${m[2]}` : "";
    const rel = ATMOST.test(req) ? "atmost" : ATLEAST.test(req) ? "atleast" : EXACT.test(req) ? "exact" : "around";
    const step = n % 1 === 0 ? 1 : 0.1;
    const f = (x) => `${Math.round(x * 100) / 100}${unit}`;
    const below = { v: f(n - step), expect: rel === "atmost" ? "accepted" : rel === "atleast" ? "rejected or flagged" : rel === "exact" ? "rejected or flagged" : "behaves as the nearest valid case" };
    const at = { v: f(n), expect: "accepted" };
    const above = { v: f(n + step), expect: rel === "atmost" ? "rejected or flagged" : rel === "atleast" ? "accepted" : rel === "exact" ? "rejected or flagged" : "behaves as the nearest valid case" };
    vals.push({ n, rel, cases: [["below", below], ["at", at], ["above", above]] });
  }
  return vals;
}

/** Plan: { requirements, cases, flags, proofs, stats } */
export function plan(text) {
  const { requirements, proofs } = parseRequirements(text);
  const cases = [];
  const flags = [];
  requirements.forEach((r, ri) => {
    const t = ri + 1;
    const vague = VAGUE.exec(r.text);
    // measurable when the requirement carries a number, a quoted example, or a proof with a number or comparison
    const hasNumber = /\d/.test(r.text) || /["'“”‘’][^"'“”‘’]{2,}["'“”‘’]/.test(r.text) || /\b(http \d{3}|status \d{3})\b/i.test(r.text) || /\d|>=|<=|===?|\btrue\b/.test(r.proof ?? "");
    if (INCOMPLETE.test(r.text)) flags.push({ req: r.id, kind: "incomplete", why: `says "${INCOMPLETE.exec(r.text)[0]}"` });
    else if (vague && !hasNumber) flags.push({ req: r.id, kind: "untestable", why: `"${vague[0]}" with no number or example: say how fast, how many, or give an example` });
    const blocked = flags.some((f) => f.req === r.id);
    cases.push({ id: `T${t}.1`, req: r.id, type: "positive", check: `With a typical valid input, verify: ${r.text}`, expect: blocked ? "blocked: the requirement needs a measurable criterion first" : "requirement holds" });
    if (INPUTY.test(r.text) || !REGRESS.test(r.text)) {
      cases.push({ id: `T${t}.2`, req: r.id, type: "negative", check: INPUTY.test(r.text) ? `With empty, malformed or oversized input, verify: ${r.text}` : `With the precondition missing, verify: ${r.text}`, expect: "fails cleanly: clear message, nothing half-done" });
    }
    let b = 0;
    for (const bv of boundaryValues(r.text)) {
      for (const [where, c] of bv.cases) cases.push({ id: `T${t}.b${++b}`, req: r.id, type: "boundary", check: `Use ${c.v} (${where} the limit ${bv.n}): ${r.text}`, expect: c.expect });
    }
    if (REGRESS.test(r.text)) cases.push({ id: `T${t}.r`, req: r.id, type: "regression", check: `Re-run the checks that guarded this area before the change and compare: ${r.text}`, expect: "same results as before the change (P2P)" });
  });
  const byType = {};
  for (const c of cases) byType[c.type] = (byType[c.type] ?? 0) + 1;
  const uncovered = requirements.filter((r) => !cases.some((c) => c.req === r.id)).length;
  return { requirements, cases, flags, proofs, stats: { requirements: requirements.length, cases: cases.length, flagged: new Set(flags.map((f) => f.req)).size, boundaryCases: byType.boundary ?? 0, regressionCases: byType.regression ?? 0, negativeCases: byType.negative ?? 0, uncovered, proofLines: proofs.length + requirements.filter((r) => r.proof).length } };
}

export function planMarkdown(p, name = "spec") {
  const s = p.stats;
  const out = [`# Test plan: ${name}`, "", `${s.requirements} requirements, ${s.cases} cases (${s.negativeCases} negative, ${s.boundaryCases} boundary, ${s.regressionCases} regression), ${s.flagged} requirement(s) flagged, ${s.uncovered} uncovered.`, ""];
  if (p.flags.length) { out.push("## Flagged (fix the requirement before testing it)"); for (const f of p.flags) out.push(`- ${f.req} [${f.kind}]: ${f.why}`); out.push(""); }
  out.push("## Cases", "", "| Case | Req | Type | Check | Expected |", "|---|---|---|---|---|");
  for (const c of p.cases) out.push(`| ${c.id} | ${c.req} | ${c.type} | ${c.check.replace(/\|/g, "/")} | ${c.expect} |`);
  if (p.proofs.length || p.requirements.some((r) => r.proof)) {
    out.push("", "## Runnable proof carried from the spec (F2P fails before the change, P2P keeps passing)");
    for (const x of p.proofs) out.push(`- ${x.kind}: ${x.text}`);
    for (const r of p.requirements) if (r.proof) out.push(`- ${r.id}: ${r.proof}`);
  }
  return out.join("\n") + "\n";
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h") || !argv.length) {
    console.log("Usage: node duties/test-planner/run.mjs <spec.md> [--json]\n       node duties/test-planner/run.mjs --real --json");
    return;
  }
  if (argv.includes("--real")) {
    const text = readFileSync(join(ROOT, REAL_TARGET), "utf8");
    const p = plan(text);
    const out = {
      target: { kind: "spec", path: REAL_TARGET, bytes: Buffer.byteLength(text) },
      numbers: { ...p.stats },
      summary: `real spec ${REAL_TARGET}: ${p.stats.requirements} requirements (bars and rules) became ${p.stats.cases} cases; ${p.stats.flagged} flagged as untestable as written${p.flags[0] ? ` (${p.flags[0].req}: ${p.flags[0].why.slice(0, 70)})` : ""}; ${p.stats.proofLines} runnable proof lines carried`,
    };
    console.log(argv.includes("--json") ? JSON.stringify(out, null, 2) : out.summary);
    return;
  }
  const file = resolve(argv.find((a) => !a.startsWith("--")));
  const p = plan(readFileSync(file, "utf8"));
  console.log(argv.includes("--json") ? JSON.stringify(p, null, 2) : planMarkdown(p, file.split(/[\\/]/).pop()));
}

if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("duties/test-planner/run.mjs")) main();
