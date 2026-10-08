---
name: qa-web-tester
description: Use when a web page of ours (a local HTML file or a localhost app) needs a browser check for console errors, failed requests, broken links, unlabelled inputs, missing alt text, sideways scrolling in RTL layouts, or a missing lang, dir or title. Drives Edge or Chrome over the DevTools protocol.
---
# QA web tester (skill)

When to use: before a page ships, after a layout change, or when a Hebrew RTL page may overflow on a phone.

Steps:
1. `node duties/qa-web-tester/run.mjs <page> --json` at desktop width, then `--viewport 390x844`.
2. Each finding has a `kind` and a `detail` naming the element or link. Fix or file one by one.
3. Re-run until the count is 0, or the remaining findings are written down as accepted.

Not for: third-party sites (it refuses them), flows that need clicking, visual design review.
Test: `node --test duties/qa-web-tester/test.mjs` (real browser, planted defects).
