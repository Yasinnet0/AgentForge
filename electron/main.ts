import { app, BrowserWindow, ipcMain, screen, shell, dialog, Menu, nativeImage } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import AdmZip from 'adm-zip';
import { execSync } from 'child_process';

const isDev = process.env.NODE_ENV === 'development';

// Set application identity early so Windows Task Manager and Taskbar register AgentForge branding
app.name = 'AgentForge';
app.setName('AgentForge');

if (process.platform === 'win32') {
  app.setAppUserModelId('com.agentforge.desktop');
}

if (isDev) {
  // Isolate development cache from production/portable releases to prevent GPUCache access collisions
  app.setPath('userData', path.join(app.getPath('appData'), 'agentforge-dev'));
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;

interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  isMaximized: boolean;
}

const DEFAULT_STATE: WindowState = {
  width: 1440,
  height: 900,
  isMaximized: false,
};

function getStateFilePath(): string {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function loadWindowState(): WindowState {
  try {
    const filePath = getStateFilePath();
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const width = typeof data.width === 'number' && data.width >= 1100 ? data.width : DEFAULT_STATE.width;
      const height = typeof data.height === 'number' && data.height >= 700 ? data.height : DEFAULT_STATE.height;
      const isMaximized = Boolean(data.isMaximized);

      let x = typeof data.x === 'number' ? data.x : undefined;
      let y = typeof data.y === 'number' ? data.y : undefined;

      if (x !== undefined && y !== undefined) {
        const isVisibleOnAnyDisplay = screen.getAllDisplays().some((display) => {
          const { x: dx, y: dy, width: dw, height: dh } = display.bounds;
          return x! >= dx - 50 && x! < dx + dw && y! >= dy - 50 && y! < dy + dh;
        });
        if (!isVisibleOnAnyDisplay) {
          x = undefined;
          y = undefined;
        }
      }

      return { width, height, x, y, isMaximized };
    }
  } catch (err) {
    console.warn('Failed to load window state, falling back to default:', err);
  }
  return { ...DEFAULT_STATE };
}

let saveTimeout: NodeJS.Timeout | null = null;

function saveWindowState(win: BrowserWindow) {
  if (!win || win.isDestroyed()) return;

  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }

  saveTimeout = setTimeout(() => {
    try {
      if (!win || win.isDestroyed()) return;
      const isMaximized = win.isMaximized();
      let stateToSave: WindowState;

      if (isMaximized) {
        const prev = loadWindowState();
        stateToSave = {
          width: prev.width,
          height: prev.height,
          x: prev.x,
          y: prev.y,
          isMaximized: true,
        };
      } else {
        const bounds = win.getBounds();
        stateToSave = {
          width: bounds.width,
          height: bounds.height,
          x: bounds.x,
          y: bounds.y,
          isMaximized: false,
        };
      }

      fs.writeFileSync(getStateFilePath(), JSON.stringify(stateToSave, null, 2), 'utf-8');
    } catch (err) {
      console.warn('Failed to save window state:', err);
    }
  }, 250);
}

function getAppIconPath(): string {
  if (process.platform === 'win32') {
    const icoCandidates = [
      path.join(__dirname, '../build/icon.ico'),
      path.join(__dirname, '../public/icon.ico'),
      path.join(__dirname, '../dist/icon.ico'),
      path.join(__dirname, 'icon.ico'),
    ];
    for (const c of icoCandidates) {
      if (fs.existsSync(c)) return c;
    }
  }

  const pngCandidates = [
    path.join(__dirname, '../build/icon.png'),
    path.join(__dirname, '../public/icon.png'),
    path.join(__dirname, '../dist/icon.png'),
    path.join(__dirname, '../AgentForge.png'),
    path.join(__dirname, 'icon.png'),
  ];
  for (const c of pngCandidates) {
    if (fs.existsSync(c)) return c;
  }
  return '';
}

function createWindow() {
  Menu.setApplicationMenu(null);
  const windowState = loadWindowState();
  const iconPath = getAppIconPath();
  const appIcon = iconPath ? nativeImage.createFromPath(iconPath) : undefined;

  mainWindow = new BrowserWindow({
    title: 'AgentForge',
    icon: appIcon,
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    minWidth: 880,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: false,
    },
    show: false,
  });

  mainWindow.removeMenu();
  mainWindow.setMenuBarVisibility(false);

  // Block Developer Tools and Inspect Element keyboard shortcuts
  mainWindow.webContents.on('before-input-event', (event, input) => {
    const isCtrlOrCmd = input.control || input.meta;
    const key = input.key.toLowerCase();
    if (
      key === 'f12' ||
      (isCtrlOrCmd && input.shift && (key === 'i' || key === 'j' || key === 'c')) ||
      (isCtrlOrCmd && key === 'u')
    ) {
      event.preventDefault();
    }
  });

  // Block Chromium context menu to disable Inspect Element
  mainWindow.webContents.on('context-menu', (event) => {
    event.preventDefault();
  });

  if (process.platform === 'win32' && appIcon && !appIcon.isEmpty()) {
    try {
      mainWindow.setIcon(appIcon);
    } catch (err) {
      console.warn('Failed to set window icon:', err);
    }
  }

  if (windowState.isMaximized) {
    mainWindow.maximize();
  }

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // External navigation
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      if (isDev && (url.includes('localhost:5173') || url.includes('127.0.0.1:5173'))) {
        return;
      }
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.once('ready-to-show', () => {
    if (process.platform === 'win32' && appIcon && !appIcon.isEmpty()) {
      try {
        mainWindow?.setIcon(appIcon);
      } catch (err) {
        console.warn('Failed to re-apply window icon on ready-to-show:', err);
      }
    }
    mainWindow?.show();
  });

  // Window visibility
  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  }, 1200);

  mainWindow.on('resize', () => {
    if (mainWindow) saveWindowState(mainWindow);
  });

  mainWindow.on('move', () => {
    if (mainWindow) saveWindowState(mainWindow);
  });

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:maximize-change', true);
    if (mainWindow) saveWindowState(mainWindow);
  });

  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:maximize-change', false);
    if (mainWindow) saveWindowState(mainWindow);
  });

  mainWindow.on('enter-full-screen', () => {
    mainWindow?.webContents.send('window:maximize-change', true);
  });

  mainWindow.on('leave-full-screen', () => {
    mainWindow?.webContents.send('window:maximize-change', false);
  });

  if (isDev) {
    mainWindow.loadURL('http://127.0.0.1:5173').catch((err) => {
      console.warn('Dev server not reachable, loading dist/index.html:', err);
      mainWindow?.loadFile(path.join(__dirname, '../dist/index.html'));
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('close', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        const isMaximized = mainWindow.isMaximized();
        const bounds = mainWindow.getBounds();
        const prev = loadWindowState();
        const finalState: WindowState = {
          width: isMaximized ? prev.width : bounds.width,
          height: isMaximized ? prev.height : bounds.height,
          x: isMaximized ? prev.x : bounds.x,
          y: isMaximized ? prev.y : bounds.y,
          isMaximized,
        };
        fs.writeFileSync(getStateFilePath(), JSON.stringify(finalState, null, 2), 'utf-8');
      } catch (err) {
        console.warn('Failed to save final window state:', err);
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Window IPC
ipcMain.on('window:minimize', () => {
  mainWindow?.minimize();
});

ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.on('window:close', () => {
  mainWindow?.close();
});

ipcMain.handle('window:isMaximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

ipcMain.handle('app:version', () => {
  return app.getVersion();
});

ipcMain.handle('app:openExternal', async (_event, url: string) => {
  if (url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('mailto:'))) {
    try {
      await shell.openExternal(url);
      return true;
    } catch (err) {
      console.warn('Failed to open external URL:', err);
      return false;
    }
  }
  return false;
});

ipcMain.handle('app:openPath', async (_event, targetPath: string) => {
  if (!targetPath) return false;
  try {
    const resolved = resolveHome(targetPath);
    if (!fs.existsSync(resolved)) {
      const parent = path.dirname(resolved);
      if (fs.existsSync(parent)) {
        await shell.openPath(parent);
        return true;
      }
      return false;
    }
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      const err = await shell.openPath(resolved);
      return !err;
    } else {
      shell.showItemInFolder(resolved);
      return true;
    }
  } catch (err) {
    console.warn('Failed to open path in file explorer:', targetPath, err);
    return false;
  }
});

function resolveHome(filepath: string): string {
  if (!filepath) return '';
  if (filepath.startsWith('~/') || filepath.startsWith('~\\')) {
    return path.join(os.homedir(), filepath.slice(2));
  }
  if (filepath === '~') {
    return os.homedir();
  }
  return filepath;
}

function parseJsonc(text: string): any {
  let inString = false;
  let inSingle = false;
  let inMulti = false;
  let quote = '';
  let res = '';

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inSingle) {
      if (ch === '\n' || ch === '\r') {
        inSingle = false;
        res += ch;
      }
      continue;
    }

    if (inMulti) {
      if (ch === '*' && next === '/') {
        inMulti = false;
        i++;
      }
      continue;
    }

    if (inString) {
      res += ch;
      if (ch === '\\' && i + 1 < text.length) {
        i++;
        res += text[i];
      } else if (ch === quote) {
        inString = false;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      quote = ch;
      res += ch;
    } else if (ch === '/' && next === '/') {
      inSingle = true;
      i++;
    } else if (ch === '/' && next === '*') {
      inMulti = true;
      i++;
    } else {
      res += ch;
    }
  }

  return JSON.parse(res.replace(/,\s*([}\]])/g, '$1'));
}

function checkCliCommandExists(commandName: string): boolean {
  try {
    const pathEnv = process.env.PATH || '';
    const delimiter = path.delimiter;
    const pathDirs = pathEnv.split(delimiter);
    const extensions = process.platform === 'win32'
      ? (process.env.PATHEXT ? process.env.PATHEXT.split(';') : ['.exe', '.cmd', '.bat', '.ps1'])
      : [''];

    for (const dir of pathDirs) {
      if (!dir) continue;
      if (process.platform === 'win32') {
        for (const ext of extensions) {
          const target = path.join(dir, commandName.toLowerCase().endsWith(ext.toLowerCase()) ? commandName : `${commandName}${ext}`);
          if (fs.existsSync(target)) return true;
        }
      } else {
        const target = path.join(dir, commandName);
        if (fs.existsSync(target)) return true;
      }
    }
  } catch {}
  return false;
}

interface AgentFallbackConfig {
  cliCommands?: string[];
  baseDirs?: string[];
  mcpConfigPaths?: string[];
  skillsDirs?: string[];
  rulesPaths?: string[];
  pluginsDirs?: string[];
}

