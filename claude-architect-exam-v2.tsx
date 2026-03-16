import { useState, useEffect, useRef, useCallback } from "react";

const SCENARIOS = [
  {
    id: 1, name: "Customer Support Resolution Agent",
    desc: "You are building a customer support resolution agent using the Claude Agent SDK. The agent handles high-ambiguity requests like returns, billing disputes, and account issues via MCP tools (get_customer, lookup_order, process_refund, escalate_to_human). Your target is 80%+ first-contact resolution while knowing when to escalate.",
    domains: [1, 2, 5], color: "#E85D3A"
  },
  {
    id: 2, name: "Code Generation with Claude Code",
    desc: "You are using Claude Code to accelerate software development. Your team uses it for code generation, refactoring, debugging, and documentation. You need to integrate it into your development workflow with custom slash commands, CLAUDE.md configurations, and understand when to use plan mode vs direct execution.",
    domains: [3, 5], color: "#2D9CDB"
  },
  {
    id: 3, name: "Multi-Agent Research System",
    desc: "You are building a multi-agent research system using the Claude Agent SDK. A coordinator agent delegates to specialized subagents: one searches the web, one analyzes documents, one synthesizes findings, and one generates reports. The system produces comprehensive, cited reports.",
    domains: [1, 2, 5], color: "#27AE60"
  },
  {
    id: 4, name: "Developer Productivity with Claude",
    desc: "You are building developer productivity tools using the Claude Agent SDK. The agent helps engineers explore unfamiliar codebases, understand legacy systems, generate boilerplate, and automate tasks using built-in tools (Read, Write, Bash, Grep, Glob) and MCP servers.",
    domains: [2, 3, 1], color: "#F2994A"
  },
  {
    id: 5, name: "Claude Code for Continuous Integration",
    desc: "You are integrating Claude Code into your CI/CD pipeline. The system runs automated code reviews, generates test cases, and provides feedback on pull requests. You need to design prompts that provide actionable feedback and minimize false positives.",
    domains: [3, 4], color: "#9B51E0"
  },
  {
    id: 6, name: "Structured Data Extraction",
    desc: "You are building a structured data extraction system using Claude. The system extracts information from unstructured documents, validates output using JSON schemas, and maintains high accuracy. It must handle edge cases gracefully and integrate with downstream systems.",
    domains: [4, 5], color: "#EB5757"
  }
];

const DOMAINS = [
  { num: 1, name: "Agentic Architecture & Orchestration", weight: "27%", color: "#E85D3A" },
  { num: 2, name: "Tool Design & MCP Integration", weight: "18%", color: "#2D9CDB" },
  { num: 3, name: "Claude Code Configuration & Workflows", weight: "20%", color: "#27AE60" },
  { num: 4, name: "Prompt Engineering & Structured Output", weight: "20%", color: "#F2994A" },
  { num: 5, name: "Context Management & Reliability", weight: "15%", color: "#9B51E0" }
];

