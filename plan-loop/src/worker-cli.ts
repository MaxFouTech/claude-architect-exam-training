/** Run one worker by hand: npm run worker -- s1 s2 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runWorker } from "./worker.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stepIds = process.argv.slice(2);
if (!stepIds.length) {
  console.error("usage: npm run worker -- <step_id> [more step ids]");
  process.exit(1);
}
const res = await runWorker({ planPath: path.join(root, "plan.json"), toolsDir: path.join(root, "tools"), stepIds });
console.log(JSON.stringify(res, null, 2));
