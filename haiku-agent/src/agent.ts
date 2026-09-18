/**
 * Minimal Claude Agent SDK agent.
 *
 * - Model: Haiku (current generation alias resolved by the CLI)
 * - Auth: the Claude Code login on this machine (subscription). No API key.
 * - Prompts: one concise system prompt, one concise user prompt.
 * - Tools: every built-in tool removed; exactly one custom in-process tool.
 */
import { readFile } from "node:fs/promises";
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

const examServer = createSdkMcpServer({
  name: "exam",
  version: "1.0.0",
  tools: [searchQuestions],
});

// ---------- Prompts ----------

const SYSTEM_PROMPT =
  "You are an exam coach for the Claude Architect certification. " +
  "Use search_questions to fetch real questions from the bank, never invent them. " +
  "Reply in under 120 words: quiz the student, then give the answer and a one-line explanation.";

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
    allowedTools: ["mcp__exam__search_questions"], // auto-approve our tool
    settingSources: [], // no CLAUDE.md, no user/project settings
    maxTurns: 5,
    env,
  },
})) {
  if (message.type === "assistant") {
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
