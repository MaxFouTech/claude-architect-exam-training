/** Shared plan file: schema, load/save, and a serialized updater safe for parallel workers. */
import { readFile, writeFile } from "node:fs/promises";

export type StepStatus = "pending" | "in_progress" | "done" | "blocked" | "failed";

export interface PlanStep {
  id: string;
  title: string;
  instructions: string;
  /** Known to the main agent only; never shown to workers. */
  expected_result: string;
  status: StepStatus;
  /** Last answer a worker gave for this step. */
  result?: string | null;
  /** Free-text note from a worker (why blocked, what was missing). */
  note?: string | null;
  /** Main agent's verdict after comparing result to expected_result. */
  verified?: boolean;
}

export interface Plan {
  goal: string;
  steps: PlanStep[];
}

export async function loadPlan(planPath: string): Promise<Plan> {
  return JSON.parse(await readFile(planPath, "utf8"));
}

// All workers run inside this one process, so a promise chain is enough to serialize writes.
let queue: Promise<unknown> = Promise.resolve();

export function updatePlan(planPath: string, mutate: (plan: Plan) => void): Promise<Plan> {
  const next = queue.then(async () => {
    const plan = await loadPlan(planPath);
    mutate(plan);
    await writeFile(planPath, JSON.stringify(plan, null, 2) + "\n", "utf8");
    return plan;
  });
  queue = next.catch(() => undefined);
  return next;
}

/** The view a worker gets: its assigned steps without expected results, plus the plan outline. */
export function workerView(plan: Plan, stepIds: string[]): string {
  const outline = plan.steps.map((s) => `- ${s.id} [${s.status}] ${s.title}`).join("\n");
  const assigned = plan.steps
    .filter((s) => stepIds.includes(s.id))
    .map((s) => `### ${s.id}: ${s.title}\n${s.instructions}`)
    .join("\n\n");
  return `Goal: ${plan.goal}\n\nPlan outline:\n${outline}\n\nYour assigned steps:\n\n${assigned}`;
}
