import { CatalogSkill, CatalogPlugin, CatalogMcpServer } from '../types/catalog';
import { SKILLS_CATALOG } from '../data/skillsCatalog';
import { PLUGINS_CATALOG } from '../data/pluginsCatalog';
import { MCP_CATALOG } from '../data/mcpCatalog';

const UPSTREAM_REPO = 'sickn33/agentic-awesome-skills';
const SKILLS_INDEX_URL = 'https://raw.githubusercontent.com/sickn33/agentic-awesome-skills/main/skills_index.json';
const BUNDLES_URL = 'https://raw.githubusercontent.com/sickn33/agentic-awesome-skills/main/data/editorial-bundles.json';

const CACHE_KEY_SKILLS = 'agentforge_aas_skills_catalog';
const CACHE_KEY_PLUGINS = 'agentforge_aas_plugins_catalog';
const CACHE_KEY_SYNC_META = 'agentforge_aas_sync_meta';

export const AAS_MCP_SERVER: CatalogMcpServer = {
  id: 'aas-mcp',
  name: 'AAS Core MCP Server',
  description: 'Official Agentic Awesome Skills local MCP server: gives AI agents live stdio tools to search the 2,126+ skill catalog, validate skill stack selection, and inspect skill contracts.',
  category: 'AI & Multi-Agent',
  transport: 'stdio',
  command: 'npx',
  args: ['-y', 'agentic-awesome-skills', 'aas-mcp'],
  author: 'sickn33',
  tags: ['aas', 'skills', 'catalog', 'search', 'mcp'],
  docsUrl: 'https://github.com/sickn33/agentic-awesome-skills',
};

export interface CatalogSyncResult {
  skills: CatalogSkill[];
  plugins: CatalogPlugin[];
  mcpServers: CatalogMcpServer[];
  syncedAt: string | null;
  isFromCache: boolean;
  error?: string;
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
  const c = category.toLowerCase().trim();
  if (c === 'frontend' || c === 'ui') return 'Frontend';
  if (c === 'backend' || c === 'api') return 'Backend & API';
  if (c === 'ai' || c === 'agents' || c === 'llm') return 'AI & Multi-Agent';
  if (c === 'devops' || c === 'git' || c === 'ci') return 'DevOps & Git';
  if (c === 'database' || c === 'db' || c === 'sql') return 'Database';
  if (c === 'testing' || c === 'debug' || c === 'qa') return 'Testing & Debugging';
  if (c === 'security' || c === 'sec') return 'Security';
  if (c === 'desktop' || c === 'mobile') return 'Desktop & Mobile';

  return category.charAt(0).toUpperCase() + category.slice(1);
}

/**
 * Fetches all 2,126+ skills from sickn33/agentic-awesome-skills skills_index.json
 */
export async function fetchUpstreamSkills(): Promise<CatalogSkill[]> {
  const res = await fetch(SKILLS_INDEX_URL, {
    headers: { 'User-Agent': 'AgentForge-Desktop' },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch skills catalog from GitHub: HTTP ${res.status}`);
  }

  const rawSkills = await res.json();
  if (!Array.isArray(rawSkills)) {
    throw new Error('Invalid skills index format received from GitHub');
  }

  return rawSkills.map((item: any) => {
    const rawUrl = item.path.startsWith('http')
      ? item.path
      : `https://raw.githubusercontent.com/${UPSTREAM_REPO}/main/${item.path}/SKILL.md`;

    return {
      id: item.id || item.name,
      name: item.name && item.name !== item.id ? formatTitle(item.name) : formatTitle(item.id),
      description: item.description || `Specialized skill: ${item.name || item.id}`,
      category: formatCategory(item.category),
      author: item.source === 'personal' ? 'sickn33' : (item.source || 'community'),
      tags: [item.category, item.risk, 'aas'].filter(Boolean),
      rawUrl,
      sourceRepo: UPSTREAM_REPO,
      hasScripts: item.plugin?.setup?.type === 'scripts' || false,
      hasReferences: Boolean(item.plugin?.setup?.docs),
    };
  });
}

