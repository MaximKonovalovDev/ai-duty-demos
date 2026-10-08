// clean demo runner: answers from the local notes file, nothing leaves the machine.
import { readFileSync } from "node:fs";

const notes = readFileSync(new URL("./notes.txt", import.meta.url), "utf8").split("\n");
const q = process.argv.slice(2).join(" ").toLowerCase();
const hit = notes.find((l) => l.toLowerCase().includes(q));
console.log(hit ?? "no note");
