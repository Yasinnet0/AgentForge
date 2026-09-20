import { app, BrowserWindow, ipcMain, screen, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';

const isDev = process.env.NODE_ENV === 'development';

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

function createWindow() {
  const windowState = loadWindowState();

  mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    minWidth: 1100,
    minHeight: 700,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
  });

  if (windowState.isMaximized) {
    mainWindow.maximize();
  }

  // Intercept new window requests (e.g. target="_blank" links) to open in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Intercept in-window navigation for external URLs
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
    mainWindow?.show();
  });

  // Fallback to guarantee window visibility
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

// Window IPC handlers
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

ipcMain.handle('agents:detectAll', async (_event, agentConfigs: any[]) => {
  const results: Record<string, { detected: boolean; installedCounts: { skills: number; mcps: number; rules: number } }> = {};

  if (!Array.isArray(agentConfigs)) {
    return results;
  }

  for (const agent of agentConfigs) {
    const resolvedBase = resolveHome(agent.baseDir);
    const resolvedSkills = resolveHome(agent.skillsDir);
    const resolvedMcp = resolveHome(agent.mcpConfigPath);
    const resolvedRules = resolveHome(agent.rulesPath);

    const baseExists = resolvedBase ? fs.existsSync(resolvedBase) : false;
    const skillsExists = resolvedSkills ? fs.existsSync(resolvedSkills) : false;
    const mcpExists = resolvedMcp ? fs.existsSync(resolvedMcp) : false;
    const rulesExists = resolvedRules ? fs.existsSync(resolvedRules) : false;

    const detected = baseExists || skillsExists || mcpExists || rulesExists;

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
        const content = JSON.parse(fs.readFileSync(resolvedMcp, 'utf-8'));
        const mcpServers = content.mcpServers || content.servers || {};
        mcpsCount = Object.keys(mcpServers).length;
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
    };
  }

  return results;
});

