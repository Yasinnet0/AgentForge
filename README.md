<div align="center">

<img src="./AgentForge.png" alt="AgentForge Logo" width="440" />

<p align="center">
  A local desktop application to manage, transfer, and configure tools, skills, MCP servers, and context rules across 12 AI coding assistants on your machine.
</p>

<p align="center">
  <a href="https://github.com/Yasinnet0/AgentForge/releases/latest"><img src="https://img.shields.io/badge/release-latest-0284c7?logo=github&logoColor=white" alt="Release" /></a>
  <a href="#supported-agents"><img src="https://img.shields.io/badge/agents-12%20supported-ea580c?logo=probot&logoColor=white" alt="Agents" /></a>
  <a href="https://github.com/Yasinnet0/AgentForge/releases/latest"><img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-6366f1" alt="Platform" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-10b981?logo=opensourceinitiative&logoColor=white" alt="License" /></a>
</p>

<p align="center">
  <a href="#quick-start"><b>Quick Start</b></a> &bull;
  <a href="#core-capabilities"><b>Capabilities</b></a> &bull;
  <a href="#supported-agents"><b>Supported Agents</b></a> &bull;
  <a href="#build-from-source"><b>Build from Source</b></a> &bull;
  <a href="#license"><b>License</b></a>
</p>

</div>

---

## Quick Start

### 1. Download Pre-built Binaries

Download the latest version from the [Releases](https://github.com/Yasinnet0/AgentForge/releases/latest) page:
- **Portable**: Standalone single executable (runs immediately without installation)
- **Installer**: Standard desktop setup wizard

### 2. Or Run from Source

Requirements: **Node.js 18+** and **npm**.

```bash
# Clone the repository
git clone https://github.com/Yasinnet0/AgentForge
cd AgentForge

# Install dependencies
npm install

# Launch desktop app in development mode
npm run electron:dev
```

---

## Core Capabilities

| Capability | Details |
| :--- | :--- |
| **Agent Discovery** | Automatically scans system PATH and CLI commands (`claude`, `cursor`, `agy`, `windsurf`, etc.) to detect installed agents and their dotfile directories. |
| **Skill Portability** | 1-click replication of custom skills and tool packages between any agent with automated folder path and schema adjustments. |
| **MCP Registry** | Centralized deck to search vetted community and official servers, configure environment variables, and toggle stdio/SSE servers per agent. |
| **Directives Studio** | Visual editor to author, preview, and synchronize global and workspace prompt rules (`CLAUDE.md`, `.cursorrules`, `AGENTS.md`) with live diffs. |
| **Air-Gapped Privacy** | 100% local execution on your machine. Zero telemetry, no cloud accounts, and no data leaves your computer. |

---

## Supported Agents

| Agent | Default Directory | MCP Target | Instructions / Rules Target |
| :--- | :--- | :--- | :--- |
| **Google Antigravity** | `~/.gemini/config/` | `mcp_config.json` | `AGENTS.md` / `GEMINI.md` |
| **Claude Code** | `~/.claude/` | `mcp.json` | `CLAUDE.md` |
| **Cursor** | `~/.cursor/` | `mcp.json` | `.cursorrules` / `rules/` |
| **Codeium Windsurf** | `~/.windsurf/` | `mcp_config.json` | `.windsurfrules` |
| **GitHub Copilot** | `~/.copilot/` | `mcp-config.json` | `.github/copilot-instructions.md` |
| **OpenAI Codex** | `~/.codex/` | `mcp_config.json` | `instructions.md` |
| **Cline** | `~/.cline/` | `cline_mcp_settings.json` | `.clinerules` |
| **Aider AI** | `~/.aider/` | `mcp.json` | `.aider.conf.yml` |
| **Continue.dev** | `~/.continue/` | `config.json` | `.continue/rules.md` |
| **OpenCode** | `~/.config/opencode/` | `opencode.jsonc` | `instructions.md` |
| **Pi** | `~/.pi/` | `mcp.json` | `instructions.md` |
| **Zed AI** | `~/.config/zed/` | `settings.json` (ACP) | `.zed/prompts` |

---

## Build from Source

```bash
# Build React frontend & compile Electron backend
npm run build
npm run build:electron

# Package desktop binaries
npm run electron:win        # Windows (Installer & Portable)
npm run electron:mac        # macOS (DMG & Zip)
npm run electron:linux      # Linux (AppImage & DEB)
```

Packaged outputs will be located in the `release/` directory.

---

## Legal & Trademarks

<details>
<summary><b>Trademarks & Nominative Fair Use Notice</b></summary>

<br />

AgentForge is an independent, open-source desktop software project. It is **not** affiliated with, endorsed by, or sponsored by:
- **Anthropic PBC** (*Claude Code*)
- **Anysphere Inc.** (*Cursor*)
- **Codeium / Exafunction Inc.** (*Windsurf*)
- **Google LLC** (*Gemini, Antigravity*)
- **OpenAI OpCo, LLC** (*Codex, ChatGPT*)
- **Microsoft Corporation / GitHub Inc.** (*GitHub Copilot*)
- **Inflection AI, Inc.** (*Pi*)
- **Zed Industries** (*Zed*)

All third-party trademarks, service marks, trade names, product names, and logos referenced within AgentForge belong to their respective owners. Any reference to third-party entities, tools, or products is strictly intended for **nominative fair use** to identify compatibility, configuration standards, and local file paths for software development.

</details>

---

## License

[MIT](LICENSE) &copy; AgentForge Contributors.
