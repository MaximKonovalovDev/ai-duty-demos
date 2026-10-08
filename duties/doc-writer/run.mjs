// duties/doc-writer/run.mjs: the deterministic core of the doc-writer duty.
// Scans markdown docs and runbooks the way the ads ask: plain words (no banned
// jargon), short lines (wrappable, RTL-safe) and runbooks with Purpose, Steps
// and Rollback sections so someone else can run them without asking.
// Donor ideas: forge plain_english_check (jargon plus long-line gate),
// center repomap (ranked map idea -> per-kind defect counts). Internal,
// ideas only: no donor code was read and none is copied.
// No model, no network, read only. Text-only gate: it files findings, never rewrites.
// Usage: node duties/doc-writer/run.mjs <doc.md> [--json]
//        node duties/doc-writer/run.mjs --real --json     (the real target of the receipt)
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REAL_TARGET = "team/fetch.md";
const CHECKS = 3;
const LONG_LINE = 120;

// Banned jargon: corporate filler the ads call "plain English" against.
// Word-boundary, case-insensitive; multi-word phrases match with any spacing.
const BANNED = [
  "leverage",
  "utilize",
  "synergy",
  "synergies",
  "paradigm",
  "seamless",
  "robust",
  "cutting-edge",
  "state-of-the-art",
  "circle back",
  "deep dive",
  "bandwidth",
  "move the needle",
  "learnings",
  "ideate",
  "disruptive",
];

const jargonRes = BANNED.map((p) => ({
  phrase: p,
  re: new RegExp(`\\b${p.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&").replace(/\s+/g, "\\s+")}\\b`, "i"),
}));

// A runbook is any doc that says runbook: it must carry these sections.
const SECTIONS = ["Purpose", "Steps", "Rollback"];
const sectionRe = (s) => new RegExp(`^#{1,3}\\s*${s}\\b`, "im");

/** Audit one markdown text. -> { lines, checks, defects:[{kind, line?, detail}] } */
export function auditText(text) {
  const lines = String(text).split(/\r?\n/);
  const defects = [];
  lines.forEach((raw, i) => {
    for (const { phrase, re } of jargonRes) {
      if (re.test(raw)) defects.push({ kind: "jargon", line: i + 1, detail: `line ${i + 1} uses banned jargon "${phrase}": ${raw.trim().slice(0, 100)}` });
    }
    if (raw.length > LONG_LINE) defects.push({ kind: "long-line", line: i + 1, detail: `line ${i + 1} is ${raw.length} chars (limit ${LONG_LINE})` });
  });
  if (/runbook/i.test(String(text))) {
    for (const s of SECTIONS) {
      if (!sectionRe(s).test(String(text))) defects.push({ kind: "missing-section", detail: `runbook is missing a ## ${s} section` });
    }
  }
  return { lines: lines.length, checks: CHECKS, defects };
}

export function auditFile(path) {
  return { path, ...auditText(readFileSync(path, "utf8")) };
}

export const kinds = (r) => [...new Set(r.defects.map((d) => d.kind))].sort();

function reportText(r, name) {
  const out = [`# Doc audit: ${name}`, "", `${r.lines} line(s), ${r.checks} checks, ${r.defects.length} defect(s).`, ""];
  if (!r.defects.length) out.push("No defects: plain words, short lines, runbook sections present.");
  for (const d of r.defects) out.push(`- ${d.kind}${d.line ? ` line ${d.line}` : ""}: ${d.detail}`);
  return out.join("\n");
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h") || !argv.length) {
    console.log("Usage: node duties/doc-writer/run.mjs <doc.md> [--json]\n       node duties/doc-writer/run.mjs --real --json");
    return;
  }
  if (argv.includes("--real")) {
    const full = join(ROOT, REAL_TARGET);
    const text = readFileSync(full, "utf8");
    const r = auditText(text);
    const byKind = {};
    for (const d of r.defects) byKind[`defect_${d.kind.replace(/-/g, "_")}`] = (byKind[`defect_${d.kind.replace(/-/g, "_")}`] ?? 0) + 1;
    const out = {
      target: { kind: "doc", path: REAL_TARGET, sha256: createHash("sha256").update(text).digest("hex").slice(0, 16) },
      numbers: { lines: r.lines, checks: r.checks, defects: r.defects.length, ...byKind },
      summary: `real doc ${REAL_TARGET}: ${r.lines} lines, ${r.checks} checks, ${r.defects.length} defect(s)${r.defects.length ? `: ${[...new Set(r.defects.map((d) => d.kind))].join(", ")}` : ""}`,
    };
    console.log(argv.includes("--json") ? JSON.stringify(out, null, 2) : out.summary);
    return;
  }
  const file = resolve(argv.find((a) => !a.startsWith("--")) ?? "");
  if (!existsSync(file) || !statSync(file).isFile()) { console.error(`not a file: ${file}`); process.exit(1); }
  const r = auditFile(file);
  console.log(argv.includes("--json") ? JSON.stringify(r, null, 2) : reportText(r, file.split(/[\\/]/).pop()));
}

if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("duties/doc-writer/run.mjs")) main();
