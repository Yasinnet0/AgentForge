import { app, BrowserWindow, ipcMain, screen, shell, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import AdmZip from 'adm-zip';

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

    // Scan direct skills
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

            // Plugin skills count
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

            // Plugin MCPs count
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

    // Scan MCP configs
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
    // Download content
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

    // Write targets
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

// Plugin Kit Installation
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
    // Download bundled skills
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

    // Write targets
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