function parseSkillInfo(skillDirPath: string, folderName: string) {
  let name = folderName;
  let description = 'Workflow skill package';
  let hasScripts = false;
  let hasReferences = false;

  try {
    const skillMdPath = path.join(skillDirPath, 'SKILL.md');
    if (fs.existsSync(skillMdPath)) {
      const content = fs.readFileSync(skillMdPath, 'utf-8');
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

  return { name, description, hasScripts, hasReferences };
}

ipcMain.handle('agents:scanCapabilities', async (_event, agentConfigs: any[]) => {
  const allSkills: any[] = [];
  const allMcps: any[] = [];
  const allPlugins: any[] = [];

  if (!Array.isArray(agentConfigs)) {
    return { skills: allSkills, mcpServers: allMcps, plugins: allPlugins };
  }

  for (const agent of agentConfigs) {
    const resolvedSkills = resolveHome(agent.skillsDir);
    const resolvedMcp = resolveHome(agent.mcpConfigPath);
    const resolvedPlugins = resolveHome(agent.pluginsDir);

    // 1. Scan direct skills
    if (resolvedSkills && fs.existsSync(resolvedSkills)) {
      try {
        const entries = fs.readdirSync(resolvedSkills, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const skillPath = path.join(resolvedSkills, entry.name);
            const info = parseSkillInfo(skillPath, entry.name);
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
            });
          }
        }
      } catch (err) {
        console.warn(`Failed scanning skills for ${agent.name}:`, err);
      }
    }

    // 2. Scan plugins & plugin-nested skills/MCPs
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

            const manifestPath = path.join(pluginPath, 'plugin.json');
            if (fs.existsSync(manifestPath)) {
              try {
                const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
                if (manifest.name) pluginName = manifest.name;
                if (manifest.version) pluginVersion = manifest.version;
                if (manifest.description) pluginDesc = manifest.description;
                if (manifest.author) {
                  pluginAuthor = typeof manifest.author === 'string' ? manifest.author : (manifest.author.name || 'Local');
                }
              } catch {}
            }

            // Plugin bundled skills count
            const pluginSkillsDir = path.join(pluginPath, 'skills');
            if (fs.existsSync(pluginSkillsDir)) {
              try {
                const rootSkillMd = path.join(pluginSkillsDir, 'SKILL.md');
                if (fs.existsSync(rootSkillMd)) {
                  bundledSkillsCount++;
                } else {
                  const pSkillEntries = fs.readdirSync(pluginSkillsDir, { withFileTypes: true });
                  for (const pSkill of pSkillEntries) {
                    if (pSkill.isDirectory() && !pSkill.name.startsWith('.')) {
                      const skillPath = path.join(pluginSkillsDir, pSkill.name);
                      if (fs.existsSync(path.join(skillPath, 'SKILL.md'))) {
                        bundledSkillsCount++;
                      }
                    }
                  }
                }
              } catch {}
            }

            // Plugin bundled MCPs count
            const pluginMcpPath = path.join(pluginPath, 'mcp_config.json');
            if (fs.existsSync(pluginMcpPath)) {
              try {
                const mcpContent = JSON.parse(fs.readFileSync(pluginMcpPath, 'utf-8'));
                const servers = mcpContent.mcpServers || mcpContent.servers || {};
                bundledMcpsCount += Object.keys(servers).length;
              } catch {}
            }

            // Plugin rules
            const pluginRulesDir = path.join(pluginPath, 'rules');
            if (fs.existsSync(pluginRulesDir)) {
              try {
                bundledRulesCount = fs.readdirSync(pluginRulesDir).length;
              } catch {}
            }

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
            });
          }
        }
      } catch (err) {
        console.warn(`Failed scanning plugins for ${agent.name}:`, err);
      }
    }

    // 3. Scan primary MCP config file
    if (resolvedMcp && fs.existsSync(resolvedMcp)) {
      try {
        const mcpContent = JSON.parse(fs.readFileSync(resolvedMcp, 'utf-8'));
        const servers = mcpContent.mcpServers || mcpContent.servers || {};
        for (const [sKey, sVal] of Object.entries<any>(servers)) {
          allMcps.push({
            id: `${agent.id}-mcp-${sKey}`,
            name: sKey,
            command: sVal?.command,
            args: sVal?.args || [],
            url: sVal?.url,
            transport: sVal?.url ? 'sse' : 'stdio',
            envKeys: Object.keys(sVal?.env || {}),
            sourceAgentId: agent.id,
            sourceAgentName: agent.name,
            sourceAgentColor: agent.color || '#818cf8',
            sourceAgentIcon: agent.iconName || 'Server',
            sourcePath: resolvedMcp,
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

// ==========================================
// Catalog Provisioning Handlers (Multi-Agent)
// ==========================================

// 1-Click Skill Install: Fetches once over HTTPS from GitHub, distributes to all selected agents
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
    // Download content ONCE over HTTPS into memory
    const response = await fetch(rawUrl, {
      headers: { 'User-Agent': 'AgentForge-Desktop' },
    });
    if (!response.ok) {
      return {
        success: false,
        error: `Failed to download skill from GitHub: HTTP ${response.status} ${response.statusText}`,
      };
    }
    const skillContent = await response.text();

    const installedAgents: string[] = [];

    // Write to each selected agent target
    for (const target of targets) {
      const resolvedSkillsDir = resolveHome(target.skillsDir);
      if (!resolvedSkillsDir) continue;

      const destFolder = path.join(resolvedSkillsDir, skillId);
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
    console.error(`Error installing skill ${skillId}:`, err);
    return { success: false, error: err.message || 'Unknown installation error' };
  }
});

// 1-Click Skill Uninstall: Removes from selected agents
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

// Create Custom Skill ("Forge Skill"): Writes a custom authored skill directly to selected agents
ipcMain.handle('skills:createCustomSkill', async (_event, params: {
  folderName: string;
  skillContent: string;
  targets: Array<{ agentId: string; skillsDir: string }>;
}) => {
  const { folderName, skillContent, targets } = params;
  if (!folderName || !skillContent || !Array.isArray(targets) || targets.length === 0) {
    return { success: false, error: 'Folder name, content, and at least one target agent are required' };
  }

  // Sanitize folder name to prevent directory traversal
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

// Transfer Skills: Copy or Move skills across local AI agents
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

      // Avoid copying back to the same directory
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

// 1-Click MCP Install: Injects server definition into selected agents' mcp_config.json
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
      const resolvedMcp = resolveHome(target.mcpConfigPath);
      if (!resolvedMcp) continue;

      fs.mkdirSync(path.dirname(resolvedMcp), { recursive: true });

      let configObj: any = { mcpServers: {} };
      if (fs.existsSync(resolvedMcp)) {
        try {
          configObj = JSON.parse(fs.readFileSync(resolvedMcp, 'utf-8'));
        } catch {
          configObj = { mcpServers: {} };
        }
      }

      if (!configObj.mcpServers && !configObj.servers) {
        configObj.mcpServers = {};
      }
      const targetKey = configObj.mcpServers !== undefined ? 'mcpServers' : 'servers';
      configObj[targetKey][serverKey] = serverConfig;

      fs.writeFileSync(resolvedMcp, JSON.stringify(configObj, null, 2), 'utf-8');
      installedCount++;
    }
    return { success: true, count: installedCount };
  } catch (err: any) {
    console.error(`Error configuring MCP ${serverKey}:`, err);
    return { success: false, error: err.message || 'Unknown MCP error' };
  }
});

// 1-Click MCP Uninstall: Removes server definition from selected agents' mcp_config.json
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
      const resolvedMcp = resolveHome(target.mcpConfigPath);
      if (!resolvedMcp || !fs.existsSync(resolvedMcp)) continue;

      try {
        const configObj = JSON.parse(fs.readFileSync(resolvedMcp, 'utf-8'));
        let modified = false;
        if (configObj.mcpServers && configObj.mcpServers[serverKey]) {
          delete configObj.mcpServers[serverKey];
          modified = true;
        }
        if (configObj.servers && configObj.servers[serverKey]) {
          delete configObj.servers[serverKey];
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

// 1-Click Plugin Kit Install: Downloads each skill ONCE and equips all selected agents
ipcMain.handle('catalog:installPlugin', async (_event, params: {
  pluginId: string;
  skills: Array<{ skillId: string; rawUrl: string }>;
  targets: Array<{ agentId: string; skillsDir: string; pluginsDir?: string }>;
}) => {
  const { skills, targets } = params;
  if (!Array.isArray(skills) || !Array.isArray(targets) || targets.length === 0) {
    return { success: false, error: 'Invalid plugin kit parameters' };
  }

  try {
    // Download all skills once into memory
    const skillContents = new Map<string, string>();
    for (const item of skills) {
      try {
        const res = await fetch(item.rawUrl, {
          headers: { 'User-Agent': 'AgentForge-Desktop' },
        });
        if (res.ok) {
          skillContents.set(item.skillId, await res.text());
        }
      } catch (err) {
        console.warn(`Failed to fetch bundled skill ${item.skillId}:`, err);
      }
    }

    // Write to each selected agent target
    let writeCount = 0;
    for (const target of targets) {
      const resolvedSkillsDir = resolveHome(target.skillsDir);
      if (!resolvedSkillsDir) continue;

      for (const [skillId, content] of skillContents.entries()) {
        const destFolder = path.join(resolvedSkillsDir, skillId);
        fs.mkdirSync(destFolder, { recursive: true });
        fs.writeFileSync(path.join(destFolder, 'SKILL.md'), content, 'utf-8');
        writeCount++;
      }
    }

    return { success: true, count: writeCount };
  } catch (err: any) {
    console.error('Error installing plugin kit:', err);
    return { success: false, error: err.message || 'Failed installing plugin kit' };
  }
});

app.whenReady().then(() => {
  createWindow();

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