const AGENT_FALLBACK_PATHS: Record<string, AgentFallbackConfig> = {
  opencode: {
    cliCommands: ['opencode', 'opencode.cmd'],
    baseDirs: ['~/.config/opencode/', '~/.opencode/'],
    mcpConfigPaths: [
      '~/.config/opencode/opencode.jsonc',
      '~/.config/opencode/opencode.json',
      '~/.opencode/opencode.jsonc',
      '~/.opencode/opencode.json',
      '~/.opencode/mcp_config.json',
    ],
    skillsDirs: ['~/.config/opencode/skills', '~/.opencode/skills'],
    rulesPaths: ['~/.config/opencode/rules', '~/.config/opencode/instructions.md', '~/.opencode/rules.md'],
    pluginsDirs: ['~/.config/opencode/plugins', '~/.opencode/plugins'],
  },
  antigravity: {
    cliCommands: ['agy', 'antigravity'],
    baseDirs: ['~/.gemini/config/', '~/.gemini/antigravity-ide/'],
    mcpConfigPaths: ['~/.gemini/config/mcp_config.json'],
    skillsDirs: ['~/.gemini/config/skills'],
    rulesPaths: ['~/.gemini/config/AGENTS.md', '~/.gemini/config/GEMINI.md'],
    pluginsDirs: ['~/.gemini/config/plugins'],
  },
  'claude-code': {
    cliCommands: ['claude'],
    baseDirs: ['~/.claude/'],
    mcpConfigPaths: ['~/.claude/mcp.json', '~/.claude.json'],
    skillsDirs: ['~/.claude/skills'],
    rulesPaths: ['~/.claude/CLAUDE.md'],
    pluginsDirs: ['~/.claude/plugins'],
  },
  cursor: {
    cliCommands: ['cursor'],
    baseDirs: ['~/.cursor/', '~/AppData/Roaming/Cursor'],
    mcpConfigPaths: ['~/.cursor/mcp.json'],
    skillsDirs: ['~/.cursor/skills'],
    rulesPaths: ['~/.cursor/rules'],
    pluginsDirs: ['~/.cursor/extensions'],
  },
  cline: {
    baseDirs: [
      '~/.cline/',
      '~/AppData/Roaming/Code/User/globalStorage/saoudrizwan.claude-dev',
      '~/AppData/Roaming/Code/User/globalStorage/rooveterinaryinc.roo-cline',
    ],
    mcpConfigPaths: [
      '~/.cline/mcp_settings.json',
      '~/AppData/Roaming/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json',
      '~/AppData/Roaming/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/cline_mcp_settings.json',
    ],
    skillsDirs: ['~/.cline/skills'],
    rulesPaths: ['~/.clinerules'],
    pluginsDirs: ['~/.cline/plugins'],
  },
  windsurf: {
    cliCommands: ['windsurf'],
    baseDirs: ['~/.windsurf/', '~/AppData/Roaming/Windsurf', '~/.codeium/windsurf'],
    mcpConfigPaths: ['~/.windsurf/mcp_config.json'],
    skillsDirs: ['~/.windsurf/skills'],
    rulesPaths: ['~/.windsurf/rules'],
    pluginsDirs: ['~/.windsurf/plugins'],
  },
  codex: {
    cliCommands: ['codex'],
    baseDirs: ['~/.codex/'],
    mcpConfigPaths: ['~/.codex/mcp_config.json'],
    skillsDirs: ['~/.codex/skills'],
    rulesPaths: ['~/.codex/instructions.md'],
    pluginsDirs: ['~/.codex/plugins'],
  },
  copilot: {
    cliCommands: ['gh'],
    baseDirs: ['~/.copilot/', '~/.config/github-copilot/'],
    mcpConfigPaths: ['~/.copilot/mcp-config.json'],
    skillsDirs: ['~/.copilot/skills'],
    rulesPaths: ['~/.copilot/instructions.md'],
    pluginsDirs: ['~/.copilot/plugins'],
  },
  aider: {
    cliCommands: ['aider'],
    baseDirs: ['~/.aider/'],
    mcpConfigPaths: ['~/.aider/mcp.json'],
    skillsDirs: ['~/.aider/skills'],
    rulesPaths: ['~/.aider.conf.yml'],
    pluginsDirs: ['~/.aider/plugins'],
  },
  continue: {
    baseDirs: ['~/.continue/'],
    mcpConfigPaths: ['~/.continue/config.json'],
    skillsDirs: ['~/.continue/skills'],
    rulesPaths: ['~/.continue/rules.md'],
    pluginsDirs: ['~/.continue/plugins'],
  },
  pi: {
    cliCommands: ['pi', 'pi-ai'],
    baseDirs: ['~/.pi/'],
    mcpConfigPaths: ['~/.pi/mcp.json'],
    skillsDirs: ['~/.pi/skills'],
    rulesPaths: ['~/.pi/instructions.md', '~/.pi/prompt.md'],
    pluginsDirs: ['~/.pi/plugins'],
  },
  zed: {
    cliCommands: ['zed', 'zedit'],
    baseDirs: ['~/.config/zed/', '~/AppData/Roaming/Zed'],
    mcpConfigPaths: ['~/.config/zed/settings.json'],
    skillsDirs: ['~/.config/zed/skills'],
    rulesPaths: ['~/.config/zed/prompts'],
    pluginsDirs: ['~/.config/zed/extensions'],
  },
};

function resolveFirstExisting(primaryPath: string | undefined, candidates: string[] | undefined): string {
  if (primaryPath) {
    const resolved = resolveHome(primaryPath);
    if (resolved && fs.existsSync(resolved)) {
      return resolved;
    }
  }
  if (Array.isArray(candidates)) {
    for (const cand of candidates) {
      const resolved = resolveHome(cand);
      if (resolved && fs.existsSync(resolved)) {
        return resolved;
      }
    }
  }
  return primaryPath ? resolveHome(primaryPath) : '';
}

function resolveAgentEffectivePaths(agent: any) {
  const fallback = AGENT_FALLBACK_PATHS[agent.id];
  const resolvedBase = resolveFirstExisting(agent.baseDir, fallback?.baseDirs);
  const resolvedSkills = resolveFirstExisting(agent.skillsDir, fallback?.skillsDirs);
  const resolvedMcp = resolveFirstExisting(agent.mcpConfigPath, fallback?.mcpConfigPaths);
  const resolvedRules = resolveFirstExisting(agent.rulesPath, fallback?.rulesPaths);
  const resolvedPlugins = resolveFirstExisting(agent.pluginsDir, fallback?.pluginsDirs);

  let cliDetected = false;
  if (fallback?.cliCommands) {
    for (const cmd of fallback.cliCommands) {
      if (checkCliCommandExists(cmd)) {
        cliDetected = true;
        break;
      }
    }
  }

  return {
    resolvedBase,
    resolvedSkills,
    resolvedMcp,
    resolvedRules,
    resolvedPlugins,
    cliDetected,
  };
}

ipcMain.handle('agents:detectAll', async (_event, agentConfigs: any[]) => {
  const results: Record<string, {
    detected: boolean;
    installedCounts: { skills: number; mcps: number; rules: number };
    resolvedPaths?: {
      baseDir: string;
      skillsDir: string;
      mcpConfigPath: string;
      rulesPath: string;
      pluginsDir: string;
    };
  }> = {};

  if (!Array.isArray(agentConfigs)) {
    return results;
  }

  for (const agent of agentConfigs) {
    const {
      resolvedBase,
      resolvedSkills,
      resolvedMcp,
      resolvedRules,
      resolvedPlugins,
      cliDetected,
    } = resolveAgentEffectivePaths(agent);

    const baseExists = resolvedBase ? fs.existsSync(resolvedBase) : false;
    const skillsExists = resolvedSkills ? fs.existsSync(resolvedSkills) : false;
    const mcpExists = resolvedMcp ? fs.existsSync(resolvedMcp) : false;
    const rulesExists = resolvedRules ? fs.existsSync(resolvedRules) : false;
    const pluginsExists = resolvedPlugins ? fs.existsSync(resolvedPlugins) : false;

    const detected = baseExists || skillsExists || mcpExists || rulesExists || pluginsExists || cliDetected;

    let skillsCount = 0;
    if (skillsExists) {
      try {
        const entries = fs.readdirSync(resolvedSkills, { withFileTypes: true });
        skillsCount = entries.filter((e) => e.isDirectory()).length;
      } catch {}
    }

    let mcpsCount = 0;
    if (mcpExists) {
      try {
        const content = parseJsonc(fs.readFileSync(resolvedMcp, 'utf-8'));
        const mcpServers = content.mcpServers || content.servers || content.mcp?.servers || {};
        const disabledServers = content.disabledMcpServers || content.disabledServers || content.mcp?.disabledServers || {};
        mcpsCount = Object.keys(mcpServers).length + Object.keys(disabledServers).length;
      } catch {}
    }

    let rulesCount = 0;
    if (rulesExists) {
      try {
        if (fs.statSync(resolvedRules).isDirectory()) {
          rulesCount = fs.readdirSync(resolvedRules).length;
        } else {
          rulesCount = 1;
        }
      } catch {
        rulesCount = 1;
      }
    }

    results[agent.id] = {
      detected,
      installedCounts: {
        skills: skillsCount,
        mcps: mcpsCount,
        rules: rulesCount,
      },
      resolvedPaths: {
        baseDir: resolvedBase,
        skillsDir: resolvedSkills,
        mcpConfigPath: resolvedMcp,
        rulesPath: resolvedRules,
        pluginsDir: resolvedPlugins,
      },
    };
  }

  return results;
});

