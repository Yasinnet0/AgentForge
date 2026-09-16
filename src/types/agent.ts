export interface AgentPathConfig {
  baseDir: string;
  skillsDir: string;
  mcpConfigPath: string;
  rulesPath: string;
  pluginsDir: string;
}

export interface SupportedAgent {
  id: string;
  name: string;
  tagline: string;
  iconName: string;
  color: string;
  detected: boolean;
  selected: boolean;
  installedCounts: {
    skills: number;
    mcps: number;
    rules: number;
  };
  paths: AgentPathConfig;
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
