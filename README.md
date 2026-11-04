<div align="center">

  <img src="./AgentForge.png" alt="AgentForge Banner" width="820" style="border-radius: 12px; box-shadow: 0 12px 36px rgba(0,0,0,0.6);" />

  # AgentForge
  ### The Unified Desktop Command Hub for AI Agents, Skills, MCP Servers & Context Rules

  <p align="center">
    Seamlessly discover, configure, transfer, and synchronize tools, skills, rules, and Model Context Protocol (MCP) servers across 12 premier AI coding assistants in one unified local desktop interface.
  </p>

  <p align="center">
    <a href="https://github.com/Yasinnet0/AgentForge/releases"><img src="https://img.shields.io/badge/Version-0.0.1-38bdf8?style=for-the-badge&logo=semver&logoColor=white" alt="Version" /></a>
    <a href="#supported-agents--compatibility-matrix"><img src="https://img.shields.io/badge/Agents-12%20Supported-f97316?style=for-the-badge&logo=anthropic&logoColor=white" alt="17 Agents Supported" /></a>
    <a href="https://www.electronjs.org/"><img src="https://img.shields.io/badge/Electron-34.x-47848f?style=for-the-badge&logo=electron&logoColor=white" alt="Electron 34" /></a>
    <a href="https://react.dev/"><img src="https://img.shields.io/badge/React-19.x-06b6d4?style=for-the-badge&logo=react&logoColor=white" alt="React 19" /></a>
    <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.7-3178c6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript 5.7" /></a>
    <a href="https://vitejs.dev/"><img src="https://img.shields.io/badge/Vite-6.x-bd34fe?style=for-the-badge&logo=vite&logoColor=white" alt="Vite 6" /></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-10b981?style=for-the-badge&logo=opensourceinitiative&logoColor=white" alt="License: MIT" /></a>
  </p>

</div>

---

## 📑 Table of Contents

