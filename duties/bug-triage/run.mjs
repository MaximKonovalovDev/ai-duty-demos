// duties/bug-triage/run.mjs: the deterministic core of the bug-triage duty.
// Fingerprint every line of a log (timestamps, ids, numbers, paths and durations stripped), cluster the
// lines that mean the same thing, rank the problems, separate new from known, and print repro-ready findings.
// Donor idea: forge log_triage (fingerprint, dedupe, repro-ready report). No model, no network, read only.
// Usage: node duties/bug-triage/run.mjs <log> [--known known.json] [--save-known out.json] [--json]
//        node duties/bug-triage/run.mjs --real --json     (the real target of the receipt)
import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REAL_TARGET = "sprint/loop-keeper.log";

export function decode(buf) {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString("utf16le");
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.subarray(3).toString("utf8");
  return buf.toString("utf8");
}

export function normalize(line) {
  let s = String(line);
  s = s.replace(/^\s*\[?\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?Z?\]?\s*/, "");
  s = s.replace(/\bses_[A-Za-z0-9]+\b/g, "<sid>");
  s = s.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<uuid>");
  s = s.replace(/\b0x[0-9a-f]+\b/gi, "<hex>").replace(/\b(?=[0-9a-f]*\d)[0-9a-f]{10,}\b/gi, "<hex>");
  s = s.replace(/[A-Za-z]:\\[^\s"'|]+/g, "<path>").replace(/(?:\/[\w.-]+){3,}/g, "<path>");
  s = s.replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, "<ip>");
  s = s.replace(/\b\d{1,2}:\d{2}(?::\d{2})?Z?\b/g, "<t>");
  s = s.replace(/\b\d+(?:\.\d+)?\s?(?:ms|s|m|h|d|kb|mb|gb|%)(?![A-Za-z])/gi, "<q>");
  s = s.replace(/-r\d+\b/g, "-r<n>").replace(/#\d+/g, "#<n>").replace(/\b\d+x\b/g, "<n>x").replace(/\b\d+\b/g, "<n>");
  return s.replace(/\s+/g, " ").trim();
}

const NEGATED = /\b(?:0|no|zero|without)\s+(?:errors?|failures?|failed|warnings?|exceptions?)\b|\b(?:errors?|failures?|failed|warnings?)\s*[:=]\s*0\b|error_count=0/i;
const ERROR = /\b(?:error|fatal|exception|crash(?:ed)?|panic|traceback|segfault|unhandled|failed|failure)\b/i;
const WARN = /\b(?:warn(?:ing)?|stale|timeout|timed out|refused|denied|retry(?:ing)?|held|blocked|stuck|abort(?:ed)?|deprecated|noop|no valid lock|glitch)\b/i;

export function severity(line) {
  if (NEGATED.test(line)) return "info";
  if (ERROR.test(line)) return "error";
  if (WARN.test(line)) return "warn";
  return "info";
}

const tsOf = (line) => (/^\s*\[?(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})/.exec(line) ?? [])[1] ?? null;
export const fingerprint = (norm) => `bt-${createHash("sha1").update(norm).digest("hex").slice(0, 8)}`;

/** known: array of fingerprint ids. -> { lines, fingerprints (all), problems (warn+error, ranked), newOnes } */
export function triage(text, { known = [] } = {}) {
  const lines = String(text).split(/\r?\n/);
  const knownSet = new Set(known);
  const byId = new Map();
  const fam = new Map();
  let last = null;
  let total = 0;
  lines.forEach((raw, i) => {
    if (!raw.trim()) return;
    if (/^\s+\S/.test(raw) && !/^\s*\[?\d{4}-\d{2}-\d{2}/.test(raw)) {
      if (last && last.stack.length < 4 && last.count === 1) last.stack.push(raw.trim().slice(0, 160));
      return;
    }
    total++;
    const norm = normalize(raw);
    const id = fingerprint(norm);
    const sev = severity(raw);
    if (sev !== "info") {
      const key = norm.replace(/^<sid> /, "").split(" ").slice(0, 2).join(" ");
      const g = fam.get(key) ?? { family: key, severity: sev, lines: 0, firstLine: i + 1 };
      g.lines++;
      if (sev === "error") g.severity = "error";
      fam.set(key, g);
    }
    let f = byId.get(id);
    if (!f) {
      f = { id, severity: sev, count: 0, pattern: norm.slice(0, 200), firstLine: i + 1, firstTs: tsOf(raw), lastTs: null, sample: raw.trim().slice(0, 220), before: lines.slice(Math.max(0, i - 2), i).filter((l) => l.trim()).map((l) => l.trim().slice(0, 160)), stack: [] };
      byId.set(id, f);
    }
    f.count++;
    f.lastTs = tsOf(raw) ?? f.lastTs;
    last = f;
  });
  const all = [...byId.values()];
  const rank = { error: 0, warn: 1, info: 2 };
  const problems = all.filter((f) => f.severity !== "info").sort((a, b) => rank[a.severity] - rank[b.severity] || b.count - a.count || a.firstLine - b.firstLine)
    .map((f) => ({ ...f, status: knownSet.has(f.id) ? "known" : "new" }));
  const families = [...fam.values()].sort((a, b) => b.lines - a.lines || a.firstLine - b.firstLine);
  return { lines: total, fingerprints: all.length, problems, newOnes: problems.filter((p) => p.status === "new"), families };
}

export function reportMarkdown(r, name = "log") {
  const out = [`# Triage: ${name}`, "", `${r.lines} log lines, ${r.fingerprints} distinct patterns, ${r.problems.length} problem patterns (${r.newOnes.length} new) in ${r.families.length} families.`, ""];
  if (r.families.length) out.push("Biggest families: " + r.families.slice(0, 5).map((g) => `'${g.family}' x${g.lines}`).join(", "), "");
  if (!r.problems.length) out.push("No problem patterns.");
  for (const p of r.problems) {
    out.push(`## ${p.id} [${p.severity}] x${p.count} (${p.status})`,
      `- first seen: line ${p.firstLine}${p.firstTs ? ` at ${p.firstTs}` : ""}; last: ${p.lastTs ?? "?"}`,
      `- pattern: ${p.pattern}`,
      `- sample: ${p.sample}`,
      ...(p.before.length ? [`- just before: ${p.before.join(" / ")}`] : []),
      ...(p.stack.length ? [`- detail: ${p.stack.join(" / ")}`] : []),
      `- repro: open ${name} at line ${p.firstLine} and replay the ${p.before.length} line(s) before it; expected: this pattern absent.`, "");
  }
  return out.join("\n");
}

function main() {
  const argv = process.argv.slice(2);
  const get = (k) => { const i = argv.indexOf(`--${k}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : ""; };
  if (argv.includes("--help") || argv.includes("-h") || !argv.length) {
    console.log("Usage: node duties/bug-triage/run.mjs <log> [--known known.json] [--save-known out.json] [--json]\n       node duties/bug-triage/run.mjs --real --json");
    return;
  }
  if (argv.includes("--real")) {
    const path = join(ROOT, REAL_TARGET);
    const buf = readFileSync(path);
    const r = triage(decode(buf));
    const top = r.problems[0];
    const out = {
      target: { kind: "log", path: REAL_TARGET, bytes: statSync(path).size, sha256: createHash("sha256").update(buf).digest("hex").slice(0, 16) },
      numbers: { lines: r.lines, patterns: r.fingerprints, problemPatterns: r.problems.length, problemFamilies: r.families.length, errorPatterns: r.problems.filter((p) => p.severity === "error").length, biggestFamilyLines: r.families[0]?.lines ?? 0 },
      summary: `real keeper log: ${r.lines} lines, ${r.fingerprints} patterns, ${r.problems.length} problem patterns in ${r.families.length} families; the biggest family is '${r.families[0]?.family ?? "none"}' with ${r.families[0]?.lines ?? 0} lines (first: line ${r.families[0]?.firstLine ?? 0}); top pattern ${top?.id ?? "none"} x${top?.count ?? 0}`,
    };
    console.log(argv.includes("--json") ? JSON.stringify(out, null, 2) : out.summary);
    return;
  }
  const file = resolve(argv.find((a) => !a.startsWith("--") && a !== get("known") && a !== get("save-known")));
  let known = [];
  if (get("known")) { try { const k = JSON.parse(readFileSync(resolve(get("known")), "utf8")); known = Array.isArray(k) ? k : Object.keys(k); } catch { known = []; } }
  const r = triage(decode(readFileSync(file)), { known });
  if (get("save-known")) writeFileSync(resolve(get("save-known")), JSON.stringify(r.problems.map((p) => p.id), null, 2) + "\n");
  console.log(argv.includes("--json") ? JSON.stringify(r, null, 2) : reportMarkdown(r, file.split(/[\\/]/).pop()));
}

if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("duties/bug-triage/run.mjs")) main();
