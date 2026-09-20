export interface CatalogSkill {
  id: string; // Directory name / slug, e.g. "api-design-principles"
  name: string;
  description: string;
  category: string;
  author: string;
  tags: string[];
  rawUrl: string;
  sourceRepo: string;
  hasScripts?: boolean;
  hasReferences?: boolean;
}

export interface CatalogMcpServer {
  id: string; // Server identifier / key, e.g. "postgres"
  name: string;
  description: string;
  category: string;
  transport: 'stdio' | 'sse';
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  envKeys?: string[];
  author: string;
  tags: string[];
  docsUrl?: string;
}

export interface CatalogPlugin {
  id: string;
  name: string;
  version: string;
  description: string;
  category: string;
  author: string;
  bundledSkills: string[]; // List of CatalogSkill ids
  bundledMcps: string[]; // List of CatalogMcpServer ids
  tags: string[];
}
