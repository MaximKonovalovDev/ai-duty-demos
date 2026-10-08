// duties/campaign-builder/run.mjs: the deterministic core of the campaign-builder duty.
// Builds and gates file-only marketing campaigns the way the ads ask: every link
// carries UTM (source, medium, campaign, lowercase), no personal data in the files,
// and visits/sales rows join back to the campaign by UTM (the scoreboard join).
// Donor ideas: marketing-studio tracking_check (UTM check, no-PII gate; see
// ../from-marketing-studio/tracking-check.mjs, MIT, same owner) and scoreboard
// (visits-sales join by UTM, KNOWN only on a UTM re-match). Internal, ideas only:
// the checks here are the generic ones (UTM present, lowercase, no PII, join counts).
// No model, no network, read only. Files-only: it audits and counts, never posts,
// never sends, never publishes anything.
// Usage: node duties/campaign-builder/run.mjs <campaign-dir> [--json]
//        node duties/campaign-builder/run.mjs --real --json     (the real target of the receipt)
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REAL_TARGET = "duties/campaign-builder/example";
const CHECKS = 4;
const REQUIRED_UTM = ["utm_source", "utm_medium", "utm_campaign"];

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
// Phone: a digit run with a separator (space/dash) and 9+ digits, or 10+ plain
// digits. Written this way so a post date like 2026-10-04 (8 digits) is not PII.
function hasPhone(line) {
  for (const m of String(line).matchAll(/\+?[\d][\d\s-]*\d/g)) {
    const digits = m[0].replace(/\D/g, "");
    const seps = (m[0].match(/[\s-]/g) ?? []).length;
    if (digits.length >= 10 || (seps >= 1 && digits.length >= 9)) return true;
  }
  return false;
}
export const isPiiLine = (line) => EMAIL.test(String(line)) || hasPhone(line);

/** All http(s) links in a markdown/HTML text, each with its 1-based line number. */
export function extractLinks(text) {
  const out = [];
  const lines = String(text).split(/\r?\n/);
  lines.forEach((raw, i) => {
    for (const m of raw.matchAll(/\[([^\]]*)\]\(([^)\s]+)\)/g)) {
      if (/^https?:\/\//i.test(m[2])) out.push({ url: m[2], line: i + 1 });
    }
    for (const m of raw.matchAll(/href\s*=\s*["'](https?:\/\/[^"'\s>]+)["']/gi)) {
      out.push({ url: m[1], line: i + 1 });
    }
  });
  return out;
}

/** Split a URL query into [name, value] pairs preserving case. */
function queryPairs(url) {
  const q = String(url).split("?")[1] ?? "";
  return q.split("&").filter(Boolean).map((p) => {
    const i = p.indexOf("=");
    return i === -1 ? [p, ""] : [p.slice(0, i), decodeURIComponent(p.slice(i + 1).replace(/\+/g, " "))];
  });
}

/** UTM params found on a link, keyed by lowercase name, keeping raw names/values. */
export function linkUtm(url) {
  const found = {};
  for (const [k, v] of queryPairs(url)) {
    if (/^utm_/i.test(k)) found[k.toLowerCase()] = { name: k, value: v };
  }
  return found;
}

/** Read a campaign dir: campaign.json, posts/*.md, visits.csv, sales.csv. */
export function readCampaign(dir) {
  const files = [];
  const posts = [];
  let campaign = null;
  let campaignRaw = null;
  const camp = join(dir, "campaign.json");
  if (existsSync(camp)) {
    campaignRaw = readFileSync(camp, "utf8");
    files.push("campaign.json");
    try { campaign = JSON.parse(campaignRaw); } catch { campaign = null; }
  }
  const postsDir = join(dir, "posts");
  if (existsSync(postsDir)) {
    for (const f of readdirSync(postsDir).sort()) {
      if (!/\.md$/i.test(f)) continue;
      posts.push({ file: `posts/${f}`, text: readFileSync(join(postsDir, f), "utf8") });
      files.push(`posts/${f}`);
    }
  }
  const csv = (name) => {
    const p = join(dir, name);
    if (!existsSync(p)) return { rows: [], present: false };
    files.push(name);
    const lines = readFileSync(p, "utf8").split(/\r?\n/).filter((l) => l.trim());
    const head = (lines[0] ?? "").split(",").map((h) => h.trim().toLowerCase());
    return {
      present: true,
      rows: lines.slice(1).map((l) => {
        const cells = l.split(",");
        const r = {};
        head.forEach((h, i) => { r[h] = (cells[i] ?? "").trim(); });
        return r;
      }),
    };
  };
  return { files, posts, campaign, campaignRaw, visits: csv("visits.csv"), sales: csv("sales.csv") };
}

const lowerOk = (s) => String(s).length > 0 && String(s) === String(s).toLowerCase();

