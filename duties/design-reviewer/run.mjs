// duties/design-reviewer/run.mjs: the deterministic core of the design-reviewer duty.
// Reviews a page of ours the way the ads ask: accessibility (every image has an
// alt, every input has a label, the html names its lang, the head has a title,
// a Hebrew page rides dir=rtl), design tokens (color only through var(--*),
// never a hardcoded hex or rgb) and RTL-safe CSS (logical margin-inline and
// padding-block, never physical margin-left or float:left).
// Donor ideas: design-studio audit (its per-check list in design-audit.json:
// tokens parse, no hardcoded colors, rtl dir, logical properties, contrast),
// design-studio judge (per-kind counts) and tokens.css (the only color source).
// Internal, ideas only: the checks here are reimplemented for any page of
// ours; 0 lines copied. No model, no network, no browser, read only.
// Usage: node duties/design-reviewer/run.mjs <page.html> [--css <file.css>] [--json]
//        node duties/design-reviewer/run.mjs --real --json     (the real target of the receipt)
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REAL_PAGES = ["from-design-studio/O-007/page.html", "from-design-studio/O-007/page-en.html"];
const REAL_CSS = "from-design-studio/O-007/cv.css";
const CHECKS = 7;

const COLOR_RE = /#[0-9a-f]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/i;
const PHYSICAL_RE = /\b(margin-left|margin-right|padding-left|padding-right|border-left|border-right|border-top-left-radius|border-top-right-radius|border-bottom-left-radius|border-bottom-right-radius)\b|text-align\s*:\s*(left|right)\b|float\s*:\s*(left|right)\b|clear\s*:\s*(left|right)\b|(?<![\w-])(left|right)\s*:/i;
const SKIP_TYPES = new Set(["hidden", "submit", "button", "reset", "image"]);

const lineOf = (text, i) => String(text).slice(0, i).split("\n").length;

