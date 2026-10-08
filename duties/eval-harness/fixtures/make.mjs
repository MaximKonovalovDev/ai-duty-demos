// Regenerates the three answer sets from a seeded generator: node duties/eval-harness/fixtures/make.mjs
// Same 10 cases x 5 runs each; a failing answer breaks exactly one rubric check, picked in turn.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
function rng(seed) { let a = seed; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export const cases = Array.from({ length: 10 }, (_, i) => ({
  id: `c${i + 1}`,
  checks: [
    { name: "verdict-line", kind: "regex", value: "^VERDICT: (PASS|FAIL|BLOCKED)$", flags: "m" },
    { name: "max-8-lines", kind: "maxLines", value: 8 },
    { name: "revert-line", kind: "regex", value: "^revert:", flags: "mi" },
    { name: "no-email", kind: "notRegex", value: "[\\w.+-]+@[\\w-]+\\.[\\w.-]+" },
  ],
}));

const good = (c) => `VERDICT: PASS\nchanged: ${c} output checked\nrevert: git restore ${c}.txt`;
const bad = [
  (c) => `looks fine to me, ${c} is ok\nrevert: git restore ${c}.txt`,
  (c) => `VERDICT: PASS\n${Array.from({ length: 9 }, (_, i) => `note ${i + 1} about ${c}`).join("\n")}\nrevert: git restore ${c}.txt`,
  (c) => `VERDICT: PASS\nchanged: ${c}\nrevert: git restore ${c}.txt\ncontact: someone@example.test`,
  (c) => `VERDICT: PASS\nchanged: ${c} output checked`,
];

function make(seed, failures) {
  const r = rng(seed);
  const slots = Array.from({ length: 50 }, (_, i) => i);
  for (let i = slots.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [slots[i], slots[j]] = [slots[j], slots[i]]; }
  const failing = new Set(slots.slice(0, failures));
  const answers = [];
  let k = 0;
  cases.forEach((c, ci) => { for (let run = 1; run <= 5; run++) { const idx = ci * 5 + run - 1; answers.push({ case: c.id, run, text: failing.has(idx) ? bad[k++ % bad.length](c.id) : good(c.id) }); } });
  return { answers };
}

writeFileSync(join(here, "cases.json"), JSON.stringify({ cases }, null, 2) + "\n");
writeFileSync(join(here, "answers-baseline.json"), JSON.stringify(make(11, 2), null, 1) + "\n");
writeFileSync(join(here, "answers-same.json"), JSON.stringify(make(23, 4), null, 1) + "\n");
writeFileSync(join(here, "answers-degraded.json"), JSON.stringify(make(37, 17), null, 1) + "\n");
console.log("fixtures written");
