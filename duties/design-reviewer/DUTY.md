# Duty: design-reviewer

The job duty: take a page of ours and hand back what is wrong with its design
review before it ships: accessibility gaps (images without alt, inputs without
a label, missing lang, missing title, a Hebrew page without dir=rtl), design
tokens (color only through `var(--*)`, never a hardcoded hex or rgb) and
RTL-safe CSS (logical `margin-inline` and `padding-block`, never physical
`margin-left` or `float:left`).

Ads that ask for it: 4 of 34 real fit-60 ads at the first survey (2026-10-04;
`node tools/duty.mjs map` recounts it).
Words in the ads: design review, accessib, usability, design system, figma,
design token.

## What the AI does

`node duties/design-reviewer/run.mjs <page.html> [--css <file.css>] [--json]`

1. Files `missing-alt` for every `<img>` without an `alt` attribute (an empty
   `alt=""` for a decorative image passes).
2. Files `missing-label` for every input, select and textarea that has no
   `label for`, no wrapping `<label>`, no `aria-label`, `aria-labelledby` or
   `title` (submit, button, reset, hidden and image types are skipped).
3. Files `missing-lang` when `<html>` names no `lang`, `no-title` when the head
   has no non-empty `<title>`, and `missing-dir` when a Hebrew page rides
   without `dir=rtl`.
4. Files `hardcoded-color` for a hex, `rgb()` or `hsl()` literal in an inline
   style, a `<style>` block or the `--css` file: color must come through
   `var(--*)` from the token file.
5. Files `physical-css` for a physical property (`margin-left`, `float:left`,
   `text-align:right`, bare `left:`/`right:` and kin) in the same places: RTL
   pages use logical properties only.

Seven checks, one per rule group above.

## Proof

- Test: `node --test duties/design-reviewer/test.mjs` (planted page: 12 lines,
  all 6 planted defects found one per kind on the planted lines; clean page: 0
  findings; temp cases cover the Hebrew dir rule, labelled inputs, token
  colors, logical CSS and the file entry point; the `--real` target, the
  invented `fixtures/sample-page/`, files its 4 planted defects, one per kind).
- Receipt: `receipt.json`, an older run (2 pages, 7 checks, 0 defects) on a
  two-page real layout that was removed from this repo on 2026-10-10. The
  receipt keeps its counts only, was written by the private project's
  `tools/duty.mjs` (not in this repo), and does not match the `--real` target
  above. It has not been re-run on the sample page.

## Honest limits

- It reads shape, not beauty: a labelled, alted, token-clean page can still
  look wrong, and contrast ratios are not checked here (no luminance math).
- Regex over markup, not a parser: pathological nesting or case tricks can
  fool it; the fixtures pin the shapes we claim.
- Named colors (`red`, `blue`) are not flagged: hex and functions cover what
  our pages actually use.
- The `--real` target is invented and has 4 planted defects on purpose: it
  proves the tool files findings, not that a real page is clean. The old
  receipt (0 defects on a Hebrew-first RTL layout) was a no-false-alarm check
  on a page that is no longer in this repo.
- No model, no browser: it is a deterministic core. The agent in `agent.md`
  adds the judgment (which finding blocks the ship, what the smallest fix is).
