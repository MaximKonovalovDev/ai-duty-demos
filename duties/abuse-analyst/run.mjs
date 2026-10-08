// duties/abuse-analyst/run.mjs: the deterministic core of the abuse-analyst duty.
// Flags abuse/bot signals in a timestamped text log the way the ads ask:
// rate bursts, machine-regular rhythm, template reuse across sessions,
// auth-failure bursts and id sweeps. Files only, no network, no probing:
// it reads our own local logs, never touches a live site.
// Donor ideas: fp-research drill (per-class detection table, human
// false-positive counting, dated change ledger). Internal, ideas only:
// the signals here are reimplemented for plain timestamped text logs,
// 0 lines copied.
// Usage: node duties/abuse-analyst/run.mjs <logfile> [--json]
//        node duties/abuse-analyst/run.mjs --real --json     (the real target of the receipt)
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REAL_TARGET = "sprint/loop-keeper.log";
export const CHECKS = 5;

// Thresholds: a burst is volume no human typing pace reaches; rhythm needs a
// run of near-identical gaps; template needs repetition across time buckets
// (one retry storm is not a botnet); auth needs a cluster of denies.
const RATE_N = 12;
const RATE_WIN = 60_000;
const RHYTHM_RUN = 8;
const RHYTHM_CV = 0.15;
const TEMPLATE_N = 5;
const AUTH_N = 4;
const AUTH_WIN = 300_000;
const SWEEP_N = 8;
const SWEEP_WIN = 120_000;

const TS_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)/;
const AUTH_RE = /\b(401|403)\b|unauthori|forbidden|failed login|invalid token/i;

/** Lines of a log: [{ n, ts (ms or null), line }]. Rows count non-empty lines. */
export function parseLog(text) {
  const out = [];
  let n = 0;
  for (const raw of String(text).split(/\r?\n/)) {
    if (raw.trim() === "") continue;
    n += 1;
    const m = TS_RE.exec(raw);
    out.push({ n, ts: m ? Date.parse(m[1]) : null, line: raw });
  }
  return out;
}

