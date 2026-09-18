// Restore the seed tool set and clear the plan so the loop starts from scratch.
import { cpSync, existsSync, readdirSync, rmSync } from "node:fs";
const root = new URL("../", import.meta.url);
const tools = new URL("tools/", root);
for (const f of readdirSync(tools)) rmSync(new URL(f, tools));
cpSync(new URL("tools-seed/", root), tools, { recursive: true });
for (const f of ["plan.json", "report.md"]) if (existsSync(new URL(f, root))) rmSync(new URL(f, root));
console.log("reset: tools/ restored from tools-seed/, plan.json and report.md removed");
