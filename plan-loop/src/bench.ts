/** Run the loop N times under a fixed protocol and aggregate rounds, pass rate and cost. */
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const N = Number(process.argv[2] ?? 5);
const benchDir = path.join(root, "bench");
mkdirSync(benchDir, { recursive: true });

const sh = (cmd: string, args: string[]) =>
  new Promise<number>((resolve) => {
    const p = spawn(cmd, args, { cwd: root, stdio: "inherit", env: process.env });
    p.on("exit", (code) => resolve(code ?? 1));
  });

const runs: any[] = [];
for (let i = 1; i <= N; i++) {
  const dir = path.join(benchDir, `run-${i}`);
  if (existsSync(path.join(dir, "summary.json"))) {
    runs.push(JSON.parse(readFileSync(path.join(dir, "summary.json"), "utf8")));
    console.log(`bench: run ${i} already done, skipping`);
    continue;
  }
  console.log(`\n########## bench run ${i}/${N} ##########`);
  await sh("node", ["scripts/reset.mjs"]);
  rmSync(path.join(root, "runs"), { recursive: true, force: true });
  mkdirSync(path.join(root, "runs"));
  const code = await sh("npx", ["tsx", "src/main.ts"]);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  cpSync(path.join(root, "runs"), dir, { recursive: true });
  cpSync(path.join(root, "tools"), path.join(dir, "tools"), { recursive: true });
  for (const f of ["plan.json", "report.md"]) if (existsSync(path.join(root, f))) cpSync(path.join(root, f), path.join(dir, f));
  const summary = existsSync(path.join(dir, "summary.json")) ? JSON.parse(readFileSync(path.join(dir, "summary.json"), "utf8")) : { error: `exit ${code}` };
  runs.push(summary);
}

const ok = runs.filter((r) => !r.error);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const fmt = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : "n/a");
const lines = [
  `# Bench: ${runs.length} runs, fixed plan, seed tool, main model ${ok[0]?.model ?? "?"}`,
  "",
  "| Run | Rounds | Final verified | Converged | Round-1 pass | Main turns | Main cost | Worker cost | Total cost | Minutes | Final tools |",
  "|---|---|---|---|---|---|---|---|---|---|---|",
  ...runs.map((r, i) =>
    r.error
      ? `| ${i + 1} | error: ${r.error} | | | | | | | | | |`
      : `| ${i + 1} | ${r.rounds_used} | ${r.final_verified} | ${r.converged ? "yes" : "no"} | ${r.rounds[0]?.passed ?? "?"}/${r.rounds[0]?.dispatched ?? "?"} | ${r.main_turns} | $${fmt(r.main_cost_usd)} | $${fmt(r.worker_cost_usd)} | $${fmt(r.total_cost_usd)} | ${fmt(r.duration_ms / 60000, 1)} | ${r.final_tools.join(", ")} |`,
  ),
  "",
  `- Converged: ${ok.filter((r) => r.converged).length}/${ok.length}`,
  `- Rounds to finish: mean ${fmt(mean(ok.map((r) => r.rounds_used)), 1)}, min ${Math.min(...ok.map((r) => r.rounds_used))}, max ${Math.max(...ok.map((r) => r.rounds_used))}`,
  `- Total cost per run (API-rate estimate): mean $${fmt(mean(ok.map((r) => r.total_cost_usd)))}, min $${fmt(Math.min(...ok.map((r) => r.total_cost_usd)))}, max $${fmt(Math.max(...ok.map((r) => r.total_cost_usd)))}`,
  `- Minutes per run: mean ${fmt(mean(ok.map((r) => r.duration_ms / 60000)), 1)}`,
  `- Final tool count: ${ok.map((r) => r.final_tools.length).join(", ")}`,
  "",
  "Per-round pass counts:",
  ...ok.map((r, i) => `- run ${i + 1}: ${r.rounds.map((x: any) => `${x.passed}/${x.dispatched}`).join(" -> ")}`),
];
writeFileSync(path.join(benchDir, "results.md"), lines.join("\n") + "\n");
console.log("\n" + lines.join("\n"));
