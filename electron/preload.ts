import { contextBridge, ipcRenderer } from 'electron';

export interface AgentPathConfigPayload {
  id: string;
  baseDir: string;
  skillsDir: string;
  mcpConfigPath: string;
  rulesPath: string;
  pluginsDir: string;
}

export interface AgentDetectionResult {
  detected: boolean;
  installedCounts: {
    skills: number;
    mcps: number;
    rules: number;
  };
}

export interface ScannedSkill {
  id: string;
  name: string;
  folderName?: string;
  description: string;
  sourceAgentId: string;
  sourceAgentName: string;
  sourceAgentColor: string;
  sourceAgentIcon: string;
  sourcePath: string;
  pluginName?: string;
  hasScripts: boolean;
  hasReferences: boolean;
}

export interface ScannedMcpServer {
  id: string;
  name: string;
  command?: string;
  args?: string[];
  url?: string;
  transport: 'stdio' | 'sse';
  envKeys: string[];
  sourceAgentId: string;
  sourceAgentName: string;
  sourceAgentColor: string;
  sourceAgentIcon: string;
  sourcePath: string;
  pluginName?: string;
}

export interface ScannedPlugin {
  id: string;
  name: string;
  folderName?: string;
  version: string;
  description: string;
  author?: string;
  sourceAgentId: string;
  sourceAgentName: string;
  sourceAgentColor: string;
  sourceAgentIcon: string;
  sourcePath: string;
  skillsCount: number;
  mcpsCount: number;
  rulesCount: number;
}

export interface AgentCapabilitiesPayload {
  skills: ScannedSkill[];
  mcpServers: ScannedMcpServer[];
  plugins: ScannedPlugin[];
}

export interface InstallSkillTarget {
  agentId: string;
  skillsDir: string;
}

export interface InstallSkillParams {
  skillId: string;
  rawUrl: string;
  targets: InstallSkillTarget[];
}

export interface UninstallSkillParams {
  skillId: string;
  targets: InstallSkillTarget[];
}

export interface InstallMcpTarget {
  agentId: string;
  mcpConfigPath: string;
}

export interface InstallMcpParams {
  serverKey: string;
  serverConfig: {
    command?: string;
    args?: string[];
    url?: string;
    transport?: 'stdio' | 'sse';
    env?: Record<string, string>;
  };
  targets: InstallMcpTarget[];
}

export interface UninstallMcpParams {
  serverKey: string;
  targets: InstallMcpTarget[];
}

export interface InstallPluginParams {
  pluginId: string;
  skills: Array<{ skillId: string; rawUrl: string }>;
  targets: Array<{ agentId: string; skillsDir: string; pluginsDir?: string }>;
}

export interface CreateSkillParams {
  folderName: string;
  skillContent: string;
  targets: Array<{ agentId: string; skillsDir: string }>;
}

export interface TransferSkillsParams {
  sourceAgentId: string;
  sourceSkillsDir: string;
  targetAgents: Array<{ agentId: string; skillsDir: string }>;
  skillSlugs: string[];
  mode: 'copy' | 'move';
}

export interface TransferSkillsResult {
  success: boolean;
  count?: number;
  transferredSlugs?: string[];
  errors?: string[];
  error?: string;
}

export interface ProvisionResult {
  success: boolean;
  count?: number;
  installedAgents?: string[];
  error?: string;
}

export interface SaveRulesParams {
  targets: Array<{ agentId: string; rulesPath: string }>;
  content: string;
  syncGeminiMd?: boolean;
}

export interface RulesFileResult {
  content: string;
  path: string;
  exists: boolean;
}

export interface ForgePluginBundleParams {
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
}

export interface ForgePluginResult {
  success: boolean;
  count?: number;
  exportPath?: string;
  installedAgents?: string[];
  error?: string;
  canceled?: boolean;
}