function parseSkillInfo(skillDirPath: string, folderName: string) {
  let name = folderName;
  let description = 'Workflow skill package';
  let hasScripts = false;
  let hasReferences = false;
  let disabled = false;

  try {
    const disabledMarker = path.join(skillDirPath, '.disabled');
    const skillMdPath = path.join(skillDirPath, 'SKILL.md');
    const skillMdDisabledPath = path.join(skillDirPath, 'SKILL.md.disabled');

    let targetMdPath = '';
    if (fs.existsSync(disabledMarker) || fs.existsSync(skillMdDisabledPath)) {
      disabled = true;
      if (fs.existsSync(skillMdDisabledPath)) {
        targetMdPath = skillMdDisabledPath;
      } else if (fs.existsSync(skillMdPath)) {
        targetMdPath = skillMdPath;
      }
    } else if (fs.existsSync(skillMdPath)) {
      targetMdPath = skillMdPath;
    }

    if (targetMdPath && fs.existsSync(targetMdPath)) {
      const content = fs.readFileSync(targetMdPath, 'utf-8');
      const fmMatch = content.match(/^---\s*[\r\n]+([\s\S]*?)[\r\n]+---/);
      if (fmMatch) {
        const fm = fmMatch[1];
        const nameMatch = fm.match(/name:\s*([^\r\n]+)/);
        if (nameMatch) {
          name = nameMatch[1].trim().replace(/^['"]|['"]$/g, '');
        }
        const descMatch = fm.match(/description:\s*(?:>-\s*|\|-\s*)?([\s\S]*?)(?=\n[a-zA-Z0-9_-]+:|$)/);
        if (descMatch) {
          description = descMatch[1].trim().replace(/^['"]|['"]$/g, '').replace(/\s+/g, ' ');
          if (description.length > 220) {
            description = description.slice(0, 217) + '...';
          }
        }
      }
    }
    hasScripts = fs.existsSync(path.join(skillDirPath, 'scripts'));
    hasReferences = fs.existsSync(path.join(skillDirPath, 'references'));
  } catch {}

  return { name, description, hasScripts, hasReferences, disabled };
}

ipcMain.handle('agents:scanCapabilities', async (_event, agentConfigs: any[]) => {
  const allSkills: any[] = [];
  const allMcps: any[] = [];
  const allPlugins: any[] = [];

  if (!Array.isArray(agentConfigs)) {
    return { skills: allSkills, mcpServers: allMcps, plugins: allPlugins };
  }

  for (const agent of agentConfigs) {
    const {
      resolvedSkills,
      resolvedMcp,
      resolvedPlugins,
    } = resolveAgentEffectivePaths(agent);

    // Scan direct skills
    if (resolvedSkills && fs.existsSync(resolvedSkills)) {
      try {
        const entries = fs.readdirSync(resolvedSkills, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const skillPath = path.join(resolvedSkills, entry.name);
            const info = parseSkillInfo(skillPath, entry.name);
            let skillMtime = 0;
            try {
              skillMtime = fs.statSync(skillPath).mtimeMs;
            } catch {}
            allSkills.push({
              id: `${agent.id}-skill-${entry.name}`,
              folderName: entry.name,
              name: info.name,
              description: info.description,
              sourceAgentId: agent.id,
              sourceAgentName: agent.name,
              sourceAgentColor: agent.color || '#3b82f6',
              sourceAgentIcon: agent.iconName || 'Sparkles',
              sourcePath: skillPath,
              hasScripts: info.hasScripts,
              hasReferences: info.hasReferences,
              disabled: Boolean(info.disabled),
              mtimeMs: skillMtime,
            });
          }
        }
      } catch (err) {
        console.warn(`Failed scanning skills for ${agent.name}:`, err);
      }
    }

    // Scan plugins
    if (resolvedPlugins && fs.existsSync(resolvedPlugins)) {
      try {
        const pluginEntries = fs.readdirSync(resolvedPlugins, { withFileTypes: true });
        for (const pluginDir of pluginEntries) {
          if (pluginDir.isDirectory()) {
            const pluginPath = path.join(resolvedPlugins, pluginDir.name);
            let pluginName = pluginDir.name;
            let pluginVersion = '1.0.0';
            let pluginDesc = 'Custom agent extension plugin bundle';
            let pluginAuthor = 'Local';
            let bundledSkillsCount = 0;
            let bundledMcpsCount = 0;
            let bundledRulesCount = 0;

            let isPluginDisabled = false;
            const disabledMarker = path.join(pluginPath, '.disabled');
            const manifestPath = path.join(pluginPath, 'plugin.json');
            const manifestDisabledPath = path.join(pluginPath, 'plugin.json.disabled');

            let targetManifest = '';
            if (fs.existsSync(disabledMarker) || fs.existsSync(manifestDisabledPath)) {
              isPluginDisabled = true;
              if (fs.existsSync(manifestDisabledPath)) {
                targetManifest = manifestDisabledPath;
              } else if (fs.existsSync(manifestPath)) {
                targetManifest = manifestPath;
              }
            } else if (fs.existsSync(manifestPath)) {
              targetManifest = manifestPath;
            }

            if (targetManifest && fs.existsSync(targetManifest)) {
              try {
                const manifest = JSON.parse(fs.readFileSync(targetManifest, 'utf-8'));
                if (manifest.displayName) pluginName = manifest.displayName;
                else if (manifest.name) pluginName = manifest.name;
                if (manifest.version) pluginVersion = manifest.version;
                if (manifest.description) pluginDesc = manifest.description;
                if (manifest.disabled) isPluginDisabled = true;
                if (manifest.author) {
                  pluginAuthor = typeof manifest.author === 'string' ? manifest.author : (manifest.author.name || 'Local');
                }
              } catch {}
            }

            // Plugin skills count
            const pluginSkillsDir = path.join(pluginPath, 'skills');
            if (fs.existsSync(pluginSkillsDir)) {
              try {
                const rootSkillMd = path.join(pluginSkillsDir, 'SKILL.md');
                const rootSkillMdDisabled = path.join(pluginSkillsDir, 'SKILL.md.disabled');
                if (fs.existsSync(rootSkillMd) || fs.existsSync(rootSkillMdDisabled)) {
                  bundledSkillsCount++;
                } else {
                  const pSkillEntries = fs.readdirSync(pluginSkillsDir, { withFileTypes: true });
                  for (const pSkill of pSkillEntries) {
                    if (pSkill.isDirectory() && !pSkill.name.startsWith('.')) {
                      const skillPath = path.join(pluginSkillsDir, pSkill.name);
                      if (fs.existsSync(path.join(skillPath, 'SKILL.md')) || fs.existsSync(path.join(skillPath, 'SKILL.md.disabled'))) {
                        bundledSkillsCount++;
                      }
                    }
                  }
                }
              } catch {}
            }

            // Plugin MCPs count
            const pluginMcpPath = path.join(pluginPath, 'mcp_config.json');
            if (fs.existsSync(pluginMcpPath)) {
              try {
                const mcpContent = JSON.parse(fs.readFileSync(pluginMcpPath, 'utf-8'));
                const servers = mcpContent.mcpServers || mcpContent.servers || {};
                const disabledServers = mcpContent.disabledMcpServers || mcpContent.disabledServers || {};
                bundledMcpsCount += Object.keys(servers).length + Object.keys(disabledServers).length;
              } catch {}
            }

            // Plugin rules
            const pluginRulesDir = path.join(pluginPath, 'rules');
            if (fs.existsSync(pluginRulesDir)) {
              try {
                bundledRulesCount = fs.readdirSync(pluginRulesDir).length;
              } catch {}
            }

            let pluginMtime = 0;
            try {
              pluginMtime = fs.statSync(pluginPath).mtimeMs;
            } catch {}

            allPlugins.push({
              id: `${agent.id}-plugin-${pluginDir.name}`,
              folderName: pluginDir.name,
              name: pluginName,
              version: pluginVersion,
              description: pluginDesc,
              author: pluginAuthor,
              sourceAgentId: agent.id,
              sourceAgentName: agent.name,
              sourceAgentColor: agent.color || '#38bdf8',
              sourceAgentIcon: agent.iconName || 'Boxes',
              sourcePath: pluginPath,
              skillsCount: bundledSkillsCount,
              mcpsCount: bundledMcpsCount,
              rulesCount: bundledRulesCount,
              disabled: isPluginDisabled,
              mtimeMs: pluginMtime,
            });
          }
        }
      } catch (err) {
        console.warn(`Failed scanning plugins for ${agent.name}:`, err);
      }
    }

    // Scan MCP configs
    if (resolvedMcp && fs.existsSync(resolvedMcp)) {
      try {
        let mcpMtime = 0;
        try {
          mcpMtime = fs.statSync(resolvedMcp).mtimeMs;
        } catch {}
        const mcpContent = parseJsonc(fs.readFileSync(resolvedMcp, 'utf-8'));
        const servers = mcpContent.mcpServers || mcpContent.servers || mcpContent.mcp?.servers || {};
        const disabledServers = mcpContent.disabledMcpServers || mcpContent.disabledServers || mcpContent.mcp?.disabledServers || {};

        for (const [sKey, sVal] of Object.entries<any>(servers)) {
          let command = sVal?.command;
          let args = sVal?.args || [];
          if (Array.isArray(sVal?.command)) {
            command = sVal.command[0];
            args = sVal.command.slice(1);
          }
          const url = sVal?.url || sVal?.options?.url;
          const transport = url ? 'sse' : (sVal?.type === 'sse' ? 'sse' : 'stdio');

          allMcps.push({
            id: `${agent.id}-mcp-${sKey}`,
            name: sKey,
            command,
            args,
            url,
            transport,
            env: sVal?.env || {},
            envKeys: Object.keys(sVal?.env || {}),
            sourceAgentId: agent.id,
            sourceAgentName: agent.name,
            sourceAgentColor: agent.color || '#818cf8',
            sourceAgentIcon: agent.iconName || 'Server',
            sourcePath: resolvedMcp,
            disabled: Boolean(sVal?.disabled),
            mtimeMs: mcpMtime,
          });
        }

        for (const [sKey, sVal] of Object.entries<any>(disabledServers)) {
          if (servers[sKey]) continue;
          let command = sVal?.command;
          let args = sVal?.args || [];
          if (Array.isArray(sVal?.command)) {
            command = sVal.command[0];
            args = sVal.command.slice(1);
          }
          const url = sVal?.url || sVal?.options?.url;
          const transport = url ? 'sse' : (sVal?.type === 'sse' ? 'sse' : 'stdio');

          allMcps.push({
            id: `${agent.id}-mcp-${sKey}`,
            name: sKey,
            command,
            args,
            url,
            transport,
            env: sVal?.env || {},
            envKeys: Object.keys(sVal?.env || {}),
            sourceAgentId: agent.id,
            sourceAgentName: agent.name,
            sourceAgentColor: agent.color || '#818cf8',
            sourceAgentIcon: agent.iconName || 'Server',
            sourcePath: resolvedMcp,
            disabled: true,
            mtimeMs: mcpMtime,
          });
        }
      } catch (err) {
        console.warn(`Failed scanning MCP config for ${agent.name}:`, err);
      }
    }
  }

  return {
    skills: allSkills,
    mcpServers: allMcps,
    plugins: allPlugins,
  };
});

// Catalog Provisioning
ipcMain.handle('catalog:installSkill', async (_event, params: {
  skillId: string;
  rawUrl: string;
  targets: Array<{ agentId: string; skillsDir: string }>;
}) => {
  const { skillId, rawUrl, targets } = params;
  if (!skillId || !rawUrl || !Array.isArray(targets) || targets.length === 0) {
    return { success: false, error: 'Invalid install parameters or empty target list' };
  }

  try {
    // Download content with fallback
    let skillContent = '';
    try {
      const response = await fetch(rawUrl, {
        headers: { 'User-Agent': 'AgentForge-Desktop' },
      });
      if (response.ok) {
        skillContent = await response.text();
      }
    } catch (fetchErr) {
      console.warn(`Network fetch failed for ${rawUrl}:`, fetchErr);
    }

    if (!skillContent || !skillContent.trim()) {
      // Check if any target already has an existing valid file before creating stub
      let hasExistingFile = false;
      for (const target of targets) {
        const resolvedSkillsDir = resolveHome(target.skillsDir);
        if (resolvedSkillsDir) {
          const dest = path.join(resolvedSkillsDir, skillId);
          if (fs.existsSync(path.join(dest, 'SKILL.md')) || fs.existsSync(path.join(dest, 'SKILL.md.disabled'))) {
            hasExistingFile = true;
            break;
          }
        }
      }
      if (hasExistingFile) {
        return { success: false, error: 'Could not fetch upstream update; existing local skill retained.' };
      }

      const readableName = skillId
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
      skillContent = `---
name: ${readableName}
description: Specialized instructions and workflows for ${readableName}.
---

# ${readableName}

Comprehensive agent instructions for **${readableName}**.
`;
    }

    const installedAgents: string[] = [];

    // Write targets
    for (const target of targets) {
      const resolvedSkillsDir = resolveHome(target.skillsDir);
      if (!resolvedSkillsDir) continue;

      const destFolder = path.join(resolvedSkillsDir, skillId);
      fs.mkdirSync(destFolder, { recursive: true });
      const targetMd = fs.existsSync(path.join(destFolder, 'SKILL.md.disabled'))
        ? path.join(destFolder, 'SKILL.md.disabled')
        : path.join(destFolder, 'SKILL.md');
      fs.writeFileSync(targetMd, skillContent, 'utf-8');
      installedAgents.push(target.agentId);
    }

    return {
      success: true,
      count: installedAgents.length,
      installedAgents,
    };
  } catch (err: any) {
    console.error(`Error installing skill ${skillId}:`, err);
    return { success: false, error: err.message || 'Unknown installation error' };
  }
});

// Skill Removal
ipcMain.handle('catalog:uninstallSkill', async (_event, params: {
  skillId: string;
  targets: Array<{ agentId: string; skillsDir: string }>;
}) => {
  const { skillId, targets } = params;
  if (!skillId || !Array.isArray(targets) || targets.length === 0) {
    return { success: false, error: 'Invalid uninstall parameters' };
  }

  try {
    let uninstalledCount = 0;
    for (const target of targets) {
      const resolvedSkillsDir = resolveHome(target.skillsDir);
      if (!resolvedSkillsDir) continue;

      const destFolder = path.join(resolvedSkillsDir, skillId);
      if (fs.existsSync(destFolder)) {
        fs.rmSync(destFolder, { recursive: true, force: true });
        uninstalledCount++;
      }
    }
    return { success: true, count: uninstalledCount };
  } catch (err: any) {
    console.error(`Error uninstalling skill ${skillId}:`, err);
    return { success: false, error: err.message || 'Unknown uninstallation error' };
  }
});

// Skill Enable/Disable Toggle
ipcMain.handle('catalog:toggleSkill', async (_event, params: {
  skillId: string;
  enabled: boolean;
  targets: Array<{ agentId: string; skillsDir: string }>;
}) => {
  const { skillId, enabled, targets } = params;
  if (!skillId || !Array.isArray(targets) || targets.length === 0) {
    return { success: false, error: 'Invalid parameters for toggleSkill' };
  }

  let modifiedCount = 0;
  for (const target of targets) {
    const resolvedSkillsDir = resolveHome(target.skillsDir);
    if (!resolvedSkillsDir) continue;

    const skillFolder = path.join(resolvedSkillsDir, skillId);
    if (!fs.existsSync(skillFolder)) continue;

    const skillMd = path.join(skillFolder, 'SKILL.md');
    const skillMdDisabled = path.join(skillFolder, 'SKILL.md.disabled');
    const marker = path.join(skillFolder, '.disabled');

    try {
      if (enabled) {
        if (fs.existsSync(skillMdDisabled) && !fs.existsSync(skillMd)) {
          fs.renameSync(skillMdDisabled, skillMd);
        }
        if (fs.existsSync(marker)) {
          fs.unlinkSync(marker);
        }
        modifiedCount++;
      } else {
        if (fs.existsSync(skillMd) && !fs.existsSync(skillMdDisabled)) {
          fs.renameSync(skillMd, skillMdDisabled);
        }
        if (!fs.existsSync(marker)) {
          fs.writeFileSync(marker, `Disabled by AgentForge at ${new Date().toISOString()}\n`, 'utf-8');
        }
        modifiedCount++;
      }
    } catch (err: any) {
      console.warn(`Failed toggling skill ${skillId} on ${target.agentId}:`, err);
    }
  }

  return { success: true, count: modifiedCount };
});

// Custom Skill Authoring
ipcMain.handle('skills:createCustomSkill', async (_event, params: {
  folderName: string;
  skillContent: string;
  targets: Array<{ agentId: string; skillsDir: string }>;
}) => {
  const { folderName, skillContent, targets } = params;
  if (!folderName || !skillContent || !Array.isArray(targets) || targets.length === 0) {
    return { success: false, error: 'Folder name, content, and at least one target agent are required' };
  }

  // Sanitize folder name
  const sanitizedFolder = folderName.trim().replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
  if (!sanitizedFolder) {
    return { success: false, error: 'Invalid skill folder name' };
  }

  try {
    const installedAgents: string[] = [];
    for (const target of targets) {
      const resolvedSkillsDir = resolveHome(target.skillsDir);
      if (!resolvedSkillsDir) continue;

      const destFolder = path.join(resolvedSkillsDir, sanitizedFolder);
      fs.mkdirSync(destFolder, { recursive: true });
      fs.writeFileSync(path.join(destFolder, 'SKILL.md'), skillContent, 'utf-8');
      installedAgents.push(target.agentId);
    }

    return {
      success: true,
      count: installedAgents.length,
      installedAgents,
    };
  } catch (err: any) {
    console.error(`Error creating custom skill ${sanitizedFolder}:`, err);
    return { success: false, error: err.message || 'Failed to create skill' };
  }
});

// Read Skill Content
ipcMain.handle('skills:readSkill', async (_event, params: {
  skillPath?: string;
  skillsDir?: string;
  skillId?: string;
}) => {
  const { skillPath, skillsDir, skillId } = params;
  let targetPath = '';

  if (skillPath) {
    const resolved = resolveHome(skillPath);
    if (fs.existsSync(resolved)) {
      if (fs.statSync(resolved).isDirectory()) {
        const primary = path.join(resolved, 'SKILL.md');
        const secondary = path.join(resolved, 'SKILL.md.disabled');
        targetPath = fs.existsSync(primary) ? primary : (fs.existsSync(secondary) ? secondary : primary);
      } else {
        targetPath = resolved;
      }
    }
  }

  if ((!targetPath || !fs.existsSync(targetPath)) && skillsDir && skillId) {
    const resolvedDir = resolveHome(skillsDir);
    const candidate = path.join(resolvedDir, skillId, 'SKILL.md');
    const candidateDisabled = path.join(resolvedDir, skillId, 'SKILL.md.disabled');
    if (fs.existsSync(candidate)) {
      targetPath = candidate;
    } else if (fs.existsSync(candidateDisabled)) {
      targetPath = candidateDisabled;
    }
  }

  if (targetPath && fs.existsSync(targetPath)) {
    try {
      const content = fs.readFileSync(targetPath, 'utf-8');
      return { success: true, content, path: targetPath };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed reading skill file' };
    }
  }

  return { success: false, error: 'Skill file not found on disk' };
});

// File content reader for diff inspections
ipcMain.handle('diff:getFileContent', async (_event, filePath: string) => {
  if (!filePath) return { success: false, error: 'Path required' };
  try {
    const resolved = resolveHome(filePath);
    if (!resolved || !fs.existsSync(resolved)) {
      return { success: false, error: 'File not found on disk' };
    }
    const stat = fs.statSync(resolved);
    if (!stat.isFile()) {
      return { success: false, error: 'Path is not a regular file' };
    }
    const content = fs.readFileSync(resolved, 'utf-8');
    return { success: true, content, path: resolved };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed reading file' };
  }
});


// Skill Transfer
ipcMain.handle('skills:transferSkills', async (_event, params: {
  sourceAgentId: string;
  sourceSkillsDir: string;
  targetAgents: Array<{ agentId: string; skillsDir: string }>;
  skillSlugs: string[];
  mode: 'copy' | 'move';
}) => {
  const { sourceSkillsDir, targetAgents, skillSlugs, mode } = params;
  if (!sourceSkillsDir || !Array.isArray(targetAgents) || targetAgents.length === 0 || !Array.isArray(skillSlugs) || skillSlugs.length === 0) {
    return { success: false, error: 'Source directory, target agents, and skill list are required' };
  }

  const resolvedSourceDir = resolveHome(sourceSkillsDir);
  if (!resolvedSourceDir || !fs.existsSync(resolvedSourceDir)) {
    return { success: false, error: 'Source skills directory not found on disk' };
  }

  const transferredSlugs: string[] = [];
  const errors: string[] = [];

  for (const slug of skillSlugs) {
    const cleanSlug = slug.trim().replace(/[^a-zA-Z0-9_-]/g, '-');
    if (!cleanSlug) continue;

    const sourceSkillPath = path.join(resolvedSourceDir, cleanSlug);
    if (!fs.existsSync(sourceSkillPath)) {
      errors.push(`Skill "${cleanSlug}" not found in source directory`);
      continue;
    }

    let copiedToAny = false;
    for (const target of targetAgents) {
      const resolvedTargetSkillsDir = resolveHome(target.skillsDir);
      if (!resolvedTargetSkillsDir) continue;

      // Skip identical directory
      if (path.resolve(resolvedSourceDir) === path.resolve(resolvedTargetSkillsDir)) {
        continue;
      }

      try {
        fs.mkdirSync(resolvedTargetSkillsDir, { recursive: true });
        const destSkillPath = path.join(resolvedTargetSkillsDir, cleanSlug);
        fs.cpSync(sourceSkillPath, destSkillPath, { recursive: true, force: true });
        copiedToAny = true;
      } catch (err: any) {
        errors.push(`Failed copying "${cleanSlug}" to ${target.agentId}: ${err.message}`);
      }
    }

    if (copiedToAny) {
      transferredSlugs.push(cleanSlug);
      if (mode === 'move') {
        try {
          fs.rmSync(sourceSkillPath, { recursive: true, force: true });
        } catch (err: any) {
          errors.push(`Failed removing "${cleanSlug}" from source after move: ${err.message}`);
        }
      }
    }
  }

  return {
    success: transferredSlugs.length > 0,
    count: transferredSlugs.length,
    transferredSlugs,
    errors: errors.length > 0 ? errors : undefined,
  };
});

// MCP Configuration
ipcMain.handle('catalog:installMcp', async (_event, params: {
  serverKey: string;
  serverConfig: any;
  targets: Array<{ agentId: string; mcpConfigPath: string }>;
}) => {
  const { serverKey, serverConfig, targets } = params;
  if (!serverKey || !serverConfig || !Array.isArray(targets) || targets.length === 0) {
    return { success: false, error: 'Invalid MCP install parameters' };
  }

  try {
    let installedCount = 0;
    for (const target of targets) {
      const { resolvedMcp: effectiveMcp } = resolveAgentEffectivePaths({ id: target.agentId, mcpConfigPath: target.mcpConfigPath });
      const resolvedMcp = effectiveMcp || resolveHome(target.mcpConfigPath);
      if (!resolvedMcp) continue;

      fs.mkdirSync(path.dirname(resolvedMcp), { recursive: true });

      let configObj: any = { mcpServers: {} };
      if (fs.existsSync(resolvedMcp)) {
        try {
          configObj = parseJsonc(fs.readFileSync(resolvedMcp, 'utf-8'));
        } catch {
          configObj = { mcpServers: {} };
        }
      }

      // Detect container structure (nested mcp.servers vs flat mcpServers/servers)
      let activeContainer: any;
      let disabledContainer: any;

      if (configObj.mcp && typeof configObj.mcp === 'object') {
        if (!configObj.mcp.servers) configObj.mcp.servers = {};
        if (!configObj.mcp.disabledServers) configObj.mcp.disabledServers = {};
        activeContainer = configObj.mcp.servers;
        disabledContainer = configObj.mcp.disabledServers;
      } else {
        if (!configObj.mcpServers && !configObj.servers) {
          configObj.mcpServers = {};
        }
        activeContainer = configObj.mcpServers !== undefined ? configObj.mcpServers : configObj.servers;
        if (!configObj.disabledMcpServers && !configObj.disabledServers) {
          configObj.disabledMcpServers = {};
        }
        disabledContainer = configObj.disabledMcpServers !== undefined ? configObj.disabledMcpServers : configObj.disabledServers;
      }

      // 1. Find existing config for this serverKey
      let existingConfig: any = activeContainer[serverKey] || disabledContainer[serverKey];

      // 2. Safely merge env variables so user tokens / secrets are NEVER wiped out
      const finalConfig = { ...serverConfig };
      if (existingConfig?.env || serverConfig.env) {
        const mergedEnv: Record<string, string> = { ...(serverConfig.env || {}) };
        if (existingConfig?.env && typeof existingConfig.env === 'object') {
          for (const [k, v] of Object.entries(existingConfig.env)) {
            const newV = mergedEnv[k];
            const isNewValPlaceholder = typeof newV === 'string' && (newV.trim() === '' || newV.startsWith('<') || newV.toLowerCase().includes('your_token') || newV.toLowerCase().includes('your_api_key'));
            if (v !== undefined && v !== null && v !== '' && (isNewValPlaceholder || !newV)) {
              mergedEnv[k] = v as string;
            }
          }
        }
        finalConfig.env = mergedEnv;
      }

      // 3. Preserve Windows command wrapper (npx.cmd, uvx.cmd) if matching
      if (process.platform === 'win32' && existingConfig?.command) {
        const normOld = existingConfig.command.toLowerCase().replace(/\.(cmd|exe|bat)$/i, '').trim();
        const normNew = (serverConfig.command || '').toLowerCase().replace(/\.(cmd|exe|bat)$/i, '').trim();
        if (normOld === normNew) {
          finalConfig.command = existingConfig.command;
        }
      }
      
      // Preserve disabled state if currently disabled
      if (disabledContainer[serverKey]) {
        disabledContainer[serverKey] = finalConfig;
      } else {
        activeContainer[serverKey] = finalConfig;
      }

      fs.writeFileSync(resolvedMcp, JSON.stringify(configObj, null, 2), 'utf-8');
      installedCount++;
    }
    return { success: true, count: installedCount };
  } catch (err: any) {
    console.error(`Error configuring MCP ${serverKey}:`, err);
    return { success: false, error: err.message || 'Unknown MCP error' };
  }
});

ipcMain.handle('catalog:uninstallMcp', async (_event, params: {
  serverKey: string;
  targets: Array<{ agentId: string; mcpConfigPath: string }>;
}) => {
  const { serverKey, targets } = params;
  if (!serverKey || !Array.isArray(targets) || targets.length === 0) {
    return { success: false, error: 'Invalid MCP uninstall parameters' };
  }

  try {
    let uninstalledCount = 0;
    for (const target of targets) {
      const { resolvedMcp: effectiveMcp } = resolveAgentEffectivePaths({ id: target.agentId, mcpConfigPath: target.mcpConfigPath });
      const resolvedMcp = effectiveMcp || resolveHome(target.mcpConfigPath);
      if (!resolvedMcp || !fs.existsSync(resolvedMcp)) continue;

      try {
        const configObj = parseJsonc(fs.readFileSync(resolvedMcp, 'utf-8'));
        let modified = false;
        if (configObj.mcp?.servers && configObj.mcp.servers[serverKey]) {
          delete configObj.mcp.servers[serverKey];
          modified = true;
        }
        if (configObj.mcp?.disabledServers && configObj.mcp.disabledServers[serverKey]) {
          delete configObj.mcp.disabledServers[serverKey];
          modified = true;
        }
        if (configObj.mcpServers && configObj.mcpServers[serverKey]) {
          delete configObj.mcpServers[serverKey];
          modified = true;
        }
        if (configObj.servers && configObj.servers[serverKey]) {
          delete configObj.servers[serverKey];
          modified = true;
        }
        if (configObj.disabledMcpServers && configObj.disabledMcpServers[serverKey]) {
          delete configObj.disabledMcpServers[serverKey];
          modified = true;
        }
        if (configObj.disabledServers && configObj.disabledServers[serverKey]) {
          delete configObj.disabledServers[serverKey];
          modified = true;
        }
        if (modified) {
          fs.writeFileSync(resolvedMcp, JSON.stringify(configObj, null, 2), 'utf-8');
          uninstalledCount++;
        }
      } catch {}
    }
    return { success: true, count: uninstalledCount };
  } catch (err: any) {
    console.error(`Error removing MCP ${serverKey}:`, err);
    return { success: false, error: err.message || 'Unknown MCP error' };
  }
});

// MCP Enable/Disable Toggle
ipcMain.handle('catalog:toggleMcp', async (_event, params: {
  serverKey: string;
  enabled: boolean;
  targets: Array<{ agentId: string; mcpConfigPath: string }>;
}) => {
  const { serverKey, enabled, targets } = params;
  if (!serverKey || !Array.isArray(targets) || targets.length === 0) {
    return { success: false, error: 'Invalid parameters for toggleMcp' };
  }

  let modifiedCount = 0;
  for (const target of targets) {
    const { resolvedMcp: effectiveMcp } = resolveAgentEffectivePaths({ id: target.agentId, mcpConfigPath: target.mcpConfigPath });
    const resolvedMcp = effectiveMcp || resolveHome(target.mcpConfigPath);
    if (!resolvedMcp || !fs.existsSync(resolvedMcp)) continue;

    try {
      const configObj = parseJsonc(fs.readFileSync(resolvedMcp, 'utf-8'));
      let activeContainer: any;
      let disabledContainer: any;

      if (configObj.mcp && typeof configObj.mcp === 'object') {
        if (!configObj.mcp.servers) configObj.mcp.servers = {};
        if (!configObj.mcp.disabledServers) configObj.mcp.disabledServers = {};
        activeContainer = configObj.mcp.servers;
        disabledContainer = configObj.mcp.disabledServers;
      } else {
        if (!configObj.mcpServers && !configObj.servers) {
          configObj.mcpServers = {};
        }
        activeContainer = configObj.mcpServers !== undefined ? configObj.mcpServers : configObj.servers;
        if (!configObj.disabledMcpServers && !configObj.disabledServers) {
          configObj.disabledMcpServers = {};
        }
        disabledContainer = configObj.disabledMcpServers !== undefined ? configObj.disabledMcpServers : configObj.disabledServers;
      }

      if (enabled) {
        // Move from disabledContainer -> activeContainer
        const serverDef = disabledContainer[serverKey] || activeContainer[serverKey];
        if (serverDef) {
          const cleanedDef = { ...serverDef };
          delete cleanedDef.disabled;
          activeContainer[serverKey] = cleanedDef;
          delete disabledContainer[serverKey];
          fs.writeFileSync(resolvedMcp, JSON.stringify(configObj, null, 2), 'utf-8');
          modifiedCount++;
        }
      } else {
        // Move from activeContainer -> disabledContainer
        const serverDef = activeContainer[serverKey];
        if (serverDef) {
          disabledContainer[serverKey] = {
            ...serverDef,
            disabled: true,
          };
          delete activeContainer[serverKey];
          fs.writeFileSync(resolvedMcp, JSON.stringify(configObj, null, 2), 'utf-8');
          modifiedCount++;
        } else if (disabledContainer[serverKey]) {
          modifiedCount++;
        }
      }
    } catch (err: any) {
      console.warn(`Failed toggling MCP ${serverKey} on ${target.agentId}:`, err);
    }
  }

  return { success: true, count: modifiedCount };
});

// Plugin Kit Installation
ipcMain.handle('catalog:installPlugin', async (_event, params: {
  pluginId: string;
  name?: string;
  version?: string;
  description?: string;
  author?: string;
  category?: string;
  tags?: string[];
  bundledSkills?: string[];
  bundledMcps?: string[];
  mcpConfigs?: Record<string, any>;
  skills: Array<{ skillId: string; rawUrl?: string; content?: string }>;
  targets: Array<{ agentId: string; skillsDir?: string; pluginsDir?: string; mcpConfigPath?: string }>;
}) => {
  const { pluginId, name, version, description, author, category, tags, skills, targets } = params;
  if (!Array.isArray(targets) || targets.length === 0) {
    return { success: false, error: 'Target agent(s) required' };
  }

  const cleanPluginId = (pluginId || 'custom-plugin').trim().replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
  const pluginDisplayName = name || cleanPluginId;

  try {
    // 1. Gather all skill IDs needed
    const allSkillIds = new Set<string>();
    if (Array.isArray(skills)) {
      for (const s of skills) {
        if (s?.skillId) allSkillIds.add(s.skillId.trim());
      }
    }
    if (Array.isArray(params.bundledSkills)) {
      for (const bs of params.bundledSkills) {
        if (bs) allSkillIds.add(bs.trim());
      }
    }

    // 2. Resolve skill contents
    const skillContents = new Map<string, string>();

    // Pre-populate any explicit content provided in skills array
    if (Array.isArray(skills)) {
      for (const item of skills) {
        if (item.content && item.content.trim()) {
          skillContents.set(item.skillId.trim(), item.content);
        }
      }
    }

    // Download any missing skills with rawUrl
    if (Array.isArray(skills)) {
      for (const item of skills) {
        const sId = item?.skillId ? item.skillId.trim() : '';
        if (sId && !skillContents.has(sId) && item.rawUrl) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 6000);
            const res = await fetch(item.rawUrl, {
              headers: { 'User-Agent': 'AgentForge-Desktop' },
              signal: controller.signal,
            });
            clearTimeout(timeoutId);
            if (res.ok) {
              const text = await res.text();
              if (text && text.trim()) {
                skillContents.set(sId, text);
              }
            }
          } catch (err) {
            console.warn(`Failed fetching skill ${sId} from network:`, err);
          }
        }
      }
    }

    // For any remaining skill IDs, check local disks or generate standard template
    for (const sId of allSkillIds) {
      if (!skillContents.has(sId)) {
        let foundLocal = false;
        // Search in local targets
        for (const target of targets) {
          if (target.skillsDir) {
            const cPath = path.join(resolveHome(target.skillsDir), sId, 'SKILL.md');
            if (fs.existsSync(cPath)) {
              try {
                skillContents.set(sId, fs.readFileSync(cPath, 'utf-8'));
                foundLocal = true;
                break;
              } catch {}
            }
          }
          if (target.pluginsDir) {
            const rPlugins = resolveHome(target.pluginsDir);
            if (rPlugins && fs.existsSync(rPlugins)) {
              try {
                const subdirs = fs.readdirSync(rPlugins, { withFileTypes: true });
                for (const sub of subdirs) {
                  if (sub.isDirectory()) {
                    const cPath = path.join(rPlugins, sub.name, 'skills', sId, 'SKILL.md');
                    if (fs.existsSync(cPath)) {
                      skillContents.set(sId, fs.readFileSync(cPath, 'utf-8'));
                      foundLocal = true;
                      break;
                    }
                  }
                }
                if (foundLocal) break;
              } catch {}
            }
          }
        }

        // If still not found, generate clean SKILL.md
        if (!foundLocal) {
          const readableName = sId
            .split('-')
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
          const fallbackContent = `---
name: ${readableName}
description: Bundled skill for ${pluginDisplayName}
---

# ${readableName}

This skill is part of the **${pluginDisplayName}** plugin bundle.
`;
          skillContents.set(sId, fallbackContent);
        }
      }
    }

    // 3. Prepare MCP config map
    const mcpServersMap: Record<string, any> = { ...(params.mcpConfigs || {}) };
    if (Array.isArray(params.bundledMcps)) {
      for (const mId of params.bundledMcps) {
        if (!mcpServersMap[mId]) {
          if (mId === 'postgres') {
            mcpServersMap['postgres'] = {
              command: 'npx',
              args: ['-y', '@modelcontextprotocol/server-postgres', 'postgresql://localhost/mydb'],
            };
          } else if (mId === 'filesystem') {
            mcpServersMap['filesystem'] = {
              command: 'npx',
              args: ['-y', '@modelcontextprotocol/server-filesystem', './'],
            };
          } else if (mId === 'desktop-commander') {
            mcpServersMap['desktop-commander'] = {
              command: 'npx',
              args: ['-y', '@wonderwhy-er/desktop-commander@latest'],
            };
          } else if (mId === 'docker') {
            mcpServersMap['docker'] = {
              command: 'npx',
              args: ['-y', 'mcp-server-docker'],
            };
          } else if (mId === 'puppeteer') {
            mcpServersMap['puppeteer'] = {
              command: 'npx',
              args: ['-y', '@modelcontextprotocol/server-puppeteer'],
            };
          } else if (mId === 'rea') {
            mcpServersMap['rea'] = {
              command: 'npx',
              args: ['-y', 'rea-agents@latest', 'mcp'],
            };
          } else if (mId === 'context7') {
            mcpServersMap['context7'] = {
              command: 'npx',
              args: ['-y', '@upstash/context7-mcp'],
            };
          } else if (mId === 'supabase') {
            mcpServersMap['supabase'] = {
              command: 'npx',
              args: ['-y', '@supabase/mcp-server-supabase@latest'],
            };
          } else if (mId === 'linear') {
            mcpServersMap['linear'] = {
              command: 'npx',
              args: ['-y', '@modelcontextprotocol/server-linear'],
            };
          } else if (mId === 'playwright') {
            mcpServersMap['playwright'] = {
              command: 'npx',
              args: ['-y', '@modelcontextprotocol/server-puppeteer'],
            };
          } else if (mId === 'figma') {
            mcpServersMap['figma'] = {
              command: 'npx',
              args: ['-y', 'figma-developer-mcp'],
            };
          } else {
            mcpServersMap[mId] = {
              command: 'npx',
              args: ['-y', mId],
            };
          }
        }
      }
    }

    // 4. Install plugin into each target
    const installedAgents: string[] = [];
    let writeCount = 0;

    for (const target of targets) {
      let resolvedPluginsDir = target.pluginsDir ? resolveHome(target.pluginsDir) : '';
      if (!resolvedPluginsDir && target.skillsDir) {
        resolvedPluginsDir = path.join(resolveHome(target.skillsDir), '..', 'plugins');
      }
      if (!resolvedPluginsDir) continue;

      fs.mkdirSync(resolvedPluginsDir, { recursive: true });
      const pluginDest = path.join(resolvedPluginsDir, cleanPluginId);

      if (fs.existsSync(pluginDest)) {
        try {
          const existingManifestPath = path.join(pluginDest, 'plugin.json');
          if (fs.existsSync(existingManifestPath)) {
            const existingManifest = JSON.parse(fs.readFileSync(existingManifestPath, 'utf-8'));
            const existingVer = existingManifest.version;
            const incomingVer = version || '1.0.0';
            const exParts = String(existingVer || '').replace(/^v/i, '').split('.').map((p) => parseInt(p, 10));
            const inParts = String(incomingVer || '').replace(/^v/i, '').split('.').map((p) => parseInt(p, 10));
            if (!isNaN(exParts[0]) && !isNaN(inParts[0])) {
              const isDowngrade = inParts[0] < exParts[0] || 
                (inParts[0] === exParts[0] && (inParts[1] || 0) < (exParts[1] || 0)) ||
                (inParts[0] === exParts[0] && (inParts[1] || 0) === (exParts[1] || 0) && (inParts[2] || 0) < (exParts[2] || 0));
              if (isDowngrade) {
                console.warn(`Prevented downgrade of ${cleanPluginId} from v${existingVer} to v${incomingVer}`);
                continue;
              }
            }
          }
        } catch (e) {
          console.warn('Error checking existing plugin version:', e);
        }
        fs.rmSync(pluginDest, { recursive: true, force: true });
      }
      fs.mkdirSync(pluginDest, { recursive: true });

      // Author plugin.json
      const pluginManifest = {
        name: cleanPluginId,
        displayName: pluginDisplayName,
        version: version || '1.0.0',
        description: description || '',
        author: author || 'AgentForge Catalog',
        category: category || 'General',
        tags: tags || [],
        skills: Array.from(skillContents.keys()),
        ...(Object.keys(mcpServersMap).length > 0 ? { mcpServers: mcpServersMap } : {}),
      };

      const isPluginDisabled = fs.existsSync(path.join(pluginDest, '.disabled')) || fs.existsSync(path.join(pluginDest, 'plugin.json.disabled'));
      const manifestFile = isPluginDisabled ? 'plugin.json.disabled' : 'plugin.json';
      fs.writeFileSync(
        path.join(pluginDest, manifestFile),
        JSON.stringify(pluginManifest, null, 2),
        'utf-8'
      );

      // Write bundled skills
      const pluginSkillsDir = path.join(pluginDest, 'skills');
      fs.mkdirSync(pluginSkillsDir, { recursive: true });

      for (const [sId, sContent] of skillContents.entries()) {
        const cleanFolder = sId.replace(/[^a-zA-Z0-9_-]/g, '-');
        const skillFolder = path.join(pluginSkillsDir, cleanFolder);
        fs.mkdirSync(skillFolder, { recursive: true });
        fs.writeFileSync(path.join(skillFolder, 'SKILL.md'), sContent, 'utf-8');
        writeCount++;
      }

      // Write mcp_config.json if MCPs present
      if (Object.keys(mcpServersMap).length > 0) {
        fs.writeFileSync(
          path.join(pluginDest, 'mcp_config.json'),
          JSON.stringify({ mcpServers: mcpServersMap }, null, 2),
          'utf-8'
        );

        // Also merge into agent's main MCP config if available
        if (target.mcpConfigPath) {
          const resolvedMcp = resolveHome(target.mcpConfigPath);
          if (resolvedMcp) {
            try {
              fs.mkdirSync(path.dirname(resolvedMcp), { recursive: true });
              let agentMcpConfig: any = { mcpServers: {} };
              if (fs.existsSync(resolvedMcp)) {
                try {
                  agentMcpConfig = JSON.parse(fs.readFileSync(resolvedMcp, 'utf-8'));
                } catch {
                  agentMcpConfig = { mcpServers: {} };
                }
              }
              const key = agentMcpConfig.mcpServers !== undefined ? 'mcpServers' : 'servers';
              if (!agentMcpConfig[key]) agentMcpConfig[key] = {};
              for (const [sKey, sVal] of Object.entries(mcpServersMap)) {
                agentMcpConfig[key][sKey] = sVal;
              }
              fs.writeFileSync(resolvedMcp, JSON.stringify(agentMcpConfig, null, 2), 'utf-8');
            } catch (err) {
              console.warn(`Failed merging MCP configs for ${target.agentId}:`, err);
            }
          }
        }
      }

      installedAgents.push(target.agentId);
    }

    return {
      success: installedAgents.length > 0,
      count: writeCount,
      installedAgents,
    };
  } catch (err: any) {
    console.error('Error in catalog:installPlugin:', err);
    return { success: false, error: err.message || 'Failed installing plugin bundle' };
  }
});

