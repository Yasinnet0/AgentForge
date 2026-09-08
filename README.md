# AgentForge

AgentForge is a desktop hub for creating, bundling, discovering, and installing AI agent capabilities. It brings together skills, multi-tool kits, context rules, and Model Context Protocol (MCP) servers into a single local workspace.

> **Note:** This repository represents the initial prototype (v0.0.1).

---

## Overview

Agent tooling is often fragmented across ad-hoc markdown files, standalone MCP servers, prompt guidelines, and custom environment configurations. AgentForge provides a local interface to organize, author, and distribute these assets cleanly.

### What You Can Do

- **Author & Bundle**: Create reusable agent skills, compose related skills into packaged kits, and define structured context rules for LLM reasoning.
- **Discover & Install**: Search and install community or official skills, context bundles, and MCP servers directly into your active project.
- **Manage Runtime & State**: Keep track of installed packages, review security permissions, inspect environment paths, and apply updates from a centralized dashboard.

---

## Quickstart

### Prerequisites

- Node.js 18+
- npm (or pnpm / yarn)

### Setup

```bash
git clone https://github.com/Yasinnet0/AgentForge.git
cd AgentForge
npm install
```

### Running Locally

```bash
npm run electron:dev
```

This compiles the Electron main process and starts the Vite development server with Hot Module Replacement.

---

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run electron:dev` | Launch Electron and Vite in development mode |
| `npm run build` | Build the React frontend (`dist/`) |
| `npm run build:electron` | Compile Electron TypeScript files (`dist-electron/`) |
| `npm run electron:build` | Build production assets and package via `electron-builder` |
| `npm run electron:portable` | Package a standalone Windows portable `.exe` into `release/` |
| `npm run electron:win` | Build Windows NSIS installer and portable executables |

---

## Packaging

Distribution builds are generated using `electron-builder` and placed in the `release/` folder:

- **Portable Executable**: `release/AgentForge 0.0.1.exe` (run directly without installation)
- **Installer**: `release/AgentForge Setup 0.0.1.exe` (NSIS setup wizard)
- **Unpacked Directory**: `release/win-unpacked/AgentForge.exe`

---

## Project Structure

```text
AgentForge/
├── electron/
│   ├── main.ts         # Main process, window lifecycle, IPC handlers
│   ├── preload.ts      # Context bridge exposing safe IPC APIs
│   └── tsconfig.json   # TypeScript config for Electron
├── src/
│   ├── components/     # TopBar, Sidebar, StatCards, Activity, Updates, Tables
│   ├── App.tsx         # Dashboard layout, state, and view routing
│   ├── index.css       # Design tokens, typography, layout styles
│   └── main.tsx        # React entrypoint
└── package.json        # Dependencies, build targets, and metadata
```

---

## Tech Stack

- **Desktop Shell**: Electron 34
- **Frontend**: React 19, TypeScript 5.7, Tailwind CSS 4
- **Build Tooling**: Vite 6, electron-builder 25
- **Icons**: Lucide React
