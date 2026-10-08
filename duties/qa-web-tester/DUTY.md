# Duty: qa-web-tester

The job duty: test a web page in a real browser and file what is broken, with enough detail for an engineer to fix it.

Ads that ask for it: 19 of 34 real fit-60 ads at the survey (`node tools/duty.mjs map` recounts it). Words in the ads:
Playwright, Selenium, Cypress, Puppeteer, test automation, automated test, automation framework.

## What the AI does

`node duties/qa-web-tester/run.mjs <page.html | http://localhost:port/...> [--viewport 1280x800] [--json]`

1. Opens the page in a real Edge or Chrome over the DevTools protocol (the layer Playwright and Puppeteer sit on; no Playwright
   package is installed, see limits) and waits for load.
2. Files, one finding per problem: `console-error` (console.error or an uncaught exception), `bad-request` (a resource that
   answered 4xx/5xx or failed), `broken-link` (a relative link to a file or an `#anchor` that does not exist), `missing-label`
   (input, select or textarea with no label, aria-label or title; a placeholder is not a label), `missing-alt` (img with no alt
   attribute; `alt=""` is allowed), `overflow-x` (the page scrolls sideways: RTL layout overflow), `clipped-text` (a container
   hides content sideways), `missing-lang`, `missing-dir` (Hebrew page without dir=rtl), `no-title`.
3. Prints counts and the finding list; `--json` for another tool.

## Proof

- Test: `node --test duties/qa-web-tester/test.mjs` runs a real browser over `fixtures/queue-planted.html`, a synthetic Hebrew
  RTL queue page with 4 planted defects (broken link, console error, input with only a placeholder, 2400px block): 4 of 4 found
  with the right kinds; `fixtures/queue-clean.html` (the same page without them): 0 findings. More classes are tested on small pages.
- Receipt: a run on the author's own Hebrew queue and tracker pages (a private project, not included), at 1280x800 and 390x844, written by
  `node tools/duty.mjs check qa-web-tester --write-receipt`. The run found one real defect on our own page: the queue table
  scrolls sideways at phone width (390px).

## Honest limits

- It checks what it can see in the DOM and the browser's own logs. It does not click through flows, fill forms, or judge design.
- Contrast, keyboard order and screen-reader behavior are not checked.
- It drives the browser through the DevTools protocol directly (about 150 lines in `tools/lib/browser.mjs`), not through Playwright:
  say "browser automation over the DevTools protocol", never "Playwright tests", about this duty.
- It only opens `file://` pages and localhost. External links are counted, never fetched. It refuses any other host.
- Donors (ideas only): fp-research real-browser driving, design-studio `audit`. No code was copied.
