# Upstream Sources & Registries

AgentForge aggregates MCP servers, skills, plugins, and directives from vetted open-source registries, curated community feeds, and your machine's local configuration directories.

AgentForge operates under a **local-first, zero-telemetry architecture**: all network fetches are strictly client-side queries to fetch public JSON indexes, and no user data, keys, or file paths are ever transmitted.

---

## 1. Remote Catalogs & Endpoints

| Source | Category | Upstream Provider / Repository | Endpoint URL | License |
| :--- | :--- | :--- | :--- | :--- |
| **Model Context Protocol** | MCP Servers | Linux Foundation / Anthropic | `https://registry.modelcontextprotocol.io/v0.1/servers` | MIT / Apache-2.0 |
| **Anthropic Official Plugins** | Plugins | Anthropic PBC (`claude-plugins-official`) | `https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/.claude-plugin/marketplace.json` | MIT |
| **Anthropic Community Plugins** | Plugins | Community via Anthropic (`claude-plugins-community`) | `https://raw.githubusercontent.com/anthropics/claude-plugins-community/main/.claude-plugin/marketplace.json` | MIT |
| **Agentic Awesome Skills (AAS)** | Skills | `sickn33/agentic-awesome-skills` | `https://raw.githubusercontent.com/sickn33/agentic-awesome-skills/main/skills_index.json` | MIT |
| **AAS Editorial Bundles** | Plugins & Kits | `sickn33/agentic-awesome-skills` | `https://raw.githubusercontent.com/sickn33/agentic-awesome-skills/main/data/editorial-bundles.json` | MIT |
| **GitHub Copilot Marketplace** | Plugins | `github/awesome-copilot` | `https://raw.githubusercontent.com/github/awesome-copilot/marketplace/.github/plugin/marketplace.json` | MIT |
| **Smithery Registry** | MCP Servers | Smithery.ai | `https://api.smithery.ai/servers` | Open Index |

---

## 2. Local Agent Discovery (On-Disk Scanners)

In addition to public registries, AgentForge dynamically detects tools, MCP configs, and skills already installed on your local machine by scanning standard dotfile directories:

| Agent | Default Base Path | Detected Capabilities |
| :--- | :--- | :--- |
| **Google Antigravity** | `~/.gemini/antigravity/` | MCP configs (`mcp_config.json`), local skills, rules (`AGENTS.md`, `GEMINI.md`) |
| **Claude Code** | `~/.claude/` | MCP configs (`mcp.json`), installed skills, directives (`CLAUDE.md`) |
| **Cursor** | `~/.cursor/` | MCP configs (`mcp.json`), prompt rules (`.cursorrules`, `rules/`) |
| **Codeium Windsurf** | `~/.windsurf/` | MCP configs (`mcp_config.json`), rule files (`.windsurfrules`) |
| **GitHub Copilot** | `~/.copilot/` | MCP configurations, instructions (`.github/copilot-instructions.md`) |
| **OpenAI Codex** | `~/.codex/` | MCP configs, system instructions (`instructions.md`) |
| **Cline** | `~/.cline/` | MCP settings (`cline_mcp_settings.json`), instructions (`.clinerules`) |
| **Aider AI** | `~/.aider/` | MCP servers, configuration files (`.aider.conf.yml`) |
| **Continue.dev** | `~/.continue/` | Configuration file (`config.json`), prompt rules (`.continue/rules.md`) |
| **OpenCode** | `~/.config/opencode/` | Workspace config (`opencode.jsonc`), instructions |
| **Pi** | `~/.pi/` | MCP servers, system directives |
| **Zed AI** | `~/.config/zed/` | ACP / settings (`settings.json`), custom prompts (`.zed/prompts`) |

---

## 3. Offline & Air-Gapped Operation

AgentForge is built to work fully offline:

* **Bundled Catalog Fallback:** The desktop app ships with pre-compiled snapshots (`src/data/mcpCatalog.ts`, `src/data/skillsCatalog.ts`, `src/data/pluginsCatalog.ts`). If no internet connection is available or if upstream servers are unreachable, the app automatically falls back to bundled datasets.
* **Local Caching:** Synced remote feeds are cached in local browser storage (`localStorage`) with timestamps. Network requests only occur when manually triggered or when the cache expires.
* **No Outbound Data:** Server execution parameters, secrets (e.g., API keys), and file paths stay on your local disk.

---

## 4. Custom & Private Registry Feeds

Organizations and teams hosting internal MCP servers or proprietary playbooks can register custom JSON endpoints via AgentForge:

1. Navigate to **Settings → Sources & Feeds**.
2. Click **Add Custom Feed**.
3. Provide your raw JSON URL adhering to standard catalog schema:
   ```json
   [
     {
       "id": "internal-db-connector",
       "name": "Internal DB Connector",
       "description": "Production database MCP server for internal services",
       "category": "Database",
       "transport": "stdio",
       "command": "node",
       "args": ["/opt/internal/db-mcp.js"]
     }
   ]
   ```
4. AgentForge will fetch, validate, and merge your private tools into your desktop catalog deck.

---

## 5. Security & Verification Policy

* **Execution Responsibility:** AgentForge configures local agent configuration files; it does not execute MCP servers or run tool commands directly without explicit user action.
* **Prerequisite Checking:** When an MCP server or skill specifies command-line dependencies (e.g., `uv`, `node`, `docker`, `python`), AgentForge evaluates whether those binaries exist on your system `PATH` and surfaces terminal copy snippets.
* **Environment Variables:** API keys entered via the prompt modal are written solely to target agent config files on your machine. AgentForge does not store or log credentials.

---

## 6. Upstream Attribution

AgentForge is grateful to the open-source projects, organizations, and contributors whose public catalogs power the ecosystem:

* [Model Context Protocol Specification & Registry](https://modelcontextprotocol.io/) by Anthropic & Linux Foundation
* [Claude Plugins Catalog](https://github.com/anthropics/claude-plugins-official) by Anthropic PBC
* [Agentic Awesome Skills](https://github.com/sickn33/agentic-awesome-skills) by sickn33 and community contributors
* [Smithery.ai](https://smithery.ai) for supplementary community metadata