/**
 * Fetches all 58+ editorial plugin bundles from sickn33/agentic-awesome-skills
 */
export async function fetchUpstreamBundles(): Promise<CatalogPlugin[]> {
  const res = await fetch(BUNDLES_URL, {
    headers: { 'User-Agent': 'AgentForge-Desktop' },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch editorial bundles from GitHub: HTTP ${res.status}`);
  }

  const data = await res.json();
  const rawBundles: any[] = Array.isArray(data) ? data : (data.bundles || []);

  const fetchedBundles: CatalogPlugin[] = rawBundles.map((b: any) => {
    const skillIds: string[] = Array.isArray(b.skills)
      ? b.skills.map((s: any) => (typeof s === 'string' ? s : s.id)).filter(Boolean)
      : [];

    return {
      id: b.id,
      name: b.name || formatTitle(b.id),
      version: '17.5.0',
      description: b.description || b.tagline || 'Curated skill suite from Agentic Awesome Skills',
      category: b.group || 'Curated Bundles',
      author: 'AAS Editorial',
      bundledSkills: skillIds,
      bundledMcps: ['aas-mcp'],
      tags: [b.group, 'bundle', 'aas', b.emoji].filter(Boolean),
    };
  });

  // Merge with initial starter plugins to ensure complete coverage
  const existingIds = new Set(fetchedBundles.map((p) => p.id));
  for (const starter of PLUGINS_CATALOG) {
    if (!existingIds.has(starter.id)) {
      fetchedBundles.unshift(starter);
    }
  }

  return fetchedBundles;
}

/**
 * Loads catalog data: checks localStorage cache first, falls back to seed data or fetches live.
 */
export async function loadCatalogData(forceRefresh = false): Promise<CatalogSyncResult> {
  const mcpServers: CatalogMcpServer[] = [
    AAS_MCP_SERVER,
    ...MCP_CATALOG.filter((m) => m.id !== 'aas-mcp'),
  ];

  // 1. If not forcing refresh, try reading from cache
  if (!forceRefresh) {
    try {
      const cachedSkills = localStorage.getItem(CACHE_KEY_SKILLS);
      const cachedPlugins = localStorage.getItem(CACHE_KEY_PLUGINS);
      const syncMeta = localStorage.getItem(CACHE_KEY_SYNC_META);

      if (cachedSkills && cachedPlugins) {
        const skills: CatalogSkill[] = JSON.parse(cachedSkills);
        const plugins: CatalogPlugin[] = JSON.parse(cachedPlugins);
        return {
          skills,
          plugins,
          mcpServers,
          syncedAt: syncMeta || null,
          isFromCache: true,
        };
      }
    } catch (err) {
      console.warn('Failed reading catalog from cache:', err);
    }
  }

  // 2. Fetch fresh upstream catalog from GitHub
  try {
    const [skills, plugins] = await Promise.all([
      fetchUpstreamSkills(),
      fetchUpstreamBundles(),
    ]);

    const nowIso = new Date().toISOString();

    // Cache to localStorage
    try {
      localStorage.setItem(CACHE_KEY_SKILLS, JSON.stringify(skills));
      localStorage.setItem(CACHE_KEY_PLUGINS, JSON.stringify(plugins));
      localStorage.setItem(CACHE_KEY_SYNC_META, nowIso);
    } catch (cacheErr) {
      console.warn('Unable to persist full catalog to localStorage (storage quota):', cacheErr);
    }

    return {
      skills,
      plugins,
      mcpServers,
      syncedAt: nowIso,
      isFromCache: false,
    };
  } catch (fetchErr: any) {
    console.error('Catalog fetch error:', fetchErr);

    // Fallback to static seed data
    return {
      skills: SKILLS_CATALOG,
      plugins: PLUGINS_CATALOG,
      mcpServers,
      syncedAt: null,
      isFromCache: true,
      error: fetchErr.message || 'Failed to connect to GitHub',
    };
  }
}
