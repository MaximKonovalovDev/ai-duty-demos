---
name: design-reviewer
description: Use when a page of ours is about to ship and needs a design review first: accessibility (alt, labels, lang, title, Hebrew dir), design tokens (color only via var(--*)) and RTL-safe logical CSS. Runs the deterministic design reviewer in this folder.
---

# Design reviewer (skill)

When to use: an HTML page of ours (plus its CSS) before it ships or before a DONE is claimed.

Steps:

1. `node duties/design-reviewer/run.mjs <page.html> --css <file.css> --json` gives `defects` (each with kind, line and detail) plus page and check counts.
2. Fix in this order: `missing-label` first (a control nobody can name cannot
   be used), then `missing-alt` (describe the image or mark it decorative),
   then `missing-lang`, `no-title`, `missing-dir` (set the attribute), then
   `hardcoded-color` (move the value into the token file, use `var(--*)`),
   then `physical-css` (switch to the logical property).
3. A decorative image takes `alt=""`: present and empty is clean, missing is a defect.
4. The adopted O-007 layout (`from-design-studio/O-007/`) is the reference:
   `page.html` plus `page-en.html` with `cv.css` scan clean.

Not for: judging beauty, contrast ratios or a real screen-reader pass (the scan reads shape, not the eye).
Test: `node --test duties/design-reviewer/test.mjs`.
