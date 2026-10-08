// Runs every duty's test.mjs and prints one line per duty. Exit code 1 if any fails.
import { readdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;
for (const d of readdirSync(join(root, "duties")).sort()) {
  const t = join(root, "duties", d, "test.mjs");
  if (!existsSync(t)) continue;
  const r = spawnSync(process.execPath, [t], { cwd: root, encoding: "utf8", timeout: 120000 });
  const ok = r.status === 0;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${d}`);
  if (!ok) console.log((r.stdout + r.stderr).split("\n").slice(-8).join("\n"));
}
console.log(failed ? `\n${failed} duty test(s) failed` : "\nall duty tests pass");
process.exit(failed ? 1 : 0);
