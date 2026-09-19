/**
 * Main agent: writes a validated plan, builds tools for Haiku workers, dispatches them in
 * parallel, compares results to expected results, and evolves the tools until the plan passes.
 */
import { existsSync } from "node:fs";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { createOrchestratorServer } from "./orchestratorTools.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAIN_MODEL = process.env.MAIN_MODEL ?? "opus";
const MAX_ROUNDS = Number(process.env.MAX_ROUNDS ?? 4);
const FIXED_PLAN = existsSync(path.join(root, "plan-fixed.json"));

const SYSTEM_PROMPT = `You are the lead engineer of a tool-building loop. You never solve the business task yourself. Your job is to make cheap Haiku workers able to solve it by designing and iteratively improving the tools they use.

Working directory layout:
- data/orders.json: the dataset. Read it first and learn the fields.
- plan.json: the shared plan you write. JSON: {"goal": string, "steps": [{"id": "s1", "title", "instructions", "expected_result", "status": "pending"}]}. Instructions are what a worker sees; expected_result is yours only. Compute every expected_result with Bash (node -e over data/orders.json) BEFORE writing the plan. Never guess an expected result.
- tools/*.mjs: worker tools. Each file exports: name (string), description (string), schema (a zod raw shape object, import { z } from "zod"), and async handler(args) returning { content: [{ type: "text", text }], isError?: boolean }. Read data with readFileSync(new URL("../data/orders.json", import.meta.url)). Use .optional() for optional parameters and apply defaults in the handler; zod .default() is rejected as a missing required field at the MCP boundary. Keep all logic inside the tool file; files starting with _ are ignored. Workers always also get update_plan_steps and final_answer.
- runs/round-NN.json: full trace of each dispatch, written automatically.

Your tools: Read, Write, Edit, Glob, Bash for files and ground truth; test_tool to smoke-test a tool file; run_subagents to dispatch workers in parallel (one worker per step unless steps are trivially related).

The loop, at most ${MAX_ROUNDS} rounds of run_subagents:
1. ${FIXED_PLAN
    ? "plan.json is FIXED for this experiment. Read it, but never edit it: not the instructions, not the expected results. Only the tools may change."
    : 'Write plan.json with 6 to 8 ambitious, precise, verifiable steps. Each instruction must state the exact output format (numbers rounded to 2 decimals, ranked lists as "name: value").'}
2. Read the current tools but do NOT modify or add any tool before the first dispatch. Round 1 must run with the tools exactly as they are: its traces are the evidence that drives your tool design. Dispatch every pending step.
3. ${FIXED_PLAN
    ? "Verification is automatic: run_subagents returns a verdict per step (missing numbers and labels) and records it in plan.json. You cannot override it."
    : "Compare each final answer with expected_result. In plan.json set verified true and status done for exact matches; otherwise verified false, status pending, and a note on what went wrong."} Then study the traces: did the worker drown in raw rows, lack an aggregation, misread a parameter, hit a cap, or do arithmetic by hand?
4. Improve the tools based on that evidence: rewrite descriptions, change signatures, rewrite algorithms, add or merge tools. Prefer a small set of general tools over one tool per step. Smoke-test each changed tool with test_tool.
5. Re-dispatch only unverified steps. Stop when all steps are verified or the round budget is spent.

Finally write report.md: for each round, the pass count, what the traces showed, and exactly what you changed in the tools and why. End with the final tool set (name, signature, one-line purpose). Be factual and brief. Then reply with a three-line summary.`;

const USER_PROMPT =
  process.argv.slice(2).join(" ") ||
  "Task for the workers: a half-year sales review of data/orders.json (Jan-Jun 2026). Cover totals, regional breakdowns, top customers, monthly trend, refund behaviour by category, and product-level insights. Build the plan, then run the loop.";

await mkdir(path.join(root, "runs"), { recursive: true });
const logPath = path.join(root, "runs", "main-log.txt");
const log = async (s: string) => { process.stdout.write(s); await appendFile(logPath, s); };
await log(`\n===== main agent start ${new Date().toISOString()} model=${MAIN_MODEL} =====\n`);

const { ANTHROPIC_API_KEY: _ignored, ...env } = process.env; // subscription login only
const orchestrator = createOrchestratorServer(root);
const startedAt = Date.now();
let mainCost = 0;
let mainTurns = 0;

for await (const message of query({
  prompt: USER_PROMPT,
  options: {
    model: MAIN_MODEL,
    cwd: root,
    systemPrompt: SYSTEM_PROMPT,
    tools: ["Read", "Write", "Edit", "Glob", "Bash"],
    mcpServers: { orchestrator: orchestrator.server },
    allowedTools: ["Read", "Write", "Edit", "Glob", "Bash", "mcp__orchestrator__*"],
    permissionMode: "acceptEdits",
    settingSources: [],
    maxTurns: 120,
    env,
  },
})) {
  if (message.type === "assistant") {
    for (const block of message.message.content) {
      if (block.type === "text") await log(`\n${block.text}\n`);
      else if (block.type === "tool_use") {
        const input = JSON.stringify(block.input);
        await log(`\n> ${block.name} ${input.length > 300 ? input.slice(0, 300) + "…" : input}\n`);
      }
    }
  } else if (message.type === "result") {
    if (message.subtype === "success") {
      mainCost = message.total_cost_usd;
      mainTurns = message.num_turns;
      await log(`\n===== done: turns=${message.num_turns} est_cost_usd=${message.total_cost_usd.toFixed(2)} models=${Object.keys(message.modelUsage ?? {}).join(",")} =====\n`);
    } else {
      await log(`\n===== ended with ${message.subtype} =====\n`);
      process.exitCode = 1;
    }
  }
}

// Machine-readable summary for the bench runner.
const rounds = orchestrator.history;
const workerCost = rounds.reduce((s, r) => s + r.worker_cost_usd, 0);
const summary = {
  model: MAIN_MODEL,
  fixed_plan: FIXED_PLAN,
  duration_ms: Date.now() - startedAt,
  main_turns: mainTurns,
  rounds: rounds.map((r) => ({ ...r, worker_cost_usd: Number(r.worker_cost_usd.toFixed(4)) })),
  rounds_used: rounds.length,
  converged: false,
  main_cost_usd: Number(mainCost.toFixed(4)),
  worker_cost_usd: Number(workerCost.toFixed(4)),
  total_cost_usd: Number((mainCost + workerCost).toFixed(4)),
  final_tools: rounds.at(-1)?.tools ?? [],
};
{
  const { loadPlan } = await import("./plan.js");
  const plan = await loadPlan(path.join(root, "plan.json"));
  const verified = plan.steps.filter((s) => s.verified).length;
  summary.converged = verified === plan.steps.length;
  (summary as any).final_verified = `${verified}/${plan.steps.length}`;
}
await writeFile(path.join(root, "runs", "summary.json"), JSON.stringify(summary, null, 2));
await log(`summary: ${JSON.stringify({ rounds: summary.rounds_used, verified: (summary as any).final_verified, total_cost_usd: summary.total_cost_usd })}\n`);
