// duties/agent-builder/run.mjs: the deterministic core of the agent-builder duty.
// Statically audits an agent/MCP scaffold directory the way the ads ask: every agent
// ships a skill card, a bounded runner and a test, names its tools one by one, and
// carries no network exfiltration, no shell escape and no secret in the open.
// Donor ideas: skillworks MCP part, center mcp/. No model, no network, read only.
// Usage: node duties/agent-builder/run.mjs <dir> [--json]
//        node duties/agent-builder/run.mjs --real --json     (the real target of the receipt)
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REAL_TARGET = "duties/bug-triage";
const CHECKS = 6;

const REQUIRED = ["SKILL.md", "run.mjs", "test.mjs"];
const RUNNERS = ["run.mjs", "server.mjs", "main.mjs", "index.mjs"];
const MANIFESTS = ["mcp.json", "package.json", "manifest.json"];
const FRONT = /^---\s*[\s\S]*?\bname:\s*\S+[\s\S]*?\bdescription:\s*\S+[\s\S]*?---/m;
const OVERBROAD = /\btools\s*:\s*(\*|"all"|'all'|\[\s*\*\s*\])|allow[^:\n]{0,40}:\s*(shell|anything|all\b)|run\s+any\s+(command|thing|tool)/i;
const UNSAFE = /fetch\s*\(|http\s*\.\s*request|https\s*\.\s*request|WebSocket\s*\(|child_process|execSync|eval\s*\(|rm\s+-rf/i;
const LOCAL = /localhost|127\.0\.0\.1/;
const SECRET = /sk-[A-Za-z0-9]{8,}|AKIA[0-9A-Z]{16}|api[_-]?key\s*[:=]\s*["'][^"' ]{6,}["']/i;

const read = (dir, n) => { try { return readFileSync(join(dir, n), "utf8"); } catch { return null; } };

/** Audit one scaffold directory. -> { dir, files, checks, defects:[{kind, detail}] } */
export function auditDir(dir) {
  const defects = [];
  const seen = [];
  for (const f of REQUIRED) {
    if (existsSync(join(dir, f))) seen.push(f);
    else defects.push({ kind: "missing-file", detail: `${f} missing from the scaffold` });
  }
  const agentText = read(dir, "agent.md") ?? read(dir, "AGENT.md");
  if (agentText === null) defects.push({ kind: "missing-file", detail: "agent.md missing from the scaffold" });
  else {
    seen.push("agent.md");
    if (OVERBROAD.test(agentText)) defects.push({ kind: "overbroad-scope", detail: "agent.md grants tools by wildcard instead of naming them" });
  }
  const skill = read(dir, "SKILL.md");
  if (skill !== null && !FRONT.test(skill)) defects.push({ kind: "bad-frontmatter", detail: "SKILL.md lacks name/description front matter" });
  for (const r of RUNNERS) {
    const text = read(dir, r);
    if (text === null) continue;
    for (const line of text.split("\n")) {
      if (UNSAFE.test(line) && !LOCAL.test(line)) {
        defects.push({ kind: "unsafe-capability", detail: `${r} runs a network, shell or eval capability: ${line.trim().slice(0, 120)}` });
        break;
      }
    }
  }
  for (const f of readdirSync(dir)) {
    if (!/\.(md|mjs|json)$/i.test(f)) continue;
    const t = read(dir, f);
    if (t !== null && SECRET.test(t)) {
      defects.push({ kind: "secret-leak", detail: `${f} holds a key-like secret in the open` });
      break;
    }
  }
  for (const m of MANIFESTS) {
    const t = read(dir, m);
    if (t === null) continue;
    try { JSON.parse(t); seen.push(m); } catch { defects.push({ kind: "broken-manifest", detail: `${m} is not valid JSON` }); }
  }
  return { dir, files: seen.length, checks: CHECKS, defects };
}

export const kinds = (r) => [...new Set(r.defects.map((d) => d.kind))].sort();

function reportText(r, name) {
  const out = [`# Agent audit: ${name}`, "", `${r.files} scaffold files, ${r.checks} checks, ${r.defects.length} defect(s).`, ""];
  if (!r.defects.length) out.push("No defects: the scaffold names its files, its tools and its limits.");
  for (const d of r.defects) out.push(`- ${d.kind}: ${d.detail}`);
  return out.join("\n");
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h") || !argv.length) {
    console.log("Usage: node duties/agent-builder/run.mjs <dir> [--json]\n       node duties/agent-builder/run.mjs --real --json");
    return;
  }
  if (argv.includes("--real")) {
    const path = join(ROOT, REAL_TARGET);
    const r = auditDir(path);
    const byKind = {};
    for (const d of r.defects) byKind[d.kind] = (byKind[d.kind] ?? 0) + 1;
    const out = {
      target: { kind: "dir", path: REAL_TARGET, files: readdirSync(path).sort(), sha256: createHash("sha256").update(readFileSync(join(path, "run.mjs"))).digest("hex").slice(0, 16) },
      numbers: { files: r.files, checks: r.checks, defects: r.defects.length, ...Object.fromEntries(Object.entries(byKind).map(([k, v]) => [`defect_${k.replace(/-/g, "_")}`, v])) },
      summary: `real scaffold ${REAL_TARGET}: ${r.files} files, ${r.checks} checks, ${r.defects.length} defect(s)${r.defects.length ? `: ${r.defects.map((d) => d.kind).join(", ")}` : ""}`,
    };
    console.log(argv.includes("--json") ? JSON.stringify(out, null, 2) : out.summary);
    return;
  }
  const dir = resolve(argv.find((a) => !a.startsWith("--")) ?? "");
  if (!existsSync(dir) || !statSync(dir).isDirectory()) { console.error(`not a directory: ${dir}`); process.exit(1); }
  const r = auditDir(dir);
  console.log(argv.includes("--json") ? JSON.stringify(r, null, 2) : reportText(r, dir.split(/[\\/]/).pop()));
}

if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("duties/agent-builder/run.mjs")) main();