/** Audit one HTML text plus optional CSS text. -> { lines, checks, defects:[{kind, line?, detail}] }. Details name lines and tag or attribute names only, never values. */
export function auditText(html, cssText = "") {
  const text = String(html ?? "");
  const defects = [];
  const htmlTag = text.match(/<html\b[^>]*>/i)?.[0] ?? "";
  const lang = htmlTag.match(/\blang\s*=\s*["']?([\w-]+)/i)?.[1] ?? "";
  if (!lang) defects.push({ kind: "missing-lang", detail: "html has no lang attribute" });
  const title = text.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i);
  if (!title || !title[1].trim()) defects.push({ kind: "no-title", detail: "page has no title" });
  if (/^he/i.test(lang)) {
    const dir = htmlTag.match(/\bdir\s*=\s*["']?([\w-]+)/i)?.[1] ?? "";
    if (dir.toLowerCase() !== "rtl") defects.push({ kind: "missing-dir", detail: "Hebrew page without dir=rtl" });
  }
  for (const m of text.matchAll(/<img\b[^>]*>/gi)) {
    if (!/\balt\s*=/i.test(m[0])) defects.push({ kind: "missing-alt", line: lineOf(text, m.index), detail: `line ${lineOf(text, m.index)}: img tag without an alt attribute` });
  }
  const forIds = new Set([...text.matchAll(/<label\b[^>]*\bfor\s*=\s*["']?([\w-]+)/gi)].map((m) => m[1]));
  const labelRanges = [...text.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label\s*>/gi)].map((m) => [m.index, m.index + m[0].length]);
  for (const m of text.matchAll(/<(input|select|textarea)\b[^>]*>/gi)) {
    const tag = m[0];
    const type = (tag.match(/\btype\s*=\s*["']?([\w-]+)/i)?.[1] ?? "").toLowerCase();
    if (m[1].toLowerCase() === "input" && SKIP_TYPES.has(type)) continue;
    const id = tag.match(/\bid\s*=\s*["']?([\w-]+)/i)?.[1] ?? "";
    const wrapped = labelRanges.some(([a, b]) => m.index > a && m.index < b);
    if (!/\baria-label\s*=/i.test(tag) && !/\baria-labelledby\s*=/i.test(tag) && !/\btitle\s*=/i.test(tag) && !(id && forIds.has(id)) && !wrapped) {
      defects.push({ kind: "missing-label", line: lineOf(text, m.index), detail: `line ${lineOf(text, m.index)}: ${m[1].toLowerCase()} control without a label, aria-label or title` });
    }
  }
  const styleSources = [...text.matchAll(/\bstyle\s*=\s*"([^"]*)"/gi)].map((m, i) => ({ name: "inline style", css: m[1], base: lineOf(text, m.index) }));
  for (const m of text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) styleSources.push({ name: "style block", css: m[1], base: lineOf(text, m.index) });
  if (cssText) styleSources.push({ name: "css", css: String(cssText), base: null });
  for (const src of styleSources) {
    if (COLOR_RE.test(src.css)) defects.push({ kind: "hardcoded-color", ...(src.base ? { line: src.base } : {}), detail: `${src.name}${src.base ? ` at line ${src.base}` : ""} uses a hardcoded color instead of var(--*)` });
    if (PHYSICAL_RE.test(src.css)) defects.push({ kind: "physical-css", ...(src.base ? { line: src.base } : {}), detail: `${src.name}${src.base ? ` at line ${src.base}` : ""} uses a physical property instead of a logical one` });
  }
  return { lines: text.replace(/\r?\n$/, "").split("\n").length, checks: CHECKS, defects };
}

export function auditFile(path, { css } = {}) {
  const html = readFileSync(path, "utf8");
  const cssText = css ? readFileSync(css, "utf8") : "";
  return { path, ...auditText(html, cssText) };
}

export const kinds = (r) => [...new Set(r.defects.map((d) => d.kind))].sort();

function reportText(r, name) {
  const out = [`# Design review: ${name}`, "", `${r.lines} line(s), ${r.checks} checks, ${r.defects.length} defect(s).`, ""];
  if (!r.defects.length) out.push("No defects: labelled, alted, lang plus title plus dir set, color only via tokens, logical CSS.");
  for (const d of r.defects) out.push(`- ${d.kind}${d.line ? ` line ${d.line}` : ""}: ${d.detail}`);
  return out.join("\n");
}

function real() {
  const cssText = readFileSync(join(ROOT, REAL_CSS), "utf8");
  const all = [];
  for (const p of REAL_PAGES) all.push({ page: p, ...auditText(readFileSync(join(ROOT, p), "utf8"), cssText) });
  const flat = all.flatMap((r) => r.defects);
  const byKind = {};
  for (const d of flat) byKind[`defect_${d.kind.replace(/-/g, "_")}`] = (byKind[`defect_${d.kind.replace(/-/g, "_")}`] ?? 0) + 1;
  return {
    target: { kind: "design", path: REAL_PAGES[0], sha256: createHash("sha256").update(all.map((r) => r.lines).join(",")).digest("hex").slice(0, 16) },
    numbers: { pages: all.length, checks: CHECKS, defects: flat.length, ...byKind },
    summary: `real pages ${REAL_PAGES[0]} + 1 more with ${REAL_CSS}: ${all.length} pages, ${CHECKS} checks, ${flat.length} defect(s)${flat.length ? `: ${kinds({ defects: flat }).join(", ")}` : ""}`,
  };
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h") || !argv.length) {
    console.log("Usage: node duties/design-reviewer/run.mjs <page.html> [--css <file.css>] [--json]\n       node duties/design-reviewer/run.mjs --real --json");
    return;
  }
  const json = argv.includes("--json");
  if (argv.includes("--real")) {
    const r = real();
    console.log(json ? JSON.stringify(r, null, 2) : r.summary);
    return;
  }
  const file = resolve(argv.find((a) => !a.startsWith("--") && argv[argv.indexOf(a) - 1] !== "--css") ?? "");
  if (!existsSync(file) || !statSync(file).isFile()) { console.error(`not a file: ${file}`); process.exit(1); }
  const ci = argv.indexOf("--css");
  const css = ci >= 0 ? resolve(argv[ci + 1] ?? "") : null;
  if (ci >= 0 && (!css || !existsSync(css))) { console.error("--css needs an existing file"); process.exit(1); }
  const r = auditFile(file, css ? { css } : {});
  console.log(json ? JSON.stringify(r, null, 2) : reportText(r, file.split(/[\\/]/).pop()));
}

if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("duties/design-reviewer/run.mjs")) main();
