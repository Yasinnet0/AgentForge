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
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
