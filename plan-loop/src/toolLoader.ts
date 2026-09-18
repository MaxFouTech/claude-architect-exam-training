/** Loads worker tool modules from tools/*.mjs, fresh on every call so main-agent edits are picked up. */
import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { tool, type SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";

export interface ToolModule {
  name: string;
  description: string;
  schema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<{ content: unknown[]; isError?: boolean }>;
}

export async function loadToolModules(toolsDir: string): Promise<{ modules: ToolModule[]; errors: string[] }> {
  const files = (await readdir(toolsDir)).filter((f) => f.endsWith(".mjs") && !f.startsWith("_")).sort();
  const modules: ToolModule[] = [];
  const errors: string[] = [];
  for (const file of files) {
    const url = pathToFileURL(path.join(toolsDir, file)).href + `?v=${Date.now()}`; // cache-bust
    try {
      const mod = (await import(url)) as Partial<ToolModule>;
      if (!mod.name || !mod.description || !mod.schema || typeof mod.handler !== "function") {
        errors.push(`${file}: must export name, description, schema, handler`);
        continue;
      }
      modules.push(mod as ToolModule);
    } catch (err) {
      errors.push(`${file}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { modules, errors };
}

/** Wrap a module in an SDK tool. Handler errors become isError results so the worker can react. */
export function toSdkTool(mod: ToolModule): SdkMcpToolDefinition<any> {
  return tool(
    mod.name,
    mod.description,
    mod.schema as any,
    async (args: Record<string, unknown>) => {
      try {
        return (await mod.handler(args)) as any;
      } catch (err) {
        return {
          content: [{ type: "text", text: `Tool ${mod.name} threw: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
    { alwaysLoad: true },
  );
}
