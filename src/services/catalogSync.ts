import { CatalogSkill, CatalogPlugin, CatalogMcpServer } from '../types/catalog';
import { SKILLS_CATALOG } from '../data/skillsCatalog';
import { PLUGINS_CATALOG } from '../data/pluginsCatalog';
import { MCP_CATALOG } from '../data/mcpCatalog';
import { isVersionNewer } from '../utils/versionUtils';

// Upstream Repositories and Endpoints (All under MIT or Apache-2.0)
const AAS_REPO = 'sickn33/agentic-awesome-skills';
const AAS_SKILLS_URL = 'https://raw.githubusercontent.com/sickn33/agentic-awesome-skills/main/skills_index.json';
const AAS_BUNDLES_URL = 'https://raw.githubusercontent.com/sickn33/agentic-awesome-skills/main/data/editorial-bundles.json';

const ANTHROPIC_OFFICIAL_PLUGINS_URL = 'https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/.claude-plugin/marketplace.json';
const ANTHROPIC_COMMUNITY_PLUGINS_URL = 'https://raw.githubusercontent.com/anthropics/claude-plugins-community/main/.claude-plugin/marketplace.json';
const GITHUB_COPILOT_PLUGINS_URL = 'https://raw.githubusercontent.com/github/awesome-copilot/marketplace/.github/plugin/marketplace.json';
const MCP_REGISTRY_URL = 'https://registry.modelcontextprotocol.io/v0.1/servers';
const SMITHERY_REGISTRY_URL = 'https://api.smithery.ai/servers';

const CACHE_KEY_SKILLS = 'agentforge_multi_skills_v6';
const CACHE_KEY_PLUGINS = 'agentforge_multi_plugins_v6';
const CACHE_KEY_MCPS = 'agentforge_multi_mcps_v6';
const CACHE_KEY_SYNC_META = 'agentforge_multi_sync_meta_v6';
export const CACHE_KEY_CUSTOM_FEEDS = 'agentforge_custom_feeds_v6';

export interface CustomCatalogFeed {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
}

export function getCustomFeeds(): CustomCatalogFeed[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY_CUSTOM_FEEDS);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveCustomFeeds(feeds: CustomCatalogFeed[]): void {
  try {
    localStorage.setItem(CACHE_KEY_CUSTOM_FEEDS, JSON.stringify(feeds));
  } catch (err) {
    console.warn('Failed saving custom feeds:', err);
  }
}

