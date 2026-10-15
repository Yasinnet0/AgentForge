export interface CatalogSkill {
  id: string;
  name: string;
  description: string;
  category: string;
  author: string;
  tags: string[];
  rawUrl: string;
  sourceRepo: string;
  hasScripts?: boolean;
  hasReferences?: boolean;
  sourceRegistry?: string;
  license?: string;
}

export interface CatalogMcpServer {
  id: string;
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
  sourceRegistry?: string;
  license?: string;
}

export interface CatalogPlugin {
  id: string;
  name: string;
  version: string;
  description: string;
  category: string;
  author: string;
  bundledSkills: string[];
  bundledMcps: string[];
  tags: string[];
  sourceRegistry?: string;
  license?: string;
}