/** Audit a campaign dir. -> { files, posts, links, checks, defects:[{kind,file?,line?,detail}], join } */
export function auditDir(dir) {
  const c = readCampaign(dir);
  const defects = [];
  // 1. campaign.json fields.
  if (!c.campaign || typeof c.campaign !== "object") {
    defects.push({ kind: "missing-field", file: "campaign.json", detail: "campaign.json is missing or is not JSON" });
  } else {
    for (const f of REQUIRED_UTM) {
      const v = c.campaign[f];
      if (!v || !String(v).trim()) {
        defects.push({ kind: "missing-field", file: "campaign.json", detail: `campaign.json is missing ${f}` });
      } else if (!lowerOk(v)) {
        defects.push({ kind: "bad-utm", file: "campaign.json", detail: `campaign.json ${f} is not lowercase: ${v}` });
      }
    }
  }
  // 2+3. every link: full UTM triple, lowercase names and values.
  const links = [];
  for (const p of c.posts) {
    for (const l of extractLinks(p.text)) {
      links.push({ ...l, file: p.file });
      const u = linkUtm(l.url);
      for (const [k, hit] of Object.entries(u)) {
        if (hit.name !== k) defects.push({ kind: "bad-utm", file: p.file, line: l.line, detail: `link line ${l.line} uses uppercase UTM param "${hit.name}"` });
        else if (!lowerOk(hit.value)) defects.push({ kind: "bad-utm", file: p.file, line: l.line, detail: `link line ${l.line} ${k} value is not lowercase: ${hit.value}` });
      }
      if (!REQUIRED_UTM.every((k) => u[k] && u[k].value)) {
        const missing = REQUIRED_UTM.filter((k) => !(u[k] && u[k].value));
        defects.push({ kind: "missing-utm", file: p.file, line: l.line, detail: `link line ${l.line} is missing ${missing.join(", ")}: ${l.url.slice(0, 80)}` });
      }
    }
  }
  // 4. no personal data in any campaign file.
  const scan = [];
  if (c.campaignRaw) scan.push({ file: "campaign.json", text: c.campaignRaw });
  for (const p of c.posts) scan.push(p);
  for (const s of scan) {
    s.text.split(/\r?\n/).forEach((raw, i) => {
      if (isPiiLine(raw)) {
        defects.push({ kind: "pii", file: s.file, line: i + 1, detail: `file ${s.file} line ${i + 1} holds an email or phone` });
      }
    });
  }
  // Scoreboard join: visits/sales rows whose UTM triple matches the campaign's.
  const triple = c.campaign && REQUIRED_UTM.every((k) => c.campaign[k])
    ? REQUIRED_UTM.map((k) => String(c.campaign[k]).toLowerCase()).join("|")
    : null;
  const matches = (row) => {
    const u = linkUtm(row.url ?? "");
    return triple && REQUIRED_UTM.every((k) => (u[k]?.value ?? "").toLowerCase() === String(c.campaign[k]).toLowerCase());
  };
  const joinedVisits = c.visits.rows.filter(matches);
  const joinedSales = c.sales.rows.filter(matches);
  const sum = (rows, k) => rows.reduce((n, r) => n + (Number(r[k]) || 0), 0);
  return {
    files: c.files.length,
    posts: c.posts.length,
    links: links.length,
    checks: CHECKS,
    defects,
    join: {
      visits_total: sum(c.visits.rows, "visits"),
      visits_joined: sum(joinedVisits, "visits"),
      sales_total: c.sales.rows.length,
      sales_joined: joinedSales.length,
    },
  };
}

export const kinds = (r) => [...new Set(r.defects.map((d) => d.kind))].sort();

function reportText(r, name) {
  const out = [`# Campaign audit: ${name}`, "", `${r.files} file(s), ${r.posts} post(s), ${r.links} link(s), ${r.checks} checks, ${r.defects.length} defect(s).`, `Scoreboard join: ${r.join.visits_joined}/${r.join.visits_total} visits, ${r.join.sales_joined}/${r.join.sales_total} sales trace to this campaign by UTM.`, ""];
  if (!r.defects.length) out.push("No defects: every link carries lowercase UTM, no personal data, campaign fields present.");
  for (const d of r.defects) out.push(`- ${d.kind}${d.file ? ` ${d.file}` : ""}${d.line ? ` line ${d.line}` : ""}: ${d.detail}`);
  return out.join("\n");
}

function hashDir(dir) {
  const h = createHash("sha256");
  const c = readCampaign(dir);
  for (const f of c.files) h.update(`${f}\n${readFileSync(join(dir, f), "utf8")}`);
  return h.digest("hex").slice(0, 16);
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h") || !argv.length) {
    console.log("Usage: node duties/campaign-builder/run.mjs <campaign-dir> [--json]\n       node duties/campaign-builder/run.mjs --real --json");
    return;
  }
  if (argv.includes("--real")) {
    const r = auditDir(join(ROOT, REAL_TARGET));
    const byKind = {};
    for (const d of r.defects) byKind[`defect_${d.kind.replace(/-/g, "_")}`] = (byKind[`defect_${d.kind.replace(/-/g, "_")}`] ?? 0) + 1;
    const out = {
      target: { kind: "campaign", path: REAL_TARGET, sha256: hashDir(join(ROOT, REAL_TARGET)) },
      numbers: { files: r.files, posts: r.posts, links: r.links, checks: r.checks, defects: r.defects.length, ...byKind, visits_joined: r.join.visits_joined, sales_joined: r.join.sales_joined },
      summary: `real campaign ${REAL_TARGET}: ${r.files} files, ${r.posts} posts, ${r.links} links, ${r.checks} checks, ${r.defects.length} defect(s), join ${r.join.visits_joined}/${r.join.visits_total} visits ${r.join.sales_joined}/${r.join.sales_total} sales`,
    };
    console.log(argv.includes("--json") ? JSON.stringify(out, null, 2) : out.summary);
    return;
  }
  const dir = resolve(argv.find((a) => !a.startsWith("--")) ?? "");
  if (!existsSync(dir) || !statSync(dir).isDirectory()) { console.error(`not a directory: ${dir}`); process.exit(1); }
  const r = auditDir(dir);
  console.log(argv.includes("--json") ? JSON.stringify({ dir, ...r }, null, 2) : reportText(r, dir.split(/[\\/]/).pop()));
}

if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("duties/campaign-builder/run.mjs")) main();