- [The Problem: Tooling Fragmentation](#-the-problem-tooling-fragmentation)
- [Key Features](#-key-features)
- [Supported Agents & Compatibility Matrix](#-supported-agents--compatibility-matrix)
- [Architecture & Security Model](#-architecture--security-model)
- [Getting Started](#-getting-started)
- [Desktop Packaging & Releases](#-desktop-packaging--releases)
- [Keyboard Shortcuts](#-keyboard-shortcuts)
- [Project Layout](#-project-layout)
- [Trademarks & Nominative Fair Use](#-trademarks--nominative-fair-use)
- [License](#-license)

---

## ⚡ The Problem: Tooling Fragmentation

Modern software development with AI agents is fragmented. Developers juggle multiple specialized tools across different projects:

- **Anthropic Claude Code** expects `~/.claude/skills` and `CLAUDE.md`.
- **Cursor** configures rules in `.cursorrules` and MCPs in `~/.cursor/mcp.json`.
- **Codeium Windsurf** maintains `.windsurfrules` and `~/.windsurf/mcp_config.json`.
- **Google Antigravity** customizes skills in `~/.gemini/config/skills` and rules in `AGENTS.md`.
- **Cline** uses `.clinerules` and VS Code MCP settings.
- **Aider AI, Continue.dev, OpenCode, Zed AI, OpenAI Codex, and Pi** each employ disjoint configuration formats, isolated directory locations, and divergent MCP registration schemas.

**AgentForge solves this.** It acts as a single local command deck that scans, visualizes, audits, and bridges your tools, skills, rules, and MCP servers across every agent installed on your machine.

---

## 🚀 Key Features

### 🎛️ Multi-Agent Command Deck
- Automatically detects installed AI agents via CLI binary checks and environment paths.
- View live installed counts for skills, MCP servers, and active context directives per agent.
- Filter, inspect, and toggle configurations per agent with a single click.

### 🔄 1-Click Skill Transfer & Cross-Agent Sync
- Author a skill once and instantly equip it across any combination of agents.
- Drag-and-drop or select batch skills with intelligent path normalization and conflict detection.
- Sync workspace directives into agent-specific rule files (`CLAUDE.md`, `.cursorrules`, `.clinerules`, `.windsurfrules`, `.roorules`, etc.).

### 🔌 Unified Model Context Protocol (MCP) Hub
- Search, browse, and install vetted community and official MCP servers.
- Automatically transforms server arguments into each agent's native format (JSON, JSONC, or YAML).
- Real-time environment variable configuration, secure token inputs, and active status toggling.

### 📋 Declarative Context Rules Builder
- Visual rule builder with modular sections (Communication, Code Quality, Security, Architecture, TDD).
- Seamless switching between **Global User Scope** (`~/.config/...`) and **Workspace Project Scope** (`./...`).
- Direct markdown preview with syntax highlighting and live diff tracking.

### 🛡️ Zero-Trust Security & Environment Isolation
- Audit local agent directory permissions and inspect environment variables before deployment.
- Three-layer process isolation (Sandboxed Electron Renderer $\leftrightarrow$ Typed IPC Context Bridge $\leftrightarrow$ Main Node Process).
- Complete offline capability: all filesystem modifications happen locally on your hardware.

---

## 🤖 Supported Agents & Compatibility Matrix

AgentForge provides out-of-the-box discovery and configuration bridge support for **12 premier AI agent runtimes with native skills, MCPs, plugins, or rules**:

| Agent | Category | Default Base Directory | MCP Configuration Target | Instructions / Rules Target |
| :--- | :--- | :--- | :--- | :--- |
| **Google Antigravity** | Unified Platform / CLI | `~/.gemini/config/` | `mcp_config.json` | `AGENTS.md` / `GEMINI.md` |
| **Claude Code** | Anthropic CLI Companion | `~/.claude/` | `mcp.json` / `~/.claude.json` | `CLAUDE.md` |
| **Cursor** | AI Code Editor | `~/.cursor/` | `mcp.json` | `.cursorrules` / `rules/` |
| **Codeium Windsurf** | Cascade Flow IDE | `~/.windsurf/` | `mcp_config.json` | `.windsurfrules` |
| **GitHub Copilot** | CLI & Agent Workspaces | `~/.copilot/` | `mcp-config.json` | `.github/copilot-instructions.md` |
| **OpenAI Codex** | OpenAI Assistants / CLI | `~/.codex/` | `mcp_config.json` | `instructions.md` |
| **Cline** | Autonomous Extension | `~/.cline/` | `cline_mcp_settings.json` | `.clinerules` |
| **Aider AI** | Pair Programming Terminal | `~/.aider/` | `mcp.json` | `.aider.conf.yml` |
| **Continue.dev** | Open-Source Modular Assistant | `~/.continue/` | `config.json` | `.continue/rules.md` |
| **OpenCode** | Open-Source Autonomous Agent | `~/.config/opencode/` | `opencode.jsonc` | `instructions.md` |
| **Pi** | Personal AI Agent Companion | `~/.pi/` | `mcp.json` | `instructions.md` |
| **Zed AI** | High-Performance Editor | `~/.config/zed/` | `settings.json` (ACP) | `.zed/prompts` |

---

## 🏗️ Architecture & Security Model

AgentForge is built on a hardened three-tier architectural boundary:

```
┌────────────────────────────────────────────────────────┐
│               React 19 Frontend Canvas                 │
│      (Vite + Tailwind CSS + Lucide + Vector Icons)     │
└───────────────────────────┬────────────────────────────┘
                            │ (Typed Window Electron API)
┌───────────────────────────▼────────────────────────────┐
│              Hardened Electron Preload                 │
│   (contextIsolation: true, nodeIntegration: false)     │
└───────────────────────────┬────────────────────────────┘
                            │ (Secure IPC Channels)
┌───────────────────────────▼────────────────────────────┐
│             Electron Main Process (Node.js)            │
│  - Path Resolvers & Environment Normalization          │
│  - Safe JSON/JSONC/YAML Parsing & Merging Engine       │
│  - Atomic File Writes & Backup Checkpoints             │
└───────────────────────────┬────────────────────────────┘
                            │ (Local Filesystem Access)
┌───────────────────────────▼────────────────────────────┐
│      Target Agent Configuration Stores On Your Disk    │
│ (~/.claude, ~/.cursor, ~/.gemini, ~/.roo, ~/.pi, etc.) │
└────────────────────────────────────────────────────────┘
```

- **Zero Host Mutation without Consent**: AgentForge scans read-only by default and only writes when explicit user actions (Install, Transfer, Toggle, Sync) are dispatched.
- **Atomic Operations**: Rule syncs and MCP merges use staging writes to prevent corrupting active agent configurations.
- **Air-Gapped Privacy**: No telemetry, no third-party cloud routing. All skill transfers and configs remain local.

---

## 🛠️ Getting Started

### Prerequisites

- **Node.js**: v18.0.0 or higher
- **npm** (or pnpm / yarn)
- **Git**

### Installation & Local Run

```bash
# 1. Clone the repository
git clone https://github.com/Yasinnet0/AgentForge.git
cd AgentForge

# 2. Install dependencies
npm install

# 3. Launch in desktop development mode (Electron + Vite HMR)
npm run electron:dev
```

---

## 📦 Desktop Packaging & Releases

AgentForge packages into standalone, production-ready desktop distributions powered by `electron-builder`:

```bash
# Compile React frontend and Electron main process
npm run build
npm run build:electron

# Package Windows NSIS Setup Wizard & Standalone Executables
npm run electron:win

# Build Windows Portable Executable (runs anywhere without installation)
npm run electron:portable
```

Built artifacts are output into the `release/` directory:
- **Windows Portable**: `release/AgentForge-Portable-0.0.1.exe`
- **Windows Installer**: `release/AgentForge Setup 0.0.1.exe`
- **Unpacked Binary**: `release/win-unpacked/AgentForge.exe`

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action | Scope |
| :--- | :--- | :--- |
| <kbd>Ctrl</kbd> + <kbd>K</kbd> / <kbd>⌘</kbd> + <kbd>K</kbd> | Open Global Command Palette & Package Search | Global |
| <kbd>Ctrl</kbd> + <kbd>1</kbd> | Navigate to Skills Catalog | Global |
| <kbd>Ctrl</kbd> + <kbd>2</kbd> | Navigate to MCP Servers | Global |
| <kbd>Ctrl</kbd> + <kbd>3</kbd> | Navigate to Multi-Skill Plugins | Global |
| <kbd>Ctrl</kbd> + <kbd>4</kbd> | Navigate to Context Rules Builder | Global |
| <kbd>Ctrl</kbd> + <kbd>5</kbd> | Navigate to Supported Agents Deck | Global |
| <kbd>Ctrl</kbd> + <kbd>6</kbd> | Navigate to Security & Environment Audit | Global |
| <kbd>Ctrl</kbd> + <kbd>S</kbd> / <kbd>⌘</kbd> + <kbd>S</kbd> | Save & Sync Active Rule Directives | Rules View |
| <kbd>Esc</kbd> | Dismiss Active Drawer, Modal, or Dropdown | Global |

---

## 📂 Project Layout

```text
AgentForge/
├── electron/
│   ├── main.ts            # Privileged backend: IPC handlers, safe FS bridge, agent scanner
│   ├── preload.ts         # Secure contextBridge exposing typed window.electronAPI
│   └── tsconfig.json      # TypeScript configuration for Electron process
├── src/
│   ├── components/        # Desktop UI views: TopBar, Sidebar, AgentIcon, SecurityView, etc.
│   ├── config/            # Supported agent specifications and fallback directories
│   ├── data/              # Curated catalogs for skills, MCP servers, plugins, and rule presets
│   ├── services/          # Activity logger, catalog synchronizer, and update history
│   ├── types/             # Strict TypeScript models for agents, packages, and catalogs
│   ├── App.tsx            # Main application orchestrator & responsive layout state
│   ├── index.css          # Design tokens, typography hierarchy, and animations
│   └── main.tsx           # React 19 entrypoint
├── public/                # Static assets, branding, and icons
├── package.json           # Scripts, Electron dependencies, and builder configuration
└── vite.config.ts         # Vite bundler configuration
```

---

## ⚖️ Trademarks & Nominative Fair Use

AgentForge is an independent, open-source desktop software project. It is **not** affiliated with, endorsed by, or sponsored by:
- Anthropic PBC (*Claude*)
- Anysphere Inc. (*Cursor*)
- Codeium / Exafunction Inc. (*Windsurf*)
- Google LLC (*Gemini, Antigravity*)
- OpenAI OpCo, LLC (*Codex, ChatGPT*)
- Microsoft Corporation / GitHub Inc. (*GitHub Copilot*)
- Inflection AI, Inc. (*Pi*)
- Zed Industries (*Zed*)

All third-party trademarks, product names, marks, and logos referenced within AgentForge belong to their respective owners. Their depiction is strictly intended for **nominative fair use** to identify compatibility, folder targets, and configuration standards for local software development.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE) - feel free to use, modify, and distribute it for personal and commercial development.