const ALL_QUESTIONS = [
  // ═══ SCENARIO 1: Customer Support Resolution Agent ═══
  { id: 101, scenario: 1, domain: 1, type: "scenario",
    question: "Production data shows that in 12% of cases, your agent skips get_customer entirely and calls lookup_order using only the customer's stated name, occasionally leading to misidentified accounts and incorrect refunds. What change would most effectively address this reliability issue?",
    options: [
      "Add a programmatic prerequisite that blocks lookup_order and process_refund calls until get_customer has returned a verified customer ID",
      "Enhance the system prompt to state that customer verification via get_customer is mandatory before any order operations",
      "Add few-shot examples showing the agent always calling get_customer first, even when customers volunteer order details",
      "Implement a routing classifier that analyzes each request and enables only the subset of tools appropriate for that request type"
    ],
    correct: 0,
    explanation: "When a specific tool sequence is required for critical business logic (like verifying customer identity before processing refunds), programmatic enforcement provides deterministic guarantees that prompt-based approaches cannot. Options B and C rely on probabilistic LLM compliance, which is insufficient when errors have financial consequences. Option D addresses tool availability rather than tool ordering.",
    source: "Intercept and Control Agent Behavior with Hooks — Claude API Docs",
    sourceUrl: "https://platform.claude.com/docs/en/agent-sdk/hooks"
  },
  { id: 102, scenario: 1, domain: 2, type: "scenario",
    question: "Production logs show the agent frequently calls get_customer when users ask about orders (e.g., \"check my order #12345\"), instead of calling lookup_order. Both tools have minimal descriptions (\"Retrieves customer information\" / \"Retrieves order details\") and accept similar identifier formats. What's the most effective first step to improve tool selection reliability?",
    options: [
      "Add few-shot examples to the system prompt demonstrating correct tool selection patterns, with 5–8 examples showing order-related queries routing to lookup_order",
      "Expand each tool's description to include input formats it handles, example queries, edge cases, and boundaries explaining when to use it versus similar tools",
      "Implement a routing layer that parses user input before each turn and pre-selects the appropriate tool based on detected keywords and identifier patterns",
      "Consolidate both tools into a single lookup_entity tool that accepts any identifier and internally determines which backend to query"
    ],
    correct: 1,
    explanation: "Tool descriptions are the primary mechanism LLMs use for tool selection. When descriptions are minimal, models lack the context to differentiate between similar tools. Expanding descriptions directly addresses this root cause with a low-effort, high-leverage fix. Few-shot examples add token overhead without fixing the underlying issue. A routing layer is over-engineered. Consolidation requires more effort than a first step warrants.",
    source: "Tool Use Overview — Claude API Docs",
    sourceUrl: "https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/overview"
  },
  { id: 103, scenario: 1, domain: 5, type: "scenario",
    question: "Your agent achieves 55% first-contact resolution, well below the 80% target. Logs show it escalates straightforward cases (standard damage replacements with photo evidence) while attempting to autonomously handle complex situations requiring policy exceptions. What's the most effective way to improve escalation calibration?",
    options: [
      "Add explicit escalation criteria to your system prompt with few-shot examples demonstrating when to escalate versus resolve autonomously",
      "Have the agent self-report a confidence score (1–10) before each response and automatically route requests to humans when confidence falls below a threshold",
      "Deploy a separate classifier model trained on historical tickets to predict which requests need escalation before the main agent begins processing",
      "Implement sentiment analysis to detect customer frustration levels and automatically escalate when negative sentiment exceeds a threshold"
    ],
    correct: 0,
    explanation: "Adding explicit escalation criteria with few-shot examples directly addresses the root cause: unclear decision boundaries. This is the proportionate first response before adding infrastructure. Self-reported confidence is poorly calibrated — the agent is already incorrectly confident on hard cases. A classifier is over-engineered when prompt optimization hasn't been tried. Sentiment doesn't correlate with case complexity, which is the actual issue.",
    source: "Building Agents with the Claude Agent SDK — Anthropic Engineering",
    sourceUrl: "https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk"
  },
  { id: 104, scenario: 1, domain: 1, type: "scenario",
    question: "A customer contacts support with three issues: a damaged item requiring replacement, a billing discrepancy, and a question about their loyalty points. The agent currently handles one issue at a time, requiring three separate interactions. How should the agent handle this multi-concern request?",
    options: [
      "Ask the customer to submit each issue as a separate support ticket for clearer tracking",
      "Address only the most urgent issue first and prompt the customer to call back for the remaining issues",
      "Decompose the request into distinct items, investigate each using shared context, then synthesize a unified resolution",
      "Escalate to a human agent since multi-concern requests are too complex for automated handling"
    ],
    correct: 2,
    explanation: "The agent should decompose multi-concern customer requests into distinct items, then investigate each in parallel using shared context before synthesizing a unified resolution. This is a core skill for multi-step workflow implementation described in Task Statement 1.4.",
    source: "Building Agents with the Claude Agent SDK — Anthropic Engineering",
    sourceUrl: "https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk"
  },
  { id: 105, scenario: 1, domain: 1, type: "concept",
    question: "A PostToolUse hook intercepts a tool result from get_customer that contains a Unix timestamp for the account creation date. What is the most appropriate use of this hook?",
    options: [
      "Block the tool call and request the customer provide their account creation date manually",
      "Normalize the timestamp to ISO date format via additionalContext before the model processes it",
      "Log the raw timestamp for audit purposes only, passing it through unchanged",
      "Retry the get_customer call requesting a different date format from the backend"
    ],
    correct: 1,
    explanation: "PostToolUse hooks fire after a tool completes successfully. The hook input includes tool_input and tool_response, allowing you to normalize data formats — such as converting Unix timestamps to ISO date formats — via additionalContext before the model processes it. This runs outside the context window and doesn't consume tokens.",
    source: "Hooks Reference — Claude Code Docs",
    sourceUrl: "https://code.claude.com/docs/en/hooks"
  },
  { id: 106, scenario: 1, domain: 2, type: "scenario",
    question: "The process_refund tool returns a generic \"Operation failed\" message when a refund is rejected due to the item being outside the return window. The agent tells the customer \"there was a system error\" and escalates. What should be changed?",
    options: [
      "Add retry logic with exponential backoff to handle transient failures",
      "Return a structured error response with errorCategory: 'business', isRetryable: false, and a customer-friendly explanation of the policy violation",
      "Log the error and silently continue the conversation without mentioning the refund",
      "Implement a fallback that attempts the refund through an alternative payment gateway"
    ],
    correct: 1,
    explanation: "Uniform error responses like generic 'Operation failed' prevent the agent from making appropriate recovery decisions. Returning structured error metadata including errorCategory (business), isRetryable: false, and a customer-friendly explanation allows the agent to communicate appropriately rather than treating policy violations as system errors.",
    source: "Tool Use Overview — Claude API Docs",
    sourceUrl: "https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/overview"
  },
  { id: 107, scenario: 1, domain: 5, type: "scenario",
    question: "A customer asks for a competitor price match on a product. Your company's return policy covers own-site price adjustments but says nothing about competitor pricing. What should the agent do?",
    options: [
      "Deny the request since the policy doesn't explicitly permit competitor price matching",
      "Approve the match since the policy doesn't explicitly forbid it",
      "Escalate to a human agent because the policy is ambiguous or silent on this specific request",
      "Ask the customer to provide a screenshot of the competitor's price and then decide"
    ],
    correct: 2,
    explanation: "When policy is ambiguous or silent on the customer's specific request (e.g., competitor price matching when policy only addresses own-site adjustments), the agent should escalate. This is a valid escalation trigger — policy gaps that the agent can't handle. The agent shouldn't make policy decisions that aren't within its defined authority.",
    source: "Building Agents with the Claude Agent SDK — Anthropic Engineering",
    sourceUrl: "https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk"
  },
  { id: 108, scenario: 1, domain: 1, type: "scenario",
    question: "When escalating a complex billing dispute to a human agent, what information should the agent compile in the handoff summary?",
    options: [
      "Only the customer's account ID and a flag indicating escalation was requested",
      "The complete raw conversation transcript for the human to re-read",
      "A structured summary including customer ID, root cause analysis, refund amount, and recommended action",
      "A model-generated natural language explanation of what the agent thinks happened"
    ],
    correct: 2,
    explanation: "Structured handoff protocols for mid-process escalation should include customer details, root cause analysis, and recommended actions. The human agent receiving the handoff may lack access to the conversation transcript, so compiling structured context (customer ID, root cause, refund amount, recommended action) is essential.",
    source: "Building Agents with the Claude Agent SDK — Anthropic Engineering",
    sourceUrl: "https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk"
  },
  { id: 109, scenario: 1, domain: 5, type: "scenario",
    question: "After multiple summarization cycles in a long support conversation, a refund request for \"$247.83 for order #8891\" becomes \"customer wants a refund.\" What pattern prevents this information loss?",
    options: [
      "Increase the context window size to avoid summarization entirely",
      "Extract transactional facts (amounts, order numbers, statuses) into a persistent case facts block always included in prompts",
      "Store the full conversation in an external database and retrieve on demand",
      "Use a separate summarization model trained specifically on support conversations"
    ],
    correct: 1,
    explanation: "Progressive summarization loses transactional details over time. The solution is extracting important information (amounts, order numbers, customer IDs) into a persistent case facts block that is always included in every prompt, outside the summarized conversation history.",
    source: "Managing Context on the Claude Developer Platform — Anthropic News",
    sourceUrl: "https://www.anthropic.com/news/context-management"
  },

  // ═══ SCENARIO 2: Code Generation with Claude Code ═══
  { id: 201, scenario: 2, domain: 3, type: "scenario",
    question: "You want to create a custom /review slash command that runs your team's standard code review checklist. This command should be available to every developer when they clone or pull the repository. Where should you create this command file?",
    options: [
      "In the .claude/commands/ directory in the project repository",
      "In ~/.claude/commands/ in each developer's home directory",
      "In the CLAUDE.md file at the project root",
      "In a .claude/config.json file with a commands array"
    ],
    correct: 0,
    explanation: "Project-scoped custom slash commands should be stored in the .claude/commands/ directory within the repository. These commands are version-controlled and automatically available to all developers when they clone or pull the repo. ~/.claude/commands/ is for personal commands. CLAUDE.md is for instructions, not command definitions. The config.json option doesn't exist.",
    source: "Claude Code Settings — Claude Code Docs",
    sourceUrl: "https://code.claude.com/docs/en/settings"
  },
  { id: 202, scenario: 2, domain: 3, type: "scenario",
    question: "You've been assigned to restructure the team's monolithic application into microservices. This will involve changes across dozens of files and requires decisions about service boundaries and module dependencies. Which approach should you take?",
    options: [
      "Enter plan mode to explore the codebase, understand dependencies, and design an implementation approach before making changes",
      "Start with direct execution and make changes incrementally, letting the implementation reveal the natural service boundaries",
      "Use direct execution with comprehensive upfront instructions detailing exactly how each service should be structured",
      "Begin in direct execution mode and only switch to plan mode if you encounter unexpected complexity during implementation"
    ],
    correct: 0,
    explanation: "Plan mode is designed for complex tasks involving large-scale changes, multiple valid approaches, and architectural decisions — exactly what monolith-to-microservices restructuring requires. It enables safe codebase exploration and design before committing to changes. Starting with direct execution risks costly rework. The complexity is already stated in the requirements, not something that might emerge later.",
    source: "Best Practices for Claude Code — Claude Code Docs",
    sourceUrl: "https://code.claude.com/docs/en/best-practices"
  },
  { id: 203, scenario: 2, domain: 3, type: "scenario",
    question: "Your codebase has distinct areas with different coding conventions: React components use functional style with hooks, API handlers use async/await with specific error handling, and test files are spread throughout the codebase alongside the code they test. What's the most maintainable way to ensure Claude automatically applies the correct conventions?",
    options: [
      "Create rule files in .claude/rules/ with YAML frontmatter specifying glob patterns to conditionally apply conventions based on file paths",
      "Consolidate all conventions in the root CLAUDE.md file under headers for each area, relying on Claude to infer which section applies",
      "Create skills in .claude/skills/ for each code type that include the relevant conventions in their SKILL.md files",
      "Place a separate CLAUDE.md file in each subdirectory containing that area's specific conventions"
    ],
    correct: 0,
    explanation: "The .claude/rules/ files with glob patterns (e.g., **/*.test.tsx) allow conventions to be automatically applied based on file paths regardless of directory location — essential for test files spread throughout the codebase. Relying on inference is unreliable. Skills require manual invocation. Directory-level CLAUDE.md files can't easily handle files spread across many directories.",
    source: "Claude Code Settings — Claude Code Docs",
    sourceUrl: "https://code.claude.com/docs/en/settings"
  },
  { id: 204, scenario: 2, domain: 3, type: "concept",
    question: "A team's coding conventions are stored in a developer's ~/.claude/CLAUDE.md file. New team members clone the repo but don't follow the conventions. Why?",
    options: [
      "CLAUDE.md files are only read on first installation of Claude Code",
      "User-level CLAUDE.md (~/.claude/CLAUDE.md) is personal — it's not shared when others clone the repository",
      "New team members need to run /init before CLAUDE.md takes effect",
      "CLAUDE.md conventions are only suggestions, not enforceable rules"
    ],
    correct: 1,
    explanation: "User-level configuration (~/.claude/CLAUDE.md) is personal and applies only to that developer. Instructions in this file are not shared via version control. Team conventions should be stored in the project-level CLAUDE.md at the repository root or in .claude/rules/.",
    source: "Using CLAUDE.md Files — claude.com Blog",
    sourceUrl: "https://claude.com/blog/using-claude-md-files"
  },
  { id: 205, scenario: 2, domain: 3, type: "concept",
    question: "What is the purpose of `context: fork` in a SKILL.md frontmatter configuration?",
    options: [
      "It forks the current Git branch before running the skill",
      "It runs the skill in an isolated sub-agent context, preventing skill outputs from polluting the main conversation",
      "It duplicates the skill definition so multiple developers can run it simultaneously",
      "It creates a backup of the current session before executing destructive operations"
    ],
    correct: 1,
    explanation: "The context: fork frontmatter option runs skills in an isolated sub-agent context. This prevents verbose output (e.g., codebase analysis) or exploratory context (e.g., brainstorming alternatives) from polluting the main conversation session.",
    source: "Claude Code Settings — Claude Code Docs",
    sourceUrl: "https://code.claude.com/docs/en/settings"
  },
  { id: 206, scenario: 2, domain: 3, type: "scenario",
    question: "Your CLAUDE.md is growing to over 500 lines and becoming hard to maintain. It covers testing standards, API conventions, deployment rules, and security guidelines. What's the recommended approach?",
    options: [
      "Keep it as a single file but add a table of contents with anchor links",
      "Split it into focused topic-specific files in .claude/rules/ (e.g., testing.md, api-conventions.md, deployment.md)",
      "Move the entire file to a wiki and link to it from CLAUDE.md",
      "Use conditional comments to show/hide sections based on the current directory"
    ],
    correct: 1,
    explanation: "The .claude/rules/ directory is designed for organizing topic-specific rule files as an alternative to a monolithic CLAUDE.md. Splitting into focused files (testing.md, api-conventions.md, deployment.md) improves maintainability. Rules files can also use YAML frontmatter with glob patterns for path-specific loading.",
    source: "Claude Code Settings — Claude Code Docs",
    sourceUrl: "https://code.claude.com/docs/en/settings"
  },
  { id: 207, scenario: 2, domain: 3, type: "scenario",
    question: "You are iterating on a migration script but Claude keeps misinterpreting your natural language description of how null values should be handled. What's the most effective way to communicate the expected behavior?",
    options: [
      "Write a longer, more detailed prose description with emphasis on the null handling rules",
      "Provide 2–3 concrete input/output examples showing the expected transformation including null cases",
      "Ask Claude to generate test cases first and then correct the ones it gets wrong",
      "Switch to a higher-capability model that better understands nuanced descriptions"
    ],
    correct: 1,
    explanation: "Concrete input/output examples are the most effective way to communicate expected transformations when prose descriptions are interpreted inconsistently. Providing 2–3 examples showing the exact input and expected output (including null cases) clarifies requirements unambiguously.",
    source: "Best Practices for Claude Code — Claude Code Docs",
    sourceUrl: "https://code.claude.com/docs/en/best-practices"
  },
  { id: 208, scenario: 2, domain: 5, type: "concept",
    question: "During an extended codebase exploration session, you notice Claude starts giving inconsistent answers and referencing \"typical patterns\" rather than specific classes it discovered earlier. What is happening and what should you do?",
    options: [
      "The model is hallucinating — restart with a completely new prompt",
      "Context degradation from a full context window — use /compact to reduce context or have agents maintain scratchpad files",
      "The codebase has changed since the session started — pull the latest changes",
      "The model's knowledge cutoff doesn't include the framework version you're using"
    ],
    correct: 1,
    explanation: "Context degradation in extended sessions causes models to start giving inconsistent answers and referencing generic patterns rather than specific findings. Using /compact to reduce context usage, having agents maintain scratchpad files recording key findings, or spawning subagents to isolate verbose exploration are all recommended mitigations.",
    source: "Effective Harnesses for Long-Running Agents — Anthropic Engineering",
    sourceUrl: "https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents"
  },

  // ═══ SCENARIO 3: Multi-Agent Research System ═══
  { id: 301, scenario: 3, domain: 1, type: "scenario",
    question: "After running the system on \"impact of AI on creative industries,\" each subagent completes successfully, but the final report covers only visual arts — completely missing music, writing, and film. The coordinator's logs show it decomposed the topic into: \"AI in digital art creation,\" \"AI in graphic design,\" and \"AI in photography.\" What is the most likely root cause?",
    options: [
      "The synthesis agent lacks instructions for identifying coverage gaps in the findings it receives",
      "The coordinator agent's task decomposition is too narrow, resulting in subagent assignments that don't cover all relevant domains",
      "The web search agent's queries are not comprehensive enough",
      "The document analysis agent is filtering out sources related to non-visual creative industries"
    ],
    correct: 1,
    explanation: "The coordinator's logs reveal the root cause directly: it decomposed 'creative industries' into only visual arts subtasks. The subagents executed their assigned tasks correctly — the problem is what they were assigned. Options A, C, and D incorrectly blame downstream agents that are working correctly within their assigned scope.",
    source: "Building Agents with the Claude Agent SDK — Anthropic Engineering",
    sourceUrl: "https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk"
  },
  { id: 302, scenario: 3, domain: 5, type: "scenario",
    question: "The web search subagent times out while researching a complex topic. You need to design how this failure information flows back to the coordinator. Which error propagation approach best enables intelligent recovery?",
    options: [
      "Return structured error context including failure type, attempted query, partial results, and potential alternative approaches",
      "Implement automatic retry logic with exponential backoff, returning a generic \"search unavailable\" status only after all retries are exhausted",
      "Catch the timeout within the subagent and return an empty result set marked as successful",
      "Propagate the timeout exception directly to a top-level handler that terminates the entire research workflow"
    ],
    correct: 0,
    explanation: "Structured error context gives the coordinator the information it needs to make intelligent recovery decisions — whether to retry with a modified query, try an alternative approach, or proceed with partial results. Generic statuses hide valuable context. Marking failure as success prevents any recovery. Terminating the entire workflow is unnecessary when recovery strategies could succeed.",
    source: "Effective Harnesses for Long-Running Agents — Anthropic Engineering",
    sourceUrl: "https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents"
  },
  { id: 303, scenario: 3, domain: 2, type: "scenario",
    question: "During testing, the synthesis agent frequently needs to verify specific claims while combining findings. Currently, verification requires 2–3 round trips through the coordinator to the web search agent, increasing latency by 40%. Evaluation shows 85% are simple fact-checks and 15% require deeper investigation. What's the most effective approach?",
    options: [
      "Give the synthesis agent a scoped verify_fact tool for simple lookups, while complex verifications continue delegating through the coordinator",
      "Have the synthesis agent accumulate all verification needs and return them as a batch to the coordinator at the end of its pass",
      "Give the synthesis agent access to all web search tools so it can handle any verification need directly",
      "Have the web search agent proactively cache extra context around each source during initial research"
    ],
    correct: 0,
    explanation: "This applies the principle of least privilege by giving the synthesis agent only what it needs for the 85% common case (simple fact verification) while preserving the existing coordination pattern for complex cases. Batching creates blocking dependencies. Full web search tools violate separation of concerns. Proactive caching cannot reliably predict verification needs.",
    source: "Building Agents with the Claude Agent SDK — Anthropic Engineering",
    sourceUrl: "https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk"
  },
  { id: 304, scenario: 3, domain: 1, type: "concept",
    question: "In the hub-and-spoke multi-agent architecture, what happens to conversation history when the coordinator spawns a subagent?",
    options: [
      "The subagent inherits the coordinator's full conversation history automatically",
      "The subagent operates with isolated context — information must be explicitly passed in its prompt",
      "The subagent and coordinator share a synchronized memory store",
      "The subagent receives a compressed summary of the coordinator's history"
    ],
    correct: 1,
    explanation: "Subagents operate with isolated context — they do NOT inherit the coordinator's conversation history or share memory. Every piece of information a subagent needs must be explicitly passed in its prompt. This is a fundamental architectural property of the hub-and-spoke pattern.",
    source: "Building Agents with the Claude Agent SDK — Anthropic Engineering",
    sourceUrl: "https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk"
  },
  { id: 305, scenario: 3, domain: 1, type: "code",
    question: "How should the coordinator spawn parallel subagents to investigate different subtopics simultaneously?",
    options: [
      "Use threading primitives to run multiple API calls concurrently in the application layer",
      "Emit multiple Task tool calls in a single coordinator response rather than across separate turns",
      "Configure the coordinator with a `parallel: true` flag in the AgentDefinition",
      "Chain subagent calls using Promise.all() in the system prompt"
    ],
    correct: 1,
    explanation: "Spawning parallel subagents is achieved by having the coordinator emit multiple Task tool calls in a single response. This is the documented mechanism for parallel execution in the Agent SDK, allowing the runtime to execute them concurrently.",
    source: "Agent SDK Overview — Claude API Docs",
    sourceUrl: "https://platform.claude.com/docs/en/agent-sdk/overview"
  },
  { id: 306, scenario: 3, domain: 5, type: "scenario",
    question: "The final research report combines findings from 12 sources but strips all source attribution during synthesis — claims like \"AI adoption grew 340%\" appear without citations. What should be changed?",
    options: [
      "Add a post-processing step that uses regex to match claims to sources",
      "Require subagents to output structured claim-source mappings that the synthesis agent must preserve and merge",
      "Have the synthesis agent run a second pass to re-attribute claims after initial synthesis",
      "Include all raw source material in the final report as an appendix"
    ],
    correct: 1,
    explanation: "Source attribution is lost during summarization when findings are compressed without preserving claim-source mappings. The fix is requiring subagents to output structured claim-source mappings (source URLs, document names, relevant excerpts) that downstream agents preserve through synthesis.",
    source: "Managing Context on the Claude Developer Platform — Anthropic News",
    sourceUrl: "https://www.anthropic.com/news/context-management"
  },
  { id: 307, scenario: 3, domain: 5, type: "scenario",
    question: "Two credible sources report conflicting statistics: one says AI adoption is at 35% and another says 52%. How should the synthesis agent handle this in the final report?",
    options: [
      "Use the more recent source's figure and discard the older one",
      "Average the two values and present 43.5%",
      "Annotate both values with source attribution and present them as contested findings",
      "Omit the statistic entirely since it cannot be verified"
    ],
    correct: 2,
    explanation: "When handling conflicting statistics from credible sources, the synthesis should annotate conflicts with source attribution rather than arbitrarily selecting one value. Reports should distinguish well-established findings from contested ones, preserving original source characterizations.",
    source: "Managing Context on the Claude Developer Platform — Anthropic News",
    sourceUrl: "https://www.anthropic.com/news/context-management"
  },
  { id: 308, scenario: 3, domain: 1, type: "concept",
    question: "What must be included in the coordinator's allowedTools configuration for it to be able to spawn subagents?",
    options: [
      "The names of all subagent tools (e.g., \"web_search\", \"analyze_doc\")",
      "\"Task\" — the mechanism for spawning subagents",
      "\"fork_session\" to create isolated subagent contexts",
      "\"spawn\" — the built-in subagent creation tool"
    ],
    correct: 1,
    explanation: "The Task tool is the mechanism for spawning subagents in the Agent SDK. The coordinator's allowedTools must include 'Task' for it to be able to invoke subagents. This is a specific configuration requirement documented in Task Statement 1.3.",
    source: "Agent SDK Overview — Claude API Docs",
    sourceUrl: "https://platform.claude.com/docs/en/agent-sdk/overview"
  },
  { id: 309, scenario: 3, domain: 1, type: "scenario",
    question: "The coordinator evaluates the synthesis output and finds it lacks coverage of regulatory aspects of the research topic. What should the coordinator do?",
    options: [
      "Append a generic disclaimer about regulatory considerations to the report",
      "Re-delegate to search and analysis subagents with targeted queries about regulations, then re-invoke synthesis with combined findings",
      "Ask the end user to specify if they need regulatory analysis",
      "Increase the temperature setting to encourage more diverse synthesis output"
    ],
    correct: 1,
    explanation: "The coordinator should implement iterative refinement loops where it evaluates synthesis output for gaps, re-delegates to search and analysis subagents with targeted queries, and re-invokes synthesis until coverage is sufficient. This is a core orchestration pattern described in Task Statement 1.2.",
    source: "Building Agents with the Claude Agent SDK — Anthropic Engineering",
    sourceUrl: "https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk"
  },

  // ═══ SCENARIO 4: Developer Productivity with Claude ═══
  { id: 401, scenario: 4, domain: 2, type: "concept",
    question: "A developer needs to find all files that import a specific module across the codebase. Which built-in tool is most appropriate?",
    options: [
      "Glob — to find files matching naming patterns",
      "Grep — to search file contents for the import statement pattern",
      "Read — to load each file and check for the import",
      "Bash — to run a custom find command"
    ],
    correct: 1,
    explanation: "Grep is designed for content search — searching file contents for patterns like function names, error messages, or import statements. Glob matches file path patterns (names/extensions), not content. Reading every file is inefficient. Bash is unnecessary when a built-in tool handles the use case directly.",
    source: "Claude Code Built-in Tools — Claude Code Docs",
    sourceUrl: "https://code.claude.com/docs/en/agentic-tools"
  },
  { id: 402, scenario: 4, domain: 2, type: "concept",
    question: "You need to find all TypeScript test files in a project regardless of where they're located in the directory tree. Which built-in tool and pattern should you use?",
    options: [
      "Grep with the pattern \"*.test.tsx\"",
      "Glob with the pattern **/*.test.tsx",
      "Bash with `find . -name '*.test.tsx'`",
      "Read with a recursive directory listing"
    ],
    correct: 1,
    explanation: "Glob is designed for file path pattern matching — finding files by name or extension patterns. The pattern **/*.test.tsx matches all TypeScript test files regardless of directory depth. Grep searches file contents, not names. Bash and Read are unnecessarily complex for this use case.",
    source: "Claude Code Built-in Tools — Claude Code Docs",
    sourceUrl: "https://code.claude.com/docs/en/agentic-tools"
  },
  { id: 403, scenario: 4, domain: 2, type: "scenario",
    question: "The Edit tool fails when attempting to modify a function because the anchor text appears in multiple places in the file. What is the correct fallback approach?",
    options: [
      "Use a more specific anchor text that appears only once",
      "Use Read to load the full file contents, then Write to replace the entire file with the modified version",
      "Use Bash to run sed for targeted text replacement",
      "Split the file into smaller files so each anchor text is unique"
    ],
    correct: 1,
    explanation: "When Edit fails due to non-unique text matches, the documented fallback is using Read to load full file contents followed by Write for reliable file modifications. While using a more specific anchor is ideal, when that's not possible, Read + Write is the recommended pattern.",
    source: "Claude Code Built-in Tools — Claude Code Docs",
    sourceUrl: "https://code.claude.com/docs/en/agentic-tools"
  },
  { id: 404, scenario: 4, domain: 1, type: "scenario",
    question: "An engineer asks the agent to explore a large unfamiliar codebase to understand its architecture. The agent starts reading files one by one from the root directory. What's a more effective approach?",
    options: [
      "Read the README.md first since it always contains accurate architecture documentation",
      "Start with Grep to find entry points (main files, route definitions), then use Read to follow imports and trace flows incrementally",
      "Use Bash to generate a complete file listing and read all files at once",
      "Ask the engineer to describe the architecture verbally before starting exploration"
    ],
    correct: 1,
    explanation: "Building codebase understanding incrementally is recommended: start with Grep to find entry points, then use Read to follow imports and trace flows, rather than reading all files upfront. This targeted approach is more efficient and avoids overwhelming the context window.",
    source: "Claude Code Built-in Tools — Claude Code Docs",
    sourceUrl: "https://code.claude.com/docs/en/agentic-tools"
  },
  { id: 405, scenario: 4, domain: 2, type: "scenario",
    question: "Your agent has access to both a Jira MCP server and the built-in Grep tool. When asked to \"find the ticket about the login bug,\" the agent uses Grep to search the codebase instead of querying Jira. Why might this happen and what's the fix?",
    options: [
      "The Jira MCP server is not properly configured — verify the connection",
      "Enhance the MCP tool descriptions to explain capabilities and outputs in detail, preventing the agent from preferring built-in tools over more capable MCP tools",
      "Remove the Grep tool entirely when the Jira MCP server is connected",
      "Add a routing rule that keywords like \"ticket\" always go to Jira"
    ],
    correct: 1,
    explanation: "When MCP tool descriptions are insufficient, agents may prefer familiar built-in tools (like Grep) over more capable MCP tools. Enhancing MCP tool descriptions to explain capabilities and outputs in detail prevents this. The agent needs enough information to understand that Jira is the appropriate tool for ticket-related queries.",
    source: "Code Execution with MCP — Anthropic Engineering",
    sourceUrl: "https://www.anthropic.com/engineering/code-execution-with-mcp"
  },
  { id: 406, scenario: 4, domain: 3, type: "concept",
    question: "What is the difference between configuring an MCP server in .mcp.json versus ~/.claude.json?",
    options: [
      ".mcp.json servers run faster because they're co-located with the project",
      ".mcp.json is project-level (shared via version control) while ~/.claude.json is user-level (personal/experimental servers)",
      ".mcp.json supports more MCP features than ~/.claude.json",
      "There is no functional difference — both are equivalent configuration locations"
    ],
    correct: 1,
    explanation: "MCP server scoping follows the same pattern as other Claude Code configuration: .mcp.json is project-level for shared team tooling (version-controlled), while ~/.claude.json is user-level for personal or experimental servers. Environment variable expansion (e.g., ${GITHUB_TOKEN}) in .mcp.json handles credential management without committing secrets.",
    source: "Claude Code Settings — Claude Code Docs",
    sourceUrl: "https://code.claude.com/docs/en/settings"
  },
  { id: 407, scenario: 4, domain: 1, type: "scenario",
    question: "An agent exploring a codebase crashes after 2 hours of investigation. When restarted, it has no memory of what it found. What design pattern would enable crash recovery?",
    options: [
      "Configure automatic session saving every 5 minutes",
      "Have agents maintain scratchpad files recording key findings, and design crash recovery using structured state exports (manifests) that the coordinator loads on resume",
      "Use a database to store every API call and response for full replay",
      "Run the agent in a container with checkpoint/restore capabilities"
    ],
    correct: 1,
    explanation: "Structured state persistence for crash recovery involves each agent exporting state to a known location (scratchpad files), and the coordinator loading a manifest on resume and injecting it into agent prompts. This is more practical and reliable than full replay or container-level checkpointing.",
    source: "Effective Harnesses for Long-Running Agents — Anthropic Engineering",
    sourceUrl: "https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents"
  },
  { id: 408, scenario: 4, domain: 2, type: "concept",
    question: "What are MCP resources used for, and how do they differ from MCP tools?",
    options: [
      "Resources and tools are interchangeable terms in MCP",
      "Resources are application-controlled data exposures (like content catalogs) that reduce exploratory tool calls; tools are model-controlled actions",
      "Resources are cached versions of tool results for faster access",
      "Resources are read-only tools with simplified schemas"
    ],
    correct: 1,
    explanation: "MCP defines three core primitives with different control surfaces: tools (model-controlled actions), resources (application-controlled data), and prompts (user-controlled templates). Resources expose content catalogs (issue summaries, documentation hierarchies, database schemas) to give agents visibility into available data without requiring exploratory tool calls.",
    source: "MCP Architecture Overview — modelcontextprotocol.io",
    sourceUrl: "https://modelcontextprotocol.io/docs/learn/architecture"
  },

  // ═══ SCENARIO 5: Claude Code for Continuous Integration ═══
  { id: 501, scenario: 5, domain: 3, type: "scenario",
    question: "Your pipeline script runs `claude \"Analyze this pull request for security issues\"` but the job hangs indefinitely. Logs indicate Claude Code is waiting for interactive input. What's the correct fix?",
    options: [
      "Add the -p flag: `claude -p \"Analyze this pull request for security issues\"`",
      "Set the environment variable CLAUDE_HEADLESS=true before running the command",
      "Redirect stdin from /dev/null: `claude \"Analyze...\" < /dev/null`",
      "Add the --batch flag: `claude --batch \"Analyze...\"`"
    ],
    correct: 0,
    explanation: "The -p (or --print) flag is the documented way to run Claude Code in non-interactive mode. It processes the prompt, outputs the result to stdout, and exits without waiting for user input — exactly what CI/CD pipelines require. The other options reference non-existent features or Unix workarounds.",
    source: "Best Practices for Claude Code — Claude Code Docs",
    sourceUrl: "https://code.claude.com/docs/en/best-practices"
  },
  { id: 502, scenario: 5, domain: 4, type: "scenario",
    question: "Your team wants to reduce API costs. Currently, real-time Claude calls power two workflows: (1) a blocking pre-merge check that must complete before developers can merge, and (2) a technical debt report generated overnight. Your manager proposes switching both to the Message Batches API for its 50% cost savings. How should you evaluate this?",
    options: [
      "Use batch processing for the technical debt reports only; keep real-time calls for pre-merge checks",
      "Switch both workflows to batch processing with status polling to check for completion",
      "Keep real-time calls for both workflows to avoid batch result ordering issues",
      "Switch both to batch processing with a timeout fallback to real-time if batches take too long"
    ],
    correct: 0,
    explanation: "The Message Batches API offers 50% cost savings but has processing times up to 24 hours with no guaranteed latency SLA. This makes it unsuitable for blocking pre-merge checks where developers wait for results, but ideal for overnight batch jobs like technical debt reports. Batch results can be correlated using custom_id fields, so ordering is not an issue.",
    source: "Message Batches API — Claude API Docs",
    sourceUrl: "https://docs.anthropic.com/en/docs/build-with-claude/batch-processing"
  },
  { id: 503, scenario: 5, domain: 4, type: "scenario",
    question: "A pull request modifies 14 files. Your single-pass review produces inconsistent results: detailed feedback for some files but superficial comments for others, with contradictory feedback — flagging a pattern as problematic in one file while approving identical code elsewhere. How should you restructure the review?",
    options: [
      "Split into focused passes: analyze each file individually for local issues, then run a separate integration-focused pass examining cross-file data flow",
      "Require developers to split large PRs into smaller submissions of 3–4 files before the automated review runs",
      "Switch to a higher-tier model with a larger context window to give all 14 files adequate attention in one pass",
      "Run three independent review passes on the full PR and only flag issues that appear in at least two of three runs"
    ],
    correct: 0,
    explanation: "Splitting reviews into focused passes directly addresses attention dilution when processing many files at once. File-by-file analysis ensures consistent depth, while a separate integration pass catches cross-file issues. Larger context windows don't solve attention quality issues. Consensus voting would suppress detection of real bugs.",
    source: "Building Agents with the Claude Agent SDK — Anthropic Engineering",
    sourceUrl: "https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk"
  },
  { id: 504, scenario: 5, domain: 4, type: "scenario",
    question: "Your automated code review flags too many minor style issues, and developers have started ignoring all findings — including legitimate security bugs. What's the most effective fix?",
    options: [
      "Add a confidence threshold — only surface findings above 90% confidence",
      "Write specific review criteria that define which issues to report (bugs, security) versus skip (minor style, local patterns) rather than relying on confidence-based filtering",
      "Reduce the number of files reviewed per pass to improve focus",
      "Send findings only to a team lead who curates them before sharing with developers"
    ],
    correct: 1,
    explanation: "High false positive rates in certain categories undermine developer trust across all categories. The fix is writing explicit criteria for what to report versus skip, rather than confidence-based filtering. Temporarily disabling high false-positive categories can restore trust while prompts for those categories are improved.",
    source: "Be Clear and Direct — Claude API Docs",
    sourceUrl: "https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/be-clear-and-direct"
  },
  { id: 505, scenario: 5, domain: 3, type: "scenario",
    question: "How should you structure the CI output to enable automated posting of review findings as inline PR comments?",
    options: [
      "Have Claude output findings in natural language and use regex to parse file/line references",
      "Use --output-format json with --json-schema to produce machine-parseable structured findings",
      "Output findings in CSV format for easy parsing",
      "Write findings to a temporary file and use a post-processing script to format them"
    ],
    correct: 1,
    explanation: "The --output-format json and --json-schema CLI flags enforce structured output in CI contexts, producing machine-parseable findings that can be automatically posted as inline PR comments. This is the documented approach for CI integration.",
    source: "Best Practices for Claude Code — Claude Code Docs",
    sourceUrl: "https://code.claude.com/docs/en/best-practices"
  },
  { id: 506, scenario: 5, domain: 4, type: "concept",
    question: "Why is an independent Claude instance more effective at reviewing generated code than asking the same instance to self-review?",
    options: [
      "Different instances have access to different tools",
      "The generating instance retains reasoning context from generation, making it less likely to question its own decisions",
      "Self-review is prohibited by the API",
      "Independent instances have higher token limits"
    ],
    correct: 1,
    explanation: "A model retains reasoning context from generation, making it less likely to question its own decisions in the same session. Independent review instances (without prior reasoning context) are more effective at catching subtle issues than self-review instructions or extended thinking. This is session context isolation.",
    source: "Building Agents with the Claude Agent SDK — Anthropic Engineering",
    sourceUrl: "https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk"
  },
  { id: 507, scenario: 5, domain: 3, type: "scenario",
    question: "After a new commit to an already-reviewed PR, Claude re-reviews and posts duplicate comments about issues it flagged before. How should you prevent this?",
    options: [
      "Clear all previous comments before each new review run",
      "Include prior review findings in context and instruct Claude to report only new or still-unaddressed issues",
      "Only review the diff between the two commits, ignoring unchanged files",
      "Maintain a database of all previous findings and filter duplicates programmatically"
    ],
    correct: 1,
    explanation: "Including prior review findings in context when re-running reviews after new commits, and instructing Claude to report only new or still-unaddressed issues, is the recommended approach. This avoids duplicate comments while still catching persisting issues. A database approach is over-engineered for this use case.",
    source: "Best Practices for Claude Code — Claude Code Docs",
    sourceUrl: "https://code.claude.com/docs/en/best-practices"
  },
  { id: 508, scenario: 5, domain: 4, type: "scenario",
    question: "Your CI pipeline generates test cases, but many duplicate scenarios already covered by the existing test suite. What should you do?",
    options: [
      "Run deduplication on the generated tests using string matching",
      "Provide existing test files in context so test generation avoids suggesting duplicate scenarios",
      "Generate tests in a separate directory and manually merge unique ones",
      "Limit the number of generated tests to reduce duplication probability"
    ],
    correct: 1,
    explanation: "Providing existing test files in context gives Claude visibility into what's already covered, allowing it to avoid suggesting duplicate scenarios. Additionally, documenting testing standards and available fixtures in CLAUDE.md improves test generation quality and reduces low-value test output.",
    source: "Best Practices for Claude Code — Claude Code Docs",
    sourceUrl: "https://code.claude.com/docs/en/best-practices"
  },

  // ═══ SCENARIO 6: Structured Data Extraction ═══
  { id: 601, scenario: 6, domain: 4, type: "concept",
    question: "What is the recommended approach for guaranteeing schema-compliant structured output from Claude?",
    options: [
      "Ask the model to return raw JSON in a text response and parse it client-side",
      "Use tool_use with JSON schemas to ensure predictable structure through constrained decoding",
      "Use XML tags exclusively since Claude prefers XML over JSON",
      "Generate Markdown tables and convert them to JSON post-processing"
    ],
    correct: 1,
    explanation: "Using tool_use with JSON schemas (or structured outputs with output_format) is the recommended approach. Constrained decoding eliminates JSON syntax errors entirely and ensures outputs follow a predictable, validated structure. Raw JSON in text responses is prone to syntax errors.",
    source: "Structured Outputs — Claude API Docs",
    sourceUrl: "https://platform.claude.com/docs/en/build-with-claude/structured-outputs"
  },
  { id: 602, scenario: 6, domain: 4, type: "concept",
    question: "What is the key distinction between what JSON schemas prevent versus what they cannot prevent?",
    options: [
      "Schemas prevent all errors when properly defined",
      "Schemas prevent syntax errors (via constrained decoding) but cannot prevent semantic errors like wrong values in correct fields",
      "Schemas prevent semantic errors but cannot prevent syntax errors",
      "Schemas only validate field names, not field values or types"
    ],
    correct: 1,
    explanation: "Structured outputs guarantee schema-compliant responses through constrained decoding — eliminating syntax errors. But they cannot prevent semantic errors: the model can still place valid-looking values in the wrong fields, fabricate data, or produce line items that don't sum to a total.",
    source: "Structured Outputs — Claude API Docs",
    sourceUrl: "https://platform.claude.com/docs/en/build-with-claude/structured-outputs"
  },
  { id: 603, scenario: 6, domain: 4, type: "scenario",
    question: "Your extraction pipeline produces valid JSON but sometimes fabricates values for fields when the source document doesn't contain that information. What schema design change would mitigate this?",
    options: [
      "Add more validation rules to catch fabricated values",
      "Design schema fields as optional (nullable) when source documents may not contain the information, preventing the model from fabricating values to satisfy required fields",
      "Add a post-processing step that cross-references extracted values with the source",
      "Increase the number of few-shot examples to teach the model when data is absent"
    ],
    correct: 1,
    explanation: "When fields are marked as required, the model must produce a value — leading to fabrication when the source doesn't contain the information. Designing schema fields as optional (nullable) gives the model a valid option (returning null) when data is absent, preventing hallucinated values.",
    source: "Structured Outputs — Claude API Docs",
    sourceUrl: "https://platform.claude.com/docs/en/build-with-claude/structured-outputs"
  },
  { id: 604, scenario: 6, domain: 4, type: "scenario",
    question: "A validation retry loop detects that Claude placed a phone number in the email field. What should the system do?",
    options: [
      "Silently correct the error using regex and return the result",
      "Discard the result entirely and start a new extraction from scratch",
      "Send a follow-up request including the original document, the failed extraction, and the specific validation error so the model can correct it",
      "Flag the entire record as invalid and skip it"
    ],
    correct: 2,
    explanation: "Retry-with-error-feedback works by appending specific validation errors to the prompt on retry to guide the model toward correction. This is more efficient than starting from scratch and more reliable than silent regex fixes. The follow-up includes the original document, the failed extraction, and the specific error.",
    source: "Structured Outputs — Claude API Docs",
    sourceUrl: "https://platform.claude.com/docs/en/build-with-claude/structured-outputs"
  },
  { id: 605, scenario: 6, domain: 4, type: "scenario",
    question: "Your extraction system struggles with documents that have varied structures — some use inline citations, others use bibliographies, some have narrative descriptions while others use structured tables. What improves handling?",
    options: [
      "Build separate extraction pipelines for each document format",
      "Use a pre-classifier to detect document type and select format-specific prompts",
      "Add few-shot examples demonstrating correct extraction from documents with varied formats",
      "Normalize all documents to a standard format before extraction"
    ],
    correct: 2,
    explanation: "Few-shot examples demonstrating extraction from varied document structures (inline citations vs bibliographies, narrative vs tables) enable the model to generalize to novel document formats. This is more maintainable than separate pipelines and more practical than document normalization.",
    source: "Use Examples (Multishot Prompting) — Claude API Docs",
    sourceUrl: "https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/multishot-prompting"
  },
  { id: 606, scenario: 6, domain: 4, type: "concept",
    question: "When would a retry loop be INEFFECTIVE for improving extraction quality?",
    options: [
      "When the extraction has format mismatches or structural output errors",
      "When the required information simply doesn't exist in the source document",
      "When the model made an off-by-one error in a numerical field",
      "When the output has correct values but in wrong fields"
    ],
    correct: 1,
    explanation: "Retries are ineffective when the required information is simply absent from the source document — no amount of re-prompting will conjure data that isn't there. Retries work for format mismatches, structural errors, and field placement issues. The solution for missing data is nullable schema fields, not retries.",
    source: "Structured Outputs — Claude API Docs",
    sourceUrl: "https://platform.claude.com/docs/en/build-with-claude/structured-outputs"
  },
  { id: 607, scenario: 6, domain: 5, type: "scenario",
    question: "Your extraction system reports 97% overall accuracy, but a deep audit reveals it performs poorly on handwritten medical forms (62% accuracy) while excelling on typed invoices (99.5%). The blended metric masked this. What should you implement?",
    options: [
      "Focus on improving the overall accuracy metric above 99%",
      "Implement stratified random sampling and analyze accuracy by document type and field to verify consistent performance across all segments",
      "Exclude handwritten medical forms from the extraction pipeline",
      "Add more few-shot examples of typed invoices to maintain the high overall score"
    ],
    correct: 1,
    explanation: "Aggregate accuracy metrics may mask poor performance on specific document types or fields. Stratified random sampling for measuring error rates and analyzing accuracy by document type and field segment is essential before automating high-confidence extractions or reducing human review.",
    source: "Building Agents with the Claude Agent SDK — Anthropic Engineering",
    sourceUrl: "https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk"
  },
  { id: 608, scenario: 6, domain: 5, type: "scenario",
    question: "You're designing a human review workflow for extractions. How should you route extractions to maximize the efficiency of limited human reviewer capacity?",
    options: [
      "Randomly sample 10% of all extractions for human review",
      "Only send extractions that failed schema validation to humans",
      "Have the model output field-level confidence scores, calibrate thresholds using labeled validation sets, and route low-confidence extractions to human review",
      "Send all extractions from new document types to humans for the first month"
    ],
    correct: 2,
    explanation: "Field-level confidence scores calibrated using labeled validation sets enable targeted routing of review attention. Low-confidence extractions and those with ambiguous/contradictory source documents should be prioritized for human review, maximizing the impact of limited reviewer capacity.",
    source: "Building Agents with the Claude Agent SDK — Anthropic Engineering",
    sourceUrl: "https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk"
  },
  { id: 609, scenario: 6, domain: 4, type: "code",
    question: "You need the model to always call your extraction tool rather than sometimes returning conversational text. Which tool_choice configuration achieves this?",
    options: [
      "tool_choice: \"auto\"",
      "tool_choice: \"any\"",
      "tool_choice: {\"type\": \"tool\", \"name\": \"extract_metadata\"}",
      "tool_choice: \"required\""
    ],
    correct: 2,
    explanation: "Forced tool selection with tool_choice: {\"type\": \"tool\", \"name\": \"extract_metadata\"} ensures the model must call that specific tool. \"auto\" allows the model to return text instead. \"any\" guarantees a tool call but lets the model choose which one. \"required\" is not a valid tool_choice value.",
    source: "Tool Use Overview — Claude API Docs",
    sourceUrl: "https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/overview"
  }
];