// Plugin Kit Uninstallation
ipcMain.handle('catalog:uninstallPlugin', async (_event, params: {
  pluginId: string;
  folderName?: string;
  targets: Array<{
    agentId: string;
    pluginsDir?: string;
  }>;
}) => {
  const { pluginId, folderName, targets } = params;
  if (!Array.isArray(targets) || targets.length === 0) {
    return { success: false, error: 'Targets required' };
  }

  const cleanFolder = (folderName || pluginId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
  if (!cleanFolder) {
    return { success: false, error: 'Plugin folder name required' };
  }

  let uninstalledCount = 0;
  const uninstalledAgents: string[] = [];

  for (const target of targets) {
    if (!target.pluginsDir) continue;
    const resolvedPlugins = resolveHome(target.pluginsDir);
    if (!resolvedPlugins || !fs.existsSync(resolvedPlugins)) continue;

    let foundDir = path.join(resolvedPlugins, cleanFolder);
    if (!fs.existsSync(foundDir)) {
      try {
        const dirs = fs.readdirSync(resolvedPlugins, { withFileTypes: true });
        for (const d of dirs) {
          if (d.isDirectory()) {
            const mPath = path.join(resolvedPlugins, d.name, 'plugin.json');
            if (fs.existsSync(mPath)) {
              try {
                const manifest = JSON.parse(fs.readFileSync(mPath, 'utf-8'));
                if (
                  manifest.name?.toLowerCase() === cleanFolder ||
                  manifest.displayName?.toLowerCase() === cleanFolder
                ) {
                  foundDir = path.join(resolvedPlugins, d.name);
                  break;
                }
              } catch {}
            }
          }
        }
      } catch {}
    }

    if (fs.existsSync(foundDir)) {
      try {
        fs.rmSync(foundDir, { recursive: true, force: true });
        uninstalledCount++;
        uninstalledAgents.push(target.agentId);
      } catch (err: any) {
        console.warn(`Failed removing plugin ${cleanFolder} from ${target.agentId}:`, err);
      }
    }
  }

  return {
    success: uninstalledCount > 0,
    count: uninstalledCount,
    installedAgents: uninstalledAgents,
  };
});

// Plugin Enable/Disable Toggle
ipcMain.handle('catalog:togglePlugin', async (_event, params: {
  pluginId: string;
  folderName?: string;
  enabled: boolean;
  targets: Array<{ agentId: string; pluginsDir?: string }>;
}) => {
  const { pluginId, folderName, enabled, targets } = params;
  if (!Array.isArray(targets) || targets.length === 0) {
    return { success: false, error: 'Targets required' };
  }

  const cleanFolder = (folderName || pluginId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
  let modifiedCount = 0;

  for (const target of targets) {
    if (!target.pluginsDir) continue;
    const resolvedPlugins = resolveHome(target.pluginsDir);
    if (!resolvedPlugins || !fs.existsSync(resolvedPlugins)) continue;

    let foundDir = path.join(resolvedPlugins, cleanFolder);
    if (!fs.existsSync(foundDir)) {
      try {
        const dirs = fs.readdirSync(resolvedPlugins, { withFileTypes: true });
        for (const d of dirs) {
          if (d.isDirectory()) {
            const mPath = path.join(resolvedPlugins, d.name, 'plugin.json');
            const mDisPath = path.join(resolvedPlugins, d.name, 'plugin.json.disabled');
            const checkFile = fs.existsSync(mPath) ? mPath : (fs.existsSync(mDisPath) ? mDisPath : '');
            if (checkFile) {
              try {
                const manifest = JSON.parse(fs.readFileSync(checkFile, 'utf-8'));
                if (
                  manifest.name?.toLowerCase() === cleanFolder ||
                  manifest.displayName?.toLowerCase() === cleanFolder
                ) {
                  foundDir = path.join(resolvedPlugins, d.name);
                  break;
                }
              } catch {}
            }
          }
        }
      } catch {}
    }

    if (fs.existsSync(foundDir)) {
      const pJson = path.join(foundDir, 'plugin.json');
      const pJsonDisabled = path.join(foundDir, 'plugin.json.disabled');
      const marker = path.join(foundDir, '.disabled');

      try {
        if (enabled) {
          if (fs.existsSync(pJsonDisabled) && !fs.existsSync(pJson)) {
            fs.renameSync(pJsonDisabled, pJson);
          }
          if (fs.existsSync(marker)) {
            fs.unlinkSync(marker);
          }
          if (fs.existsSync(pJson)) {
            try {
              const manifest = JSON.parse(fs.readFileSync(pJson, 'utf-8'));
              if (manifest.disabled) {
                delete manifest.disabled;
                fs.writeFileSync(pJson, JSON.stringify(manifest, null, 2), 'utf-8');
              }
            } catch {}
          }
          modifiedCount++;
        } else {
          if (fs.existsSync(pJson) && !fs.existsSync(pJsonDisabled)) {
            fs.renameSync(pJson, pJsonDisabled);
          }
          if (!fs.existsSync(marker)) {
            fs.writeFileSync(marker, `Disabled by AgentForge at ${new Date().toISOString()}\n`, 'utf-8');
          }
          modifiedCount++;
        }
      } catch (err: any) {
        console.warn(`Failed toggling plugin ${cleanFolder} on ${target.agentId}:`, err);
      }
    }
  }

  return { success: true, count: modifiedCount };
});

// Rules
ipcMain.handle('rules:read', async (_event, targetPath: string) => {
  if (!targetPath) {
    return { content: '', path: '', exists: false };
  }
  const resolved = resolveHome(targetPath);
  try {
    if (fs.existsSync(resolved)) {
      const stat = fs.statSync(resolved);
      if (stat.isFile()) {
        const content = fs.readFileSync(resolved, 'utf-8');
        return { content, path: resolved, exists: true };
      } else if (stat.isDirectory()) {
        const files = fs.readdirSync(resolved).filter((f) => f.endsWith('.md') || f.endsWith('.mdc'));
        let combined = '';
        for (const file of files) {
          combined += `\n# Rule: ${file}\n` + fs.readFileSync(path.join(resolved, file), 'utf-8') + '\n';
        }
        return { content: combined.trim(), path: resolved, exists: true };
      }
    }
  } catch (err) {
    console.warn(`Failed to read rules from ${resolved}:`, err);
  }
  return { content: '', path: resolved, exists: false };
});

ipcMain.handle('rules:save', async (_event, params: {
  targets: Array<{ agentId: string; rulesPath: string }>;
  content: string;
  syncGeminiMd?: boolean;
}) => {
  const { targets, content, syncGeminiMd } = params;
  if (!Array.isArray(targets) || targets.length === 0) {
    return { success: false, error: 'At least one target agent is required' };
  }

  try {
    let writeCount = 0;
    const installedAgents: string[] = [];

    for (const target of targets) {
      const resolved = resolveHome(target.rulesPath);
      if (!resolved) continue;

      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      fs.writeFileSync(resolved, content, 'utf-8');
      writeCount++;
      installedAgents.push(target.agentId);

      // Antigravity sync
      if (target.agentId === 'antigravity' || syncGeminiMd) {
        const dir = path.dirname(resolved);
        const altFile = resolved.endsWith('AGENTS.md')
          ? path.join(dir, 'GEMINI.md')
          : path.join(dir, 'AGENTS.md');
        try {
          fs.writeFileSync(altFile, content, 'utf-8');
        } catch {}
      }
    }

    return { success: true, count: writeCount, installedAgents };
  } catch (err: any) {
    console.error('Error saving agent rules:', err);
    return { success: false, error: err.message || 'Failed saving agent rules' };
  }
});

// Read agent rules
ipcMain.handle('rules:readAgentRules', async (_event, agentConfigs: Array<{ id: string; rulesPath: string }>) => {
  const results: Record<string, { content: string; path: string; exists: boolean }> = {};
  if (!Array.isArray(agentConfigs)) return results;

  for (const agent of agentConfigs) {
    const resolved = resolveHome(agent.rulesPath);
    if (!resolved) {
      results[agent.id] = { content: '', path: '', exists: false };
      continue;
    }

    try {
      if (fs.existsSync(resolved)) {
        const stat = fs.statSync(resolved);
        if (stat.isFile()) {
          const content = fs.readFileSync(resolved, 'utf-8');
          results[agent.id] = { content, path: resolved, exists: true };
          continue;
        } else if (stat.isDirectory()) {
          const files = fs.readdirSync(resolved).filter((f) => f.endsWith('.md') || f.endsWith('.mdc'));
          let combined = '';
          for (const file of files) {
            combined += `\n# Rule: ${file}\n` + fs.readFileSync(path.join(resolved, file), 'utf-8') + '\n';
          }
          results[agent.id] = { content: combined.trim(), path: resolved, exists: true };
          continue;
        }
      }
      // Fallback GEMINI.md
      if (agent.id === 'antigravity') {
        const alt = path.join(path.dirname(resolved), 'GEMINI.md');
        if (fs.existsSync(alt)) {
          const content = fs.readFileSync(alt, 'utf-8');
          results[agent.id] = { content, path: alt, exists: true };
          continue;
        }
      }
    } catch {}

    results[agent.id] = { content: '', path: resolved, exists: false };
  }

  return results;
});

// Dialogs
ipcMain.handle('dialog:showSaveDialog', async (_event, options: { defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }) => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  if (!win) return { canceled: true };
  return await dialog.showSaveDialog(win, options);
});

ipcMain.handle('dialog:showOpenDirectory', async (_event, options?: { defaultPath?: string }) => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  if (!win) return { canceled: true, filePaths: [] };
  return await dialog.showOpenDialog(win, {
    properties: ['openDirectory', 'createDirectory'],
    ...options,
  });
});