/** Shape key: timestamp stripped, numbers and hex folded, words kept. */
export function shapeOf(line) {
  return String(line)
    .replace(TS_RE, "")
    .toLowerCase()
    .replace(/[0-9a-f]{6,}/g, "#")
    .replace(/\d+/g, "#")
    .replace(/[^a-z# /._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const bucket = (ts) => new Date(ts).toISOString().slice(0, 16);

function mean(xs) {
  return xs.reduce((a, x) => a + x, 0) / xs.length;
}
function cv(xs) {
  const m = mean(xs);
  if (!(m > 0)) return Infinity;
  const v = mean(xs.map((x) => (x - m) * (x - m)));
  return Math.sqrt(v) / m;
}

/**
 * Audit parsed lines -> { rows, events, checks, defects:[{kind, row, detail}] }.
 * One defect per kind at most (the first occurrence). Details name line
 * numbers, counts and kinds only, never log values (privacy).
 */
export function auditLines(lines) {
  const defects = [];
  const rows = lines.length;
  const ts = lines.filter((l) => Number.isFinite(l.ts));

  // 1. rate-burst: RATE_N or more timestamped lines inside a 60 s window.
  for (let i = 0; i < ts.length; i += 1) {
    let j = i;
    while (j < ts.length && ts[j].ts - ts[i].ts <= RATE_WIN) j += 1;
    if (j - i >= RATE_N) {
      defects.push({ kind: "rate-burst", row: ts[i].n, detail: `line ${ts[i].n} starts a 60s window with ${j - i} timestamped lines (threshold ${RATE_N})` });
      break;
    }
  }

  // 2. machine-rhythm: RHYTHM_RUN consecutive gaps with cv under RHYTHM_CV.
  const gaps = [];
  for (let i = 1; i < ts.length; i += 1) gaps.push({ gap: ts[i].ts - ts[i - 1].ts, row: ts[i - RHYTHM_RUN + 1]?.n ?? ts[0].n });
  for (let i = 0; i + RHYTHM_RUN - 1 < gaps.length; i += 1) {
    const win = gaps.slice(i, i + RHYTHM_RUN);
    if (win.every((g) => g.gap >= 0) && cv(win.map((g) => g.gap)) < RHYTHM_CV) {
      defects.push({ kind: "machine-rhythm", row: ts[i].n, detail: `line ${ts[i].n} starts ${RHYTHM_RUN} near-identical gaps (cv under ${RHYTHM_CV})` });
      break;
    }
  }

  // 3. template-reuse: one shape TEMPLATE_N+ times across 2+ minute buckets.
  const groups = new Map();
  for (const l of lines) {
    const k = shapeOf(l.line);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(l);
  }
  for (const members of groups.values()) {
    const buckets = new Set(members.filter((l) => Number.isFinite(l.ts)).map((l) => bucket(l.ts)));
    if (members.length >= TEMPLATE_N && buckets.size >= 2) {
      defects.push({ kind: "template-reuse", row: members[0].n, detail: `line ${members[0].n} shape repeats ${members.length} times across ${buckets.size} minute buckets (threshold ${TEMPLATE_N})` });
      break;
    }
  }

  // 4. auth-burst: AUTH_N+ denied lines inside a 5 min window.
  const denied = lines.filter((l) => AUTH_RE.test(l.line) && Number.isFinite(l.ts));
  for (let i = 0; i < denied.length; i += 1) {
    let j = i;
    while (j < denied.length && denied[j].ts - denied[i].ts <= AUTH_WIN) j += 1;
    if (j - i >= AUTH_N) {
      defects.push({ kind: "auth-burst", row: denied[i].n, detail: `line ${denied[i].n} starts a 5min window with ${j - i} denied lines (threshold ${AUTH_N})` });
      break;
    }
  }

  // 5. sweep: SWEEP_N+ distinct id tokens (digit runs) inside a 2 min window.
  // The timestamp prefix is stripped first: clock digits are not id tokens.
  const withIds = ts.map((l) => ({ n: l.n, ts: l.ts, ids: l.line.replace(TS_RE, "").match(/\d{2,}/g) ?? [] })).filter((l) => l.ids.length);
  for (let i = 0; i < withIds.length; i += 1) {
    const seen = new Set();
    let j = i;
    while (j < withIds.length && withIds[j].ts - withIds[i].ts <= SWEEP_WIN) {
      for (const id of withIds[j].ids) seen.add(id);
      j += 1;
    }
    if (seen.size >= SWEEP_N) {
      defects.push({ kind: "sweep", row: withIds[i].n, detail: `line ${withIds[i].n} starts a 2min window with ${seen.size} distinct id tokens (threshold ${SWEEP_N})` });
      break;
    }
  }

  return { rows, events: ts.length, checks: CHECKS, defects };
}

export const kinds = (r) => [...new Set(r.defects.map((d) => d.kind))].sort();
export const byKind = (r) => {
  const out = {};
  for (const d of r.defects) out[`defect_${d.kind.replace(/-/g, "_")}`] = (out[`defect_${d.kind.replace(/-/g, "_")}`] ?? 0) + 1;
  return out;
};

/** Audit a log file on disk. */
export function auditFile(path) {
  return { path, ...auditLines(parseLog(readFileSync(path, "utf8"))) };
}

function reportText(r, name) {
  const out = [`# Abuse scan: ${name}`, "", `${r.rows} line(s), ${r.events} timestamped, ${r.checks} checks, ${r.defects.length} defect(s).`, ""];
  if (!r.defects.length) out.push("No defects: no bursts, no machine rhythm, no shared templates, no deny clusters, no sweeps.");
  for (const d of r.defects) out.push(`- ${d.kind} line ${d.row}: ${d.detail}`);
  return out.join("\n");
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h") || !argv.length) {
    console.log("Usage: node duties/abuse-analyst/run.mjs <logfile> [--json]\n       node duties/abuse-analyst/run.mjs --real --json");
    return;
  }
  const json = argv.includes("--json");
  if (argv.includes("--real")) {
    const r = auditFile(join(ROOT, REAL_TARGET));
    const out = {
      target: { kind: "log", path: REAL_TARGET },
      numbers: { lines: r.rows, events: r.events, defects: r.defects.length, ...byKind(r) },
      summary: `real log ${REAL_TARGET}: ${r.rows} lines, ${r.events} timestamped, ${r.checks} checks, ${r.defects.length} defect(s)${r.defects.length ? `: ${kinds(r).join(", ")}` : ""}`,
    };
    console.log(json ? JSON.stringify(out, null, 2) : out.summary);
    return;
  }
  const file = resolve(argv.find((a) => !a.startsWith("--")) ?? "");
  if (!existsSync(file) || !statSync(file).isFile()) { console.error(`not a file: ${file}`); process.exit(1); }
  const r = auditFile(file);
  console.log(json ? JSON.stringify(r, null, 2) : reportText(r, file.split(/[\\/]/).pop()));
}

if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("duties/abuse-analyst/run.mjs")) main();