export function addCustomFeed(feed: Omit<CustomCatalogFeed, 'id'>): CustomCatalogFeed {
  const current = getCustomFeeds();
  const id = `feed-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const newFeed: CustomCatalogFeed = { ...feed, id };
  saveCustomFeeds([...current, newFeed]);
  return newFeed;
}

export function removeCustomFeed(id: string): void {
  const current = getCustomFeeds();
  saveCustomFeeds(current.filter((f) => f.id !== id));
}

export interface SourceBadgeInfo {
  badgeText: string;
  badgeClass: string;
  tooltip: string;
}

/**
 * Normalizes source registry into standardized badges:
 * [AAS], [Official MCP], [Addy Osmani], [Custom Feed], [Smithery.ai], [Awesome MCP], [Core]
 */
export function formatSourceBadge(sourceRegistry?: string): SourceBadgeInfo {
  if (!sourceRegistry) {
    return {
      badgeText: '[Catalog]',
      badgeClass: 'pill-default',
      tooltip: 'Standard Catalog Resource',
    };
  }

  const s = sourceRegistry.trim().toLowerCase();

  if (s.includes('aas') || s === 'agentic awesome skills') {
    return {
      badgeText: '[AAS]',
      badgeClass: 'pill-aas',
      tooltip: 'Primary AAS Catalog: sickn33/agentic-awesome-skills',
    };
  }
  if (s.includes('anthropic')) {
    return {
      badgeText: s.includes('mcp') ? '[Anthropic MCP]' : '[Anthropic]',
      badgeClass: 'pill-official',
      tooltip: 'Anthropic Official Registry & Plugins',
    };
  }
  if (s.includes('official') || s.includes('mcp registry') || s === 'modelcontextprotocol') {
    return {
      badgeText: '[Official MCP]',
      badgeClass: 'pill-official',
      tooltip: 'Official Reference MCP: Anthropic Model Context Protocol Registry',
    };
  }
  if (s.includes('addy') || s.includes('osmani')) {
    return {
      badgeText: '[Addy Osmani]',
      badgeClass: 'pill-addy',
      tooltip: 'Curated Playbook: addyosmani/agent-skills',
    };
  }
  if (s.includes('custom') || s.includes('feed')) {
    return {
      badgeText: '[Custom Feed]',
      badgeClass: 'pill-custom',
      tooltip: 'Pluggable Custom Registry Feed',
    };
  }
  if (s.includes('smithery')) {
    return {
      badgeText: '[Smithery.ai]',
      badgeClass: 'pill-smithery',
      tooltip: 'Smithery.ai Community MCP Hub',
    };
  }
  if (s.includes('awesome') || s.includes('punkpeye') || s.includes('community')) {
    return {
      badgeText: '[Awesome MCP]',
      badgeClass: 'pill-community',
      tooltip: 'Community Curated Hub: punkpeye/awesome-mcp-servers',
    };
  }
  if (s.includes('agentforge') || s.includes('core')) {
    return {
      badgeText: '[Community]',
      badgeClass: 'pill-community',
      tooltip: 'Community Curated Package',
    };
  }

  return {
    badgeText: `[${sourceRegistry}]`,
    badgeClass: 'pill-default',
    tooltip: `Source Registry: ${sourceRegistry}`,
  };
}

export const AAS_MCP_SERVER: CatalogMcpServer = {
  id: 'aas-mcp',
  name: 'AAS Core MCP Server',
  description: 'Official Agentic Awesome Skills local MCP server: provides live stdio tools to query the 2,400+ skill catalog, validate stack selection, and inspect skill contracts.',
  category: 'AI & Multi-Agent',
  transport: 'stdio',
  command: 'npx',
  args: ['-y', 'agentic-awesome-skills', 'aas-mcp'],
  author: 'sickn33',
  tags: ['aas', 'skills', 'catalog', 'search', 'mcp'],
  docsUrl: 'https://github.com/sickn33/agentic-awesome-skills',
  sourceRegistry: 'AAS Core',
  license: 'MIT',
};

export interface CatalogSyncResult {
  skills: CatalogSkill[];
  plugins: CatalogPlugin[];
  mcpServers: CatalogMcpServer[];
  syncedAt: string | null;
  isFromCache: boolean;
  error?: string;
  sourceBreakdown?: {
    skillsCount: number;
    pluginsCount: number;
    mcpCount: number;
  };
}

function formatTitle(slug: string): string {
  if (!slug) return '';
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatCategory(category?: string): string {
  if (!category) return 'General';
  // Strip emojis, symbols, and surrogate pairs
  const stripped = category
    .replace(/[\u{1F300}-\u{1FAFF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{D800}-\u{DFFF}]/gu, '')
    .trim();
  if (!stripped) return 'General';
  const c = stripped.toLowerCase();
  if (c === 'frontend' || c === 'ui') return 'Frontend';
  if (c === 'backend' || c === 'api') return 'Backend & API';
  if (c === 'ai' || c === 'agents' || c === 'llm' || c === 'multi-agent') return 'AI & Multi-Agent';
  if (c === 'devops' || c === 'git' || c === 'ci' || c === 'infrastructure') return 'DevOps & Git';
  if (c === 'database' || c === 'db' || c === 'sql') return 'Database';
  if (c === 'testing' || c === 'debug' || c === 'qa') return 'Testing & Debugging';
  if (c === 'security' || c === 'sec') return 'Security';
  if (c === 'desktop' || c === 'mobile') return 'Desktop & Mobile';
  if (c === 'design' || c === 'styling') return 'Design & Styling';
  if (c === 'productivity' || c === 'tools') return 'Productivity';

  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

// 1. Ingest Primary AAS Skills (MIT)
async function fetchAasSkills(): Promise<CatalogSkill[]> {
  const res = await fetch(AAS_SKILLS_URL, {
    headers: { 'User-Agent': 'AgentForge-Desktop' },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const rawSkills = await res.json();
  if (!Array.isArray(rawSkills)) return [];

  return rawSkills.map((item: any) => {
    const rawUrl = item.path?.startsWith('http')
      ? item.path
      : `https://raw.githubusercontent.com/${AAS_REPO}/main/${item.path}/SKILL.md`;

    return {
      id: item.id || item.name,
      name: item.name && item.name !== item.id ? formatTitle(item.name) : formatTitle(item.id),
      description: item.description || `Specialized agent skill: ${item.name || item.id}`,
      category: formatCategory(item.category),
      author: item.source === 'personal' ? 'sickn33' : (item.source || 'AAS Community'),
      tags: [item.category, item.risk, 'aas'].filter(Boolean),
      rawUrl,
      sourceRepo: AAS_REPO,
      hasScripts: item.plugin?.setup?.type === 'scripts' || false,
      hasReferences: Boolean(item.plugin?.setup?.docs),
      sourceRegistry: 'AAS',
      license: 'MIT',
    };
  });
}

