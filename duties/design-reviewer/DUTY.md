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
  colors, logical CSS and the file entry point).
- Receipt: `receipt.json`, a run on our real pages
  `from-design-studio/O-007/page.html` plus `page-en.html` with `cv.css` (2
  pages, 7 checks, 0 defects: the adopted O-007 layout passes its own review),
  written by `node tools/duty.mjs check design-reviewer --write-receipt`.

## Honest limits

- It reads shape, not beauty: a labelled, alted, token-clean page can still
  look wrong, and contrast ratios are the design-studio audit's job, not this
  scan's (no luminance math here).
- Regex over markup, not a parser: pathological nesting or case tricks can
  fool it; the fixtures pin the shapes we claim.
- Named colors (`red`, `blue`) are not flagged: hex and functions cover what
  our pages actually use.
- The O-007 real target is clean by construction (the donor audit already
  gates it): the receipt proves no false alarms on a real Hebrew-first RTL
  page, the planted fixture proves finding power.
- No model, no browser: it is a deterministic core. The agent in `agent.md`
  adds the judgment (which finding blocks the ship, what the smallest fix is).
- Donor named by the team design: design-studio `audit`, `judge` and `tokens`
  (per-check list, per-kind counts, tokens.css as the only color source). Their
  ideas were reimplemented for any page of ours; 0 lines copied.
