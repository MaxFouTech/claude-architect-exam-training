# plan-loop: a main agent that evolves tools for Haiku workers

A main agent writes a validated plan, hands it to parallel **Haiku** workers,
checks their answers against results it already knows, and then **refactors the
workers' tools** (description, signature, algorithm) until the plan passes.
Everything runs on the Claude Code subscription login. No API key.

```
main agent (Opus by default)              Haiku workers, in parallel
────────────────────────────              ────────────────────────────
1. read data, compute ground truth  ──►   plan.json (expected results hidden)
2. write/refactor tools/*.mjs       ──►   tools loaded fresh per dispatch
3. run_subagents(assignments)       ──►   each worker gets:
4. compare answers vs expected            - the tools the main agent built
5. fix tools, re-dispatch failures        - update_plan_steps (one or many)
6. write report.md                        - final_answer (last tool)
```

## Run

```bash
cd plan-loop
npm install
claude auth status            # must show loggedIn: true
npm run reset                 # restore the deliberately weak seed tool
npm run loop                  # full loop; watch runs/main-log.txt
```

Options: `MAIN_MODEL=sonnet npm run loop` (default `opus`), `MAX_ROUNDS=3`.
Pass a different task as the argument: `npm run loop -- "your task"`.

## The test scenario

`data/orders.json` holds 400 deterministic mock orders (Jan to Jun 2026) with
region, customer, product, category, quantity, unit price and status. The task
is a half-year sales review: totals, regional breakdown, top customers, monthly
trend, refund behaviour, product insights.

The seed tool `tools-seed/query_orders.mjs` returns raw rows capped at 50. A
Haiku worker cannot answer aggregate questions with it, which is the point: the
main agent has to observe that in the traces and evolve the tools.

## Files

| Path | What |
|---|---|
| `src/main.ts` | Main agent: system prompt, loop rules, built-in tools plus `run_subagents` and `test_tool` |
| `src/orchestratorTools.ts` | `run_subagents` (parallel dispatch, trace capture, writes `runs/round-NN.json`) and `test_tool` |
| `src/worker.ts` | Haiku worker: loads `tools/*.mjs`, adds `update_plan_steps` and `final_answer`, captures the trace |
| `src/plan.ts` | Plan schema, serialized writes so parallel workers do not clobber each other |
| `src/toolLoader.ts` | Loads tool modules fresh (cache-busted) on every dispatch |
| `tools/` | Live tool set the main agent edits. `tools-seed/` is the starting point |
| `plan.json` | The shared plan. Written by the main agent, statuses updated by workers |
| `runs/` | Per-round traces and the main agent log (gitignored) |
| `report.md` | Written by the main agent at the end of the loop |

## Worker tool contract

A tool is one `.mjs` file in `tools/`:

```js
import { readFileSync } from "node:fs";
import { z } from "zod";
export const name = "aggregate_orders";
export const description = "…what it does, in words a worker can act on…";
export const schema = { group_by: z.enum(["region", "month"]), metric: z.enum(["revenue", "count"]) };
export async function handler(args) {
  const orders = JSON.parse(readFileSync(new URL("../data/orders.json", import.meta.url), "utf8"));
  // …
  return { content: [{ type: "text", text: JSON.stringify(result) }] };
}
```

Files starting with `_` are ignored. Handler exceptions reach the worker as
error results, not crashes. Use `.optional()` for optional parameters and apply
defaults inside the handler: a zod `.default()` is rejected as a missing required
field when the worker omits it.

## Running one worker by hand

```bash
npm run worker -- s1 s3     # runs a Haiku worker on steps s1 and s3 of plan.json
```