export interface ElectronAPI {
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
  isMaximized: () => Promise<boolean>;
  onMaximizeChange: (callback: (isMaximized: boolean) => void) => () => void;
  getAppVersion: () => Promise<string>;
  detectAgents: (configs: AgentPathConfigPayload[]) => Promise<Record<string, AgentDetectionResult>>;
  scanCapabilities: (
    configs: (AgentPathConfigPayload & { name: string; color: string; iconName: string })[]
  ) => Promise<AgentCapabilitiesPayload>;
  installSkill: (params: InstallSkillParams) => Promise<ProvisionResult>;
  uninstallSkill: (params: UninstallSkillParams) => Promise<ProvisionResult>;
  installMcp: (params: InstallMcpParams) => Promise<ProvisionResult>;
  uninstallMcp: (params: UninstallMcpParams) => Promise<ProvisionResult>;
  installPlugin: (params: InstallPluginParams) => Promise<ProvisionResult>;
  createCustomSkill: (params: CreateSkillParams) => Promise<ProvisionResult>;
  transferSkills: (params: TransferSkillsParams) => Promise<TransferSkillsResult>;
  readRules: (targetPath: string) => Promise<RulesFileResult>;
  saveRules: (params: SaveRulesParams) => Promise<ProvisionResult>;
  readAgentRules: (
    agentConfigs: Array<{ id: string; rulesPath: string }>
  ) => Promise<Record<string, RulesFileResult>>;
  forgePluginBundle: (params: ForgePluginBundleParams) => Promise<ForgePluginResult>;
  exportInstalledPluginZip: (params: { pluginPath: string; defaultZipName: string }) => Promise<ForgePluginResult>;
  showSaveDialog: (options: { defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }) => Promise<{ canceled: boolean; filePath?: string }>;
  showOpenDirectory: (options?: { defaultPath?: string }) => Promise<{ canceled: boolean; filePaths: string[] }>;
  openExternal: (url: string) => Promise<boolean>;
  openPath: (targetPath: string) => Promise<boolean>;
}

const electronAPI: ElectronAPI = {
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  onMaximizeChange: (callback: (isMaximized: boolean) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, isMaximized: boolean) => callback(isMaximized);
    ipcRenderer.on('window:maximize-change', subscription);
    return () => {
      ipcRenderer.removeListener('window:maximize-change', subscription);
    };
  },
  getAppVersion: () => ipcRenderer.invoke('app:version'),
  detectAgents: (configs: AgentPathConfigPayload[]) => ipcRenderer.invoke('agents:detectAll', configs),
  scanCapabilities: (configs) => ipcRenderer.invoke('agents:scanCapabilities', configs),
  installSkill: (params: InstallSkillParams) => ipcRenderer.invoke('catalog:installSkill', params),
  uninstallSkill: (params: UninstallSkillParams) => ipcRenderer.invoke('catalog:uninstallSkill', params),
  installMcp: (params: InstallMcpParams) => ipcRenderer.invoke('catalog:installMcp', params),
  uninstallMcp: (params: UninstallMcpParams) => ipcRenderer.invoke('catalog:uninstallMcp', params),
  installPlugin: (params: InstallPluginParams) => ipcRenderer.invoke('catalog:installPlugin', params),
  createCustomSkill: (params: CreateSkillParams) => ipcRenderer.invoke('skills:createCustomSkill', params),
  transferSkills: (params: TransferSkillsParams) => ipcRenderer.invoke('skills:transferSkills', params),
  readRules: (targetPath: string) => ipcRenderer.invoke('rules:read', targetPath),
  saveRules: (params: SaveRulesParams) => ipcRenderer.invoke('rules:save', params),
  readAgentRules: (agentConfigs) => ipcRenderer.invoke('rules:readAgentRules', agentConfigs),
  forgePluginBundle: (params: ForgePluginBundleParams) => ipcRenderer.invoke('plugin:forgeBundle', params),
  exportInstalledPluginZip: (params) => ipcRenderer.invoke('plugin:exportInstalledPluginZip', params),
  showSaveDialog: (options) => ipcRenderer.invoke('dialog:showSaveDialog', options),
  showOpenDirectory: (options) => ipcRenderer.invoke('dialog:showOpenDirectory', options),
  openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url),
  openPath: (targetPath: string) => ipcRenderer.invoke('app:openPath', targetPath),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

