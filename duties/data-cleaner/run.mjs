// duties/data-cleaner/run.mjs: the deterministic core of the data-cleaner duty.
// Audits CSV/JSONL datasets the way the ads ask: exact + near dupes found,
// missing fields, bad emails and out-of-range numbers filed per row, then a
// clean file written beside the source (the source is never touched).
// Donor ideas: our tools/fetch.mjs dedupeJobs (exact key drops, near key
// company|title counts but keeps, JH-81). Internal, ideas only: the exact and
// near keys here are reimplemented for generic datasets, 0 lines copied.
// No model, no network, read only (plus the --clean output it writes).
// Usage: node duties/data-cleaner/run.mjs <dataset.csv|jsonl> [--json] [--clean <out>]
//        node duties/data-cleaner/run.mjs --real --json     (the real target of the receipt)
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REAL_TARGET = "data/jobs.jsonl";
const CHECKS = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AGE_MIN = 0;
const AGE_MAX = 120;

/** Case/punct/space-insensitive text key (field names only ever printed). */
export function norm(v) {
  return String(v ?? "").toLowerCase().replace(/[^a-z0-9\u0590-\u05FF]+/g, " ").replace(/\s+/g, " ").trim();
}

const nonEmpty = (v) => String(v ?? "").trim() !== "";

/** Near-dupe keys for a row: company|title, else email, else name. */
export function nearKeys(row) {
  const keys = [];
  if (nonEmpty(row.company) && nonEmpty(row.title)) keys.push(`ct:${norm(row.company)}|${norm(row.title)}`);
  if (nonEmpty(row.email)) keys.push(`em:${norm(row.email)}`);
  else if (nonEmpty(row.name)) keys.push(`nm:${norm(row.name)}`);
  return keys;
}

const exactKey = (row) => JSON.stringify(
  Object.keys(row).sort().map((k) => [k, norm(row[k])]),
);

/**
 * Audit rows (objects). opts: { required, checkEmail, checkAge, checkPay }.
 * -> { rows, checks, defects:[{kind, row, detail}] }. Details name row numbers
 * and field names only, never values (privacy: no names, emails or phones).
 */
export function auditRows(rows, opts = {}) {
  const { required = ["id", "name", "email"], checkEmail = true, checkAge = true, checkPay = false } = opts;
  const defects = [];
  const seenExact = new Map();
  const seenNear = new Map();
  rows.forEach((row, i) => {
    const n = i + 1;
    for (const f of required) {
      if (!nonEmpty(row[f])) defects.push({ kind: "missing-field", row: n, detail: `row ${n} is missing field "${f}"` });
    }
    if (checkEmail && nonEmpty(row.email) && !EMAIL_RE.test(String(row.email).trim())) {
      defects.push({ kind: "bad-email", row: n, detail: `row ${n} has a bad email in field "email"` });
    }
    if (checkAge && nonEmpty(row.age)) {
      const a = Number(String(row.age).trim());
      if (!Number.isFinite(a) || a < AGE_MIN || a > AGE_MAX) {
        defects.push({ kind: "out-of-range", row: n, detail: `row ${n} has field "age" outside ${AGE_MIN}-${AGE_MAX}` });
      }
    }
    if (checkPay && row.pay != null && typeof row.pay === "object") {
      for (const f of ["min", "max"]) {
        const v = row.pay[f];
        if (v != null && (!Number.isFinite(Number(v)) || Number(v) < 0)) {
          defects.push({ kind: "out-of-range", row: n, detail: `row ${n} has field "pay.${f}" outside range` });
        }
      }
    }
    const ek = exactKey(row);
    if (seenExact.has(ek)) {
      defects.push({ kind: "exact-dupe", row: n, detail: `row ${n} is an exact dupe of row ${seenExact.get(ek)}` });
    } else {
      seenExact.set(ek, n);
      for (const k of nearKeys(row)) {
        if (seenNear.has(k)) {
          const field = k.startsWith("ct:") ? 'fields "company"+"title"' : k.startsWith("em:") ? 'field "email"' : 'field "name"';
          defects.push({ kind: "near-dupe", row: n, detail: `row ${n} is a near-dupe of row ${seenNear.get(k)} (same ${field})` });
          break;
        }
      }
      for (const k of nearKeys(row)) if (!seenNear.has(k)) seenNear.set(k, n);
    }
  });
  return { rows: rows.length, checks: CHECKS, defects };
}

