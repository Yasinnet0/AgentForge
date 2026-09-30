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

export interface RuleDirective {
  id: string;
  title: string;
  description?: string;
  category: 'communication' | 'engineering' | 'git' | 'debugging' | 'security' | 'custom';
  enabled: boolean;
  content: string;
}

export interface RuleSection {
  id: string;
  title: string;
  description?: string;
  directives: RuleDirective[];
}

export interface RulePreset {
  id: string;
  title: string;
  summary: string;
  category: 'communication' | 'engineering' | 'git' | 'debugging' | 'security';
  directives: Array<{
    title: string;
    content: string;
  }>;
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