// Export plugin ZIP
ipcMain.handle('plugin:exportInstalledPluginZip', async (_event, params: { pluginPath: string; defaultZipName: string }) => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  if (!win) return { success: false, error: 'No active window' };

  const saveRes = await dialog.showSaveDialog(win, {
    defaultPath: params.defaultZipName || 'plugin-bundle.zip',
    filters: [{ name: 'ZIP Archive', extensions: ['zip'] }]
  });

  if (saveRes.canceled || !saveRes.filePath) {
    return { success: false, canceled: true };
  }

  try {
    const resolved = resolveHome(params.pluginPath);
    if (!resolved || !fs.existsSync(resolved)) {
      return { success: false, error: 'Plugin directory not found on disk' };
    }

    const zip = new AdmZip();
    zip.addLocalFolder(resolved);
    zip.writeZip(saveRes.filePath);
    return { success: true, exportPath: saveRes.filePath };
  } catch (err: any) {
    console.error('Error exporting installed plugin zip:', err);
    return { success: false, error: err.message || 'Failed to export zip' };
  }
});

// Load installed plugin details for editing
ipcMain.handle('plugin:loadPluginDetails', async (_event, pluginPath: string) => {
  const resolvedPath = resolveHome(pluginPath);
  if (!resolvedPath || !fs.existsSync(resolvedPath)) {
    return { success: false, error: 'Plugin path not found on disk' };
  }

  try {
    const folderName = path.basename(resolvedPath);
    let manifest: any = {
      name: folderName,
      displayName: folderName,
      version: '1.0.0',
      description: '',
      author: 'Local',
      category: 'Development',
      tags: [],
      skills: [],
      mcpServers: {},
      rules: [],
    };

    const manifestFile = path.join(resolvedPath, 'plugin.json');
    const manifestDisabledFile = path.join(resolvedPath, 'plugin.json.disabled');
    const targetManifestFile = fs.existsSync(manifestFile) ? manifestFile : (fs.existsSync(manifestDisabledFile) ? manifestDisabledFile : null);
    if (targetManifestFile) {
      try {
        const parsed = JSON.parse(fs.readFileSync(targetManifestFile, 'utf-8'));
        manifest = { ...manifest, ...parsed };
      } catch (e) {
        console.warn('Failed to parse plugin.json:', e);
      }
    }

    // Inspect skills/
    const skillsList: Array<{ folderName: string; name: string; description: string; sourcePath: string }> = [];
    const skillsDir = path.join(resolvedPath, 'skills');
    if (fs.existsSync(skillsDir)) {
      try {
        const rootSkillMd = path.join(skillsDir, 'SKILL.md');
        const rootSkillMdDisabled = path.join(skillsDir, 'SKILL.md.disabled');
        if (fs.existsSync(rootSkillMd) || fs.existsSync(rootSkillMdDisabled)) {
          skillsList.push({
            folderName: folderName,
            name: manifest.displayName || folderName,
            description: manifest.description || '',
            sourcePath: skillsDir,
          });
        } else {
          const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
          for (const ent of entries) {
            if (ent.isDirectory() && !ent.name.startsWith('.')) {
              const skillDir = path.join(skillsDir, ent.name);
              let sDesc = '';
              let sName = ent.name;
              const sFile = path.join(skillDir, 'SKILL.md');
              const sFileDisabled = path.join(skillDir, 'SKILL.md.disabled');
              const targetSkillFile = fs.existsSync(sFile) ? sFile : (fs.existsSync(sFileDisabled) ? sFileDisabled : null);
              if (targetSkillFile) {
                try {
                  const content = fs.readFileSync(targetSkillFile, 'utf-8').slice(0, 500);
                  const titleMatch = content.match(/^#+\s*(.+)$/m);
                  if (titleMatch) sName = titleMatch[1].trim();
                  const descMatch = content.match(/(?:^|\n)(?:description:\s*([^\n]+)|([A-Z][^\n]+))/i);
                  if (descMatch) sDesc = (descMatch[1] || descMatch[2] || '').trim();
                } catch {}
              }
              skillsList.push({
                folderName: ent.name,
                name: sName,
                description: sDesc,
                sourcePath: skillDir,
              });
            }
          }
        }
      } catch (err) {
        console.warn('Failed inspecting plugin skills:', err);
      }
    }

    // Inspect MCPs
    const mcpServersList: Array<{ name: string; command?: string; args?: string[]; env?: Record<string, string>; url?: string; transport?: 'stdio' | 'sse' }> = [];
    const mcpConfigFile = path.join(resolvedPath, 'mcp_config.json');
    let mcpServersObj = manifest.mcpServers || {};
    if (fs.existsSync(mcpConfigFile)) {
      try {
        const mcpJson = JSON.parse(fs.readFileSync(mcpConfigFile, 'utf-8'));
        mcpServersObj = { ...mcpServersObj, ...(mcpJson.mcpServers || mcpJson.servers || {}) };
      } catch {}
    }
    for (const [key, val] of Object.entries<any>(mcpServersObj)) {
      if (val && typeof val === 'object') {
        mcpServersList.push({
          name: key,
          command: val.command,
          args: val.args,
          env: val.env,
          url: val.url,
          transport: val.transport || (val.url ? 'sse' : 'stdio'),
        });
      }
    }

    // Inspect rules/
    const rulesList: Array<{ filename: string; title: string; content: string }> = [];
    const rulesDir = path.join(resolvedPath, 'rules');
    if (fs.existsSync(rulesDir)) {
      try {
        const ruleFiles = fs.readdirSync(rulesDir);
        for (const rf of ruleFiles) {
          if (rf.endsWith('.md') || rf.endsWith('.txt')) {
            const rulePath = path.join(rulesDir, rf);
            const content = fs.readFileSync(rulePath, 'utf-8');
            let title = rf.replace(/\.md$/i, '');
            const titleMatch = content.match(/^#+\s*(.+)$/m);
            if (titleMatch) title = titleMatch[1].trim();
            rulesList.push({
              filename: rf,
              title,
              content,
            });
          }
        }
      } catch {}
    }

    return {
      success: true,
      folderName,
      pluginPath: resolvedPath,
      manifest,
      skills: skillsList,
      mcpServers: mcpServersList,
      rules: rulesList,
    };
  } catch (err: any) {
    console.error('Failed to load plugin details:', err);
    return { success: false, error: err.message || 'Failed to read plugin directory' };
  }
});

// Forge Plugin Bundle
ipcMain.handle('plugin:forgeBundle', async (_event, params: {
  folderName: string;
  manifest: {
    name: string;
    displayName: string;
    version: string;
    description: string;
    author: string;
    category?: string;
    tags?: string[];
    skills?: string[];
    mcpServers?: Record<string, any>;
    rules?: string[];
  };
  selectedSkills: Array<{
    folderName: string;
    sourcePath: string;
  }>;
  selectedMcps: Array<{
    name: string;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
    transport?: 'stdio' | 'sse';
  }>;
  selectedRules: Array<{
    filename: string;
    title?: string;
    content: string;
  }>;
  targetAction: 'install' | 'export-zip' | 'export-dir';
  targetAgents?: Array<{ agentId: string; pluginsDir: string; name?: string }>;
  exportDestinationPath?: string;
}) => {
  const { folderName, manifest, selectedSkills, selectedMcps, selectedRules, targetAction, targetAgents, exportDestinationPath } = params;
  const cleanFolderName = folderName.trim().replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();

  if (!cleanFolderName) {
    return { success: false, error: 'Valid folder name is required' };
  }

  // Staging directory
  const stagingRoot = path.join(os.tmpdir(), `agentforge-bundle-${Date.now()}`);
  const bundleDir = path.join(stagingRoot, cleanFolderName);

  try {
    fs.mkdirSync(bundleDir, { recursive: true });

    // Write plugin.json
    const finalManifest = {
      name: cleanFolderName,
      displayName: manifest.displayName || cleanFolderName,
      version: manifest.version || '1.0.0',
      description: manifest.description || '',
      author: manifest.author || 'Local',
      category: manifest.category || 'Development',
      tags: manifest.tags || [],
      skills: selectedSkills.map((s) => s.folderName),
      rules: selectedRules.map((r) => r.filename.endsWith('.md') ? r.filename : `${r.filename}.md`),
      ...(manifest.mcpServers ? { mcpServers: manifest.mcpServers } : {}),
    };

    fs.writeFileSync(path.join(bundleDir, 'plugin.json'), JSON.stringify(finalManifest, null, 2), 'utf-8');

    // Bundle skills
    if (selectedSkills && selectedSkills.length > 0) {
      const skillsDir = path.join(bundleDir, 'skills');
      fs.mkdirSync(skillsDir, { recursive: true });

      for (const skill of selectedSkills) {
        const cleanSkillFolder = skill.folderName.trim().replace(/[^a-zA-Z0-9_-]/g, '-');
        if (!cleanSkillFolder) continue;

        const resolvedSource = resolveHome(skill.sourcePath);
        const destSkillDir = path.join(skillsDir, cleanSkillFolder);

        if (resolvedSource && fs.existsSync(resolvedSource)) {
          const stat = fs.statSync(resolvedSource);
          if (stat.isDirectory()) {
            fs.mkdirSync(destSkillDir, { recursive: true });
            fs.cpSync(resolvedSource, destSkillDir, { recursive: true, force: true });
          } else if (stat.isFile()) {
            fs.mkdirSync(destSkillDir, { recursive: true });
            fs.copyFileSync(resolvedSource, path.join(destSkillDir, 'SKILL.md'));
          }
        }
      }
    }

    // Bundle MCP servers
    if (selectedMcps && selectedMcps.length > 0) {
      const serversObj: Record<string, any> = {};
      for (const mcp of selectedMcps) {
        serversObj[mcp.name] = {
          ...(mcp.command ? { command: mcp.command } : {}),
          ...(mcp.args && mcp.args.length > 0 ? { args: mcp.args } : {}),
          ...(mcp.env && Object.keys(mcp.env).length > 0 ? { env: mcp.env } : {}),
          ...(mcp.url ? { url: mcp.url } : {}),
          ...(mcp.transport ? { transport: mcp.transport } : {}),
        };
      }
      fs.writeFileSync(
        path.join(bundleDir, 'mcp_config.json'),
        JSON.stringify({ mcpServers: serversObj }, null, 2),
        'utf-8'
      );
    }

    // Bundle rules
    if (selectedRules && selectedRules.length > 0) {
      const rulesDir = path.join(bundleDir, 'rules');
      fs.mkdirSync(rulesDir, { recursive: true });

      for (const rule of selectedRules) {
        const cleanRuleName = rule.filename.trim().replace(/[^a-zA-Z0-9._-]/g, '-');
        const filename = cleanRuleName.endsWith('.md') ? cleanRuleName : `${cleanRuleName}.md`;
        fs.writeFileSync(path.join(rulesDir, filename), rule.content, 'utf-8');
      }
    }

    // Target action
    if (targetAction === 'install') {
      if (!Array.isArray(targetAgents) || targetAgents.length === 0) {
        return { success: false, error: 'At least one target agent is required for installation' };
      }

      let writeCount = 0;
      const installedAgents: string[] = [];

      for (const agent of targetAgents) {
        const resolvedPluginsDir = resolveHome(agent.pluginsDir);
        if (!resolvedPluginsDir) continue;

        fs.mkdirSync(resolvedPluginsDir, { recursive: true });
        const agentPluginDest = path.join(resolvedPluginsDir, cleanFolderName);
        if (fs.existsSync(agentPluginDest)) {
          fs.rmSync(agentPluginDest, { recursive: true, force: true });
        }
        fs.mkdirSync(agentPluginDest, { recursive: true });
        fs.cpSync(bundleDir, agentPluginDest, { recursive: true, force: true });
        writeCount++;
        installedAgents.push(agent.agentId);
      }

      return { success: true, count: writeCount, installedAgents };
    } else if (targetAction === 'export-zip') {
      if (!exportDestinationPath) {
        return { success: false, error: 'Destination path for zip file is required' };
      }

      const resolvedDest = resolveHome(exportDestinationPath);
      fs.mkdirSync(path.dirname(resolvedDest), { recursive: true });

      const zip = new AdmZip();
      zip.addLocalFolder(bundleDir);
      zip.writeZip(resolvedDest);

      return { success: true, exportPath: resolvedDest };
    } else if (targetAction === 'export-dir') {
      if (!exportDestinationPath) {
        return { success: false, error: 'Destination folder path is required' };
      }

      const resolvedDest = resolveHome(exportDestinationPath);
      const targetFolder = path.join(resolvedDest, cleanFolderName);
      fs.mkdirSync(targetFolder, { recursive: true });
      fs.cpSync(bundleDir, targetFolder, { recursive: true, force: true });

      return { success: true, exportPath: targetFolder };
    }

    return { success: false, error: 'Unknown target action' };
  } catch (err: any) {
    console.error('Error in plugin:forgeBundle:', err);
    return { success: false, error: err.message || 'Failed to forge plugin bundle' };
  } finally {
    try {
      if (fs.existsSync(stagingRoot)) {
        fs.rmSync(stagingRoot, { recursive: true, force: true });
      }
    } catch {}
  }
});

// Prerequisite Command & Binary Verifier
const DEPENDENCY_SPECS: Record<string, {
  name: string;
  description: string;
  docsUrl: string;
  isCritical?: boolean;
  installSnippets: { windows: string; mac: string; linux: string };
  versionCmd?: string;
  aliases?: string[];
}> = {
  uv: {
    name: 'Astral uv',
    description: 'Extremely fast Python package installer and runner. Essential for uvx-based Model Context Protocol servers and isolated Python tools.',
    docsUrl: 'https://docs.astral.sh/uv/',
    isCritical: true,
    installSnippets: {
      windows: 'winget install astral-sh.uv',
      mac: 'brew install uv',
      linux: 'curl -LsSf https://astral.sh/uv/install.sh | sh',
    },
    versionCmd: 'uv --version',
  },
  python3: {
    name: 'Python 3.10+',
    description: 'Modern Python runtime required for execution of scientific, AI agent, and automation scripts.',
    docsUrl: 'https://www.python.org/downloads/',
    isCritical: true,
    aliases: ['python3', 'python'],
    installSnippets: {
      windows: 'winget install Python.Python.3.12',
      mac: 'brew install python@3.12',
      linux: 'sudo apt-get install -y python3 python3-pip',
    },
    versionCmd: 'python --version',
  },
  node: {
    name: 'Node.js LTS',
    description: 'JavaScript runtime engine required to run Node-based MCP servers and modern development tools.',
    docsUrl: 'https://nodejs.org/',
    isCritical: true,
    installSnippets: {
      windows: 'winget install OpenJS.NodeJS.LTS',
      mac: 'brew install node',
      linux: 'sudo apt-get install -y nodejs npm',
    },
    versionCmd: 'node -v',
  },
  npx: {
    name: 'npm / npx',
    description: 'Node Package Execute CLI used to dynamically execute packaged stdio and SSE MCP servers directly from npm.',
    docsUrl: 'https://docs.npmjs.com/cli/commands/npx',
    isCritical: true,
    installSnippets: {
      windows: 'winget install OpenJS.NodeJS.LTS',
      mac: 'brew install node',
      linux: 'sudo apt-get install -y npm',
    },
    versionCmd: 'npx -v',
  },
  docker: {
    name: 'Docker Desktop / Engine',
    description: 'Container virtualization engine required for sandboxed containers, isolated databases, and Docker MCP servers.',
    docsUrl: 'https://www.docker.com/products/docker-desktop/',
    isCritical: false,
    installSnippets: {
      windows: 'winget install Docker.DockerDesktop',
      mac: 'brew install --cask docker',
      linux: 'sudo apt-get install -y docker.io && sudo systemctl enable --now docker',
    },
    versionCmd: 'docker --version',
  },
  git: {
    name: 'Git Version Control',
    description: 'Distributed version control system required for repository inspection, cloning skill kits, and staging changes.',
    docsUrl: 'https://git-scm.com/',
    isCritical: true,
    installSnippets: {
      windows: 'winget install Git.Git',
      mac: 'brew install git',
      linux: 'sudo apt-get install -y git',
    },
    versionCmd: 'git --version',
  },
  go: {
    name: 'Go Language (Golang)',
    description: 'High-performance Go compiler and runtime required for Golang-based MCP servers and native extensions.',
    docsUrl: 'https://go.dev/dl/',
    isCritical: false,
    installSnippets: {
      windows: 'winget install GoLang.Go',
      mac: 'brew install go',
      linux: 'sudo apt-get install -y golang-go',
    },
    versionCmd: 'go version',
  },
};

ipcMain.handle('env:checkDependencies', async (_event, requestedBinaries?: string[]) => {
  const isWin = process.platform === 'win32';
  const binsToCheck = Array.isArray(requestedBinaries) && requestedBinaries.length > 0
    ? requestedBinaries
    : Object.keys(DEPENDENCY_SPECS);

  const report: Record<string, any> = {};

  for (const binKey of binsToCheck) {
    const spec = DEPENDENCY_SPECS[binKey] || {
      name: binKey,
      description: `System CLI binary requirement: ${binKey}`,
      docsUrl: 'https://github.com',
      isCritical: false,
      installSnippets: {
        windows: `winget install ${binKey}`,
        mac: `brew install ${binKey}`,
        linux: `sudo apt-get install -y ${binKey}`,
      },
    };

    const candidates = [binKey, ...(spec.aliases || [])];
    let foundPath: string | undefined = undefined;
    let foundVersion: string | undefined = undefined;

    for (const c of candidates) {
      try {
        const out = execSync((isWin ? 'where ' : 'which ') + c, {
          stdio: ['pipe', 'pipe', 'ignore'],
          timeout: 1500,
        }).toString().trim().split(/[\r\n]+/)[0];

        if (out && !out.toLowerCase().includes('windowsapps\\python3.exe') && !out.toLowerCase().includes('windowsapps\\python.exe')) {
          foundPath = out;
          if (spec.versionCmd) {
            try {
              foundVersion = execSync(spec.versionCmd, {
                stdio: ['pipe', 'pipe', 'ignore'],
                timeout: 1500,
              }).toString().trim().split(/[\r\n]+/)[0];
            } catch {}
          }
          break;
        } else if (out && !foundPath) {
          foundPath = out;
        }
      } catch {}
    }

    report[binKey] = {
      binary: binKey,
      name: spec.name,
      installed: Boolean(foundPath),
      path: foundPath,
      version: foundVersion,
      installSnippets: spec.installSnippets,
      description: spec.description,
      docsUrl: spec.docsUrl,
      isCritical: spec.isCritical,
    };
  }

  return report;
});

app.whenReady().then(() => {
  createWindow();

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

