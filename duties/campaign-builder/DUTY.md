# Duty: campaign-builder

The job duty: build marketing campaigns as files only (no posting, no sending):
every link carries UTM so visits and sales join back to the campaign, the files
hold no personal data, and the campaign names its own tracking.

Ads that ask for it: 10 of 34 real fit-60 ads at the first survey (2026-10-04;
`node tools/duty.mjs map` recounts it).
Words in the ads: marketing automation, campaign, growth, seo, analytics, utm, ads.

## What the AI does

`node duties/campaign-builder/run.mjs <campaign-dir> [--json]`

A campaign dir holds `campaign.json` (name plus utm_source, utm_medium,
utm_campaign), `posts/*.md`, and optional `visits.csv` / `sales.csv`
(each row a url plus visits or amount).

1. Files `missing-field` once per missing or empty field when `campaign.json`
   is absent, is not JSON, or lacks utm_source, utm_medium or utm_campaign.
2. Files `missing-utm` once per http(s) link in a post that does not carry the
   full utm_source plus utm_medium plus utm_campaign triple.
3. Files `bad-utm` once per uppercase UTM param name or non-lowercase UTM value,
   in a link or in `campaign.json`.
4. Files `pii` once per line in any campaign file that holds an email or phone
   (a post date like 2026-10-04 is not personal data).

Four checks, one per rule group above. The scoreboard join is a number, not a
defect: visits and sales rows whose URL UTM triple matches the campaign's count
as joined (KNOWN); anything else stays unjoined (UNKNOWN).

## Proof

- Test: `node --test duties/campaign-builder/test.mjs` (planted campaign:
  5 defects of the expected kinds; clean campaign: 0 findings with the join
  100 of 125 visits and 1 of 2 sales; temp-dir cases cover per-field filing,
  case rules, relative-link exemption and the date-is-not-PII rule).
- Receipt: `receipt.json`, a run on our real file-only campaign
  `duties/campaign-builder/example` (the duties portfolio, 3 posts links all
  tagged, join 80 of 90 visits and 1 of 1 sales), written by
  `node tools/duty.mjs check campaign-builder --write-receipt`.

## Honest limits

- It reads links, not marketing quality: a fully tagged campaign that persuades
  nobody still passes the scan.
- UTM is list-based: source, medium and campaign only; content and term ride
  along but are never required.
- The join trusts the CSVs: invented visits count as joined, so the duty proves
  traceability (every sale traces to a tagged link), never that the numbers are
  real. Money stays UNKNOWN until a real store says otherwise.
- Phone detection is digit-run based: an exotic format with few digits is
  missed, and the agent must eyeball what the scan flags.
- Files-only, no posting, no sending: it audits folders and counts joins; a
  campaign leaves this duty as files, never as a published post. The agent in
  `agent.md` adds the judgment (which finding blocks the folder, what the
  smallest fix is).
- No model: it is a deterministic core. Donors named by the team design:
  marketing-studio `tracking_check` (UTM check, no-PII gate) and `scoreboard`
  (visits-sales join by UTM). Their code was read only through the arsenal
  listing; one donor file is copied under `from-marketing-studio/` with its
  license line, none is vendored into the checks.
