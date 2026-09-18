# Haiku exam-coach agent

A minimal agent built on the **Claude Agent SDK** (TypeScript). It runs on the
Claude Code login of the machine (subscription), so **no `ANTHROPIC_API_KEY` is
needed**. The script even strips that variable from the subprocess environment
so the subscription login is always what gets used.

What the agent is made of, and nothing else:

| Piece | Where |
|---|---|
| Model | `haiku` (the CLI resolves the alias to the current Haiku) |
| System prompt | One short string in `src/agent.ts` |
| User prompt | CLI argument, or a default in `src/agent.ts` |
| Custom tools | `search_questions`, `write_memory`, `read_memory`, in-process MCP tools in `src/agent.ts` |
| Mock data | `data/questions.json`, a 12-question exam bank |
| Memory | `data/memory.json`, written by the agent, gitignored |

All built-in Claude Code tools are removed (`tools: []`), no `CLAUDE.md` or
settings files are loaded (`settingSources: []`), and the three tools are
pre-approved (`allowedTools`) so nothing prompts for permission.

## Goal of the agent

An exam coach for the Claude Architect certification. It must fetch questions
from the bank through the tool instead of inventing them, then quiz the student
and reveal the answer with a one-line explanation.

## Run

```bash
cd haiku-agent
npm install
claude auth status        # must show loggedIn: true
npm start                 # default prompt
npm start -- "Give me a hard question about agents"
```

Example output:

```
[tool call] mcp__exam__search_questions {"topic":"prompt-caching","difficulty":"medium","limit":1}

**Quiz:** A team reports cache_read_input_tokens is always zero ...
...
[done] turns=2 model=claude-haiku-4-5-20251001 est_cost_usd=0.0066
```

The cost line is the SDK's estimate of what the call would cost at API rates.
Under a subscription it is informational only.

## The tools

`write_memory(key, value)` saves a note to `data/memory.json`.
`read_memory(key?)` returns one note or all of them. The file survives between
runs, so a note written in one `npm start` is available in the next. The system
prompt tells the agent to read memory first and to write it when the student
shares something worth keeping.

```
npm start -- "My name is Max and I keep failing prompt caching. Remember that."
npm start -- "Who am I and what should I practice?"   # new process, recalls Max
```

`search_questions(topic?, difficulty?, limit=3)` filters `data/questions.json`
by topic slug and difficulty and returns the matching questions as JSON,
including the correct answer and explanation. An unknown topic returns an
error result listing the available topics so the model can recover.

Available topics: `prompt-caching`, `tool-use`, `agents`, `thinking`,
`batches`, `structured-outputs`, `context-management`.

## Files

```
haiku-agent/
├── data/questions.json   mock question bank
├── src/agent.ts          prompts, tool, and the query() call
├── package.json
└── tsconfig.json
```
