---
name: campaign-builder
description: Use when someone hands you a file-only marketing campaign folder and wants to know if it is shippable: every link carries lowercase utm_source plus utm_medium plus utm_campaign, no email or phone in the files, campaign.json names the triple, visits and sales join back by UTM. Runs the deterministic campaign checker in this folder. Never posts or sends.
---

# Campaign builder (skill)

When to use: a campaign folder (ours or a donor-shaped one) before it ships or before a DONE is claimed. Files only: nothing here ever posts, sends or publishes.

Steps:

1. `node duties/campaign-builder/run.mjs <campaign-dir> --json` gives `defects` (each with kind, file, line and detail) plus file, post, link and check counts plus the `join` (visits_joined of visits_total, sales_joined of sales_total by UTM re-match).
2. Fix in this order: `pii` first (strip the address or number), then `missing-field` (name the triple in campaign.json), then `missing-utm` (tag the link), then `bad-utm` (lowercase the name or value).
3. Relative links and anchors (`/docs/x`, `#top`) need no UTM: only http(s) links are held to the triple.
4. A post date is not personal data; an email or a phone always is.

Not for: judging copy quality, whether the visits are real, or whether the money is real (the scan proves traceability, never revenue).
Test: `node --test duties/campaign-builder/test.mjs`.
