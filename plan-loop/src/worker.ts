/**
 * A Haiku worker: executes assigned plan steps using
 *   - the tools the main agent built (tools/*.mjs)
 *   - update_plan_steps (one or many steps at once)
 *   - final_answer (always the last tool)
 */
import { createSdkMcpServer, query, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { loadPlan, updatePlan, workerView, type StepStatus } from "./plan.js";
import { loadToolModules, toSdkTool } from "./toolLoader.js";

export interface TraceEntry {
  tool: string;
  input: unknown;
  output: string;
  is_error: boolean;
}

export interface WorkerResult {
  step_ids: string[];
  final_answer: string | null;
  called_final_answer: boolean;
  status_updates: { step_id: string; status: StepStatus; note?: string }[];
  trace: TraceEntry[];
  num_turns: number;
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  error?: string;
}

const WORKER_SYSTEM_PROMPT =
  "You are a worker executing assigned steps of a shared plan. " +
  "Get every number from the tools; never estimate or compute from memory. " +
  "Mark steps in_progress when you start and done, failed, or blocked when you finish, using update_plan_steps. " +
  "If the tools cannot produce what a step needs, mark it blocked and say exactly what tool capability is missing. " +
  "Always finish by calling final_answer with one line per step in the form '<step_id>: <result>'.";

const STATUS = ["in_progress", "done", "blocked", "failed"] as const;
const clip = (s: string, n = 700) => (s.length > n ? s.slice(0, n) + `… [${s.length - n} more chars]` : s);

export async function runWorker(opts: {
  planPath: string;
  toolsDir: string;
  stepIds: string[];
  extraPrompt?: string;
  maxTurns?: number;
}): Promise<WorkerResult> {
  const result: WorkerResult = {
    step_ids: opts.stepIds,
    final_answer: null,
    called_final_answer: false,
    status_updates: [],
    trace: [],
    num_turns: 0,
    cost_usd: 0,
    input_tokens: 0,
    output_tokens: 0,
  };

  const updatePlanSteps = tool(
    "update_plan_steps",
    "Update the status of one or more plan steps. Include a short note for blocked or failed steps.",
    {
      updates: z
        .array(
          z.object({
            step_id: z.string().describe("Step id, e.g. s1"),
            status: z.enum(STATUS),
            note: z.string().optional().describe("Why blocked/failed, or what was found"),
          }),
        )
        .min(1),
    },
    async (args) => {
      const unknown = args.updates.filter((u) => !opts.stepIds.includes(u.step_id)).map((u) => u.step_id);
      if (unknown.length) {
        return { content: [{ type: "text", text: `Not your steps: ${unknown.join(", ")}. Yours: ${opts.stepIds.join(", ")}` }], isError: true };
      }
      await updatePlan(opts.planPath, (plan) => {
        for (const u of args.updates) {
          const step = plan.steps.find((s) => s.id === u.step_id);
          if (step) {
            step.status = u.status;
            if (u.note) step.note = u.note;
          }
        }
      });
      result.status_updates.push(...args.updates);
      return { content: [{ type: "text", text: `Updated ${args.updates.map((u) => `${u.step_id}=${u.status}`).join(", ")}` }] };
    },
    { alwaysLoad: true },
  );

  const finalAnswer = tool(
    "final_answer",
    "Deliver your final answer for all assigned steps. Call this exactly once, as your last action.",
    { answer: z.string().min(1).describe("One line per step: '<step_id>: <result>'") },
    async (args) => {
      result.final_answer = args.answer;
      result.called_final_answer = true;
      await updatePlan(opts.planPath, (plan) => {
        for (const id of opts.stepIds) {
          const step = plan.steps.find((s) => s.id === id);
          if (step) step.result = args.answer;
        }
      });
      return { content: [{ type: "text", text: "Final answer recorded. Stop now; do not call any more tools." }] };
    },
    { alwaysLoad: true },
  );

  const { modules, errors } = await loadToolModules(opts.toolsDir);
  if (errors.length) result.error = `Tool load errors: ${errors.join("; ")}`;

  const server = createSdkMcpServer({
    name: "plan",
    version: "1.0.0",
    tools: [...modules.map(toSdkTool), updatePlanSteps, finalAnswer], // final_answer is last
  });

  const plan = await loadPlan(opts.planPath);
  const prompt = workerView(plan, opts.stepIds) + (opts.extraPrompt ? `\n\nAdditional guidance:\n${opts.extraPrompt}` : "");
  const { ANTHROPIC_API_KEY: _ignored, ...env } = process.env; // subscription login only

  try {
    for await (const message of query({
      prompt,
      options: {
        model: "haiku",
        systemPrompt: WORKER_SYSTEM_PROMPT,
        tools: [],
        mcpServers: { plan: server },
        allowedTools: ["mcp__plan__*"],
        settingSources: [],
        maxTurns: opts.maxTurns ?? 12,
        env,
      },
    })) {
      if (message.type === "assistant") {
        for (const block of message.message.content) {
          if (block.type === "tool_use") {
            result.trace.push({ tool: block.name.replace(/^mcp__plan__/, ""), input: block.input, output: "", is_error: false });
          }
        }
      } else if (message.type === "user" && Array.isArray(message.message.content)) {
        for (const block of message.message.content) {
          if (block.type === "tool_result") {
            const text = Array.isArray(block.content)
              ? block.content.map((c) => (c.type === "text" ? c.text : "")).join("")
              : String(block.content ?? "");
            const entry = [...result.trace].reverse().find((t) => t.output === "");
            if (entry) {
              entry.output = clip(text);
              entry.is_error = Boolean(block.is_error);
            }
          }
        }
      } else if (message.type === "result") {
        result.num_turns = message.num_turns;
        result.cost_usd = message.total_cost_usd;
        for (const u of Object.values(message.modelUsage ?? {})) {
          result.input_tokens += u.inputTokens + u.cacheReadInputTokens + u.cacheCreationInputTokens;
          result.output_tokens += u.outputTokens;
        }
        if (message.subtype !== "success") result.error = `worker ended with ${message.subtype}`;
        else if (!result.called_final_answer) result.final_answer = `(no final_answer call; last text) ${message.result}`;
      }
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }
  return result;
}