// 2. Ingest Primary AAS Bundles (MIT)
async function fetchAasBundles(): Promise<CatalogPlugin[]> {
  const res = await fetch(AAS_BUNDLES_URL, {
    headers: { 'User-Agent': 'AgentForge-Desktop' },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const rawBundles: any[] = Array.isArray(data) ? data : (data.bundles || []);

  return rawBundles.map((b: any) => {
    const skillIds: string[] = Array.isArray(b.skills)
      ? b.skills.map((s: any) => (typeof s === 'string' ? s : s.id)).filter(Boolean)
      : [];

    return {
      id: b.id,
      name: b.name || formatTitle(b.id),
      version: '1.0.0',
      description: b.description || b.tagline || 'Curated skill kit from Agentic Awesome Skills',
      category: formatCategory(b.group || 'Curated Bundles'),
      author: 'AAS Editorial',
      bundledSkills: skillIds,
      bundledMcps: ['aas-mcp'],
      tags: [b.group, 'bundle', 'aas', b.emoji].filter(Boolean),
      sourceRegistry: 'AAS Bundles',
      license: 'MIT',
    };
  });
}

// 3. Ingest Anthropic Official Plugins (Apache-2.0)
async function fetchAnthropicOfficialPlugins(): Promise<CatalogPlugin[]> {
  const res = await fetch(ANTHROPIC_OFFICIAL_PLUGINS_URL, {
    headers: { 'User-Agent': 'AgentForge-Desktop' },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const rawPlugins: any[] = Array.isArray(data.plugins) ? data.plugins : [];

  return rawPlugins.map((p: any) => {
    return {
      id: p.name,
      name: formatTitle(p.name),
      version: p.source?.ref || '1.0.0',
      description: p.description || 'Verified Claude Code plugin package',
      category: formatCategory(p.category || 'Official Claude Plugin'),
      author: p.author?.name || 'Anthropic Verified',
      bundledSkills: [],
      bundledMcps: [],
      tags: ['claude-official', p.category, 'anthropic'].filter(Boolean),
      sourceRegistry: 'Anthropic Official',
      license: 'Apache-2.0',
    };
  });
}

// 4. Ingest Anthropic Community Plugins (Apache-2.0)
async function fetchAnthropicCommunityPlugins(): Promise<CatalogPlugin[]> {
  const res = await fetch(ANTHROPIC_COMMUNITY_PLUGINS_URL, {
    headers: { 'User-Agent': 'AgentForge-Desktop' },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const rawPlugins: any[] = Array.isArray(data.plugins) ? data.plugins : [];

  return rawPlugins.map((p: any) => {
    const rawRef = p.source?.ref || p.version;
    const cleanRef = typeof rawRef === 'string' && /^\d+(\.\d+)+/.test(rawRef.replace(/^v/i, ''))
      ? rawRef.replace(/^v/i, '')
      : (p.version || '1.0.0');

    return {
      id: p.name,
      name: formatTitle(p.name),
      version: cleanRef,
      description: p.description || 'Community Claude Code plugin extension',
      category: 'Community Plugin',
      author: 'Claude Community',
      bundledSkills: [],
      bundledMcps: [],
      tags: ['claude', 'community-plugin'],
      sourceRegistry: 'Claude Community',
      license: 'Apache-2.0',
    };
  });
}

// 5. Ingest GitHub Awesome Copilot Plugins (MIT)
async function fetchAwesomeCopilotPlugins(): Promise<CatalogPlugin[]> {
  const res = await fetch(GITHUB_COPILOT_PLUGINS_URL, {
    headers: { 'User-Agent': 'AgentForge-Desktop' },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const rawPlugins: any[] = Array.isArray(data.plugins) ? data.plugins : [];

  return rawPlugins.map((p: any) => {
    return {
      id: p.name,
      name: formatTitle(p.name),
      version: p.version || '1.0.0',
      description: p.description || 'Curated Copilot workflow plugin',
      category: 'Workflow Pack',
      author: p.author?.name || 'GitHub Copilot Community',
      bundledSkills: [],
      bundledMcps: [],
      tags: ['copilot', 'workflow', ...(p.keywords || [])],
      sourceRegistry: 'GitHub Copilot',
      license: p.license || 'MIT',
    };
  });
}

// Smart Deduplication for Skills
function mergeSkillsDeduplicated(
  baseList: CatalogSkill[],
  incomingLists: CatalogSkill[][]
): CatalogSkill[] {
  const map = new Map<string, CatalogSkill>();

  // Helper key normalizer
  const normKey = (id: string) => id.toLowerCase().replace(/[^a-z0-9]/g, '-');

  // Insert base items first (seeded high-priority skills like Addy Osmani & Core)
  for (const s of baseList) {
    map.set(normKey(s.id), s);
  }

  // Merge incoming lists
  for (const list of incomingLists) {
    for (const incoming of list) {
      const key = normKey(incoming.id);
      if (!map.has(key)) {
        map.set(key, incoming);
      } else {
        // Merge tags
        const existing = map.get(key)!;
        const mergedTags = Array.from(new Set([...(existing.tags || []), ...(incoming.tags || [])]));
        existing.tags = mergedTags;
      }
    }
  }

  return Array.from(map.values());
}

// Smart Deduplication for Plugins
function mergePluginsDeduplicated(
  priorityOrderLists: CatalogPlugin[][]
): CatalogPlugin[] {
  const map = new Map<string, CatalogPlugin>();
  const normKey = (id: string) => id.toLowerCase().replace(/[^a-z0-9]/g, '-');

  for (const list of priorityOrderLists) {
    for (const item of list) {
      const key = normKey(item.id);
      if (!map.has(key)) {
        map.set(key, item);
      } else {
        const existing = map.get(key)!;
        const mergedTags = Array.from(new Set([...(existing.tags || []), ...(item.tags || [])]));
        existing.tags = mergedTags;
        // Never downgrade an existing higher version
        if (item.version && isVersionNewer(existing.version, item.version)) {
          existing.version = item.version;
        }
      }
    }
  }

  return Array.from(map.values());
}

// 6. Ingest Official MCP Registry (MIT / Apache-2.0)
async function fetchOfficialMcpRegistry(): Promise<CatalogMcpServer[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4500);
  try {
    const res = await fetch(MCP_REGISTRY_URL, {
      signal: controller.signal,
      headers: { 'User-Agent': 'AgentForge-Desktop' },
    });
    clearTimeout(timeoutId);
    if (!res.ok) return [];
    const data = await res.json();
    if (!data || !Array.isArray(data.servers)) return [];

    const out: CatalogMcpServer[] = [];
    for (const item of data.servers) {
      const s = item.server;
      if (!s || !s.name) continue;

      const title = s.title || formatTitle(s.name.split('/').pop() || s.name);
      const pkg = s.packages && s.packages.length > 0 ? s.packages[0] : null;
      const remote = s.remotes && s.remotes.length > 0 ? s.remotes[0] : null;

      let transport: 'stdio' | 'sse' = 'stdio';
      let command: string | undefined = undefined;
      let args: string[] | undefined = undefined;
      let url: string | undefined = undefined;

      if (pkg) {
        transport = 'stdio';
        command = pkg.registryType === 'npm' ? 'npx' : 'uvx';
        args = pkg.registryType === 'npm' ? ['-y', pkg.identifier] : [pkg.identifier];
      } else if (remote && remote.url) {
        transport = 'sse';
        url = remote.url;
      } else {
        transport = 'stdio';
        command = 'npx';
        args = ['-y', s.name];
      }

      const id = s.name.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
      out.push({
        id,
        name: title,
        description: s.description || `${title} Model Context Protocol server.`,
        category: formatCategory('System & Automation'),
        transport,
        command,
        args,
        url,
        author: s.name.split('/')[0] || 'MCP Registry',
        tags: ['mcp', 'official-registry', id],
        docsUrl: s.websiteUrl || s.repository?.url || 'https://registry.modelcontextprotocol.io',
        sourceRegistry: 'Official MCP',
        license: 'MIT / Apache-2.0',
      });
    }
    return out;
  } catch {
    clearTimeout(timeoutId);
    return [];
  }
}

// 7. Ingest Smithery.ai Public Registry (Community Hub)
async function fetchSmitheryRegistry(): Promise<CatalogMcpServer[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4500);
  try {
    const res = await fetch(SMITHERY_REGISTRY_URL, {
      signal: controller.signal,
      headers: { 'User-Agent': 'AgentForge-Desktop' },
    });
    clearTimeout(timeoutId);
    if (!res.ok) return [];
    const data = await res.json();
    const rawServers: any[] = Array.isArray(data)
      ? data
      : Array.isArray(data?.servers)
        ? data.servers
        : [];

    return rawServers.map((s: any) => {
      const name = s.displayName || formatTitle(s.qualifiedName || s.namespace || 'Smithery Server');
      const id = (s.qualifiedName || s.id || name).toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      const qualified = s.qualifiedName || s.namespace || id;

      return {
        id: `smithery-${id}`,
        name,
        description: s.description || `${name} hosted on the Smithery.ai community registry.`,
        category: formatCategory(s.category || 'System & Automation'),
        transport: 'stdio' as const,
        command: 'npx',
        args: ['-y', '@smithery/cli@latest', 'run', qualified],
        author: s.owner || 'Smithery.ai Community',
        tags: ['mcp', 'smithery', 'community', qualified],
        docsUrl: s.homepage || `https://smithery.ai/server/${qualified}`,
        sourceRegistry: 'Smithery.ai',
        license: 'MIT / Open Source',
      };
    });
  } catch {
    clearTimeout(timeoutId);
    return [];
  }
}

// 8. Ingest Pluggable Custom Feeds
async function fetchCustomFeeds(): Promise<{
  skills: CatalogSkill[];
  plugins: CatalogPlugin[];
  mcpServers: CatalogMcpServer[];
}> {
  const feeds = getCustomFeeds().filter((f) => f.enabled !== false);
  if (!feeds.length) return { skills: [], plugins: [], mcpServers: [] };

  const results = await Promise.allSettled(
    feeds.map(async (f) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4500);
      try {
        const res = await fetch(f.url, {
          signal: controller.signal,
          headers: { 'User-Agent': 'AgentForge-Desktop' },
        });
        clearTimeout(timeoutId);
        if (!res.ok) return null;
        const data = await res.json();
        return { feed: f, data };
      } catch {
        clearTimeout(timeoutId);
        return null;
      }
    })
  );

  const outSkills: CatalogSkill[] = [];
  const outPlugins: CatalogPlugin[] = [];
  const outMcps: CatalogMcpServer[] = [];

  for (const r of results) {
    if (r.status !== 'fulfilled' || !r.value?.data) continue;
    const { data } = r.value;

    if (Array.isArray(data.skills)) {
      for (const s of data.skills) {
        outSkills.push({
          ...s,
          sourceRegistry: s.sourceRegistry || 'Custom Feed',
        });
      }
    }
    if (Array.isArray(data.plugins)) {
      for (const p of data.plugins) {
        outPlugins.push({
          ...p,
          sourceRegistry: p.sourceRegistry || 'Custom Feed',
        });
      }
    }
    const rawMcps = data.mcpServers || data.servers;
    if (Array.isArray(rawMcps)) {
      for (const m of rawMcps) {
        outMcps.push({
          ...m,
          sourceRegistry: m.sourceRegistry || 'Custom Feed',
        });
      }
    }
  }

  return { skills: outSkills, plugins: outPlugins, mcpServers: outMcps };
}

// Smart Deduplication for MCP Servers
function mergeMcpServersDeduplicated(
  baseList: CatalogMcpServer[],
  incomingLists: CatalogMcpServer[][]
): CatalogMcpServer[] {
  const map = new Map<string, CatalogMcpServer>();
  const normKey = (id: string) => id.toLowerCase().replace(/[^a-z0-9]/g, '-');

  for (const s of baseList) {
    map.set(normKey(s.id), s);
  }

  for (const list of incomingLists) {
    for (const item of list) {
      const key = normKey(item.id);
      if (!map.has(key)) {
        map.set(key, item);
      } else {
        const existing = map.get(key)!;
        const mergedTags = Array.from(new Set([...(existing.tags || []), ...(item.tags || [])]));
        existing.tags = mergedTags;
      }
    }
  }

  return Array.from(map.values());
}

/**
 * Aggregates multiple catalog registries in parallel with smart deduplication and attribution:
 * 1. Primary AAS Catalog: sickn33/agentic-awesome-skills (2,126+ skills, 58 plugin kits)
 * 2. Official MCP Registry: modelcontextprotocol/servers (Anthropic reference MCP servers)
 * 3. Addy Osmani Skills: addyosmani/agent-skills curated engineering playbooks
 * 4. Community Curated Hubs: punkpeye/awesome-mcp-servers & Smithery.ai
 * 5. Pluggable Custom Feeds: Dynamic external JSON endpoints
 */
export async function loadCatalogData(forceRefresh = false): Promise<CatalogSyncResult> {
  const baseMcpServers: CatalogMcpServer[] = [
    AAS_MCP_SERVER,
    ...MCP_CATALOG.filter((m) => m.id !== 'aas-mcp'),
  ];

  // 1. Check local cache first unless forced
  if (!forceRefresh) {
    try {
      const cachedSkills = localStorage.getItem(CACHE_KEY_SKILLS);
      const cachedPlugins = localStorage.getItem(CACHE_KEY_PLUGINS);
      const cachedMcps = localStorage.getItem(CACHE_KEY_MCPS);
      const syncMeta = localStorage.getItem(CACHE_KEY_SYNC_META);

      if (cachedSkills && cachedPlugins) {
        const rawCachedSkills: CatalogSkill[] = JSON.parse(cachedSkills);
        const rawCachedPlugins: CatalogPlugin[] = JSON.parse(cachedPlugins);

        const skills: CatalogSkill[] = mergeSkillsDeduplicated(SKILLS_CATALOG, [rawCachedSkills]);
        const plugins: CatalogPlugin[] = mergePluginsDeduplicated([PLUGINS_CATALOG, rawCachedPlugins]);
        const mcpServers: CatalogMcpServer[] = cachedMcps
          ? mergeMcpServersDeduplicated(baseMcpServers, [JSON.parse(cachedMcps)])
          : baseMcpServers;

        return {
          skills,
          plugins,
          mcpServers,
          syncedAt: syncMeta || null,
          isFromCache: true,
          sourceBreakdown: {
            skillsCount: skills.length,
            pluginsCount: plugins.length,
            mcpCount: mcpServers.length,
          },
        };
      }
    } catch (err) {
      console.warn('Failed reading multi-catalog cache:', err);
    }
  }

  // 2. Parallel Ingestion across 8 upstream endpoints via Promise.allSettled
  try {
    const [
      aasSkillsRes,
      aasBundlesRes,
      anthropicOfficialRes,
      anthropicCommunityRes,
      copilotPluginsRes,
      mcpRegistryRes,
      smitheryRes,
      customFeedsRes,
    ] = await Promise.allSettled([
      fetchAasSkills(),
      fetchAasBundles(),
      fetchAnthropicOfficialPlugins(),
      fetchAnthropicCommunityPlugins(),
      fetchAwesomeCopilotPlugins(),
      fetchOfficialMcpRegistry(),
      fetchSmitheryRegistry(),
      fetchCustomFeeds(),
    ]);

    const fetchedAasSkills = aasSkillsRes.status === 'fulfilled' ? aasSkillsRes.value : [];
    const fetchedAasBundles = aasBundlesRes.status === 'fulfilled' ? aasBundlesRes.value : [];
    const fetchedAnthropicOfficial = anthropicOfficialRes.status === 'fulfilled' ? anthropicOfficialRes.value : [];
    const fetchedAnthropicCommunity = anthropicCommunityRes.status === 'fulfilled' ? anthropicCommunityRes.value : [];
    const fetchedCopilot = copilotPluginsRes.status === 'fulfilled' ? copilotPluginsRes.value : [];
    const fetchedRegistryMcps = mcpRegistryRes.status === 'fulfilled' ? mcpRegistryRes.value : [];
    const fetchedSmitheryMcps = smitheryRes.status === 'fulfilled' ? smitheryRes.value : [];
    const fetchedCustom = customFeedsRes.status === 'fulfilled' ? customFeedsRes.value : { skills: [], plugins: [], mcpServers: [] };

    // Deduplicate skills: Seeds (Addy Osmani + Core) take priority over custom feed and raw index
    const mergedSkills = mergeSkillsDeduplicated(SKILLS_CATALOG, [fetchedCustom.skills, fetchedAasSkills]);

    // Deduplicate plugins: Core > Custom Feed > Official Anthropic > Copilot > AAS Bundles > Community
    const mergedPlugins = mergePluginsDeduplicated([
      PLUGINS_CATALOG,
      fetchedCustom.plugins,
      fetchedAnthropicOfficial,
      fetchedCopilot,
      fetchedAasBundles,
      fetchedAnthropicCommunity,
    ]);

    // Deduplicate MCP servers: Core curated list takes priority, followed by custom, official registry, and Smithery
    const mergedMcpServers = mergeMcpServersDeduplicated(baseMcpServers, [
      fetchedCustom.mcpServers,
      fetchedRegistryMcps,
      fetchedSmitheryMcps,
    ]);

    const nowIso = new Date().toISOString();

    // Persist cache asynchronously in background to never block renderer UI thread
    setTimeout(() => {
      try {
        localStorage.setItem(CACHE_KEY_SKILLS, JSON.stringify(mergedSkills));
        localStorage.setItem(CACHE_KEY_PLUGINS, JSON.stringify(mergedPlugins));
        localStorage.setItem(CACHE_KEY_MCPS, JSON.stringify(mergedMcpServers));
        localStorage.setItem(CACHE_KEY_SYNC_META, nowIso);
      } catch (cacheErr) {
        console.warn('Unable to persist full aggregated catalog to localStorage:', cacheErr);
      }
    }, 50);

    return {
      skills: mergedSkills,
      plugins: mergedPlugins,
      mcpServers: mergedMcpServers,
      syncedAt: nowIso,
      isFromCache: false,
      sourceBreakdown: {
        skillsCount: mergedSkills.length,
        pluginsCount: mergedPlugins.length,
        mcpCount: mergedMcpServers.length,
      },
    };
  } catch (err: any) {
    console.error('Multi-catalog aggregation error:', err);

    return {
      skills: SKILLS_CATALOG,
      plugins: PLUGINS_CATALOG,
      mcpServers: baseMcpServers,
      syncedAt: null,
      isFromCache: true,
      error: err.message || 'Failed connecting to upstream registries',
    };
  }
}