const PASS_THRESHOLD = 720;
const MAX_SCORE = 1000;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function TypeBadge({ type }) {
  const s = { scenario: { bg: "#FFF3E0", c: "#E65100", l: "Scenario" }, concept: { bg: "#E3F2FD", c: "#1565C0", l: "Concept" }, code: { bg: "#F3E5F5", c: "#7B1FA2", l: "Code" } }[type];
  return <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 4, fontSize: 11, fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase", background: s.bg, color: s.c }}>{s.l}</span>;
}

function DomainTag({ domainNum }) {
  const d = DOMAINS[domainNum - 1];
  return <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: d.color + "18", color: d.color, marginLeft: 8 }}>D{d.num}</span>;
}

function SourceLink({ source, url }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 10, padding: "6px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, fontSize: 12, color: "#6BA3D6", textDecoration: "none", lineHeight: 1.3, wordBreak: "break-word" }}>
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}><path d="M6 3H3a1 1 0 00-1 1v9a1 1 0 001 1h9a1 1 0 001-1v-3M9 1h6m0 0v6m0-6L8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
      <span>{source}</span>
    </a>
  );
}

export default function Exam() {
  const [phase, setPhase] = useState("intro");
  const [selectedScenarios, setSelectedScenarios] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState({});
  const [showExp, setShowExp] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [startTime, setStartTime] = useState(null);
  const [isPreview, setIsPreview] = useState(false);
  const [activeScenarioIdx, setActiveScenarioIdx] = useState(0);
  const timerRef = useRef(null);
  const qRef = useRef(null);

  useEffect(() => {
    if (phase === "exam" && startTime) {
      timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [phase, startTime]);

  const fmt = s => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  const pickScenarios = useCallback(() => {
    const shuffled = shuffle(SCENARIOS);
    return shuffled.slice(0, 4);
  }, []);

  const startExam = () => {
    const sc = pickScenarios();
    setSelectedScenarios(sc);
    const qs = sc.flatMap(s => shuffle(ALL_QUESTIONS.filter(q => q.scenario === s.id)));
    setQuestions(qs);
    setPhase("exam"); setStartTime(Date.now()); setCurrentQ(0); setAnswers({}); setShowExp(false); setIsPreview(false); setActiveScenarioIdx(0);
  };

  const selectAnswer = (qId, idx) => { if (answers[qId] !== undefined) return; setAnswers(p => ({ ...p, [qId]: idx })); setShowExp(true); };

  const nextQuestion = () => {
    setShowExp(false);
    if (currentQ < questions.length - 1) {
      const nextScenario = questions[currentQ + 1].scenario;
      const curScenario = questions[currentQ].scenario;
      if (nextScenario !== curScenario) setActiveScenarioIdx(i => i + 1);
      setCurrentQ(currentQ + 1);
      if (qRef.current) qRef.current.scrollTo({ top: 0, behavior: "smooth" });
    } else { clearInterval(timerRef.current); setPhase("review"); }
  };

  const getScore = () => questions.filter(q => answers[q.id] === q.correct).length;
  const getScaled = () => { const raw = getScore() / questions.length; return Math.round(100 + raw * 900); };

  const getDomainScores = () => DOMAINS.map(d => {
    const qs = questions.filter(q => q.domain === d.num);
    if (qs.length === 0) return { ...d, total: 0, correct: 0, pct: 0 };
    const correct = qs.filter(q => answers[q.id] === q.correct).length;
    return { ...d, total: qs.length, correct, pct: Math.round((correct / qs.length) * 100) };
  });

  const restart = () => { setPhase("intro"); setCurrentQ(0); setAnswers({}); setShowExp(false); setElapsed(0); setStartTime(null); setIsPreview(false); setSelectedScenarios([]); setQuestions([]); };

  const previewReport = () => {
    const sc = pickScenarios();
    setSelectedScenarios(sc);
    const qs = sc.flatMap(s => shuffle(ALL_QUESTIONS.filter(q => q.scenario === s.id)));
    setQuestions(qs);
    const mock = {};
    const wrongCount = Math.floor(qs.length * 0.22);
    const wrongIds = new Set(shuffle(qs.map(q => q.id)).slice(0, wrongCount));
    qs.forEach(q => { mock[q.id] = wrongIds.has(q.id) ? (q.correct === 0 ? 1 : 0) : q.correct; });
    setAnswers(mock); setElapsed(1247); setIsPreview(true); setPhase("review");
  };

  const bg = "linear-gradient(168deg, #0D0D0D 0%, #1A1A2E 50%, #16213E 100%)";
  const ff = "'IBM Plex Sans', 'SF Pro Display', -apple-system, sans-serif";

  // ── INTRO ──
  if (phase === "intro") {
    return (
      <div style={{ minHeight: "100vh", background: bg, color: "#E8E8E8", fontFamily: ff, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 660, width: "100%" }}>
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "3px", textTransform: "uppercase", color: "#E85D3A", marginBottom: 16 }}>Certification Practice</div>
            <h1 style={{ fontSize: "clamp(26px, 5vw, 38px)", fontWeight: 800, lineHeight: 1.1, margin: 0, background: "linear-gradient(135deg, #FFF 0%, #B8B8B8 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Claude Certified Architect</h1>
            <p style={{ fontSize: 13, color: "#666", marginTop: 6 }}>Foundations — Exam Simulation for Training</p>
            <p style={{ fontSize: 14, color: "#888", marginTop: 12, lineHeight: 1.6 }}>4 random scenarios per attempt · ~33 questions · 5 domains · Scaled 100–1000 · 720 to pass</p>
            <a href="https://anthropic.skilljar.com/claude-certified-architect-foundations-access-request" target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10, fontSize: 13, color: "#6BA3D6", textDecoration: "none" }}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M6 3H3a1 1 0 00-1 1v9a1 1 0 001 1h9a1 1 0 001-1v-3M9 1h6m0 0v6m0-6L8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Based on the official exam guide — access the real certification here
            </a>
          </div>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 10 }}>Domains</div>
            {DOMAINS.map(d => (
              <div key={d.num} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "rgba(255,255,255,0.03)", borderRadius: 6, borderLeft: `3px solid ${d.color}`, marginBottom: 4 }}>
                <span style={{ color: d.color, fontWeight: 700, fontSize: 13, minWidth: 36 }}>{d.weight}</span>
                <span style={{ fontSize: 13, color: "#BBB" }}>{d.name}</span>
              </div>
            ))}
          </div>
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 10 }}>Scenarios (4 of 6 selected randomly)</div>
            {SCENARIOS.map(s => (
              <div key={s.id} style={{ padding: "10px 14px", background: "rgba(255,255,255,0.03)", borderRadius: 6, borderLeft: `3px solid ${s.color}`, marginBottom: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#CCC" }}>{s.id}. {s.name}</div>
                <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>{s.desc.slice(0, 120)}...</div>
              </div>
            ))}
          </div>
          <button onClick={startExam} style={{ width: "100%", padding: "15px 32px", fontSize: 16, fontWeight: 700, color: "#FFF", background: "linear-gradient(135deg, #E85D3A 0%, #D44A28 100%)", border: "none", borderRadius: 10, cursor: "pointer", boxShadow: "0 4px 20px rgba(232,93,58,0.3)" }}>Start Exam</button>
          <button onClick={previewReport} style={{ width: "100%", padding: "13px 32px", fontSize: 14, fontWeight: 600, color: "#888", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, cursor: "pointer", marginTop: 8 }}>Preview Sample Report</button>
          <p style={{ fontSize: 11, color: "#444", textAlign: "center", marginTop: 14 }}>Based on the official Claude Certified Architect exam guide · All questions sourced from Anthropic docs</p>
        </div>
      </div>
    );
  }

  // ── EXAM ──
  if (phase === "exam") {
    const q = questions[currentQ];
    const answered = answers[q.id] !== undefined;
    const isCorrect = answers[q.id] === q.correct;
    const progress = ((currentQ + (answered ? 1 : 0)) / questions.length) * 100;
    const sc = selectedScenarios.find(s => s.id === q.scenario);

    return (
      <div style={{ minHeight: "100vh", background: bg, color: "#E8E8E8", fontFamily: ff, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "10px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontSize: 13, color: "#888" }}><span style={{ color: "#FFF", fontWeight: 700 }}>{currentQ + 1}</span>/{questions.length}</span>
            <span style={{ fontSize: 13, color: "#555" }}>{fmt(elapsed)}</span>
          </div>
          <span style={{ fontSize: 12, color: "#666" }}>{Object.keys(answers).filter(id => answers[parseInt(id)] === questions.find(qq => qq.id === parseInt(id))?.correct).length} correct</span>
        </div>
        <div style={{ height: 3, background: "rgba(255,255,255,0.06)", flexShrink: 0 }}>
          <div style={{ height: "100%", width: `${progress}%`, background: "linear-gradient(90deg, #E85D3A, #F2994A)", transition: "width 0.4s ease" }} />
        </div>
        <div style={{ padding: "8px 20px", background: `${sc.color}0A`, borderBottom: `1px solid ${sc.color}20`, flexShrink: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: sc.color }}>Scenario {sc.id}: {sc.name}</span>
        </div>
        <div ref={qRef} style={{ flex: 1, overflowY: "auto", padding: "28px 20px", display: "flex", justifyContent: "center" }}>
          <div style={{ maxWidth: 680, width: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
              <TypeBadge type={q.type} />
              <DomainTag domainNum={q.domain} />
            </div>
            <h2 style={{ fontSize: "clamp(15px, 3vw, 19px)", fontWeight: 600, lineHeight: 1.5, margin: "0 0 24px 0", color: "#F0F0F0" }}>{q.question}</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {q.options.map((opt, idx) => {
                let optBg = "rgba(255,255,255,0.04)", border = "1px solid rgba(255,255,255,0.08)", tc = "#CCC", icon = null;
                if (answered) {
                  if (idx === q.correct) { optBg = "rgba(39,174,96,0.12)"; border = "1px solid rgba(39,174,96,0.4)"; tc = "#6FCF97"; icon = "✓"; }
                  else if (idx === answers[q.id] && idx !== q.correct) { optBg = "rgba(235,87,87,0.12)"; border = "1px solid rgba(235,87,87,0.4)"; tc = "#EB5757"; icon = "✗"; }
                  else tc = "#555";
                }
                return (
                  <button key={idx} onClick={() => selectAnswer(q.id, idx)} disabled={answered}
                    style={{ padding: "13px 16px", background: optBg, border, borderRadius: 10, color: tc, fontSize: 14, lineHeight: 1.5, textAlign: "left", cursor: answered ? "default" : "pointer", display: "flex", alignItems: "flex-start", gap: 12, fontFamily: q.type === "code" ? "'IBM Plex Mono', monospace" : "inherit", transition: "all 0.2s" }}>
                    <span style={{ minWidth: 24, height: 24, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: icon ? 14 : 12, fontWeight: 700, background: icon ? "transparent" : "rgba(255,255,255,0.06)", color: icon === "✓" ? "#6FCF97" : icon === "✗" ? "#EB5757" : "#666", flexShrink: 0 }}>{icon || String.fromCharCode(65 + idx)}</span>
                    <span>{opt}</span>
                  </button>
                );
              })}
            </div>
            {showExp && (
              <div style={{ marginTop: 20, padding: "16px 18px", background: isCorrect ? "rgba(39,174,96,0.08)" : "rgba(235,87,87,0.08)", borderRadius: 10, borderLeft: `3px solid ${isCorrect ? "#27AE60" : "#EB5757"}` }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: isCorrect ? "#6FCF97" : "#EB5757", marginBottom: 8 }}>{isCorrect ? "Correct!" : "Incorrect"}</div>
                <p style={{ fontSize: 13, color: "#AAA", lineHeight: 1.6, margin: 0 }}>{q.explanation}</p>
                <SourceLink source={q.source} url={q.sourceUrl} />
              </div>
            )}
            {answered && (
              <button onClick={nextQuestion} style={{ marginTop: 20, width: "100%", padding: "14px", fontSize: 15, fontWeight: 700, color: "#FFF", background: "linear-gradient(135deg, #E85D3A 0%, #D44A28 100%)", border: "none", borderRadius: 10, cursor: "pointer", boxShadow: "0 4px 16px rgba(232,93,58,0.25)" }}>
                {currentQ < questions.length - 1 ? "Next Question →" : "See Results"}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── RESULTS ──
  if (phase === "review") {
    const score = getScore();
    const scaled = getScaled();
    const passed = scaled >= PASS_THRESHOLD;
    const domainScores = getDomainScores();

    return (
      <div style={{ minHeight: "100vh", background: bg, color: "#E8E8E8", fontFamily: ff, overflowY: "auto", padding: "36px 20px" }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          {isPreview && (
            <div style={{ marginBottom: 20, padding: "10px 14px", background: "rgba(242,153,74,0.1)", border: "1px solid rgba(242,153,74,0.3)", borderRadius: 8, fontSize: 13, color: "#F2994A", fontWeight: 600 }}>
              ⚠ Sample Report — mock answers to preview results layout. Start the exam for your real score.
            </div>
          )}
          <div style={{ textAlign: "center", marginBottom: 44 }}>
            <div style={{ width: 110, height: 110, borderRadius: "50%", margin: "0 auto 20px", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", background: passed ? "radial-gradient(circle, rgba(39,174,96,0.2) 0%, transparent 70%)" : "radial-gradient(circle, rgba(235,87,87,0.2) 0%, transparent 70%)", border: `3px solid ${passed ? "#27AE60" : "#EB5757"}` }}>
              <span style={{ fontSize: 32, fontWeight: 800, color: passed ? "#6FCF97" : "#EB5757" }}>{scaled}</span>
              <span style={{ fontSize: 10, color: "#888" }}>/ 1000</span>
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 8px 0", color: passed ? "#6FCF97" : "#EB5757" }}>{passed ? "PASSED" : "NOT YET"}</h1>
            <p style={{ fontSize: 14, color: "#888", margin: 0 }}>{score}/{questions.length} correct · {fmt(elapsed)} elapsed · 720 minimum</p>
          </div>

          <div style={{ marginBottom: 32 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 14 }}>Scenarios Tested</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {selectedScenarios.map(s => (
                <span key={s.id} style={{ padding: "6px 12px", background: `${s.color}15`, border: `1px solid ${s.color}30`, borderRadius: 6, fontSize: 12, color: s.color, fontWeight: 600 }}>S{s.id}: {s.name}</span>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 32 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 14 }}>Domain Breakdown</h3>
            {domainScores.filter(d => d.total > 0).map(d => (
              <div key={d.num} style={{ padding: "14px 18px", background: "rgba(255,255,255,0.04)", borderRadius: 10, borderLeft: `3px solid ${d.color}`, marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#CCC" }}>{d.name}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: d.pct >= 72 ? "#6FCF97" : d.pct >= 50 ? "#F2994A" : "#EB5757" }}>{d.correct}/{d.total} ({d.pct}%)</span>
                </div>
                <div style={{ height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 3 }}>
                  <div style={{ height: "100%", width: `${d.pct}%`, background: d.color, borderRadius: 3, transition: "width 0.6s ease" }} />
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginBottom: 32 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 14 }}>Question Review</h3>
            {selectedScenarios.map(sc => {
              const scQs = questions.filter(q => q.scenario === sc.id);
              return (
                <div key={sc.id} style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: sc.color, padding: "8px 0", borderBottom: `1px solid ${sc.color}25`, marginBottom: 8 }}>Scenario {sc.id}: {sc.name}</div>
                  {scQs.map((q, i) => {
                    const ok = answers[q.id] === q.correct;
                    return (
                      <details key={q.id} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, border: `1px solid ${ok ? "rgba(39,174,96,0.15)" : "rgba(235,87,87,0.15)"}`, overflow: "hidden", marginBottom: 4 }}>
                        <summary style={{ padding: "10px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#BBB", listStyle: "none" }}>
                          <span style={{ width: 20, height: 20, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, flexShrink: 0, background: ok ? "rgba(39,174,96,0.15)" : "rgba(235,87,87,0.15)", color: ok ? "#6FCF97" : "#EB5757" }}>{ok ? "✓" : "✗"}</span>
                          <span style={{ flex: 1, lineHeight: 1.4 }}>{q.question.slice(0, 100)}{q.question.length > 100 ? "..." : ""}</span>
                        </summary>
                        <div style={{ padding: "0 14px 14px", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                          <div style={{ paddingTop: 10 }}>
                            {!ok && <p style={{ fontSize: 12, color: "#EB5757", margin: "0 0 5px" }}>Your answer: {q.options[answers[q.id]]}</p>}
                            <p style={{ fontSize: 12, color: "#6FCF97", margin: "0 0 8px" }}>Correct: {q.options[q.correct]}</p>
                            <p style={{ fontSize: 12, color: "#888", lineHeight: 1.5, margin: 0 }}>{q.explanation}</p>
                            <SourceLink source={q.source} url={q.sourceUrl} />
                          </div>
                        </div>
                      </details>
                    );
                  })}
                </div>
              );
            })}
          </div>

          <div style={{ height: 80 }} />
        </div>
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "12px 20px", background: "linear-gradient(to top, rgba(13,13,13,0.98) 60%, transparent)", backdropFilter: "blur(10px)", zIndex: 50 }}>
          <div style={{ maxWidth: 680, margin: "0 auto" }}>
            <button onClick={restart} style={{ width: "100%", padding: "15px", fontSize: 16, fontWeight: 700, color: "#FFF", background: "linear-gradient(135deg, #E85D3A 0%, #D44A28 100%)", border: "none", borderRadius: 10, cursor: "pointer", boxShadow: "0 4px 16px rgba(232,93,58,0.25)" }}>{isPreview ? "← Back to Start" : "Retake Exam"}</button>
          </div>
        </div>
      </div>
    );
  }
}
