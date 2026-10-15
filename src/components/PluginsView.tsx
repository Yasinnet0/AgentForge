import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ScannedPlugin, ScannedSkill, ScannedMcpServer, SupportedAgent, InstalledPluginDetails } from '../types/agent';
import { CatalogPlugin, CatalogSkill } from '../types/catalog';
import { PLUGINS_CATALOG } from '../data/pluginsCatalog';
import { SKILLS_CATALOG } from '../data/skillsCatalog';
import { 
  Boxes, 
  Bot, 
  Sparkles, 
  Terminal, 
  Cpu, 
  Server, 
  Compass, 
  Layers, 
  Download,
  CheckCircle2,
  Loader2,
  Filter,
  FolderOpen,
  RefreshCw,
  Archive,
  Edit3,
  Trash2,
  Check,
  X,
  ChevronDown,
  Globe,
  Package,
  AlertCircle,
  Copy,
  Power,
  PowerOff,
} from 'lucide-react';
import { MCP_CATALOG } from '../data/mcpCatalog';
import { logActivity } from '../services/activityLogger';
import { useToast } from '../context/ToastContext';
import { formatSourceBadge } from '../services/catalogSync';
import { ForgePluginModal } from './ForgePluginModal';
import { DependencyReport } from '../types/dependencies';
import { getRequiredDependencies, evaluateDependencyStatus, getInstallSnippetForPlatform } from '../utils/dependencyResolver';
import { DependencyInstallDrawer } from './DependencyInstallDrawer';

interface PluginsViewProps {
  plugins: ScannedPlugin[];
  selectedAgents: SupportedAgent[];
  allAgents?: SupportedAgent[];
  skills?: ScannedSkill[];
  mcpServers?: ScannedMcpServer[];
  pluginsCatalog?: CatalogPlugin[];
  skillsCatalog?: CatalogSkill[];
  isSyncingCatalog?: boolean;
  onSyncCatalog?: () => Promise<void>;
  catalogSyncedAt?: string | null;
  onCreatePlugin?: () => void;
  onRefreshCapabilities?: () => Promise<void>;
  searchQuery?: string;
  highlightedId?: string | null;
  activeAgentFilter?: string[];
  onAgentFilterChange?: (agentIds: string[]) => void;
  dependencyReport?: DependencyReport | null;
  onRefreshDependencies?: () => Promise<void>;
}

const AGENT_ICON_MAP: Record<string, React.ElementType> = {
  Sparkles,
  Bot,
  Terminal,
  Cpu,
  Boxes,
  Compass,
  Server,
  Layers,
};

type SegmentTab = 'all' | 'installed' | 'available';

interface UnifiedPluginCard {
  id: string;
  name: string;
  version: string;
  description: string;
  category?: string;
  author?: string;
  bundledSkills: string[];
  bundledMcps: string[];
  tags?: string[];
  isCatalog: boolean;
  installedAgents: SupportedAgent[];
  rulesCount?: number;
  sourcePath?: string;
  sourceRegistry?: string;
  license?: string;
  disabledAgentIds?: string[];
  isDisabled?: boolean;
}

const EMPTY_AGENTS: SupportedAgent[] = [];
const pluginSearchCache = new WeakMap<UnifiedPluginCard, string>();

function getPluginSearchString(p: UnifiedPluginCard): string {
  let cached = pluginSearchCache.get(p);
  if (!cached) {
    cached = `${p.name} ${p.description} ${p.category || ''} ${p.author || ''} ${(p.tags || []).join(' ')}`.toLowerCase();
    pluginSearchCache.set(p, cached);
  }
  return cached;
}

