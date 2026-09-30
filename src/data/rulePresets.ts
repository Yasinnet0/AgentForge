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
  }
];

export const DEFAULT_RULES_TEMPLATE = `# Agent Behavioral Directives

`;