export const kinds = (r) => [...new Set(r.defects.map((d) => d.kind))].sort();
export const byKind = (r) => {
  const out = {};
  for (const d of r.defects) out[`defect_${d.kind.replace(/-/g, "_")}`] = (out[`defect_${d.kind.replace(/-/g, "_")}`] ?? 0) + 1;
  return out;
};

/** Rows with zero defects (first-wins, exact dupes already defective). */
export function buildClean(rows, report) {
  const bad = new Set(report.defects.map((d) => d.row));
  return rows.filter((_, i) => !bad.has(i + 1));
}

function parseCsv(text) {
  const lines = String(text).split(/\r?\n/).filter((l) => l.trim() !== "");
  if (!lines.length) return { header: [], rows: [] };
  const header = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const rows = lines.slice(1).map((l) => {
    const cells = l.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""]));
  });
  return { header, rows };
}

/** Load a dataset file (.csv with a header row, .jsonl one object per line, .json array). */
export function loadDataset(path) {
  const text = readFileSync(path, "utf8");
  if (/\.csv$/i.test(path)) return { ...parseCsv(text), format: "csv" };
  if (/\.json$/i.test(path) && !/\.jsonl$/i.test(path)) {
    const arr = JSON.parse(text);
    if (!Array.isArray(arr)) throw new Error("json dataset must be an array");
    return { header: [...new Set(arr.flatMap((r) => Object.keys(r ?? {})))], rows: arr, format: "json" };
  }
  const rows = [];
  for (const line of text.split("\n")) {
    if (!line.trim().startsWith("{")) continue;
    rows.push(JSON.parse(line));
  }
  return { header: [...new Set(rows.flatMap((r) => Object.keys(r ?? {})))], rows, format: "jsonl" };
}

export function auditFile(path, opts = {}) {
  const { rows } = loadDataset(path);
  return { path, ...auditRows(rows, opts) };
}

function reportText(r, name) {
  const out = [`# Data audit: ${name}`, "", `${r.rows} row(s), ${r.checks} checks, ${r.defects.length} defect(s).`, ""];
  if (!r.defects.length) out.push("No defects: no dupes, no missing fields, emails and numbers in range.");
  for (const d of r.defects) out.push(`- ${d.kind} row ${d.row}: ${d.detail}`);
  return out.join("\n");
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h") || !argv.length) {
    console.log("Usage: node duties/data-cleaner/run.mjs <dataset.csv|jsonl> [--json] [--clean <out>]\n       node duties/data-cleaner/run.mjs --real --json");
    return;
  }
  const json = argv.includes("--json");
  if (argv.includes("--real")) {
    const full = join(ROOT, REAL_TARGET);
    const { rows } = loadDataset(full);
    const r = auditRows(rows, { required: ["id", "title", "company", "url"], checkEmail: false, checkAge: false, checkPay: true });
    const out = {
      target: { kind: "dataset", path: REAL_TARGET, sha256: createHash("sha256").update(String(rows.length)).digest("hex").slice(0, 16) },
      numbers: { rows: r.rows, defects: r.defects.length, ...byKind(r) },
      summary: `real dataset ${REAL_TARGET}: ${r.rows} rows, ${r.checks} checks, ${r.defects.length} defect(s)${r.defects.length ? `: ${kinds(r).join(", ")}` : ""}`,
    };
    console.log(json ? JSON.stringify(out, null, 2) : out.summary);
    return;
  }
  const file = resolve(argv.find((a) => !a.startsWith("--")) ?? "");
  if (!existsSync(file) || !statSync(file).isFile()) { console.error(`not a file: ${file}`); process.exit(1); }
  let ds;
  try {
    ds = loadDataset(file);
  } catch (e) {
    console.error(String(e.message ?? e));
    process.exit(1);
  }
  const r = { path: file, ...auditRows(ds.rows) };
  const ci = argv.indexOf("--clean");
  if (ci >= 0) {
    const dest = resolve(argv[ci + 1] ?? "");
    if (!dest) { console.error("--clean needs an output path"); process.exit(1); }
    const kept = buildClean(ds.rows, r);
    const body = ds.format === "csv"
      ? [ds.header.join(","), ...kept.map((row) => ds.header.map((h) => row[h] ?? "").join(","))].join("\n") + "\n"
      : kept.map((row) => JSON.stringify(row)).join("\n") + (kept.length ? "\n" : "");
    writeFileSync(dest, body);
    if (!json) console.log(`clean: kept ${kept.length} of ${ds.rows.length} rows -> ${argv[ci + 1]} (source untouched)`);
  }
  console.log(json ? JSON.stringify(r, null, 2) : reportText(r, file.split(/[\\/]/).pop()));
}

if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("duties/data-cleaner/run.mjs")) main();
