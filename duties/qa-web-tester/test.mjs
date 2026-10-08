// duties/qa-web-tester/test.mjs: planted-defect test in a real browser. 4 of 4 found, 0 false alarms on the clean copy.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import { launch } from "../../tools/lib/browser.mjs";
import { isOwnTarget, kinds, testPage } from "./run.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (f) => join(here, "fixtures", f);
const expect = JSON.parse(readFileSync(fx("expect.json"), "utf8"));
let browser;
let tmp;
before(async () => { browser = await launch(); tmp = mkdtempSync(join(tmpdir(), "qa-test-")); });
after(async () => { await browser.close(); rmSync(tmp, { recursive: true, force: true }); });

const page = (name, html) => { const f = join(tmp, name); writeFileSync(f, html); return f; };

test("planted page: all 4 defects found, each of the expected kind", async () => {
  const r = await testPage(browser, fx(expect.planted.file));
  assert.equal(r.defects.length, expect.planted.defects, JSON.stringify(r.defects));
  assert.deepEqual(kinds(r), expect.planted.kinds);
});

test("clean copy: zero findings (no false alarm)", async () => {
  const r = await testPage(browser, fx(expect.clean.file));
  assert.equal(r.defects.length, expect.clean.defects, JSON.stringify(r.defects));
});

test("the planted file differs from the clean one by exactly the four planted parts", () => {
  const clean = readFileSync(fx("queue-clean.html"), "utf8");
  const planted = readFileSync(fx("queue-planted.html"), "utf8");
  assert.ok(planted.startsWith(clean.slice(0, clean.indexOf("</body>"))));
  assert.equal((planted.match(/planted|queue-details-missing|name="note"|2400px/g) || []).length, 4);
});

test("other classes: missing alt, lang, title, dir, a missing anchor, a failed request", async () => {
  const f = page("misc.html", '<html><head><meta charset="utf-8"></head><body><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw="><a href="#nowhere">x</a><img alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="><script src="missing-script.js"></script></body></html>');
  const r = await testPage(browser, f);
  assert.deepEqual(kinds(r), ["bad-request", "broken-link", "missing-alt", "missing-lang", "no-title"].sort());
  const he = await testPage(browser, page("he.html", '<html lang="he"><head><meta charset="utf-8"><title>t</title></head><body>שלום</body></html>'));
  assert.deepEqual(kinds(he), ["missing-dir"]);
});

test("a labelled input, an external link and a data link are not defects", async () => {
  const f = page("ok.html", '<html lang="en" dir="ltr"><head><meta charset="utf-8"><title>ok</title></head><body><label for="a">A</label><input id="a"><label>B <input name="b"></label><input aria-label="C"><input type="submit"><a href="https://example.com/never-fetched">e</a><a href="mailto:a@b.test">m</a><a href="#top" id="top">t</a></body></html>');
  const r = await testPage(browser, f);
  assert.deepEqual(r.defects, []);
  assert.equal(r.stats.external, 1);
});

test("it only opens pages of ours", () => {
  assert.equal(isOwnTarget("https://example.com/"), false);
  assert.equal(isOwnTarget("http://localhost:3000/x"), true);
  assert.equal(isOwnTarget("file:///C:/x/y.html"), true);
  assert.equal(isOwnTarget("C:/x/y.html"), true);
});