export const PluginsView: React.FC<PluginsViewProps> = ({
  plugins,
  selectedAgents,
  allAgents,
  skills,
  mcpServers,
  pluginsCatalog,
  skillsCatalog,
  isSyncingCatalog = false,
  onSyncCatalog,
  catalogSyncedAt,
  onCreatePlugin,
  onRefreshCapabilities,
  searchQuery = '',
  highlightedId,
  activeAgentFilter: propActiveAgentFilter,
  onAgentFilterChange,
  dependencyReport,
  onRefreshDependencies,
}) => {
  const [activeSegment, setActiveSegment] = useState<SegmentTab>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [localAgentFilter, setLocalAgentFilter] = useState<string[]>([]);
  const currentAgentFilter = propActiveAgentFilter !== undefined ? propActiveAgentFilter : localAgentFilter;
  const setAgentFilter = onAgentFilterChange || setLocalAgentFilter;
  const [visibleCount, setVisibleCount] = useState(36);
  const [loadingPluginId, setLoadingPluginId] = useState<string | null>(null);
  const [loadingEditPluginId, setLoadingEditPluginId] = useState<string | null>(null);
  const [depDrawerTarget, setDepDrawerTarget] = useState<{
    targetName: string;
    requiredBinaries: string[];
  } | null>(null);
  const [copiedDepKey, setCopiedDepKey] = useState<string | null>(null);
  const [copiedPluginId, setCopiedPluginId] = useState<string | null>(null);
  const [togglingPluginId, setTogglingPluginId] = useState<string | null>(null);
  const toast = useToast();

  const handleCopyMissingDep = async (key: string, binary: string) => {
    try {
      const snippet = getInstallSnippetForPlatform(binary);
      await navigator.clipboard.writeText(snippet);
      setCopiedDepKey(key);
      toast.success(`Copied install command: "${snippet}"`);
      setTimeout(() => setCopiedDepKey(null), 2000);
    } catch {
      toast.error('Failed to copy install command');
    }
  };

  const handleCopyPluginCommand = async (plugin: UnifiedPluginCard) => {
    try {
      const command = `npx plugins add ${plugin.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      await navigator.clipboard.writeText(command);
      setCopiedPluginId(plugin.id);
      toast.success(`Copied plugin command: "${command}"`);
      setTimeout(() => setCopiedPluginId(null), 2000);
    } catch {
      toast.error('Failed to copy plugin command');
    }
  };
  const [isForgeModalOpen, setIsForgeModalOpen] = useState(false);
  const [editingPluginData, setEditingPluginData] = useState<InstalledPluginDetails | null>(null);
  const [isAgentMenuOpen, setIsAgentMenuOpen] = useState(false);
  const agentMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (agentMenuRef.current && !agentMenuRef.current.contains(e.target as Node)) {
        setIsAgentMenuOpen(false);
      }
    };
    if (isAgentMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isAgentMenuOpen]);

  const activePluginsCatalog = pluginsCatalog || PLUGINS_CATALOG;
  const activeSkillsCatalog = skillsCatalog || SKILLS_CATALOG;

  // Ultra-fast O(N + P) Data Processing with Map lookups
  const unifiedPlugins = useMemo<UnifiedPluginCard[]>(() => {
    const list: UnifiedPluginCard[] = [];
    const processedIds = new Set<string>();

    // 1. Pre-index installed plugins by normalized name/folder in O(P)
    const installedLookup = new Map<string, {
      installedAgents: SupportedAgent[];
      disabledAgentIds: string[];
      matchedPlugin?: any;
    }>();
    for (let i = 0; i < plugins.length; i++) {
      const p = plugins[i];
      const agent = selectedAgents.find((a) => a.id === p.sourceAgentId);
      const keys = [
        p.folderName?.toLowerCase().trim(),
        p.name?.toLowerCase().trim(),
        p.id?.toLowerCase().trim(),
      ].filter(Boolean) as string[];

      for (let k = 0; k < keys.length; k++) {
        const key = keys[k];
        let entry = installedLookup.get(key);
        if (!entry) {
          entry = { installedAgents: [], disabledAgentIds: [], matchedPlugin: p };
          installedLookup.set(key, entry);
        }
        if (agent && !entry.installedAgents.some((a) => a.id === agent.id)) {
          entry.installedAgents.push(agent);
        }
        if (agent && p.disabled && !entry.disabledAgentIds.includes(agent.id)) {
          entry.disabledAgentIds.push(agent.id);
        }
      }
    }

    // 2. Map catalog items with O(1) installed status lookups
    for (let i = 0; i < activePluginsCatalog.length; i++) {
      const cat = activePluginsCatalog[i];
      const catIdLower = cat.id.toLowerCase().trim();
      const catNameLower = cat.name ? cat.name.toLowerCase().trim() : '';
      processedIds.add(catIdLower);
      if (catNameLower) processedIds.add(catNameLower);

      const match = installedLookup.get(catIdLower) || (catNameLower ? installedLookup.get(catNameLower) : undefined);
      const installedOn = match ? match.installedAgents : EMPTY_AGENTS;
      const disabledAgentIds = match ? match.disabledAgentIds : [];
      const isDisabled = installedOn.length > 0 && disabledAgentIds.length >= installedOn.length;
      const matchedInstalled = match?.matchedPlugin;

      list.push({
        id: cat.id,
        name: cat.name,
        version: cat.version,
        description: cat.description,
        category: cat.category,
        author: cat.author,
        bundledSkills: cat.bundledSkills,
        bundledMcps: cat.bundledMcps,
        tags: cat.tags,
        sourceRegistry: cat.sourceRegistry || 'AAS Bundles',
        license: cat.license || 'MIT',
        isCatalog: true,
        installedAgents: installedOn,
        disabledAgentIds,
        isDisabled,
        sourcePath: matchedInstalled?.sourcePath,
      });
    }

    // 3. Add local/custom installed plugins not in catalog
    for (let i = 0; i < plugins.length; i++) {
      const p = plugins[i];
      const folder = (p.folderName || p.name).toLowerCase().trim();
      if (!processedIds.has(folder)) {
        processedIds.add(folder);
        const match = installedLookup.get(folder);
        const installedOn = match ? match.installedAgents : EMPTY_AGENTS;
        const disabledAgentIds = match ? match.disabledAgentIds : [];
        const isDisabled = installedOn.length > 0 && disabledAgentIds.length >= installedOn.length;

        list.push({
          id: p.folderName || p.id,
          name: p.name,
          version: p.version,
          description: p.description,
          category: 'Custom Bundle',
          author: p.author || 'Local',
          bundledSkills: Array(p.skillsCount).fill('Skill'),
          bundledMcps: Array(p.mcpsCount).fill('MCP'),
          rulesCount: p.rulesCount,
          sourceRegistry: 'Local Workspace',
          license: 'Custom',
          isCatalog: false,
          installedAgents: installedOn,
          disabledAgentIds,
          isDisabled,
          sourcePath: p.sourcePath,
        });
      }
    }

    return list;
  }, [plugins, selectedAgents, activePluginsCatalog]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (let i = 0; i < unifiedPlugins.length; i++) {
      const cat = unifiedPlugins[i].category;
      if (cat) set.add(cat);
    }
    return ['All', ...Array.from(set)];
  }, [unifiedPlugins]);

  const counts = useMemo(() => {
    let installed = 0;
    let available = 0;
    const selCount = selectedAgents.length;
    for (let i = 0; i < unifiedPlugins.length; i++) {
      const p = unifiedPlugins[i];
      if (p.installedAgents.length > 0) installed++;
      if (p.isCatalog && p.installedAgents.length < selCount) available++;
    }
    return {
      all: unifiedPlugins.length,
      installed,
      available,
    };
  }, [unifiedPlugins, selectedAgents.length]);

  const filteredPlugins = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const isInstalledOnly = activeSegment === 'installed';
    const isAvailableOnly = activeSegment === 'available';
    const hasCategory = selectedCategory !== 'All';
    const selectedCount = selectedAgents.length;

    // Zero-allocation fast-path
    if (!q && activeSegment === 'all' && !hasCategory && currentAgentFilter.length === 0) {
      return unifiedPlugins;
    }

    const matched: UnifiedPluginCard[] = [];
    for (let i = 0; i < unifiedPlugins.length; i++) {
      const p = unifiedPlugins[i];
      if (isInstalledOnly && p.installedAgents.length === 0) continue;
      if (isAvailableOnly && (!p.isCatalog || p.installedAgents.length >= selectedCount)) continue;
      if (hasCategory && p.category !== selectedCategory) continue;
      if (q && !getPluginSearchString(p).includes(q)) continue;

      if (currentAgentFilter.length > 0) {
        const hasFilteredAgent = p.installedAgents.some((a) => currentAgentFilter.includes(a.id));
        if (isInstalledOnly) {
          if (!hasFilteredAgent) continue;
        } else if (isAvailableOnly) {
          const installedFilteredCount = p.installedAgents.filter((a) => currentAgentFilter.includes(a.id)).length;
          if (installedFilteredCount >= currentAgentFilter.length) continue;
        } else {
          if (p.installedAgents.length > 0 && !hasFilteredAgent) {
            continue;
          }
        }
      }

      matched.push(p);
    }

    return matched;
  }, [unifiedPlugins, activeSegment, selectedCategory, searchQuery, selectedAgents.length, currentAgentFilter]);

  const displayedPlugins = useMemo(() => {
    return filteredPlugins.slice(0, visibleCount);
  }, [filteredPlugins, visibleCount]);

  useEffect(() => {
    setVisibleCount(36);
  }, [searchQuery, activeSegment, selectedCategory, currentAgentFilter]);

  // Identify target plugin match from highlightedId
  const targetPluginMatch = useMemo(() => {
    if (!highlightedId) return null;
    const hLower = highlightedId.toLowerCase().trim();
    return (
      unifiedPlugins.find(
        (p) =>
          p.id.toLowerCase() === hLower ||
          p.name.toLowerCase() === hLower ||
          plugins.some(
            (mp) =>
              mp.id === highlightedId &&
              (mp.name.toLowerCase() === p.name.toLowerCase() ||
                (mp.folderName && mp.folderName.toLowerCase() === p.id.toLowerCase()))
          )
      ) || null
    );
  }, [highlightedId, unifiedPlugins, plugins]);

  // If highlighted item is hidden by category or segment filters, auto-reveal it
  useEffect(() => {
    if (!targetPluginMatch) return;

    // Reset segment if it hides the target
    if (activeSegment === 'installed' && targetPluginMatch.installedAgents.length === 0) {
      setActiveSegment('all');
    } else if (
      activeSegment === 'available' &&
      targetPluginMatch.isCatalog &&
      targetPluginMatch.installedAgents.length >= selectedAgents.length
    ) {
      setActiveSegment('all');
    }

    // Reset category if it hides the target
    if (selectedCategory !== 'All' && targetPluginMatch.category && targetPluginMatch.category !== selectedCategory) {
      setSelectedCategory('All');
    }

    // Reset agent filter if it hides the target
    if (
      currentAgentFilter.length > 0 &&
      !targetPluginMatch.installedAgents.some((a) => currentAgentFilter.includes(a.id))
    ) {
      setAgentFilter([]);
    }
  }, [targetPluginMatch, activeSegment, selectedCategory, currentAgentFilter, selectedAgents.length, setAgentFilter]);

  // Expand pagination if target is beyond current slice
  useEffect(() => {
    if (!targetPluginMatch) return;
    const targetIdx = filteredPlugins.findIndex((p) => p.id === targetPluginMatch.id);
    if (targetIdx !== -1 && targetIdx >= visibleCount) {
      setVisibleCount(targetIdx + 12);
    }
  }, [targetPluginMatch, filteredPlugins, visibleCount]);

  // Scroll into view with multi-attempt polling to handle tab transition & render delays
  useEffect(() => {
    if (!targetPluginMatch && !highlightedId) return;
    const targetCardId = targetPluginMatch ? targetPluginMatch.id : highlightedId;

    let attempts = 0;
    const maxAttempts = 14;
    const intervalId = setInterval(() => {
      attempts++;
      const el =
        document.getElementById(`plugin-card-${targetCardId}`) ||
        document.getElementById(`plugin-card-${highlightedId}`) ||
        document.querySelector('.item-card-highlighted');

      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        clearInterval(intervalId);
      } else if (attempts >= maxAttempts) {
        clearInterval(intervalId);
      }
    }, 50);

    return () => clearInterval(intervalId);
  }, [targetPluginMatch, highlightedId, visibleCount]);

  const handleToggleAgentFilter = (agentId: string | null) => {
    if (!agentId) {
      setAgentFilter([]);
      return;
    }
    if (currentAgentFilter.includes(agentId)) {
      setAgentFilter(currentAgentFilter.filter((id) => id !== agentId));
    } else {
      setAgentFilter([...currentAgentFilter, agentId]);
    }
  };

  const handleAgentPillClick = (agentId: string) => {
    if (currentAgentFilter.length === 1 && currentAgentFilter[0] === agentId) {
      setAgentFilter([]);
    } else {
      setAgentFilter([agentId]);
    }
  };

  // Handlers
  const handleInstallPluginKit = async (plugin: UnifiedPluginCard) => {
    if (!window.electronAPI?.installPlugin) return;

    const targetAgents = selectedAgents.filter(
      (agent) => !plugin.installedAgents.some((inst) => inst.id === agent.id)
    );

    if (targetAgents.length === 0) {
      toast.info(`"${plugin.name}" is already equipped on all selected agents.`);
      return;
    }

    // Skills payload
    const skillsToDownload = (plugin.bundledSkills || []).map((sId) => {
      const cleanId = sId.trim();
      const cat = activeSkillsCatalog.find((c) => 
        c.id === cleanId || 
        c.id === cleanId.split('/').pop() ||
        c.rawUrl?.includes(`/${cleanId}/`)
      );
      const rawUrl = cat?.rawUrl || (
        cleanId.startsWith('skills/')
          ? `https://raw.githubusercontent.com/sickn33/agentic-awesome-skills/main/${cleanId}/SKILL.md`
          : `https://raw.githubusercontent.com/sickn33/agentic-awesome-skills/main/skills/${cleanId}/SKILL.md`
      );
      return { skillId: cat?.id || cleanId.split('/').pop() || cleanId, rawUrl };
    });

    // Bundled MCP server configurations from catalog
    const mcpConfigs: Record<string, any> = {};
    if (plugin.bundledMcps && plugin.bundledMcps.length > 0) {
      for (const mcpId of plugin.bundledMcps) {
        const found = MCP_CATALOG.find((m) => m.id === mcpId);
        if (found) {
          mcpConfigs[found.id] = {
            ...(found.command ? { command: found.command } : {}),
            ...(found.args ? { args: found.args } : {}),
            ...(found.url ? { url: found.url } : {}),
            ...(found.transport ? { transport: found.transport } : {}),
            ...(found.env ? { env: found.env } : {}),
          };
        } else {
          mcpConfigs[mcpId] = {
            command: 'npx',
            args: ['-y', mcpId],
          };
        }
      }
    }

    setLoadingPluginId(plugin.id);
    try {
      const res = await window.electronAPI.installPlugin({
        pluginId: plugin.id,
        name: plugin.name,
        version: plugin.version || '1.0.0',
        description: plugin.description || '',
        author: plugin.author || 'AgentForge Catalog',
        category: plugin.category || 'General',
        tags: plugin.tags || [],
        bundledSkills: plugin.bundledSkills || [],
        bundledMcps: plugin.bundledMcps || [],
        mcpConfigs,
        skills: skillsToDownload,
        targets: targetAgents.map((a) => ({
          agentId: a.id,
          skillsDir: a.paths.skillsDir,
          pluginsDir: a.paths.pluginsDir,
          mcpConfigPath: a.paths.mcpConfigPath,
        })),
      });

      if (res.success) {
        toast.success(`Equipped kit "${plugin.name}" on ${targetAgents.map((a) => a.name).join(', ')}`);
        logActivity({
          type: 'PLUGIN',
          title: 'Plugin Kit Equipped',
          description: `Equipped kit "${plugin.name}" (${(plugin.bundledSkills || []).length} skills) on ${targetAgents.map((a) => a.name).join(', ')}`,
          status: 'success',
        });
        if (onRefreshCapabilities) {
          await onRefreshCapabilities();
        }
      } else {
        toast.error(`Error: ${res.error || 'Failed to install plugin kit'}`);
        logActivity({
          type: 'PLUGIN',
          title: 'Kit Equip Failed',
          description: `Failed to equip "${plugin.name}": ${res.error || 'Unknown error'}`,
          status: 'error',
        });
      }
    } catch (err: any) {
      toast.error(`Error: ${err.message || 'Installation failed'}`);
      logActivity({
        type: 'PLUGIN',
        title: 'Kit Equip Error',
        description: `Error installing kit "${plugin.name}": ${err.message || 'Unknown error'}`,
        status: 'error',
      });
    } finally {
      setLoadingPluginId(null);
    }
  };

  // Uninstall Plugin
  const handleUninstallPlugin = async (plugin: UnifiedPluginCard) => {
    if (!window.electronAPI?.uninstallPlugin) return;

    const targetAgents = selectedAgents.filter((agent) =>
      plugin.installedAgents.some((inst) => inst.id === agent.id)
    );
    if (targetAgents.length === 0) return;

    setLoadingPluginId(plugin.id);
    try {
      const res = await window.electronAPI.uninstallPlugin({
        pluginId: plugin.id,
        folderName: plugin.id,
        targets: targetAgents.map((a) => ({
          agentId: a.id,
          pluginsDir: a.paths.pluginsDir,
        })),
      });

      if (res.success) {
        toast.success(`Removed "${plugin.name}" from ${targetAgents.map((a) => a.name).join(', ')}`);
        logActivity({
          type: 'PLUGIN',
          title: 'Plugin Removed',
          description: `Removed "${plugin.name}" from ${targetAgents.map((a) => a.name).join(', ')}`,
          status: 'success',
        });
        if (onRefreshCapabilities) {
          await onRefreshCapabilities();
        }
      } else {
        toast.error(`Error: ${res.error || 'Failed to remove plugin'}`);
      }
    } catch (err: any) {
      toast.error(`Error: ${err.message || 'Uninstall failed'}`);
    } finally {
      setLoadingPluginId(null);
    }
  };

  // Enable / Disable Plugin Toggle
  const handleTogglePlugin = async (plugin: UnifiedPluginCard) => {
    if (!window.electronAPI?.togglePlugin) return;

    const targetAgents = plugin.installedAgents.filter((agent) =>
      selectedAgents.length === 0 || selectedAgents.some((sel) => sel.id === agent.id)
    );
    const effectiveTargets = targetAgents.length > 0 ? targetAgents : plugin.installedAgents;
    if (effectiveTargets.length === 0) return;

    const newEnabledState = Boolean(plugin.isDisabled);
    setTogglingPluginId(plugin.id);
    try {
      const res = await window.electronAPI.togglePlugin({
        pluginId: plugin.id,
        folderName: plugin.id,
        enabled: newEnabledState,
        targets: effectiveTargets.map((a) => ({
          agentId: a.id,
          pluginsDir: a.paths.pluginsDir,
        })),
      });

      if (res.success) {
        toast.success(`${newEnabledState ? 'Enabled' : 'Disabled'} plugin kit "${plugin.name}" on ${effectiveTargets.map((a) => a.name).join(', ')}`);
        logActivity({
          type: 'PLUGIN',
          title: newEnabledState ? 'Plugin Enabled' : 'Plugin Disabled',
          description: `${newEnabledState ? 'Enabled' : 'Disabled'} "${plugin.name}" on ${effectiveTargets.map((a) => a.name).join(', ')}`,
          status: newEnabledState ? 'success' : 'info',
        });
        if (onRefreshCapabilities) {
          await onRefreshCapabilities();
        }
      } else {
        toast.error(`Error: ${res.error || 'Failed to toggle plugin'}`);
      }
    } catch (err: any) {
      toast.error(`Error: ${err.message || 'Toggle failed'}`);
    } finally {
      setTogglingPluginId(null);
    }
  };

  // Open folder
  const handleOpenPluginFolder = (plugin: UnifiedPluginCard) => {
    if (!window.electronAPI?.openPath) return;
    if (plugin.sourcePath) {
      window.electronAPI.openPath(plugin.sourcePath);
      return;
    }
    const agent = plugin.installedAgents[0];
    if (agent?.paths?.pluginsDir) {
      window.electronAPI.openPath(agent.paths.pluginsDir);
    } else if (agent?.paths?.skillsDir) {
      window.electronAPI.openPath(agent.paths.skillsDir);
    }
  };

  // Edit Plugin
  const handleEditPlugin = async (plugin: UnifiedPluginCard) => {
    if (!plugin.sourcePath || !window.electronAPI?.loadPluginDetails) return;
    setLoadingEditPluginId(plugin.id);
    try {
      const details = await window.electronAPI.loadPluginDetails(plugin.sourcePath);
      if (details && details.success) {
        setEditingPluginData(details);
        setIsForgeModalOpen(true);
      } else {
        toast.error(`Failed to read plugin details: ${details?.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      toast.error(`Error loading plugin details: ${err.message || 'Unknown error'}`);
    } finally {
      setLoadingEditPluginId(null);
    }
  };

  // Export ZIP
  const handleExportPluginZip = async (plugin: UnifiedPluginCard) => {
    if (!plugin.sourcePath || !window.electronAPI?.exportInstalledPluginZip) return;
    try {
      const cleanSlug = plugin.name.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      const res = await window.electronAPI.exportInstalledPluginZip({
        pluginPath: plugin.sourcePath,
        defaultZipName: `${cleanSlug}-v${plugin.version || '1.0.0'}.zip`,
      });
      if (res.success && res.exportPath) {
        toast.success(`Exported "${plugin.name}" to .ZIP archive!`);
        logActivity({
          type: 'PLUGIN',
          title: `Exported "${plugin.name}" as .ZIP`,
          description: `Generated archive at ${res.exportPath}`,
          status: 'success',
        });
      }
    } catch (err: any) {
      toast.error(`Failed to export ZIP: ${err.message}`);
    }
  };

  return (
    <div className="plugins-view-container">
      {/* Header */}
      <div className="plugins-view-header">
        <div className="header-info">
          <div className="title-line">
            <h2 className="view-title">Plugins & Curated Kits</h2>
            <span className="count-pill font-mono">{plugins.length} INSTALLED</span>
            <span className="catalog-pill font-mono">{activePluginsCatalog.length.toLocaleString()} IN CLOUD CATALOG</span>
            {catalogSyncedAt && (
              <span className="sync-pill font-mono" title={`Synced with AAS: ${new Date(catalogSyncedAt).toLocaleString()}`}>
                <CheckCircle2 size={10} /> AAS SYNCED
              </span>
            )}
          </div>
          <p className="view-desc">
            Complete multi-skill bundles equipping your selected agent(s) with high-utility capability kits.
          </p>
        </div>

        <div className="header-actions-wrap">
          {/* Segmented Controls on the right */}
          <div className="segmented-controls">
            <button
              className={`segment-btn ${activeSegment === 'all' ? 'active' : ''}`}
              onClick={() => setActiveSegment('all')}
            >
              All <span className="segment-count">{counts.all}</span>
            </button>
            <button
              className={`segment-btn ${activeSegment === 'installed' ? 'active' : ''}`}
              onClick={() => setActiveSegment('installed')}
            >
              Installed <span className="segment-count">{counts.installed}</span>
            </button>
            <button
              className={`segment-btn ${activeSegment === 'available' ? 'active' : ''}`}
              onClick={() => setActiveSegment('available')}
            >
              Available Kits <span className="segment-count">{counts.available}</span>
            </button>

            {onSyncCatalog && (
              <>
                <div className="segment-divider" />
                <button
                  className={`segment-sync-btn ${isSyncingCatalog ? 'syncing' : ''}`}
                  onClick={onSyncCatalog}
                  disabled={isSyncingCatalog}
                  title={isSyncingCatalog ? 'Syncing cloud kits from GitHub...' : 'Sync latest plugin bundles from sickn33/agentic-awesome-skills'}
                  aria-label="Sync Cloud Kits"
                >
                  <RefreshCw size={12} className={isSyncingCatalog ? 'spin' : ''} />
                </button>
              </>
            )}
          </div>

          <div className="header-buttons-row">
            <button
              className="import-action-btn"
              onClick={() => {
                setEditingPluginData(null);
                if (onCreatePlugin) {
                  onCreatePlugin();
                } else {
                  setIsForgeModalOpen(true);
                }
              }}
              title="Forge and bundle custom capabilities into a shareable plugin kit"
            >
              <Sparkles size={12} />
              <span>Forge Plugin</span>
            </button>
          </div>
        </div>
      </div>

      {/* Category Pills Bar with Floating Agent Filter Dropdown */}
      <div className="category-toolbar-row">
        {/* Left: Category Pills with Category Label */}
        <div className="category-pills">
          <div className="category-label">
            <Filter size={12} />
            <span>Category:</span>
          </div>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`cat-pill ${selectedCategory === cat ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Right: Floating Agent Filter Menu (if >1 agent selected) */}
        {selectedAgents.length > 1 && (
          <div className="agent-dropdown-wrapper" ref={agentMenuRef}>
            <button
              type="button"
              className={`agent-dropdown-trigger ${currentAgentFilter.length > 0 ? 'filtered' : ''}`}
              onClick={() => setIsAgentMenuOpen((prev) => !prev)}
              title="Filter plugins to specific target agents"
            >
              <Bot size={12} className="agent-trigger-bot-icon" />
              <span className="agent-trigger-text">
                {currentAgentFilter.length === 0
                  ? `All Agents (${selectedAgents.length})`
                  : currentAgentFilter.length === 1
                  ? selectedAgents.find((a) => a.id === currentAgentFilter[0])?.name || '1 Agent'
                  : `${currentAgentFilter.length} Agents`}
              </span>
              <ChevronDown
                size={11}
                className={`agent-trigger-chevron ${isAgentMenuOpen ? 'open' : ''}`}
              />
            </button>

            {currentAgentFilter.length > 0 && (
              <button
                type="button"
                className="agent-quick-reset-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleAgentFilter(null);
                }}
                title="Clear agent filter"
              >
                <X size={10} />
              </button>
            )}

            {isAgentMenuOpen && (
              <div className="toolbar-agent-dropdown-menu">
                <div className="toolbar-dropdown-header">
                  <span>Filter by Agent</span>
                  {currentAgentFilter.length > 0 && (
                    <button
                      type="button"
                      className="toolbar-dropdown-reset-btn"
                      onClick={() => {
                        handleToggleAgentFilter(null);
                      }}
                    >
                      Reset
                    </button>
                  )}
                </div>

                <div className="toolbar-dropdown-list">
                  <button
                    type="button"
                    className={`toolbar-dropdown-item ${currentAgentFilter.length === 0 ? 'selected' : ''}`}
                    onClick={() => {
                      handleToggleAgentFilter(null);
                      setIsAgentMenuOpen(false);
                    }}
                  >
                    <div className="toolbar-dropdown-item-left">
                      <span className="toolbar-dropdown-item-icon">
                        <Bot size={13} />
                      </span>
                      <span className="toolbar-dropdown-item-name">All Selected Agents</span>
                    </div>
                    <div className="toolbar-dropdown-item-right">
                      <span className="toolbar-dropdown-item-count">{selectedAgents.length}</span>
                      {currentAgentFilter.length === 0 && <Check size={12} className="toolbar-dropdown-item-check" />}
                    </div>
                  </button>

                  <div className="toolbar-dropdown-divider" />

                  {selectedAgents.map((ag) => {
                    const isFiltered = currentAgentFilter.includes(ag.id);
                    const agentPluginsCount = plugins.filter((p) => p.sourceAgentId === ag.id).length;
                    const AgentIcon = AGENT_ICON_MAP[ag.iconName] || Bot;
                    return (
                      <button
                        type="button"
                        key={ag.id}
                        className={`toolbar-dropdown-item ${isFiltered ? 'selected' : ''}`}
                        onClick={() => handleToggleAgentFilter(ag.id)}
                      >
                        <div className="toolbar-dropdown-item-left">
                          <span
                            className="toolbar-dropdown-item-dot"
                            style={{ background: ag.color }}
                          />
                          <AgentIcon size={12} style={{ color: ag.color }} />
                          <span className="toolbar-dropdown-item-name">{ag.name}</span>
                        </div>
                        <div className="toolbar-dropdown-item-right">
                          <span className="toolbar-dropdown-item-count">{agentPluginsCount}</span>
                          {isFiltered && <Check size={12} className="toolbar-dropdown-item-check" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Content Area */}
      {selectedAgents.length === 0 ? (
        <div className="empty-state-card">
          <div className="empty-icon-wrap">
            <Bot size={28} />
          </div>
          <div className="empty-title">No Target Agents Selected</div>
          <div className="empty-desc">
            Use the agent selector dropdown in the top bar to choose which AI agents to equip.
          </div>
        </div>
      ) : filteredPlugins.length === 0 ? (
        <div className="empty-state-card">
          <div className="empty-icon-wrap">
            <Boxes size={28} />
          </div>
          <div className="empty-title">
            {searchQuery ? 'No matching plugins found' : 'No plugins in this view'}
          </div>
          <div className="empty-desc">
            {searchQuery
              ? `No plugins match "${searchQuery}". Try another search query.`
              : activeSegment === 'installed'
              ? 'No plugins are currently installed in your selected agents. Switch to "Available Kits" to install with 1-click.'
              : 'All catalog plugin kits are already equipped on your selected agents.'}
          </div>
        </div>
      ) : (
        <>
          <div className="plugins-grid">
            {displayedPlugins.map((plugin) => {
            const isInstalledOnAll =
              selectedAgents.length > 0 && plugin.installedAgents.length === selectedAgents.length;
            const isPartiallyInstalled =
              plugin.installedAgents.length > 0 && plugin.installedAgents.length < selectedAgents.length;
            const isHighlighted = targetPluginMatch
              ? targetPluginMatch.id === plugin.id
              : highlightedId === plugin.id ||
                plugins.some((p) => p.id === highlightedId && (p.folderName === plugin.id || p.name === plugin.name));
            const isLoading = loadingPluginId === plugin.id;

            const requiredBinaries = getRequiredDependencies({
              name: plugin.name,
              description: plugin.description,
              category: plugin.category,
              tags: plugin.tags,
            });
            const depStatus = evaluateDependencyStatus(requiredBinaries, dependencyReport || null);

            return (
              <div
                key={plugin.id}
                id={`plugin-card-${plugin.id}`}
                className={`plugin-card ${isHighlighted ? 'item-card-highlighted' : ''} ${plugin.isDisabled ? 'is-card-disabled' : ''}`}
              >
                {/* 1. Header: Icon Avatar + Name/Version + Status */}
                <div className="card-header-cluster">
                  <div className="card-header-left">
                    <div className="card-icon-avatar plugin">
                      <Boxes size={16} />
                    </div>
                    <div className="card-identity-text">
                      <div className="card-title-row">
                        <span className="card-item-name" title={plugin.name}>{plugin.name}</span>
                        <span className="version-badge font-mono">v{plugin.version}</span>
                      </div>
                      <div className="card-sub-meta">
                        {plugin.category && (
                          <span className="card-cat-text font-mono">{plugin.category}</span>
                        )}
                        {plugin.category && plugin.author && (
                          <span className="card-meta-dot">·</span>
                        )}
                        {plugin.author && (
                          <span className="author-text font-mono">by {plugin.author}</span>
                        )}
                        {plugin.sourceRegistry && (() => {
                          const badge = formatSourceBadge(plugin.sourceRegistry);
                          return (
                            <>
                              <span className="card-meta-dot">·</span>
                              <span
                                className={`source-registry-pill font-mono ${badge.badgeClass}`}
                                title={`${badge.tooltip} · License: ${plugin.license || 'MIT'}`}
                              >
                                {badge.badgeText}
                              </span>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>

                  <div className="card-header-right">
                    {depStatus.status !== 'none' && (
                      <div className="dep-badge-cluster">
                        <button
                          type="button"
                          className={`dep-badge ${
                            depStatus.status === 'ready'
                              ? 'ready'
                              : depStatus.firstMissing === 'docker' || depStatus.firstMissing === 'go'
                              ? 'missing-amber'
                              : 'missing-rose'
                          } font-mono`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setDepDrawerTarget({
                              targetName: plugin.name,
                              requiredBinaries,
                            });
                          }}
                          title={
                            depStatus.status === 'ready'
                              ? `Prerequisites: ${requiredBinaries.join(', ')} (Verified on system PATH). Click to inspect.`
                              : `Missing prerequisite: ${depStatus.missingBinaries.join(', ')}. Click for 1-click install snippets.`
                          }
                        >
                          {depStatus.status === 'ready' ? (
                            <>
                              <CheckCircle2 size={10} className="dep-badge-icon" />
                              <span>Ready</span>
                            </>
                          ) : (
                            <>
                              <AlertCircle size={10} className="dep-badge-icon" />
                              <span>Missing: {depStatus.firstMissing}</span>
                            </>
                          )}
                        </button>

                        {depStatus.status === 'missing' && depStatus.firstMissing && (
                          <button
                            type="button"
                            className={`dep-badge-quick-copy ${copiedDepKey === `dep-${plugin.id}` ? 'copied' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyMissingDep(`dep-${plugin.id}`, depStatus.firstMissing!);
                            }}
                            title={`Copy install command: ${getInstallSnippetForPlatform(depStatus.firstMissing)}`}
                            aria-label="Copy prerequisite install command"
                          >
                            {copiedDepKey === `dep-${plugin.id}` ? <Check size={10} /> : <Copy size={10} />}
                          </button>
                        )}
                      </div>
                    )}

                    {isInstalledOnAll ? (
                      <button
                        type="button"
                        className={`status-pill-clean ${plugin.isDisabled ? 'disabled' : 'installed'} font-mono clickable`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTogglePlugin(plugin);
                        }}
                        title={plugin.isDisabled ? 'Plugin kit is disabled. Click to enable.' : 'Plugin kit is enabled. Click to disable.'}
                      >
                        <span className={`status-dot ${plugin.isDisabled ? 'disabled' : 'installed'}`} />
                        <span>{plugin.isDisabled ? 'DISABLED' : 'INSTALLED'}</span>
                      </button>
                    ) : isPartiallyInstalled ? (
                      <button
                        type="button"
                        className={`status-pill-clean ${plugin.isDisabled ? 'disabled' : 'partial'} font-mono clickable`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTogglePlugin(plugin);
                        }}
                        title={plugin.isDisabled ? 'Plugin kit is disabled. Click to enable.' : `Equipped on ${plugin.installedAgents.length}/${selectedAgents.length} agents. Click to toggle.`}
                      >
                        <span className={`status-dot ${plugin.isDisabled ? 'disabled' : 'partial'}`} />
                        <span>{plugin.isDisabled ? 'DISABLED' : `PARTIAL (${plugin.installedAgents.length}/${selectedAgents.length})`}</span>
                      </button>
                    ) : (
                      <span className="status-pill-clean available font-mono">
                        <span className="status-dot available" />
                        <span>AVAILABLE</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* 2. Body: Description + Bundled capabilities + Equipped Agents */}
                <div className="card-content-body">
                  <p className="card-description-text">{plugin.description}</p>

                  <div className="bundled-stats-row">
                    {plugin.bundledSkills.length > 0 || plugin.bundledMcps.length > 0 ? (
                      <>
                        <span className="meta-subtle-badge skills font-mono">
                          <Sparkles size={11} />
                          <span>{plugin.bundledSkills.length} Skills</span>
                        </span>
                        <span className="meta-subtle-badge mcps font-mono">
                          <Server size={11} />
                          <span>{plugin.bundledMcps.length} MCPs</span>
                        </span>
                      </>
                    ) : (
                      <span className="meta-subtle-badge font-mono" style={{ color: '#38bdf8' }}>
                        <Package size={11} />
                        <span>Plugin Extension</span>
                      </span>
                    )}
                  </div>

                  {plugin.installedAgents.length > 0 && (
                    <div className="equipped-agents-bar">
                      <span className="equipped-label font-mono">Active on:</span>
                      <div className="equipped-pills-list">
                        {plugin.installedAgents.map((ag) => {
                          const AgentIcon = AGENT_ICON_MAP[ag.iconName] || Bot;
                          const isThisFiltered = currentAgentFilter.includes(ag.id);
                          return (
                            <button
                              type="button"
                              key={ag.id}
                              className={`agent-pill clickable ${isThisFiltered ? 'filtered-active' : ''}`}
                              style={{
                                color: ag.color,
                                borderColor: isThisFiltered ? `${ag.color}80` : `${ag.color}35`,
                                background: isThisFiltered ? `${ag.color}20` : `${ag.color}0d`,
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAgentPillClick(ag.id);
                              }}
                              title={isThisFiltered ? `Filtered by ${ag.name} (click to clear)` : `Click to filter by ${ag.name}`}
                            >
                              <AgentIcon size={10} />
                              <span>{ag.name}</span>
                              {isThisFiltered && <Check size={9} />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. Bottom Toolbar */}
                <div className="card-bottom-toolbar">
                  <div className="toolbar-left-chips">
                    {plugin.sourceRegistry && (
                      <span
                        className="meta-subtle-badge source-badge font-mono"
                        title={`Source: ${plugin.sourceRegistry} (${plugin.license || 'MIT'})`}
                      >
                        <Globe size={11} />
                        <span>{plugin.sourceRegistry}</span>
                      </span>
                    )}
                    <span className="source-path-clean font-mono" title={plugin.id}>
                      {plugin.id}
                    </span>
                  </div>

                  <div className="toolbar-right-actions">
                    {/* Enable / Disable Toggle Button */}
                    {plugin.installedAgents.length > 0 && (
                      <button
                        type="button"
                        className={`card-action-icon-btn toggle-state-btn ${plugin.isDisabled ? 'disabled-state' : 'active-state'}`}
                        onClick={() => handleTogglePlugin(plugin)}
                        disabled={togglingPluginId === plugin.id}
                        title={plugin.isDisabled ? 'Enable plugin kit in equipped agent(s)' : 'Disable plugin kit without uninstalling'}
                        aria-label={plugin.isDisabled ? 'Enable plugin kit' : 'Disable plugin kit'}
                      >
                        {togglingPluginId === plugin.id ? (
                          <Loader2 size={13} className="spin" />
                        ) : plugin.isDisabled ? (
                          <PowerOff size={13} style={{ color: '#fb7185' }} />
                        ) : (
                          <Power size={13} style={{ color: '#34d399' }} />
                        )}
                      </button>
                    )}

                    {/* Edit Button for Installed Plugins */}
                    {plugin.installedAgents.length > 0 && plugin.sourcePath && (
                      <button
                        type="button"
                        className="card-action-icon-btn edit"
                        onClick={() => handleEditPlugin(plugin)}
                        disabled={loadingEditPluginId === plugin.id}
                        title="Edit plugin skills, MCP servers, and behavioral rules"
                        aria-label="Edit Plugin"
                      >
                        {loadingEditPluginId === plugin.id ? (
                          <Loader2 size={13} className="spin" />
                        ) : (
                          <Edit3 size={13} />
                        )}
                      </button>
                    )}

                    {/* Open Folder Button for Installed Plugins */}
                    {plugin.installedAgents.length > 0 && (
                      <button
                        type="button"
                        className="card-action-icon-btn"
                        onClick={() => handleOpenPluginFolder(plugin)}
                        title="Open plugin directory in File Explorer"
                      >
                        <FolderOpen size={13} />
                      </button>
                    )}

                    {/* Export as ZIP for Installed Plugins */}
                    {plugin.installedAgents.length > 0 && plugin.sourcePath && (
                      <button
                        type="button"
                        className="card-action-icon-btn"
                        onClick={() => handleExportPluginZip(plugin)}
                        title="Export this installed plugin as a shareable .ZIP archive"
                      >
                        <Archive size={13} />
                      </button>
                    )}

                    {/* Manual Install / CLI Copy Button */}
                    <button
                      type="button"
                      className={`card-action-icon-btn ${copiedPluginId === plugin.id ? 'active-copied' : ''}`}
                      onClick={() => handleCopyPluginCommand(plugin)}
                      title="Copy CLI command for manual plugin installation"
                      aria-label="Copy plugin manual install command"
                    >
                      {copiedPluginId === plugin.id ? <Check size={13} style={{ color: '#34d399' }} /> : <Copy size={13} />}
                    </button>

                    {/* Uninstall Button for Installed Plugins */}
                    {plugin.installedAgents.length > 0 && (
                      <button
                        type="button"
                        className="card-action-icon-btn danger"
                        onClick={() => handleUninstallPlugin(plugin)}
                        disabled={loadingPluginId === plugin.id}
                        title="Uninstall plugin from selected agent(s)"
                        aria-label="Uninstall Plugin"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}

                    {/* Install Button */}
                    {(!isInstalledOnAll && plugin.isCatalog) && (
                      <button
                        type="button"
                        className="card-primary-action-btn plugin"
                        onClick={() => handleInstallPluginKit(plugin)}
                        disabled={isLoading}
                      >
                        {isLoading ? (
                          <>
                            <Loader2 size={11} className="spin" />
                            <span>Installing...</span>
                          </>
                        ) : (
                          <>
                            <Download size={11} />
                            <span>
                              {isPartiallyInstalled
                                ? `Equip (${selectedAgents.length - plugin.installedAgents.length})`
                                : selectedAgents.length > 1
                                ? `Equip to ${selectedAgents.length}`
                                : 'Install Kit'}
                            </span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filteredPlugins.length > visibleCount && (
          <div className="load-more-wrap">
            <button
              className="load-more-btn font-mono"
              onClick={() => setVisibleCount((prev) => prev + 36)}
            >
              <span>Show more plugins ({displayedPlugins.length} of {filteredPlugins.length})</span>
            </button>
          </div>
        )}
      </>
    )}

      {/* Forge Skill Kit & Plugin Bundler Modal */}
      <ForgePluginModal
        isOpen={isForgeModalOpen}
        onClose={() => {
          setIsForgeModalOpen(false);
          setEditingPluginData(null);
        }}
        editingPlugin={editingPluginData}
        agents={allAgents && allAgents.length > 0 ? allAgents : selectedAgents}
        skills={skills || []}
        mcpServers={mcpServers || []}
        onPluginForged={async (pluginName, action, countOrPath) => {
          if (action === 'install') {
            toast.success(
              editingPluginData
                ? `Successfully updated "${pluginName}" on ${countOrPath} agent(s)!`
                : `Successfully forged and equipped "${pluginName}" to ${countOrPath} agent(s)!`
            );
            if (onRefreshCapabilities) {
              await onRefreshCapabilities();
            }
          } else {
            toast.success(`Successfully forged "${pluginName}" bundle!`);
          }
        }}
      />

      <DependencyInstallDrawer
        isOpen={Boolean(depDrawerTarget)}
        onClose={() => setDepDrawerTarget(null)}
        targetName={depDrawerTarget?.targetName || ''}
        requiredBinaries={depDrawerTarget?.requiredBinaries || []}
        report={dependencyReport || null}
        onRefreshReport={async () => {
          if (onRefreshDependencies) {
            await onRefreshDependencies();
          }
        }}
      />

      <style>{`
        .plugins-view-container {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .plugins-view-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          background: #121826;
          border: 1px solid #1e283d;
          border-radius: 10px;
          padding: 14px 20px;
        }

        .header-info {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
          flex: 1;
        }

        .title-line {
          display: flex;
          align-items: center;
          gap: 9px;
          flex-wrap: wrap;
        }

        .view-title {
          font-size: 16px;
          font-weight: 700;
          color: #f8fafc;
          margin: 0;
        }

        .plugins-view-header .count-pill {
          font-size: 10px;
          font-weight: 700;
          color: #38bdf8;
          background: rgba(56, 189, 248, 0.12);
          padding: 2px 7px;
          border-radius: 4px;
          border: 1px solid rgba(56, 189, 248, 0.25);
        }

        .catalog-pill {
          font-size: 10px;
          font-weight: 700;
          color: #c084fc;
          background: rgba(192, 132, 252, 0.12);
          padding: 2px 7px;
          border-radius: 4px;
          border: 1px solid rgba(192, 132, 252, 0.25);
        }

        .sync-pill {
          font-size: 10px;
          font-weight: 700;
          color: #38bdf8;
          background: rgba(56, 189, 248, 0.12);
          padding: 2px 7px;
          border-radius: 4px;
          border: 1px solid rgba(56, 189, 248, 0.25);
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }

        .view-desc {
          font-size: 12px;
          color: #8899ac;
          margin: 0;
        }

        .header-actions-wrap {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-shrink: 0;
        }

        .header-buttons-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .segment-divider {
          width: 1px;
          height: 14px;
          background: #1c273c;
          margin: 0 2px;
          flex-shrink: 0;
        }

        .segment-sync-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 22px;
          height: 22px;
          padding: 0;
          background: transparent;
          border: none;
          border-radius: 4px;
          color: #8899ac;
          cursor: pointer;
          transition: all 0.15s ease;
          flex-shrink: 0;
          box-sizing: border-box;
        }

        .segment-sync-btn:hover:not(:disabled) {
          background: #141c2c;
          color: #93c5fd;
        }

        .segment-sync-btn.syncing {
          color: #60a5fa;
        }

        .segment-sync-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .import-action-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          background: linear-gradient(135deg, #7c3aed, #6366f1);
          border: 1px solid rgba(124, 58, 237, 0.35);
          color: #ffffff;
          font-size: 11px;
          font-weight: 600;
          padding: 0 12px;
          height: 28px;
          border-radius: 5px;
          cursor: pointer;
          transition: all 0.15s ease;
          white-space: nowrap;
          box-sizing: border-box;
          box-shadow: 0 2px 8px rgba(124, 58, 237, 0.25);
        }

        .import-action-btn:hover {
          filter: brightness(1.1);
          box-shadow: 0 3px 12px rgba(124, 58, 237, 0.4);
        }

        .segmented-controls {
          display: flex;
          align-items: center;
          height: 28px;
          background: #0b0f19;
          border: 1px solid #223048;
          border-radius: 6px;
          padding: 2px;
          gap: 2px;
          box-sizing: border-box;
        }

        .segment-btn {
          background: transparent;
          border: 1px solid transparent;
          color: #8899ac;
          font-size: 11px;
          font-weight: 600;
          padding: 0 9px;
          height: 22px;
          border-radius: 4px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          transition: all 0.15s ease;
          white-space: nowrap;
          box-sizing: border-box;
        }

        .segment-btn:hover {
          color: #f1f5f9;
        }

        .segment-btn.active {
          background: #1e2a42;
          color: #ffffff;
          border-color: rgba(255, 255, 255, 0.09);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
        }

        .segment-count {
          font-size: 9.5px;
          background: rgba(255, 255, 255, 0.08);
          padding: 1px 5px;
          border-radius: 10px;
          font-family: monospace;
        }
        /* Category Toolbar Row */
        .category-toolbar-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          background: #0f1523;
          border: 1px solid #182235;
          padding: 0 10px;
          height: 36px;
          min-height: 36px;
          max-height: 36px;
          border-radius: 7px;
          box-sizing: border-box;
          position: relative;
          z-index: 50;
        }

        .category-pills {
          display: flex;
          align-items: center;
          gap: 5px;
          overflow-x: auto;
          flex: 1;
          min-width: 0;
          height: 100%;
          padding: 0;
        }

        .category-pills::-webkit-scrollbar {
          height: 3px;
        }

        .category-pills::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.02);
          border-radius: 9999px;
        }

        .category-pills::-webkit-scrollbar-thumb {
          background: #27354f;
          border-radius: 9999px;
        }

        .category-pills::-webkit-scrollbar-thumb:hover {
          background: #3b4e72;
        }

        .category-label {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          color: #64748b;
          font-size: 10.5px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          flex-shrink: 0;
          position: sticky;
          left: 0;
          z-index: 2;
          background: #0f1523;
          padding-right: 6px;
          height: 22px;
          line-height: 1;
          box-sizing: border-box;
          user-select: none;
        }

        .cat-pill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: #141c2c;
          border: 1px solid #1f2b42;
          color: #94a3b8;
          font-size: 10.5px;
          font-weight: 500;
          padding: 0 9px;
          height: 22px;
          min-height: 22px;
          max-height: 22px;
          line-height: 1;
          border-radius: 4px;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.12s ease;
          flex-shrink: 0;
          box-sizing: border-box;
        }

        .cat-pill:hover {
          background: #1c263c;
          color: #e2e8f0;
        }

        .cat-pill.active {
          background: #1e2a42;
          border-color: #334155;
          color: #ffffff;
          font-weight: 600;
        }

        /* Agent Dropdown Filter */
        .agent-dropdown-wrapper {
          display: flex;
          align-items: center;
          gap: 4px;
          flex-shrink: 0;
          position: relative;
          z-index: 60;
          height: 22px;
          align-self: center;
        }

        .agent-dropdown-trigger {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          background: #141c2c;
          border: 1px solid #1f2b42;
          color: #94a3b8;
          font-size: 10.5px;
          font-weight: 500;
          height: 22px;
          min-height: 22px;
          max-height: 22px;
          line-height: 1;
          padding: 0 8px;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.12s ease;
          user-select: none;
          white-space: nowrap;
          box-sizing: border-box;
        }

        .agent-dropdown-trigger:hover {
          background: #1c263c;
          border-color: #2e3e5c;
          color: #e2e8f0;
        }

        .agent-dropdown-trigger.filtered {
          background: #1e2a42;
          border-color: #334155;
          color: #ffffff;
          font-weight: 600;
        }

        .agent-trigger-bot-icon {
          color: #38bdf8;
          flex-shrink: 0;
        }

        .agent-trigger-text {
          max-width: 140px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .agent-trigger-chevron {
          color: #64748b;
          transition: transform 0.2s ease;
          flex-shrink: 0;
        }

        .agent-trigger-chevron.open {
          transform: rotate(180deg);
        }

        .agent-quick-reset-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 22px;
          height: 22px;
          min-height: 22px;
          max-height: 22px;
          border-radius: 4px;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.25);
          color: #f87171;
          cursor: pointer;
          transition: all 0.12s ease;
          padding: 0;
          box-sizing: border-box;
        }

        .agent-quick-reset-btn:hover {
          background: rgba(239, 68, 68, 0.2);
          border-color: rgba(239, 68, 68, 0.45);
          color: #ef4444;
        }

        .toolbar-agent-dropdown-menu {
          position: absolute;
          top: calc(100% + 6px);
          right: 0;
          left: auto !important;
          background: #0d1320;
          border: 1px solid #1f2b42;
          box-shadow: 0 16px 36px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.06);
          border-radius: 8px;
          min-width: 220px;
          max-width: 280px;
          width: max-content;
          padding: 6px;
          z-index: 1000;
          animation: dropdownFadeIn 0.15s ease-out forwards;
          box-sizing: border-box;
        }

        @keyframes dropdownFadeIn {
          from {
            opacity: 0;
            transform: translateY(-4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .toolbar-dropdown-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 4px 8px 6px;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #64748b;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          margin-bottom: 4px;
        }

        .toolbar-dropdown-reset-btn {
          background: transparent;
          border: none;
          color: #f87171;
          font-size: 10px;
          font-weight: 600;
          cursor: pointer;
          padding: 0;
          transition: color 0.12s ease;
        }

        .toolbar-dropdown-reset-btn:hover {
          color: #ef4444;
          text-decoration: underline;
        }

        .toolbar-dropdown-list {
          display: flex;
          flex-direction: column;
          gap: 2px;
          max-height: min(220px, calc(100vh - 280px));
          overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color: rgba(255, 255, 255, 0.15) transparent;
        }

        .toolbar-dropdown-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          width: 100%;
          padding: 6px 8px;
          background: transparent;
          border: 1px solid transparent;
          border-radius: 5px;
          cursor: pointer;
          color: #cbd5e1;
          font-size: 11.5px;
          text-align: left;
          transition: all 0.12s ease;
        }

        .toolbar-dropdown-item:hover {
          background: #141d2f;
          border-color: rgba(255, 255, 255, 0.05);
          color: #ffffff;
        }

        .toolbar-dropdown-item.selected {
          background: rgba(56, 189, 248, 0.1);
          border-color: rgba(56, 189, 248, 0.25);
          color: #38bdf8;
          font-weight: 600;
        }

        .toolbar-dropdown-item-left {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
          flex: 1;
        }

        .toolbar-dropdown-item-icon {
          color: #38bdf8;
          display: inline-flex;
          align-items: center;
        }

        .toolbar-dropdown-item-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .toolbar-dropdown-item-name {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .toolbar-dropdown-item-right {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
        }

        .toolbar-dropdown-item-count {
          font-family: monospace;
          font-size: 10px;
          background: rgba(0, 0, 0, 0.4);
          color: #8da2be;
          padding: 1px 5px;
          border-radius: 4px;
        }

        .toolbar-dropdown-item-check {
          color: #38bdf8;
        }

        .toolbar-dropdown-divider {
          height: 1px;
          background: rgba(255, 255, 255, 0.06);
          margin: 3px 0;
        }

        .plugins-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
          gap: 14px;
        }

        .plugin-card {
          background: #111726;
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 11px;
          padding: 16px 18px;
          display: flex;
          flex-direction: column;
          min-height: 206px;
          box-sizing: border-box;
          transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
          position: relative;
          overflow: hidden;
        }

        .plugin-card:hover {
          border-color: rgba(99, 102, 241, 0.35);
          background: #131b2c;
          box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.45);
          transform: translateY(-1px);
        }

        /* Header: Rigid 38px height, never wraps or expands */
        .card-header-cluster {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 10px;
          height: 38px;
          min-height: 38px;
          max-height: 38px;
          flex-shrink: 0;
        }

        .card-header-left {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          min-width: 0;
          flex: 1;
          overflow: hidden;
        }

        .card-icon-avatar.plugin {
          width: 34px;
          height: 34px;
          border-radius: 8px;
          background: rgba(56, 189, 248, 0.12);
          border: 1px solid rgba(56, 189, 248, 0.25);
          color: #38bdf8;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .card-identity-text {
          display: flex;
          flex-direction: column;
          gap: 3px;
          min-width: 0;
          flex: 1;
          overflow: hidden;
        }

        .card-title-row {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
          line-height: 1.2;
        }

        .card-item-name {
          font-size: 13.5px;
          font-weight: 600;
          color: #f8fafc;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          letter-spacing: -0.01em;
          min-width: 0;
          flex-shrink: 1;
        }

        .card-sub-meta {
          display: flex;
          align-items: center;
          gap: 5px;
          min-width: 0;
          height: 16px;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }

        .card-cat-text {
          font-size: 9.5px;
          line-height: 1;
          color: #8fa0b5;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          font-weight: 600;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 105px;
          flex-shrink: 1;
          display: inline-flex;
          align-items: center;
        }

        .card-meta-dot {
          color: #3b4d66;
          font-size: 10px;
          flex-shrink: 0;
        }

        .author-text {
          font-size: 10px;
          color: #64748b;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 95px;
          flex-shrink: 1;
        }

        .version-badge {
          font-size: 8.5px;
          font-weight: 700;
          color: #38bdf8;
          background: rgba(56, 189, 248, 0.12);
          border: 1px solid rgba(56, 189, 248, 0.25);
          padding: 0.5px 5px;
          border-radius: 3px;
          flex-shrink: 0;
        }

        .source-registry-pill {
          font-size: 8.5px;
          color: #38bdf8;
          background: rgba(56, 189, 248, 0.08);
          border: 1px solid rgba(56, 189, 248, 0.22);
          padding: 0.5px 5px;
          border-radius: 3px;
          font-weight: 600;
          letter-spacing: 0.03em;
          text-transform: uppercase;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 110px;
          flex-shrink: 0;
        }

        .source-registry-pill.pill-aas {
          color: #c084fc;
          background: rgba(192, 132, 252, 0.12);
          border-color: rgba(192, 132, 252, 0.28);
        }

        .source-registry-pill.pill-official {
          color: #38bdf8;
          background: rgba(56, 189, 248, 0.12);
          border-color: rgba(56, 189, 248, 0.28);
        }

        .source-registry-pill.pill-addy {
          color: #fbbf24;
          background: rgba(251, 191, 36, 0.12);
          border-color: rgba(251, 191, 36, 0.28);
        }

        .source-registry-pill.pill-custom {
          color: #34d399;
          background: rgba(52, 211, 153, 0.12);
          border-color: rgba(52, 211, 153, 0.28);
        }

        .source-registry-pill.pill-smithery {
          color: #fb923c;
          background: rgba(251, 146, 60, 0.12);
          border-color: rgba(251, 146, 60, 0.28);
        }

        .source-registry-pill.pill-community {
          color: #2dd4bf;
          background: rgba(45, 212, 191, 0.12);
          border-color: rgba(45, 212, 191, 0.28);
        }

        .source-registry-pill.pill-core {
          color: #818cf8;
          background: rgba(129, 140, 248, 0.12);
          border-color: rgba(129, 140, 248, 0.28);
        }

        .card-header-right {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 1px;
        }

        .dep-badge-cluster {
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }

        .dep-badge-quick-copy {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 20px;
          height: 19px;
          border-radius: 9999px;
          background: rgba(244, 63, 94, 0.12);
          border: 1px solid rgba(244, 63, 94, 0.35);
          color: #fb7185;
          cursor: pointer;
          transition: all 0.15s ease;
          padding: 0;
        }

        .dep-badge-quick-copy:hover {
          background: rgba(244, 63, 94, 0.25);
          border-color: rgba(244, 63, 94, 0.6);
          transform: translateY(-1px);
        }

        .dep-badge-quick-copy.copied {
          background: rgba(52, 211, 153, 0.18);
          border-color: rgba(52, 211, 153, 0.5);
          color: #34d399;
        }

        .card-action-icon-btn.active-copied {
          background: rgba(52, 211, 153, 0.15);
          border-color: rgba(52, 211, 153, 0.4);
        }

        .dep-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 7px;
          border-radius: 9999px;
          font-size: 9.5px;
          font-weight: 600;
          letter-spacing: 0.02em;
          white-space: nowrap;
          cursor: pointer;
          border: 1px solid transparent;
          transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
          user-select: none;
        }

        .dep-badge:hover {
          transform: translateY(-1px);
        }

        .dep-badge.ready {
          color: #34d399;
          background: rgba(16, 185, 129, 0.09);
          border-color: rgba(16, 185, 129, 0.25);
        }

        .dep-badge.ready:hover {
          background: rgba(16, 185, 129, 0.18);
          border-color: rgba(16, 185, 129, 0.45);
        }

        .dep-badge.missing-amber {
          color: #fbbf24;
          background: rgba(245, 158, 11, 0.12);
          border-color: rgba(245, 158, 11, 0.35);
        }

        .dep-badge.missing-amber:hover {
          background: rgba(245, 158, 11, 0.22);
          border-color: rgba(245, 158, 11, 0.55);
        }

        .dep-badge.missing-rose {
          color: #fb7185;
          background: rgba(244, 63, 94, 0.12);
          border-color: rgba(244, 63, 94, 0.35);
        }

        .dep-badge.missing-rose:hover {
          background: rgba(244, 63, 94, 0.22);
          border-color: rgba(244, 63, 94, 0.55);
        }

        .status-pill-clean {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 2.5px 8px;
          border-radius: 9999px;
          font-size: 9.5px;
          font-weight: 600;
          letter-spacing: 0.02em;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .status-pill-clean.installed {
          color: #34d399;
          background: rgba(16, 185, 129, 0.08);
          border: 1px solid rgba(16, 185, 129, 0.22);
        }

        .status-pill-clean.disabled {
          color: #fb7185;
          background: rgba(244, 63, 94, 0.08);
          border: 1px solid rgba(244, 63, 94, 0.28);
        }

        .status-pill-clean.partial {
          color: #fbbf24;
          background: rgba(245, 158, 11, 0.08);
          border: 1px solid rgba(245, 158, 11, 0.22);
        }

        .status-pill-clean.available {
          color: #38bdf8;
          background: rgba(56, 189, 248, 0.08);
          border: 1px solid rgba(56, 189, 248, 0.2);
        }

        .status-pill-clean.clickable {
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .status-pill-clean.clickable:hover {
          transform: translateY(-1px);
          filter: brightness(1.15);
        }

        .card-action-icon-btn.toggle-state-btn.disabled-state {
          background: rgba(244, 63, 94, 0.1);
          border-color: rgba(244, 63, 94, 0.3);
          color: #fb7185;
        }

        .card-action-icon-btn.toggle-state-btn.disabled-state:hover {
          background: rgba(244, 63, 94, 0.22);
          border-color: rgba(244, 63, 94, 0.5);
          color: #fda4af;
        }

        .card-action-icon-btn.toggle-state-btn.active-state {
          background: rgba(52, 211, 153, 0.08);
          border-color: rgba(52, 211, 153, 0.25);
          color: #34d399;
        }

        .card-action-icon-btn.toggle-state-btn.active-state:hover {
          background: rgba(52, 211, 153, 0.18);
          border-color: rgba(52, 211, 153, 0.45);
          color: #6ee7b7;
        }

        .plugin-card.is-card-disabled {
          border-color: rgba(244, 63, 94, 0.2);
          background: rgba(18, 24, 38, 0.7);
        }

        .status-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .status-dot.installed {
          background: #10b981;
          box-shadow: 0 0 6px rgba(16, 185, 129, 0.6);
        }

        .status-dot.disabled {
          background: #fb7185;
          box-shadow: 0 0 6px rgba(244, 63, 94, 0.6);
        }

        .status-dot.partial {
          background: #f59e0b;
          box-shadow: 0 0 6px rgba(245, 158, 11, 0.6);
        }

        .status-dot.available {
          background: #38bdf8;
          box-shadow: 0 0 6px rgba(56, 189, 248, 0.5);
        }

        /* Body */
        /* Body */
        .card-content-body {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 10px;
          min-width: 0;
        }

        .card-description-text {
          font-size: 12px;
          color: #94a3b8;
          line-height: 1.45;
          margin: 0;
          height: 35px;
          min-height: 35px;
          max-height: 35px;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .bundled-stats-row {
          display: flex;
          align-items: center;
          gap: 6px;
          min-height: 22px;
        }

        .meta-subtle-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 10px;
          padding: 2px 6px;
          border-radius: 4px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          white-space: nowrap;
          flex-shrink: 0;
        }

        .meta-subtle-badge.skills {
          color: #c084fc;
          background: rgba(192, 132, 252, 0.06);
          border-color: rgba(192, 132, 252, 0.2);
        }

        .meta-subtle-badge.mcps {
          color: #818cf8;
          background: rgba(129, 140, 248, 0.06);
          border-color: rgba(129, 140, 248, 0.2);
        }

        .meta-subtle-badge.source-badge {
          color: #38bdf8;
          background: rgba(56, 189, 248, 0.06);
          border-color: rgba(56, 189, 248, 0.2);
          max-width: 120px;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .equipped-agents-bar {
          display: flex;
          align-items: center;
          gap: 6px;
          background: rgba(0, 0, 0, 0.25);
          border: 1px solid rgba(255, 255, 255, 0.05);
          padding: 3px 8px;
          border-radius: 6px;
          min-height: 24px;
          box-sizing: border-box;
        }

        .equipped-label {
          font-size: 9.5px;
          color: #64748b;
          font-weight: 600;
          flex-shrink: 0;
        }

        .equipped-pills-list {
          display: flex;
          align-items: center;
          gap: 4px;
          flex-wrap: nowrap;
          overflow: hidden;
        }

        .agent-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 1.5px 6px;
          border-radius: 4px;
          font-size: 9.5px;
          font-weight: 600;
          border: 1px solid;
          transition: all 0.15s ease;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .agent-pill.clickable {
          cursor: pointer;
          user-select: none;
        }

        .agent-pill.clickable:hover {
          transform: translateY(-0.5px);
          filter: brightness(1.15);
        }

        .agent-pill.filtered-active {
          font-weight: 600;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
        }

        /* Bottom Toolbar: Rigid 38px height, never wraps */
        .card-bottom-toolbar {
          margin-top: auto;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
          padding-top: 10px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          min-height: 38px;
          height: 38px;
          max-height: 38px;
          box-sizing: border-box;
        }

        .toolbar-left-chips {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: nowrap;
          min-width: 0;
          flex: 1;
          overflow: hidden;
        }

        .source-path-clean {
          font-size: 10px;
          color: #64748b;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          min-width: 0;
          max-width: 130px;
          flex-shrink: 1;
        }

        .toolbar-right-actions {
          display: flex;
          align-items: center;
          gap: 5px;
          flex-shrink: 0;
        }

        .card-action-icon-btn {
          width: 28px;
          height: 28px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: #141c2c;
          border: 1px solid #223049;
          color: #8fa0b5;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s ease;
          padding: 0;
          box-sizing: border-box;
        }

        .card-action-icon-btn:hover:not(:disabled) {
          background: #1d283e;
          color: #ffffff;
          border-color: #384b6c;
        }

        .card-action-icon-btn.edit:hover:not(:disabled) {
          background: rgba(56, 189, 248, 0.15);
          color: #38bdf8;
          border-color: rgba(56, 189, 248, 0.4);
        }

        .card-action-icon-btn.danger:hover:not(:disabled) {
          background: rgba(239, 68, 68, 0.15);
          color: #ef4444;
          border-color: rgba(239, 68, 68, 0.4);
        }

        .card-action-icon-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .plugins-view-container .card-primary-action-btn,
        .card-primary-action-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          height: 28px;
          padding: 0 11px;
          background: #141c2c;
          border: 1px solid #223048;
          color: #e2e8f0;
          font-size: 11px;
          font-weight: 600;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s ease;
          white-space: nowrap;
          box-sizing: border-box;
          box-shadow: none;
        }

        .plugins-view-container .card-primary-action-btn:hover:not(:disabled) {
          background: linear-gradient(135deg, #5b21b6, #4c1d95);
          border-color: rgba(124, 58, 237, 0.35);
          color: #ffffff;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3), 0 0 6px rgba(109, 40, 217, 0.2);
          transform: translateY(-0.5px);
        }

        .card-primary-action-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .spin {
          animation: spin 1s linear infinite;
        }

        .item-card-highlighted {
          border-color: rgba(251, 191, 36, 0.95) !important;
          background: linear-gradient(135deg, rgba(251, 191, 36, 0.12), rgba(245, 158, 11, 0.04)) !important;
          box-shadow: 0 0 0 2px rgba(251, 191, 36, 0.7), 0 0 32px rgba(251, 191, 36, 0.38) !important;
          animation: highlightPluginSoft 3.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          z-index: 10;
          position: relative;
        }

        @keyframes highlightPluginSoft {
          0% {
            transform: scale(1.025);
            border-color: rgba(251, 191, 36, 1);
            box-shadow: 0 0 0 2.5px rgba(251, 191, 36, 0.85), 0 0 40px rgba(251, 191, 36, 0.5);
          }
          15% {
            transform: scale(1);
            border-color: rgba(251, 191, 36, 0.95);
            box-shadow: 0 0 0 2px rgba(251, 191, 36, 0.75), 0 0 32px rgba(251, 191, 36, 0.4);
          }
          65% {
            transform: scale(1);
            border-color: rgba(251, 191, 36, 0.8);
            box-shadow: 0 0 0 1.5px rgba(251, 191, 36, 0.55), 0 0 22px rgba(251, 191, 36, 0.25);
          }
          88% {
            transform: scale(1);
            border-color: rgba(251, 191, 36, 0.45);
            box-shadow: 0 0 0 1px rgba(251, 191, 36, 0.2), 0 0 10px rgba(251, 191, 36, 0.1);
          }
          100% {
            transform: scale(1);
            border-color: #1e283d;
            background: #121826;
            box-shadow: none;
          }
        }

        .load-more-wrap {
          display: flex;
          justify-content: center;
          margin-top: 14px;
        }

        .load-more-btn {
          background: #141324;
          border: 1px solid #2e2348;
          color: #c084fc;
          font-size: 11.5px;
          font-weight: 600;
          padding: 8px 20px;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .load-more-btn:hover {
          background: #1e1a38;
          border-color: #4a3875;
          color: #ffffff;
        }
      `}</style>
    </div>
  );
};
