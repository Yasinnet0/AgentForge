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

export interface CreateSkillParams {
  folderName: string;
  skillContent: string;
  targets: Array<{ agentId: string; skillsDir: string }>;
}

export interface ProvisionResult {
  success: boolean;
  count?: number;
  installedAgents?: string[];
  error?: string;
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

