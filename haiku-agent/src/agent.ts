/**
 * Minimal Claude Agent SDK agent.
 *
 * - Model: Haiku (current generation alias resolved by the CLI)
 * - Auth: the Claude Code login on this machine (subscription). No API key.
 * - Prompts: one concise system prompt, one concise user prompt.
 * - Tools: every built-in tool removed; three custom in-process tools
 *   (search_questions, write_memory, read_memory). Memory lives in data/memory.json.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSdkMcpServer, query, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

// ---------- Mock data (exam question bank) ----------

type Difficulty = "easy" | "medium" | "hard";

interface Question {
  id: string;
  topic: string;
  difficulty: Difficulty;
  question: string;
  choices: Record<string, string>;
  answer: string;
  explanation: string;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const questions: Question[] = JSON.parse(
  await readFile(path.join(here, "..", "data", "questions.json"), "utf8"),
);

// ---------- The one custom tool ----------

const searchQuestions = tool(
  "search_questions",
  "Search the exam question bank. Filter by topic and/or difficulty. Returns questions with choices, the correct answer, and an explanation.",
  {
    topic: z
      .string()
      .optional()
      .describe("Topic slug, e.g. prompt-caching, tool-use, agents, thinking, batches, structured-outputs, context-management"),
    difficulty: z.enum(["easy", "medium", "hard"]).optional().describe("Difficulty filter"),
    limit: z.number().int().min(1).max(10).default(3).describe("Max questions to return"),
  },
  async (args) => {
    const hits = questions.filter(
      (q) =>
        (!args.topic || q.topic === args.topic.toLowerCase().trim()) &&
        (!args.difficulty || q.difficulty === args.difficulty),
    );
    if (hits.length === 0) {
      const topics = [...new Set(questions.map((q) => q.topic))].join(", ");
      return {
        content: [{ type: "text", text: `No questions match. Available topics: ${topics}` }],
        isError: true,
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(hits.slice(0, args.limit), null, 2) }],
    };
  },
  { annotations: { readOnlyHint: true }, alwaysLoad: true },
);

// ---------- Memory tools (persisted to disk across runs) ----------

const MEMORY_FILE = path.join(here, "..", "data", "memory.json");

async function loadMemory(): Promise<Record<string, string>> {
  try {
    return JSON.parse(await readFile(MEMORY_FILE, "utf8"));
  } catch {
    return {};
  }
}

async function saveMemory(memory: Record<string, string>): Promise<void> {
  await mkdir(path.dirname(MEMORY_FILE), { recursive: true });
  await writeFile(MEMORY_FILE, JSON.stringify(memory, null, 2) + "\n", "utf8");
}

const writeMemory = tool(
  "write_memory",
  "Save a short note under a key so it can be recalled in later sessions. Overwrites any existing value for that key.",
  {
    key: z.string().min(1).describe("Short snake_case key, e.g. student_name, weak_topics"),
    value: z.string().min(1).describe("The note to remember"),
  },
  async (args) => {
    const memory = await loadMemory();
    memory[args.key] = args.value;
    await saveMemory(memory);
    return { content: [{ type: "text", text: `Saved ${args.key}. Memory now has ${Object.keys(memory).length} entries.` }] };
  },
  { annotations: { idempotentHint: true }, alwaysLoad: true },
);

const readMemory = tool(
  "read_memory",
  "Read saved notes. Pass a key for one note, or omit it to get every note.",
  {
    key: z.string().optional().describe("Key to read; omit for all notes"),
  },
  async (args) => {
    const memory = await loadMemory();
    if (args.key) {
      const value = memory[args.key];
      return value === undefined
        ? { content: [{ type: "text", text: `No memory for key "${args.key}". Known keys: ${Object.keys(memory).join(", ") || "(none)"}` }], isError: true }
        : { content: [{ type: "text", text: value }] };
    }
    return {
      content: [{ type: "text", text: Object.keys(memory).length ? JSON.stringify(memory, null, 2) : "Memory is empty." }],
    };
  },
  { annotations: { readOnlyHint: true }, alwaysLoad: true },
);

const examServer = createSdkMcpServer({
  name: "exam",
  version: "1.0.0",
  tools: [searchQuestions, writeMemory, readMemory],
});

// ---------- Prompts ----------

const SYSTEM_PROMPT =
  "You are an exam coach for the Claude Architect certification. " +
  "Use search_questions to fetch real questions from the bank, never invent them. " +
  "Start by calling read_memory to recall the student. Use write_memory when the student tells you something worth keeping, " +
  "such as their name or weak topics. Reply in under 120 words: quiz the student, then give the answer and a one-line explanation.";

const USER_PROMPT = process.argv.slice(2).join(" ") || "Give me one medium question about prompt caching.";

// ---------- Run ----------

// Guarantee the subscription login is used, even if a key is exported in the shell.
const { ANTHROPIC_API_KEY: _ignored, ...env } = process.env;

for await (const message of query({
  prompt: USER_PROMPT,
  options: {
    model: "haiku",
    systemPrompt: SYSTEM_PROMPT,
    tools: [], // remove every built-in tool
    mcpServers: { exam: examServer },
    allowedTools: ["mcp__exam__*"], // auto-approve our three tools
    settingSources: [], // no CLAUDE.md, no user/project settings
    maxTurns: 5,
    env,
  },
})) {
  if (message.type === "user" && Array.isArray(message.message.content)) {
    for (const block of message.message.content) {
      if (block.type === "tool_result") {
        const text = Array.isArray(block.content)
          ? block.content.map((c) => (c.type === "text" ? c.text : "")).join("")
          : String(block.content ?? "");
        console.log(`[tool result]${block.is_error ? " (error)" : ""}\n${text}\n`);
      }
    }
  } else if (message.type === "assistant") {
    for (const block of message.message.content) {
      if (block.type === "tool_use") {
        console.log(`[tool call] ${block.name} ${JSON.stringify(block.input)}`);
      }
    }
  } else if (message.type === "result") {
    if (message.subtype === "success") {
      console.log("\n" + message.result);
      console.log(
        `\n[done] turns=${message.num_turns} model=${Object.keys(message.modelUsage ?? {}).join(",")} est_cost_usd=${message.total_cost_usd.toFixed(4)}`,
      );
    } else {
      console.error(`[error] ${message.subtype}`);
      process.exitCode = 1;
    }
  }
}
