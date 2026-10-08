// duties/sprint-producer/run.mjs: the deterministic core of the sprint-producer duty.
// Audits a roadmap/backlog/sprint board file the way the ads ask: every row names
// its scorecard row and owner, carries runnable F2P plus P2P proof lines, DONE rows
// carry evidence, BLOCKED rows carry a reason or next step.
// Donor ideas: center loopkit_new, vision-check. No model, no network, read only.
// Usage: node duties/sprint-producer/run.mjs <board.md> [--json]
//        node duties/sprint-producer/run.mjs --real --json     (the real target of the receipt)
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REAL_TARGET = "sprint/board.md";
const CHECKS = 6;

/** Parse the board table. -> [{ id, status, scorecard, what, doneWhen, owner, evidence, line }] */
export function parseBoard(text) {
  const rows = [];
  const lines = String(text).split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line.startsWith("|")) return;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 7) return;
    const [id, status, scorecard, what, doneWhen, owner, evidence] = cells;
    if (/^ID$/i.test(id) || /^-+$/.test(id)) return; // header or separator
    if (!id) return;
    rows.push({ id, status, scorecard, what, doneWhen, owner, evidence, line: i + 1 });
  });
  return rows;
}

/** Audit one board file's text. -> { rows, checks, defects:[{kind, row, detail}] } */
export function auditText(text) {
  const rows = parseBoard(text);
  const defects = [];
  for (const r of rows) {
    if (!/F2P/i.test(r.doneWhen)) defects.push({ kind: "missing-f2p", row: r.id, detail: `${r.id} Done-when has no F2P proof line` });
    if (!/P2P/i.test(r.doneWhen)) defects.push({ kind: "missing-p2p", row: r.id, detail: `${r.id} Done-when has no P2P proof line` });
    if (!r.owner) defects.push({ kind: "missing-owner", row: r.id, detail: `${r.id} names no owner role` });
    if (!r.scorecard) defects.push({ kind: "missing-scorecard", row: r.id, detail: `${r.id} names no scorecard row` });
    if (/^DONE$/i.test(r.status) && !r.evidence) defects.push({ kind: "done-without-evidence", row: r.id, detail: `${r.id} is DONE with empty evidence` });
    if (/^BLOCKED$/i.test(r.status) && !r.evidence) defects.push({ kind: "blocked-without-next", row: r.id, detail: `${r.id} is BLOCKED with no reason or next step in evidence` });
  }
  return { rows: rows.length, checks: CHECKS, defects };
}

export function auditFile(path) {
  return { path, ...auditText(readFileSync(path, "utf8")) };
}

export const kinds = (r) => [...new Set(r.defects.map((d) => d.kind))].sort();

function reportText(r, name) {
  const out = [`# Sprint audit: ${name}`, "", `${r.rows} row(s), ${r.checks} checks, ${r.defects.length} defect(s).`, ""];
  if (!r.defects.length) out.push("No defects: every row names its scorecard, its owner and both proofs; DONE is evidenced, BLOCKED is explained.");
  for (const d of r.defects) out.push(`- ${d.kind} ${d.row}: ${d.detail}`);
  return out.join("\n");
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h") || !argv.length) {
    console.log("Usage: node duties/sprint-producer/run.mjs <board.md> [--json]\n       node duties/sprint-producer/run.mjs --real --json");
    return;
  }
  if (argv.includes("--real")) {
    const full = join(ROOT, REAL_TARGET);
    const text = readFileSync(full, "utf8");
    const r = auditText(text);
    const byKind = {};
    for (const d of r.defects) byKind[`defect_${d.kind.replace(/-/g, "_")}`] = (byKind[`defect_${d.kind.replace(/-/g, "_")}`] ?? 0) + 1;
    const out = {
      target: { kind: "board", path: REAL_TARGET, sha256: createHash("sha256").update(text).digest("hex").slice(0, 16) },
      numbers: { rows: r.rows, checks: r.checks, defects: r.defects.length, ...byKind },
      summary: `real board ${REAL_TARGET}: ${r.rows} rows, ${r.checks} checks, ${r.defects.length} defect(s)${r.defects.length ? `: ${[...new Set(r.defects.map((d) => `${d.kind}@${d.row}`))].slice(0, 8).join(", ")}` : ""}`,
    };
    console.log(argv.includes("--json") ? JSON.stringify(out, null, 2) : out.summary);
    return;
  }
  const file = resolve(argv.find((a) => !a.startsWith("--")) ?? "");
  if (!existsSync(file) || !statSync(file).isFile()) { console.error(`not a file: ${file}`); process.exit(1); }
  const r = auditFile(file);
  console.log(argv.includes("--json") ? JSON.stringify(r, null, 2) : reportText(r, file.split(/[\\/]/).pop()));
}

if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("duties/sprint-producer/run.mjs")) main();
