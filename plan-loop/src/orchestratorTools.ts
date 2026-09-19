/** Tools the main agent uses to dispatch workers and to smoke-test tool files. */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { existsSync, readFileSync } from "node:fs";
import { loadPlan, updatePlan, type Plan } from "./plan.js";
import { verifyAnswer } from "./verify.js";
import { loadToolModules } from "./toolLoader.js";
import { runWorker } from "./worker.js";

export function createOrchestratorServer(root: string) {
  const planPath = path.join(root, "plan.json");
  const toolsDir = path.join(root, "tools");
  const runsDir = path.join(root, "runs");
  const fixedPlanPath = path.join(root, "plan-fixed.json");
  let round = 0;
  const history: { round: number; dispatched: number; passed: number; worker_cost_usd: number; duration_ms: number; tools: string[] }[] = [];

  /** Expected results come from the frozen plan when one exists, so edits to plan.json cannot change grading. */
  const expectedFor = (plan: Plan, id: string): string | undefined => {
    const src: Plan = existsSync(fixedPlanPath) ? JSON.parse(readFileSync(fixedPlanPath, "utf8")) : plan;
    return src.steps.find((s) => s.id === id)?.expected_result;
  };

  const runSubagents = tool(
    "run_subagents",
    "Dispatch Haiku workers in parallel. Each assignment gets its own worker with the current tools/*.mjs, update_plan_steps and final_answer. " +
      "Returns each worker's final answer, status updates, and a tool-call trace (inputs and clipped outputs) so you can see where the tools fell short.",
    {
      assignments: z
        .array(
          z.object({
            step_ids: z.array(z.string()).min(1).describe("Plan step ids this worker owns"),
            prompt: z.string().optional().describe("Extra guidance for this worker (optional)"),
          }),
        )
        .min(1)
        .max(10),
      max_turns: z.number().int().min(2).max(30).optional().describe("Worker turn cap; defaults to 12"),
    },
    async (args) => {
      round += 1;
      const plan = await loadPlan(planPath);
      const known = new Set(plan.steps.map((s) => s.id));
      const bad = args.assignments.flatMap((a) => a.step_ids).filter((id) => !known.has(id));
      if (bad.length) return { content: [{ type: "text", text: `Unknown step ids: ${bad.join(", ")}` }], isError: true };

      // Reset assigned steps so this round's status reflects this round's workers.
      const assigned = args.assignments.flatMap((a) => a.step_ids);
      await updatePlan(planPath, (p) => {
        for (const s of p.steps) if (assigned.includes(s.id)) { s.status = "pending"; s.note = null; s.result = null; s.verified = false; }
      });

      const started = Date.now();
      const results = await Promise.all(
        args.assignments.map((a) =>
          runWorker({ planPath, toolsDir, stepIds: a.step_ids, extraPrompt: a.prompt, maxTurns: args.max_turns ?? 12 }),
        ),
      );
      const { modules } = await loadToolModules(toolsDir);

      // Verify in code and write verdicts into the plan.
      const planNow = await loadPlan(planPath);
      const verdicts = results.flatMap((w) =>
        w.step_ids.map((id) => {
          const expected = expectedFor(planNow, id) ?? "";
          const v = verifyAnswer(expected, w.final_answer);
          return { step_id: id, ...v };
        }),
      );
      await updatePlan(planPath, (p) => {
        for (const v of verdicts) {
          const step = p.steps.find((s) => s.id === v.step_id);
          if (!step) continue;
          step.verified = v.pass;
          step.status = v.pass ? "done" : "pending";
          if (!v.pass) step.note = `round ${round}: missing numbers [${v.missing_numbers.join(", ")}], missing labels [${v.missing_labels.join(", ")}]`;
        }
      });
      const passed = verdicts.filter((v) => v.pass).length;
      const worker_cost_usd = results.reduce((s, w) => s + w.cost_usd, 0);
      history.push({ round, dispatched: verdicts.length, passed, worker_cost_usd, duration_ms: Date.now() - started, tools: modules.map((m) => m.name) });

      const record = {
        round,
        started_at: new Date(started).toISOString(),
        duration_ms: Date.now() - started,
        tools_available: modules.map((m) => m.name),
        summary: { dispatched: verdicts.length, passed, worker_cost_usd: Number(worker_cost_usd.toFixed(4)) },
        verdicts,
        results,
      };
      await mkdir(runsDir, { recursive: true });
      await writeFile(path.join(runsDir, `round-${String(round).padStart(2, "0")}.json`), JSON.stringify(record, null, 2));
      return { content: [{ type: "text", text: JSON.stringify(record, null, 2) }] };
    },
    { alwaysLoad: true },
  );

  const testTool = tool(
    "test_tool",
    "Load tools/*.mjs fresh and call one tool with the given arguments. Use it to check a tool compiles and returns what you intend before dispatching workers.",
    {
      name: z.string().describe("Tool name as exported by the module"),
      args_json: z.string().optional().describe("Arguments to pass, as a JSON object string; omit for {}"),
    },
    async (args) => {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(args.args_json ?? "{}");
      } catch (err) {
        return { content: [{ type: "text", text: `args_json is not valid JSON: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
      const { modules, errors } = await loadToolModules(toolsDir);
      const mod = modules.find((m) => m.name === args.name);
      if (!mod) {
        return {
          content: [{ type: "text", text: `No tool named ${args.name}. Loaded: ${modules.map((m) => m.name).join(", ") || "(none)"}. Errors: ${errors.join("; ") || "none"}` }],
          isError: true,
        };
      }
      try {
        const out = await mod.handler(parsed);
        return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Handler threw: ${err instanceof Error ? err.stack ?? err.message : String(err)}` }], isError: true };
      }
    },
    { alwaysLoad: true },
  );

  const server = createSdkMcpServer({ name: "orchestrator", version: "1.0.0", tools: [runSubagents, testTool] });
  return { server, history };
}
