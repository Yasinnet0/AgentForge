import { RulePreset } from '../types/agent';

export const RULE_PRESETS: RulePreset[] = [
  {
    id: 'preset-communication-zero-fluff',
    title: 'Zero Fluff & High Efficiency Communication',
    summary: 'Eliminate conversational filler and sycophancy, prioritize code and direct answers.',
    category: 'communication',
    directives: [
      {
        title: 'Zero Fluff & Direct Answers',
        content: 'Eliminate sycophantic agreement phrases ("I understand", "Great idea", "Sure!"). Respect user time and provide the code, answer, or command directly without filler.'
      },
      {
        title: 'Show, Don\'t Tell',
        content: 'When modifying files or executing commands, provide brief, factual summaries. Do not over-explain every trivial line of code unless specifically requested.'
      },
      {
        title: 'Concise Questioning',
        content: 'If clarification is necessary, ask targeted, specific questions rather than open-ended conversational essays.'
      }
    ]
  },
  {
    id: 'preset-elite-engineering',
    title: 'Elite Engineering & Verification Standards',
    summary: 'Never guess file structures, perform surgical edits, and verify with tests before asserting fixes.',
    category: 'engineering',
    directives: [
      {
        title: 'Evidence Before Assertions',
        content: 'NEVER claim "the issue is fixed" or "the build succeeded" unless you have executed a terminal test, compilation, or validation command that proves it physically.'
      },
      {
        title: 'No Cowboy Coding',
        content: 'Do not guess APIs, configuration schemas, or file trees. Always inspect files and gather verified context before authoring code.'
      },
      {
        title: 'Surgical Edits Only',
        content: 'Touch only the lines required for the requested feature or fix. Do not reformat unrelated code, delete comments, or introduce unprompted style churn.'
      },
      {
        title: 'Strict Scope & Zero Overengineering',
        content: 'Do only the exact job or answer asked. Never add speculative abstractions, unrequested utility functions, or gratuitous frameworks.'
      }
    ]
  },
  {
    id: 'preset-git-discipline',
    title: 'Clean Git & GitHub Discipline',
    summary: 'Bans AI-slop commit prefixes (feat:, fix:) and requires explicit user confirmation before commits or pushes.',
    category: 'git',
    directives: [
      {
        title: 'No AI Slop Commit Syntaxes',
        content: 'Do NOT use artificial prefixes like `feat:`, `fix:`, `chore:`, or `refactor:`. Use clean, plain-English descriptive explanations (e.g. `initial prototype of AgentForge desktop dashboard`).'
      },
      {
        title: 'No Unconfirmed Commits or Pushes',
        content: 'NEVER run `git commit`, `git commit --amend`, or `git push` under any circumstance without explicit user confirmation first.'
      },
      {
        title: 'Atomic & Coherent Changesets',
        content: 'Organize git commits logically by architectural layer rather than dumping all work into a giant monolithic commit.'
      }
    ]
  },
  {
    id: 'preset-systematic-debugging',
    title: 'Systematic Debugging & Autonomous Self-Correction',
    summary: 'Formulate hypotheses before fixes and automatically read stack traces without waiting for prompts.',
    category: 'debugging',
    directives: [
      {
        title: 'Root Cause Isolation First',
        content: 'Gather logs and stack traces, isolate the exact failure point, and formulate a clear hypothesis before editing code. No blind trial-and-error guessing.'
      },
      {
        title: 'Autonomous Self-Correction',
        content: 'If a command or build fails, immediately read the exact stderr output and correct the root cause autonomously without waiting for user prompting.'
      }
    ]
  },
  {
    id: 'preset-ui-design-excellence',
    title: 'Modern UI/UX & Visual Polish Standards',
    summary: 'Enforce high-contrast dark modes, Swiss typography, micro-interactions, and anti-slop guidelines.',
    category: 'engineering',
    directives: [
      {
        title: 'Anti-Slop Visual Hierarchy',
        content: 'Avoid generic minimum viable product styles. Use curated dark themes with high-contrast typography (4.5:1 minimum ratio), subtle elevation borders, and polished micro-animations.'
      },
      {
        title: 'Desktop Touch & Pointer Targets',
        content: 'Ensure all interactive controls adhere to 28-36px minimum clickable hit targets with active hover and disabled states.'
      }
    ]
  },
  {
    id: 'preset-security-sandboxing',
    title: 'Security & Credential Boundaries',
    summary: 'Prevent hardcoded secrets, enforce directory isolation, and guard dangerous shell commands.',
    category: 'security',
    directives: [
      {
        title: 'Zero Credential Exposure',
        content: 'Never hardcode API keys, passwords, or tokens in source files. Always load sensitive values from environment variables.'
      },
      {
        title: 'Directory Traversal Protection',
        content: 'Validate and sanitize file paths and target directories before executing file read, write, or deletion operations.'
      }
    ]
  },
  {
    id: 'preset-performance-optimization',
    title: 'High-Performance & Memory Profiling',
    summary: 'Eliminate V8 heap leaks, minimize garbage collection pressure, and profile before optimizing.',
    category: 'engineering',
    directives: [
      {
        title: 'Profile Before Optimizing',
        content: 'Never perform speculative performance optimization without micro-benchmarks or flame graph profiling proving the bottleneck physically.'
      },
      {
        title: 'Zero Memory Leaks',
        content: 'Clean up all event listeners, intervals, abort controllers, and stream subscriptions on teardown or unmount. Inspect retainer trees for detached references.'
      },
      {
        title: 'V8 GC Pressure Reduction',
        content: 'Avoid object thrashing and excessive allocations inside high-frequency loops or render passes. Favor object reuse and typed arrays where appropriate.'
      }
    ]
  },
  {
    id: 'preset-cloud-native-devops',
    title: 'Cloud-Native & 12-Factor Discipline',
    summary: 'Enforce environment parity, stateless processes, immutable container images, and declarative configuration.',
    category: 'engineering',
    directives: [
      {
        title: 'Stateless & Ephemeral Workloads',
        content: 'Treat application runtime processes as stateless and share-nothing. Persist state exclusively into managed databases, vector stores, or object storage.'
      },
      {
        title: 'Immutable Infrastructure Artifacts',
        content: 'Never modify production containers or virtual machines in-place. Build deterministic, immutable images tagged with explicit Git commit SHAs.'
      },
      {
        title: 'Strict Environment Separation',
        content: 'Store all environment configuration strictly in environment variables or KMS vaults. Never bundle environment-specific secrets into code or build artifacts.'
      }
    ]
  },
  {
    id: 'preset-game-dev-determinism',
    title: 'Game Engine & Real-Time Loop Determinism',
    summary: 'Zero allocations in hot game tick loops, fixed timestep physics, and cache-friendly data structures.',
    category: 'engineering',
    directives: [
      {
        title: 'Zero Allocations in Hot Tick Loops',
        content: 'Never allocate memory or instantiate objects inside `_process`, `Update()`, or `Tick()`. Pre-allocate object pools during scene initialization.'
      },
      {
        title: 'Fixed Timestep Physics & Delta Consistency',
        content: 'Always multiply frame delta time by velocities. Decouple physics updates into fixed tick rates to prevent simulation divergence and tunneling.'
      },
      {
        title: 'Cache-Friendly Component Layout',
        content: 'Organize gameplay data in contiguous memory structures (Struct-of-Arrays or Data-Oriented ECS) rather than deeply nested pointer trees.'
      }
    ]
  },
  {
    id: 'preset-type-safety-contracts',
    title: 'Strict Type Safety & Runtime Schemas',
    summary: 'Enforce strict compile-time types with zero `any` casting and validate all external boundary inputs with runtime schemas.',
    category: 'engineering',
    directives: [
      {
        title: 'Zero Unsafe Type Casting',
        content: 'Do NOT use `as any`, `@ts-ignore`, or unchecked dynamic casts. If types are uncertain, narrow with type guards or unknown discrimination.'
      },
      {
        title: 'Runtime Schema Validation at Boundaries',
        content: 'Parse and validate all incoming HTTP payloads, WebSocket messages, IPC requests, and environment variables using Zod, Pydantic, or TypeBox schemas.'
      },
      {
        title: 'Explicit Return Types',
        content: 'Exported functions, public API routes, and interface contracts must specify explicit return types to prevent unintended contract drift.'
      }
    ]
  },
  {
    id: 'preset-clean-architecture-ddd',
    title: 'Clean Architecture & Domain Isolation',
    summary: 'Preserve unidirectional dependency flow, hexagonal ports-and-adapters, and keep business logic isolated from frameworks.',
    category: 'engineering',
    directives: [
      {
        title: 'Framework Independence',
        content: 'Keep core domain entities and business rules agnostic of UI frameworks, ORMs, and transport protocols. Frameworks are implementation details.'
      },
      {
        title: 'Unidirectional Dependency Inversion',
        content: 'Inner architectural layers must never import or depend on outer layers. Depend upon interfaces and abstractions, not concrete implementations.'
      },
      {
        title: 'Surgical Responsibility Separation',
        content: 'Keep controllers thin, services focused on orchestration, repositories dedicated to data access, and entities encapsulating invariants.'
      }
    ]
  },
  {
    id: 'preset-ai-tool-guardrails',
    title: 'Agentic Tool Safety & Guardrails',
    summary: 'Enforce dry-run validations, prevent destructive file actions without confirmation, and ensure tool call idempotence.',
    category: 'security',
    directives: [
      {
        title: 'Idempotent Tool Invocations',
        content: 'Ensure tool calls and mutations can be retried safely without causing duplicate records, state corruption, or resource exhaustion.'
      },
      {
        title: 'Dry-Run & Confirmation for Destructive Actions',
        content: 'Never perform irreversible file deletion, database drop, or external payment execution without first demonstrating a dry-run preview and requiring confirmation.'
      },
      {
        title: 'Bounded Execution Timeouts',
        content: 'Wrap all asynchronous external network and tool requests with explicit timeout thresholds and circuit breakers to avoid hanging processes.'
      }
    ]
  }
];

export const DEFAULT_RULES_TEMPLATE = `# Agent Behavioral Directives

`;

