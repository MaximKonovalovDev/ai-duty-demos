// duties/qa-web-tester/run.mjs: the deterministic core of the qa-web-tester duty.
// Opens a page of ours in a real browser (Edge or Chrome over the DevTools protocol, the layer Playwright and
// Puppeteer sit on) and files what a tester would: console errors, bad or failed requests, broken links,
// inputs without a label, images without alt, sideways scrolling (RTL overflow), clipped text, missing
// lang, dir or title. Only file:// pages and localhost are opened: it never touches a site that is not ours.
// Usage: node duties/qa-web-tester/run.mjs <page.html | http://localhost:port/...> [--viewport 1280x800] [--json]
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { launch } from "../../tools/lib/browser.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const PROBE = `(() => {
  const out = { links: [], inputs: [], imgs: [], ids: [] };
  for (const a of document.querySelectorAll('a[href]')) out.links.push(a.getAttribute('href'));
  for (const el of document.querySelectorAll('input,select,textarea')) {
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (['hidden', 'submit', 'button', 'reset', 'image'].includes(type)) continue;
    const id = el.id;
    const labelled = !!(el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title')
      || (id && document.querySelector('label[for="' + CSS.escape(id) + '"]')) || el.closest('label'));
    out.inputs.push({ tag: el.tagName.toLowerCase(), type, name: el.getAttribute('name') || '', labelled });
  }
  for (const img of document.images) out.imgs.push({ src: (img.getAttribute('src') || '').slice(0, 60), alt: img.getAttribute('alt') });
  const de = document.documentElement;
  out.scrollWidth = de.scrollWidth; out.innerWidth = window.innerWidth;
  out.clipped = [...document.querySelectorAll('body *')].filter((el) => {
    const cs = getComputedStyle(el);
    return (cs.overflowX === 'hidden' || cs.overflowX === 'clip') && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1;
  }).length;
  out.ids = [...document.querySelectorAll('[id]')].map((e) => e.id);
  out.lang = de.getAttribute('lang') || ''; out.dir = de.getAttribute('dir') || ''; out.title = document.title || '';
  return JSON.stringify(out);
})()`;

export function isOwnTarget(target) {
  if (/^file:/i.test(target) || !/^[a-z]+:\/\//i.test(target)) return true;
  try { const u = new URL(target); return u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]"; } catch { return false; }
}

const linkProblem = (href, ctx) => {
  const h = String(href ?? "").trim();
  if (!h || /^(mailto:|tel:|javascript:|data:)/i.test(h)) return null;
  if (/^https?:\/\//i.test(h)) return null; // external: counted, never fetched
  if (h.startsWith("#")) return h.length === 1 || ctx.ids.includes(decodeURIComponent(h.slice(1))) ? null : `anchor ${h} has no target id`;
  if (ctx.filePath) {
    const rel = decodeURIComponent(h.split(/[?#]/)[0]);
    if (!rel) return null;
    return existsSync(resolve(dirname(ctx.filePath), rel)) ? null : `link ${h} points to a file that does not exist`;
  }
  return null;
};

/** Test one page with an open browser. -> { target, viewport, defects:[{kind, detail}], stats } */
export async function testPage(browser, target, { width = 1280, height = 800 } = {}) {
  if (!isOwnTarget(target)) throw new Error(`refused: ${target} is not a file or localhost page of ours`);
  const filePath = /^file:/i.test(target) ? fileURLToPath(target) : (!/^[a-z]+:\/\//i.test(target) ? resolve(target) : null);
  const url = filePath ? pathToFileURL(filePath).href : target;
  const page = await browser.newPage({ width, height });
  try {
    await page.goto(url, { settleMs: 500 });
    const info = JSON.parse(await page.eval(PROBE));
    const defects = [];
    // a failed resource also logs "Failed to load resource": it is filed once, as a bad request
    for (const c of page.events.console) if (c.type === "error" && !/^Failed to load resource/i.test(String(c.text))) defects.push({ kind: "console-error", detail: String(c.text).slice(0, 160) });
    for (const e of page.events.exceptions) defects.push({ kind: "console-error", detail: String(e.text).split("\n")[0].slice(0, 160) });
    for (const r of page.events.badResponses) defects.push({ kind: "bad-request", detail: `${r.status} ${String(r.url).slice(0, 120)}` });
    for (const r of page.events.failedRequests) if (!r.canceled) defects.push({ kind: "bad-request", detail: `request failed: ${r.error}` });
    let external = 0;
    for (const href of info.links) {
      if (/^https?:\/\//i.test(href)) external++;
      const p = linkProblem(href, { ids: info.ids, filePath });
      if (p) defects.push({ kind: "broken-link", detail: p });
    }
    for (const i of info.inputs) if (!i.labelled) defects.push({ kind: "missing-label", detail: `${i.tag}${i.type ? `[type=${i.type}]` : ""} name='${i.name}' has no label, aria-label or title` });
    for (const im of info.imgs) if (im.alt === null) defects.push({ kind: "missing-alt", detail: `img ${im.src} has no alt attribute` });
    if (info.scrollWidth > info.innerWidth + 1) defects.push({ kind: "overflow-x", detail: `page scrolls sideways at ${width}px: content ${info.scrollWidth}px wide` });
    if (info.clipped > 0) defects.push({ kind: "clipped-text", detail: `${info.clipped} element(s) clip their content sideways` });
    if (!info.lang) defects.push({ kind: "missing-lang", detail: "html has no lang attribute" });
    if (info.lang.startsWith("he") && info.dir !== "rtl") defects.push({ kind: "missing-dir", detail: "Hebrew page without dir=rtl" });
    if (!info.title.trim()) defects.push({ kind: "no-title", detail: "page has no title" });
    return { target: filePath ? filePath.replace(/\\/g, "/").split("/").slice(-2).join("/") : target, viewport: `${width}x${height}`, defects, stats: { links: info.links.length, external, inputs: info.inputs.length, images: info.imgs.length } };
  } finally { await page.close(); }
}

export const kinds = (r) => [...new Set(r.defects.map((d) => d.kind))].sort();

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h") || !argv.length) {
    console.log("Usage: node duties/qa-web-tester/run.mjs <page.html | http://localhost:port/...> [--viewport 1280x800] [--json]");
    return;
  }
  const vi = argv.indexOf("--viewport");
  const [w, h] = vi >= 0 ? String(argv[vi + 1]).split("x").map(Number) : [1280, 800];
  const target = argv.find((a, i) => !a.startsWith("--") && argv[i - 1] !== "--viewport");
  const b = await launch();
  try {
    const r = await testPage(b, target, { width: w, height: h });
    if (argv.includes("--json")) console.log(JSON.stringify(r, null, 2));
    else {
      console.log(`${r.target} @ ${r.viewport}: ${r.defects.length} defect(s) (${r.stats.links} links, ${r.stats.inputs} inputs, ${r.stats.images} images)`);
      for (const d of r.defects) console.log(`- ${d.kind}: ${d.detail}`);
    }
  } finally { await b.close(); }
}

if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("duties/qa-web-tester/run.mjs")) { await main(); process.exit(0); }
