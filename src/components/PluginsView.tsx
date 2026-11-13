import React, { useState, useEffect, useMemo, useRef, useLayoutEffect, useCallback, useDeferredValue } from 'react';
import { createPortal } from 'react-dom';
import { ScannedPlugin, ScannedSkill, ScannedMcpServer, SupportedAgent, InstalledPluginDetails } from '../types/agent';
import { CatalogPlugin, CatalogSkill } from '../types/catalog';
import { PLUGINS_CATALOG } from '../data/pluginsCatalog';
import { SKILLS_CATALOG } from '../data/skillsCatalog';
import { CapabilityIcon, getDomainTheme } from './CapabilityIcon';
import {
  Boxes,
  Bot,
  Sparkles,
  Server,
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
  ChevronDown,
  Search,
  X,
  Globe,
  Package,
  AlertCircle,
  Copy,
  Power,
  PowerOff,
  LayoutGrid,
  List as ListIcon,
  RotateCcw,
  ShieldCheck,
  MoreVertical,
  Info,
  ExternalLink,
} from 'lucide-react';
import { formatAuthor } from '../utils/formatUtils';
import { MCP_CATALOG } from '../data/mcpCatalog';
import { logActivity } from '../services/activityLogger';
import { useToast } from '../context/ToastContext';
import { formatSourceBadge } from '../services/catalogSync';
import { ForgePluginModal } from './ForgePluginModal';
import { DependencyReport } from '../types/dependencies';
import { getRequiredDependencies, evaluateDependencyStatus, getInstallSnippetForPlatform } from '../utils/dependencyResolver';
import { DependencyInstallDrawer } from './DependencyInstallDrawer';
import { AGENT_ICON_MAP } from './AgentIcon';
import { useModalTransition } from '../hooks/useModalTransition';
import { Tooltip } from './Tooltip';

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
  isActive?: boolean;
}

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

function cleanCategory(cat?: string): string {
  if (!cat) return 'General';
  const stripped = cat
    .replace(/[\u{1F300}-\u{1FAFF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{D800}-\u{DFFF}]/gu, '')
    .trim();
  return stripped || 'General';
}

function getPluginSearchString(p: UnifiedPluginCard): string {
  let cached = pluginSearchCache.get(p);
  if (!cached) {
    cached = `${p.name} ${p.description} ${p.category || ''} ${p.author || ''} ${(p.tags || []).join(' ')}`.toLowerCase();
    pluginSearchCache.set(p, cached);
  }
  return cached;
}

const PluginsViewComponent: React.FC<PluginsViewProps> = ({
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
  const segmentedControlsRef = useRef<HTMLDivElement>(null);
  const isPillAnimatedRef = useRef(false);
  const [segmentPillStyle, setSegmentPillStyle] = useState<{ left: number; width: number; isReady: boolean }>({
    left: 0,
    width: 0,
    isReady: false,
  });
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    return (localStorage.getItem('agentforge_view_mode_plugins') as 'grid' | 'list') || 'grid';
  });

  const handleViewModeChange = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    localStorage.setItem('agentforge_view_mode_plugins', mode);
  };
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

  const [moreMenuPluginId, setMoreMenuPluginId] = useState<string | null>(null);
  const [moreMenuPosition, setMoreMenuPosition] = useState<{
    top?: number;
    bottom?: number;
    right: number;
    maxHeight?: number;
  } | null>(null);
  const [selectedPluginForDetails, setSelectedPluginForDetails] = useState<UnifiedPluginCard | null>(null);
  const [copiedPathPluginId, setCopiedPathPluginId] = useState<string | null>(null);

  const {
    isRendered: isDetailsModalRendered,
    isClosing: isDetailsModalClosing,
    handleClose: handleCloseDetailsModal,
  } = useModalTransition(
    Boolean(selectedPluginForDetails),
    () => setSelectedPluginForDetails(null),
    180
  );

  const resolvePluginPath = (plugin: UnifiedPluginCard) => {
    if (plugin.sourcePath) return plugin.sourcePath;
    if (plugin.installedAgents.length > 0) {
      const agent = plugin.installedAgents[0];
      const dir = agent.resolvedPaths?.pluginsDir || agent.paths?.pluginsDir;
      if (dir) {
        const base = dir.replace(/\\/g, '/').replace(/\/+$/, '');
        return `${base}/${plugin.id}`;
      }
    }
    return '';
  };

  const handleCopyPluginPath = async (plugin: UnifiedPluginCard) => {
    const path = resolvePluginPath(plugin);
    if (!path) return;
    try {
      await navigator.clipboard.writeText(path);
      setCopiedPathPluginId(plugin.id);
      toast.success('Plugin path copied to clipboard');
      setTimeout(() => setCopiedPathPluginId(null), 2000);
    } catch {
      toast.error('Failed to copy plugin path');
    }
  };

  const [isForgeModalOpen, setIsForgeModalOpen] = useState(false);
  const [editingPluginData, setEditingPluginData] = useState<InstalledPluginDetails | null>(null);
  const [isAgentMenuOpen, setIsAgentMenuOpen] = useState(false);
  const agentMenuRef = useRef<HTMLDivElement>(null);
  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false);
  const categoryMenuRef = useRef<HTMLDivElement>(null);
  const [categorySearchQuery, setCategorySearchQuery] = useState('');
  const [agentSearchQuery, setAgentSearchQuery] = useState('');
  const categorySearchInputRef = useRef<HTMLInputElement>(null);
  const agentSearchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isCategoryMenuOpen) {
      setTimeout(() => categorySearchInputRef.current?.focus(), 25);
    } else {
      setCategorySearchQuery('');
    }
  }, [isCategoryMenuOpen]);

  useEffect(() => {
    if (isAgentMenuOpen) {
      setTimeout(() => agentSearchInputRef.current?.focus(), 25);
    } else {
      setAgentSearchQuery('');
    }
  }, [isAgentMenuOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (agentMenuRef.current && !agentMenuRef.current.contains(e.target as Node)) {
        setIsAgentMenuOpen(false);
      }
      if (categoryMenuRef.current && !categoryMenuRef.current.contains(e.target as Node)) {
        setIsCategoryMenuOpen(false);
      }
    };
    if (isAgentMenuOpen || isCategoryMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isAgentMenuOpen, isCategoryMenuOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.card-options-dropdown') && !target.closest('.more-options-btn')) {
        setMoreMenuPluginId(null);
        setMoreMenuPosition(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMoreMenuPluginId(null);
        setMoreMenuPosition(null);
        handleCloseDetailsModal();
      }
    };
    const handleScroll = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (target && target.closest && target.closest('.card-options-dropdown')) {
        return;
      }
      setMoreMenuPluginId(null);
      setMoreMenuPosition(null);
    };
    const handleResize = () => {
      setMoreMenuPluginId(null);
      setMoreMenuPosition(null);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [handleCloseDetailsModal]);

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
        category: cleanCategory(cat.category),
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
          category: cleanCategory((p as any).category || 'Custom Bundle'),
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
    return ['All', ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [unifiedPlugins]);

  // Compute category item counts dynamically based on active segment and agent filter
  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = { All: 0 };
    const selCount = selectedAgents.length;
    for (let i = 0; i < unifiedPlugins.length; i++) {
      const p = unifiedPlugins[i];
      if (activeSegment === 'installed' && p.installedAgents.length === 0) continue;
      if (activeSegment === 'available' && p.isCatalog && p.installedAgents.length >= selCount) continue;
      if (currentAgentFilter.length > 0 && !currentAgentFilter.some((agId) => p.installedAgents.some((a) => a.id === agId))) continue;

      map.All = (map.All || 0) + 1;
      const cat = p.category || 'Other';
      map[cat] = (map[cat] || 0) + 1;
    }
    return map;
  }, [unifiedPlugins, activeSegment, selectedAgents.length, currentAgentFilter]);

  // Combobox filtering for dropdown menus
  const filteredCategories = useMemo(() => {
    if (!categorySearchQuery.trim()) return categories;
    const q = categorySearchQuery.trim().toLowerCase();
    return categories.filter((cat) => cat.toLowerCase().includes(q));
  }, [categories, categorySearchQuery]);

  const filteredTargetAgents = useMemo(() => {
    const list = selectedAgents.length > 0 ? selectedAgents : (allAgents || []);
    if (!agentSearchQuery.trim()) return list;
    const q = agentSearchQuery.trim().toLowerCase();
    return list.filter((ag) => ag.name.toLowerCase().includes(q) || ag.id.toLowerCase().includes(q));
  }, [selectedAgents, allAgents, agentSearchQuery]);

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

  const updateSegmentPill = useCallback(() => {
    const container = segmentedControlsRef.current;
    if (!container) return;
    const activeBtn = container.querySelector<HTMLButtonElement>('.segment-btn.active');
    if (!activeBtn) return;
    const containerRect = container.getBoundingClientRect();
    const btnRect = activeBtn.getBoundingClientRect();
    if (btnRect.width <= 10 || containerRect.width <= 10) return;
    const nextLeft = Math.round(btnRect.left - containerRect.left);
    const nextWidth = Math.round(btnRect.width);

    setSegmentPillStyle((prev) => {
      if (prev.isReady && Math.abs(prev.left - nextLeft) < 1 && Math.abs(prev.width - nextWidth) < 1) {
        return prev;
      }
      return {
        left: nextLeft,
        width: nextWidth,
        isReady: true,
      };
    });
  }, []);

  useLayoutEffect(() => {
    updateSegmentPill();
  }, [updateSegmentPill, activeSegment]);

  useEffect(() => {
    const container = segmentedControlsRef.current;
    if (!container) return;

    updateSegmentPill();

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        updateSegmentPill();
      });
      ro.observe(container);
    }

    const t1 = setTimeout(updateSegmentPill, 50);
    const t2 = setTimeout(updateSegmentPill, 150);
    const t3 = setTimeout(() => {
      isPillAnimatedRef.current = true;
    }, 100);

    window.addEventListener('resize', updateSegmentPill);
    return () => {
      if (ro) ro.disconnect();
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      window.removeEventListener('resize', updateSegmentPill);
    };
  }, [updateSegmentPill]);

  const deferredSearchQuery = useDeferredValue(searchQuery);

  const filteredPlugins = useMemo(() => {
    const q = deferredSearchQuery.trim().toLowerCase();
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
  }, [unifiedPlugins, activeSegment, selectedCategory, deferredSearchQuery, selectedAgents.length, currentAgentFilter]);

  const displayedPlugins = useMemo(() => {
    return filteredPlugins.slice(0, visibleCount);
  }, [filteredPlugins, visibleCount]);

  useEffect(() => {
    setVisibleCount(36);
  }, [deferredSearchQuery, activeSegment, selectedCategory, currentAgentFilter]);

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

  const [expandedAgentCards, setExpandedAgentCards] = useState<Set<string>>(new Set());

  const toggleCardAgentsExpanded = (cardId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedAgentCards((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else {
        next.add(cardId);
      }
      return next;
    });
  };

  const renderAgentTargetsDeck = (installedAgents: SupportedAgent[], cardId: string) => {
    const isExpanded = expandedAgentCards.has(cardId);

    type CardAgentItem = {
      agent: SupportedAgent;
      isInstalled: boolean;
      isFiltered: boolean;
    };

    const items: CardAgentItem[] = [];

    if (installedAgents.length > 0) {
      for (const ag of installedAgents) {
        items.push({
          agent: ag,
          isInstalled: true,
          isFiltered: currentAgentFilter.includes(ag.id),
        });
      }
      const pending = selectedAgents.filter((sa) => !installedAgents.some((ia) => ia.id === sa.id));
      for (const ag of pending) {
        items.push({
          agent: ag,
          isInstalled: false,
          isFiltered: currentAgentFilter.includes(ag.id),
        });
      }
    } else if (selectedAgents.length > 0) {
      for (const ag of selectedAgents) {
        items.push({
          agent: ag,
          isInstalled: false,
          isFiltered: currentAgentFilter.includes(ag.id),
        });
      }
    }

    if (items.length === 0) {
      return (
        <div className="agent-deck-container empty">
          <span className="uninstalled-muted-label font-mono">No target agents</span>
        </div>
      );
    }

    const sortedItems = [...items].sort((a, b) => {
      if (a.isFiltered && !b.isFiltered) return -1;
      if (!a.isFiltered && b.isFiltered) return 1;
      if (a.isInstalled && !b.isInstalled) return -1;
      if (!a.isInstalled && b.isInstalled) return 1;
      return 0;
    });

    const MAX_VISIBLE = 4;
    const shouldCollapse = sortedItems.length > MAX_VISIBLE;
    const initialItems = shouldCollapse ? sortedItems.slice(0, MAX_VISIBLE) : sortedItems;
    const overflowItems = shouldCollapse ? sortedItems.slice(MAX_VISIBLE) : [];
    const hiddenCount = sortedItems.length - MAX_VISIBLE;

    return (
      <div className={`agent-deck-container ${installedAgents.length === 0 ? 'pending-only' : ''}`}>
        <div className="agent-deck-pills">
          <div className="agent-deck-base-row">
            {initialItems.map(({ agent: ag, isInstalled, isFiltered }) => {
              const AgentIcon = AGENT_ICON_MAP[ag.id] || AGENT_ICON_MAP[ag.iconName] || Bot;
              return (
                <button
                  type="button"
                  key={ag.id}
                  className={`agent-deck-pill ${isInstalled ? 'installed' : 'pending'} ${isFiltered ? 'is-filtered' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAgentPillClick(ag.id);
                  }}
                  title={
                    isFiltered
                      ? `Filtered by ${ag.name} (click to clear)`
                      : isInstalled
                      ? `Active on ${ag.name} (click to filter)`
                      : `Pending target: ${ag.name} (click to filter)`
                  }
                >
                  <AgentIcon size={11} className="pill-brand-icon" style={{ color: ag.color }} />
                  <span className="pill-name">{ag.name}</span>
                  {isFiltered && <Check size={9} className="pill-check-icon" />}
                </button>
              );
            })}

            {shouldCollapse && (
              <button
                type="button"
                className={`agent-deck-more-btn font-mono ${isExpanded ? 'is-expanded' : ''}`}
                onClick={(e) => toggleCardAgentsExpanded(cardId, e)}
                title={isExpanded ? 'Collapse agent list' : `Show ${hiddenCount} more agents`}
              >
                <span>{isExpanded ? 'Less' : `+${hiddenCount}`}</span>
                <ChevronDown size={10} className={`deck-chevron ${isExpanded ? 'rotated' : ''}`} />
              </button>
            )}
          </div>

          {shouldCollapse && (
            <div className={`agent-deck-expandable ${isExpanded ? 'is-expanded' : ''}`}>
              <div className="agent-deck-expandable-content">
                <div className="agent-deck-overflow-pills">
                  {overflowItems.map(({ agent: ag, isInstalled, isFiltered }, idx) => {
                    const AgentIcon = AGENT_ICON_MAP[ag.id] || AGENT_ICON_MAP[ag.iconName] || Bot;
                    return (
                      <button
                        type="button"
                        key={ag.id}
                        className={`agent-deck-pill ${isInstalled ? 'installed' : 'pending'} ${isFiltered ? 'is-filtered' : ''}`}
                        style={{
                          animationDelay: `${idx * 28}ms`,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAgentPillClick(ag.id);
                        }}
                        title={
                          isFiltered
                            ? `Filtered by ${ag.name} (click to clear)`
                            : isInstalled
                            ? `Active on ${ag.name} (click to filter)`
                            : `Pending target: ${ag.name} (click to filter)`
                        }
                      >
                        <AgentIcon size={11} className="pill-brand-icon" style={{ color: ag.color }} />
                        <span className="pill-name">{ag.name}</span>
                        {isFiltered && <Check size={9} className="pill-check-icon" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderListAgentTargetsDeck = (installedAgents: SupportedAgent[], cardId: string) => {
    const listCardKey = `list-${cardId}`;
    const isExpanded = expandedAgentCards.has(listCardKey);

    type CardAgentItem = {
      agent: SupportedAgent;
      isInstalled: boolean;
      isFiltered: boolean;
    };

    const items: CardAgentItem[] = [];

    if (installedAgents.length > 0) {
      for (const ag of installedAgents) {
        items.push({
          agent: ag,
          isInstalled: true,
          isFiltered: currentAgentFilter.includes(ag.id),
        });
      }
      const pending = selectedAgents.filter((sa) => !installedAgents.some((ia) => ia.id === sa.id));
      for (const ag of pending) {
        items.push({
          agent: ag,
          isInstalled: false,
          isFiltered: currentAgentFilter.includes(ag.id),
        });
      }
    } else if (selectedAgents.length > 0) {
      for (const ag of selectedAgents) {
        items.push({
          agent: ag,
          isInstalled: false,
          isFiltered: currentAgentFilter.includes(ag.id),
        });
      }
    }

    if (items.length === 0) {
      return (
        <span className="uninstalled-muted-label font-mono" title="No target agents selected">
          No target agents
        </span>
      );
    }

    const sortedItems = [...items].sort((a, b) => {
      if (a.isFiltered && !b.isFiltered) return -1;
      if (!a.isFiltered && b.isFiltered) return 1;
      if (a.isInstalled && !b.isInstalled) return -1;
      if (!a.isInstalled && b.isInstalled) return 1;
      return 0;
    });

    const MAX_LIST_VISIBLE = 2;
    const shouldCollapse = sortedItems.length > MAX_LIST_VISIBLE;
    const initialItems = shouldCollapse ? sortedItems.slice(0, MAX_LIST_VISIBLE) : sortedItems;
    const overflowItems = shouldCollapse ? sortedItems.slice(MAX_LIST_VISIBLE) : [];
    const hiddenCount = sortedItems.length - MAX_LIST_VISIBLE;

    return (
      <div className="list-agents-deck">
        <div className="list-agents-base-row">
          {initialItems.map(({ agent: ag, isInstalled, isFiltered }) => {
            const AgentIcon = AGENT_ICON_MAP[ag.id] || AGENT_ICON_MAP[ag.iconName] || Bot;
            return (
              <button
                type="button"
                key={ag.id}
                className={`agent-deck-pill compact ${isInstalled ? 'installed' : 'pending'} ${isFiltered ? 'is-filtered' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleAgentPillClick(ag.id);
                }}
                title={
                  isFiltered
                    ? `Filtered by ${ag.name} (click to clear)`
                    : isInstalled
                    ? `Active in ${ag.name} (click to filter)`
                    : `Pending target: ${ag.name} (click to filter)`
                }
              >
                <AgentIcon size={10} className="pill-brand-icon" style={{ color: ag.color }} />
                <span className="pill-name">{ag.name}</span>
                {isFiltered && <Check size={8} className="pill-check-icon" />}
              </button>
            );
          })}

          {shouldCollapse && (
            <button
              type="button"
              className={`agent-deck-more-btn compact font-mono ${isExpanded ? 'is-expanded' : ''}`}
              onClick={(e) => toggleCardAgentsExpanded(listCardKey, e)}
              title={
                isExpanded
                  ? 'Show fewer agents'
                  : `+${hiddenCount} more: ${overflowItems.map((i) => i.agent.name).join(', ')}`
              }
            >
              <span>{isExpanded ? 'Less' : `+${hiddenCount}`}</span>
              <ChevronDown size={9} className={`deck-chevron ${isExpanded ? 'rotated' : ''}`} />
            </button>
          )}
        </div>

        {shouldCollapse && (
          <div className={`agent-deck-expandable list-expandable ${isExpanded ? 'is-expanded' : ''}`}>
            <div className="agent-deck-expandable-content">
              <div className="list-agents-overflow-pills">
                {overflowItems.map(({ agent: ag, isInstalled, isFiltered }, idx) => {
                  const AgentIcon = AGENT_ICON_MAP[ag.id] || AGENT_ICON_MAP[ag.iconName] || Bot;
                  return (
                    <button
                      type="button"
                      key={ag.id}
                      className={`agent-deck-pill compact ${isInstalled ? 'installed' : 'pending'} ${isFiltered ? 'is-filtered' : ''}`}
                      style={{
                        animationDelay: `${idx * 24}ms`,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAgentPillClick(ag.id);
                      }}
                      title={
                        isFiltered
                          ? `Filtered by ${ag.name} (click to clear)`
                          : isInstalled
                          ? `Active in ${ag.name} (click to filter)`
                          : `Pending target: ${ag.name} (click to filter)`
                      }
                    >
                      <AgentIcon size={10} className="pill-brand-icon" style={{ color: ag.color }} />
                      <span className="pill-name">{ag.name}</span>
                      {isFiltered && <Check size={8} className="pill-check-icon" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    );
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

  // Reinstall Plugin: cleanly uninstalls current folder and re-installs latest from catalog
  const handleReinstallPlugin = async (plugin: UnifiedPluginCard) => {
    if (!window.electronAPI?.installPlugin || !window.electronAPI?.uninstallPlugin) return;

    const targetAgents = plugin.installedAgents.filter((agent) =>
      selectedAgents.length === 0 || selectedAgents.some((sel) => sel.id === agent.id)
    );
    const effectiveTargets = targetAgents.length > 0 ? targetAgents : plugin.installedAgents;
    if (effectiveTargets.length === 0) return;

    setLoadingPluginId(plugin.id);
    try {
      // 1. Remove current plugin copy
      await window.electronAPI.uninstallPlugin({
        pluginId: plugin.id,
        folderName: plugin.id,
        targets: effectiveTargets.map((a) => ({
          agentId: a.id,
          pluginsDir: a.paths.pluginsDir,
        })),
      });

      // 2. Prepare payload from catalog or current definition
      const catMatch = PLUGINS_CATALOG.find((c) => c.id.toLowerCase() === plugin.id.toLowerCase());
      const bundledSkills = catMatch?.bundledSkills || plugin.bundledSkills || [];
      const bundledMcps = catMatch?.bundledMcps || plugin.bundledMcps || [];

      const skillsToDownload = bundledSkills.map((sId) => {
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

      const mcpConfigs: Record<string, any> = {};
      if (bundledMcps.length > 0) {
        for (const mcpId of bundledMcps) {
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

      const res = await window.electronAPI.installPlugin({
        pluginId: plugin.id,
        name: catMatch?.name || plugin.name,
        version: catMatch?.version || plugin.version || '1.0.0',
        description: catMatch?.description || plugin.description || '',
        author: catMatch?.author || plugin.author || 'AgentForge Catalog',
        category: catMatch?.category || plugin.category || 'General',
        tags: catMatch?.tags || plugin.tags || [],
        bundledSkills,
        bundledMcps,
        mcpConfigs,
        skills: skillsToDownload,
        targets: effectiveTargets.map((a) => ({
          agentId: a.id,
          skillsDir: a.paths.skillsDir,
          pluginsDir: a.paths.pluginsDir,
          mcpConfigPath: a.paths.mcpConfigPath,
        })),
      });

      if (res.success) {
        toast.success(`Reinstalled kit "${plugin.name}" with the latest files from web.`);
        logActivity({
          type: 'PLUGIN',
          title: 'Plugin Kit Reinstalled',
          description: `Cleanly reinstalled "${plugin.name}" on ${effectiveTargets.map((a) => a.name).join(', ')}`,
          status: 'success',
        });
        if (onRefreshCapabilities) {
          await onRefreshCapabilities();
        }
      } else {
        toast.error(`Reinstall failed: ${res.error || 'Failed to re-install plugin'}`);
      }
    } catch (err: any) {
      toast.error(`Reinstall error: ${err.message || 'Unknown error'}`);
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

  const renderPluginActions = (
    plugin: UnifiedPluginCard,
    isInstalledOnAll: boolean,
    isPartiallyInstalled: boolean,
    isLoading: boolean
  ) => (
    <div className="toolbar-right-actions" onClick={(e) => e.stopPropagation()}>
      {/* 1. Enable / Disable Toggle Button */}
      {plugin.installedAgents.length > 0 && (
        <button
          type="button"
          className={`card-action-icon-btn toggle-state-btn ${plugin.isDisabled ? 'disabled-state' : 'active-state'}`}
          onClick={(e) => {
            e.stopPropagation();
            handleTogglePlugin(plugin);
          }}
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

      {/* 2. Reinstall (if installed) OR Install (if catalog/available) */}
      {plugin.installedAgents.length > 0 ? (
        <button
          type="button"
          className="card-action-icon-btn reinstall"
          onClick={(e) => {
            e.stopPropagation();
            handleReinstallPlugin(plugin);
          }}
          disabled={loadingPluginId === plugin.id}
          title="Reinstall latest plugin kit and bundled capabilities from web"
          aria-label="Reinstall Plugin"
        >
          {loadingPluginId === plugin.id ? (
            <Loader2 size={12} className="spin" />
          ) : (
            <RotateCcw size={13} />
          )}
        </button>
      ) : (
        (!isInstalledOnAll && plugin.isCatalog) && (
          <button
            type="button"
            className="card-primary-action-btn plugin"
            onClick={(e) => {
              e.stopPropagation();
              handleInstallPluginKit(plugin);
            }}
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
        )
      )}

      {/* 3. More Options Menu Button (...) */}
      <button
        type="button"
        className={`card-action-icon-btn more-options-btn ${moreMenuPluginId === plugin.id ? 'active' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          if (moreMenuPluginId === plugin.id) {
            setMoreMenuPluginId(null);
            setMoreMenuPosition(null);
          } else {
            const rect = e.currentTarget.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;
            const openUpward = spaceBelow < 280 && spaceAbove > spaceBelow;
            setMoreMenuPosition({
              top: openUpward ? undefined : rect.bottom + 6,
              bottom: openUpward ? window.innerHeight - rect.top + 6 : undefined,
              right: Math.max(8, window.innerWidth - rect.right),
              maxHeight: Math.max(160, (openUpward ? spaceAbove : spaceBelow) - 16),
            });
            setMoreMenuPluginId(plugin.id);
          }
        }}
        title="More actions and details"
        aria-label="More actions"
      >
        <MoreVertical size={13} />
      </button>
    </div>
  );

  return (
    <div className="plugins-view-container">
      {/* Header */}
      <div className="plugins-view-header">
        <div className="header-info">
          <div className="title-line">
            <h2 className="view-title">Plugins<span className="title-long"> & Curated Kits</span></h2>
            <span className="count-pill font-mono">{plugins.length} INSTALLED</span>
            <span className="catalog-pill font-mono">{activePluginsCatalog.length.toLocaleString()} <span className="pill-text-long">IN CLOUD </span>CATALOG</span>
            {catalogSyncedAt && (
              <span className="sync-pill font-mono" title={`Synced with AAS: ${new Date(catalogSyncedAt).toLocaleString()}`}>
                <CheckCircle2 size={10} /> AAS SYNCED
              </span>
            )}
            <span
              className="security-hub-pill font-mono"
              title="AgentForge is an open hub: plugin kits execute locally. Inspect included skills and MCPs before installing."
            >
              <ShieldCheck size={10} /> COMMUNITY HUB
            </span>
          </div>
          <p className="view-desc">
            Complete multi-skill bundles equipping your selected agent(s) with high-utility capability kits.
          </p>
        </div>

        <div className="header-actions-wrap">
          {/* Segmented Controls on the right */}
          <div className="segmented-controls" ref={segmentedControlsRef}>
            <div
              className="segment-indicator-pill"
              style={{
                transform: `translateX(${segmentPillStyle.left}px)`,
                width: `${segmentPillStyle.width}px`,
                opacity: segmentPillStyle.isReady && segmentPillStyle.width > 10 ? 1 : 0,
                transition: isPillAnimatedRef.current
                  ? 'transform 0.24s cubic-bezier(0.16, 1, 0.3, 1), width 0.24s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.15s ease'
                  : 'opacity 0.15s ease',
              }}
            />
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
              <span className="segment-full-label">Available Kits</span>
              <span className="segment-short-label">Catalog</span>{' '}
              <span className="segment-count">{counts.available}</span>
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

      {/* Streamlined View Toolbar with Linear-Style Filter Chips */}
      <div className="category-toolbar-row">
        {/* Left: Filter Controls Group */}
        <div className="toolbar-filters-group">
          {/* Category Filter Chip */}
          <div className="filter-chip-wrapper" ref={categoryMenuRef}>
            <button
              type="button"
              className={`filter-chip-trigger ${selectedCategory !== 'All' ? 'active' : ''}`}
              onClick={() => {
                setIsCategoryMenuOpen((prev) => !prev);
                setIsAgentMenuOpen(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
                  e.preventDefault();
                  setIsCategoryMenuOpen(true);
                  setIsAgentMenuOpen(false);
                } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                  setIsCategoryMenuOpen(true);
                  setIsAgentMenuOpen(false);
                  setCategorySearchQuery(e.key);
                }
              }}
              title="Filter plugins by category"
            >
              <Filter size={12} className="filter-chip-icon text-indigo" />
              <span className="filter-chip-label">Category:</span>
              <span className="filter-chip-value" title={selectedCategory}>
                {selectedCategory === 'All' ? 'All' : selectedCategory}
              </span>
              <ChevronDown
                size={11}
                className={`filter-chip-chevron ${isCategoryMenuOpen ? 'open' : ''}`}
              />
            </button>

            {isCategoryMenuOpen && (
              <div className="filter-popover-menu">
                <div className="filter-popover-header">
                  <span>Categories</span>
                  {selectedCategory !== 'All' && (
                    <button
                      type="button"
                      className="filter-popover-reset"
                      onClick={() => {
                        setSelectedCategory('All');
                        setIsCategoryMenuOpen(false);
                      }}
                    >
                      Clear
                    </button>
                  )}
                </div>

                <div className="toolbar-combobox-search-wrap">
                  <Search size={12} className="toolbar-combobox-search-icon" />
                  <input
                    ref={categorySearchInputRef}
                    type="text"
                    className="toolbar-combobox-search-input"
                    placeholder="Search category..."
                    value={categorySearchQuery}
                    onChange={(e) => setCategorySearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setIsCategoryMenuOpen(false);
                      } else if (e.key === 'Enter') {
                        const match = filteredCategories.find(c => c !== 'All') || (categorySearchQuery.toLowerCase() === 'all' ? 'All' : null);
                        if (match) {
                          setSelectedCategory(match);
                          setIsCategoryMenuOpen(false);
                        }
                      }
                    }}
                  />
                  {categorySearchQuery && (
                    <button
                      type="button"
                      className="toolbar-combobox-clear-btn"
                      onClick={() => setCategorySearchQuery('')}
                      title="Clear search"
                    >
                      <X size={10} />
                    </button>
                  )}
                </div>

                <div className="filter-popover-list">
                  {filteredCategories.includes('All') && (
                    <button
                      type="button"
                      className={`filter-popover-item ${selectedCategory === 'All' ? 'selected' : ''}`}
                      onClick={() => {
                        setSelectedCategory('All');
                        setIsCategoryMenuOpen(false);
                      }}
                    >
                      <div className="filter-popover-item-left">
                        <Filter size={12} className="text-muted" />
                        <span>All Categories</span>
                      </div>
                      <div className="filter-popover-item-right">
                        <span className="filter-popover-count">{categoryCounts['All'] ?? 0}</span>
                        {selectedCategory === 'All' && <Check size={12} className="filter-popover-check" />}
                      </div>
                    </button>
                  )}

                  {filteredCategories.includes('All') && filteredCategories.filter(c => c !== 'All').length > 0 && (
                    <div className="filter-popover-divider" />
                  )}

                  {filteredCategories
                    .filter((c) => c !== 'All')
                    .map((cat) => {
                      const isSelected = selectedCategory === cat;
                      const count = categoryCounts[cat] ?? 0;
                      return (
                        <button
                          type="button"
                          key={cat}
                          className={`filter-popover-item ${isSelected ? 'selected' : ''}`}
                          onClick={() => {
                            setSelectedCategory(cat);
                            setIsCategoryMenuOpen(false);
                          }}
                          title={cat}
                        >
                          <div className="filter-popover-item-left">
                            <span>{cat}</span>
                          </div>
                          <div className="filter-popover-item-right">
                            <span className="filter-popover-count">{count}</span>
                            {isSelected && <Check size={12} className="filter-popover-check" />}
                          </div>
                        </button>
                      );
                    })}

                  {filteredCategories.length === 0 && (
                    <div className="toolbar-dropdown-empty">
                      <span>No categories found</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Agent Filter Chip */}
          {(selectedAgents.length > 0 || (allAgents && allAgents.length > 0)) && (() => {
            const availableAgents = selectedAgents.length > 0 ? selectedAgents : (allAgents || []);
            const singleFilteredAgent = currentAgentFilter.length === 1
              ? availableAgents.find((a) => a.id === currentAgentFilter[0])
              : null;
            const activeAgent = singleFilteredAgent || (currentAgentFilter.length === 0 && availableAgents.length === 1 ? availableAgents[0] : null);
            const AgentTriggerIcon = activeAgent
              ? (AGENT_ICON_MAP[activeAgent.id] || AGENT_ICON_MAP[activeAgent.iconName] || Bot)
              : Bot;
            const isAgentActive = currentAgentFilter.length > 0 || (availableAgents.length === 1 && currentAgentFilter.length === 0);

            return (
              <div className="filter-chip-wrapper" ref={agentMenuRef}>
                <button
                  type="button"
                  className={`filter-chip-trigger ${isAgentActive ? 'active' : ''}`}
                  style={
                    activeAgent
                      ? {
                        borderColor: `${activeAgent.color}55`,
                        background: `${activeAgent.color}14`,
                      }
                      : undefined
                  }
                  onClick={() => {
                    setIsAgentMenuOpen((prev) => !prev);
                    setIsCategoryMenuOpen(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
                      e.preventDefault();
                      setIsAgentMenuOpen(true);
                      setIsCategoryMenuOpen(false);
                    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                      setIsAgentMenuOpen(true);
                      setIsCategoryMenuOpen(false);
                      setAgentSearchQuery(e.key);
                    }
                  }}
                  title="Filter plugins by agent"
                >
                  <AgentTriggerIcon
                    size={12}
                    className="filter-chip-icon"
                    style={
                      activeAgent
                        ? { color: activeAgent.color }
                        : isAgentActive
                          ? { color: '#818cf8' }
                          : undefined
                    }
                  />
                  <span className="filter-chip-label">Agent:</span>
                  <span
                    className="filter-chip-value"
                    style={activeAgent ? { color: activeAgent.color } : undefined}
                  >
                    {currentAgentFilter.length === 0
                      ? (availableAgents.length === 1 ? availableAgents[0].name : `All (${availableAgents.length})`)
                      : singleFilteredAgent?.name || `${currentAgentFilter.length} Agents`}
                  </span>
                  <ChevronDown
                    size={11}
                    className={`filter-chip-chevron ${isAgentMenuOpen ? 'open' : ''}`}
                  />
                </button>

                {isAgentMenuOpen && (
                  <div className="filter-popover-menu">
                    <div className="filter-popover-header">
                      <span>Target Agents</span>
                      {currentAgentFilter.length > 0 && (
                        <button
                          type="button"
                          className="filter-popover-reset"
                          onClick={() => handleToggleAgentFilter(null)}
                        >
                          Clear
                        </button>
                      )}
                    </div>

                    <div className="toolbar-combobox-search-wrap">
                      <Search size={12} className="toolbar-combobox-search-icon" />
                      <input
                        ref={agentSearchInputRef}
                        type="text"
                        className="toolbar-combobox-search-input"
                        placeholder="Search agent..."
                        value={agentSearchQuery}
                        onChange={(e) => setAgentSearchQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            setIsAgentMenuOpen(false);
                          } else if (e.key === 'Enter') {
                            const first = filteredTargetAgents[0];
                            if (first) {
                              handleToggleAgentFilter(first.id);
                              setIsAgentMenuOpen(false);
                            }
                          }
                        }}
                      />
                      {agentSearchQuery && (
                        <button
                          type="button"
                          className="toolbar-combobox-clear-btn"
                          onClick={() => setAgentSearchQuery('')}
                          title="Clear search"
                        >
                          <X size={10} />
                        </button>
                      )}
                    </div>

                    <div className="filter-popover-list">
                      {(!agentSearchQuery.trim() || 'all agents'.includes(agentSearchQuery.toLowerCase())) && (
                        <button
                          type="button"
                          className={`filter-popover-item ${currentAgentFilter.length === 0 ? 'selected' : ''}`}
                          onClick={() => {
                            handleToggleAgentFilter(null);
                            setIsAgentMenuOpen(false);
                          }}
                        >
                          <div className="filter-popover-item-left">
                            <Bot size={13} className="text-muted" />
                            <span>All Agents</span>
                          </div>
                          <div className="filter-popover-item-right">
                            <span className="filter-popover-count">{availableAgents.length}</span>
                            {currentAgentFilter.length === 0 && <Check size={12} className="filter-popover-check" />}
                          </div>
                        </button>
                      )}

                      {(!agentSearchQuery.trim() || 'all agents'.includes(agentSearchQuery.toLowerCase())) && filteredTargetAgents.length > 0 && (
                        <div className="filter-popover-divider" />
                      )}

                      {filteredTargetAgents.map((ag) => {
                        const isFiltered = currentAgentFilter.includes(ag.id);
                        const agentPluginsCount = plugins.filter((p) => p.sourceAgentId === ag.id).length;
                        const AgentIcon = AGENT_ICON_MAP[ag.id] || AGENT_ICON_MAP[ag.iconName] || Bot;
                        return (
                          <button
                            type="button"
                            key={ag.id}
                            className={`filter-popover-item ${isFiltered ? 'selected' : ''}`}
                            onClick={() => handleToggleAgentFilter(ag.id)}
                          >
                            <div className="filter-popover-item-left">
                              <span
                                className="filter-popover-dot"
                                style={{ background: ag.color }}
                              />
                              <AgentIcon size={12} style={{ color: ag.color }} />
                              <span>{ag.name}</span>
                            </div>
                            <div className="filter-popover-item-right">
                              <span className="filter-popover-count">{agentPluginsCount}</span>
                              {isFiltered && <Check size={12} className="filter-popover-check" style={{ color: ag.color }} />}
                            </div>
                          </button>
                        );
                      })}

                      {filteredTargetAgents.length === 0 && (agentSearchQuery.trim() && !'all selected agents'.includes(agentSearchQuery.toLowerCase())) && (
                        <div className="toolbar-dropdown-empty">
                          <span>No agents found</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Reset All Active Filters Button */}
          {(selectedCategory !== 'All' || currentAgentFilter.length > 0) && (
            <Tooltip content="Reset all active filters">
              <button
                type="button"
                className="toolbar-reset-filters-btn"
                onClick={() => {
                  setSelectedCategory('All');
                  handleToggleAgentFilter(null);
                }}
                aria-label="Reset all active filters"
              >
                <RotateCcw size={13} className="reset-btn-icon" />
              </button>
            </Tooltip>
          )}
        </div>

        {/* Right: Results Count & View Mode Toggle */}
        <div className="category-toolbar-right">
          <span className="toolbar-items-count">
            {filteredPlugins.length} {filteredPlugins.length === 1 ? 'plugin' : 'plugins'}
          </span>
          <div className="view-mode-toggle font-mono" role="group" aria-label="View mode">
            <Tooltip content="Grid view">
              <button
                type="button"
                className={`view-mode-btn ${viewMode === 'grid' ? 'active' : ''}`}
                onClick={() => handleViewModeChange('grid')}
                aria-label="Grid View"
              >
                <LayoutGrid size={13} />
              </button>
            </Tooltip>
            <Tooltip content="List view">
              <button
                type="button"
                className={`view-mode-btn ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => handleViewModeChange('list')}
                aria-label="List View"
              >
                <ListIcon size={13} />
              </button>
            </Tooltip>
          </div>
        </div>
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
        <div key={`${activeSegment}-empty`} className="empty-state-card segment-content-animated">
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
          {viewMode === 'grid' ? (
            <div key={`${activeSegment}-grid`} className="plugins-grid segment-content-animated">
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
                const domainTheme = getDomainTheme(plugin.category, 'plugin');

                return (
                  <div
                    key={plugin.id}
                    id={`plugin-card-${plugin.id}`}
                    className={`plugin-card ${isHighlighted ? 'item-card-highlighted' : ''} ${plugin.isDisabled ? 'is-card-disabled' : ''}`}
                    onClick={() => setSelectedPluginForDetails(plugin)}
                  >
                    {/* 1. Header: Icon Avatar + Name/Version + Status */}
                    <div className="card-header-cluster">
                      <div className="card-header-left">
                        <div
                          className="card-icon-avatar plugin"
                          style={{
                            background: domainTheme.bg,
                            borderColor: domainTheme.border,
                          }}
                        >
                          <CapabilityIcon type="plugin" category={plugin.category} name={plugin.name} size={16} />
                        </div>
                        <div className="card-identity-text">
                          <div className="card-title-row">
                            <span className="card-item-name" title={plugin.name}>{plugin.name}</span>
                            <span className="version-badge font-mono">v{plugin.version}</span>
                          </div>
                          <div className="card-sub-meta">
                            {plugin.category && (
                              <span className="card-cat-text font-mono" style={{ color: domainTheme.color }}>
                                {plugin.category}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="card-header-right">
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

                    {/* 2. Body: Description + Prerequisite Alert + Bundled capabilities + Equipped Agents */}
                    <div className="card-content-body">
                      <p className={`card-description-text ${!plugin.description ? 'empty-desc' : ''}`}>
                        {plugin.description || 'No description provided for this plugin.'}
                      </p>

                      {depStatus.status === 'missing' && depStatus.firstMissing && (
                        <div className="card-prereq-alert font-mono">
                          <div
                            className="prereq-alert-label"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDepDrawerTarget({
                                targetName: plugin.name,
                                requiredBinaries,
                              });
                            }}
                            title={`Prerequisites missing: ${depStatus.missingBinaries.join(', ')}. Click to inspect install instructions.`}
                          >
                            <AlertCircle size={11} className="prereq-alert-icon" />
                            <span>Requires: <strong>{depStatus.firstMissing}</strong></span>
                          </div>
                          <button
                            type="button"
                            className={`prereq-quick-copy ${copiedDepKey === `dep-${plugin.id}` ? 'copied' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyMissingDep(`dep-${plugin.id}`, depStatus.firstMissing!);
                            }}
                            title={`Copy install command: ${getInstallSnippetForPlatform(depStatus.firstMissing)}`}
                            aria-label="Copy prerequisite install command"
                          >
                            {copiedDepKey === `dep-${plugin.id}` ? <Check size={10} /> : <Copy size={10} />}
                            <span>{copiedDepKey === `dep-${plugin.id}` ? 'COPIED' : 'INSTALL'}</span>
                          </button>
                        </div>
                      )}

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

                      {renderAgentTargetsDeck(plugin.installedAgents, plugin.id)}
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

                      {renderPluginActions(plugin, isInstalledOnAll, isPartiallyInstalled, isLoading)}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div key={`${activeSegment}-list`} className="plugins-list segment-content-animated">
              <div className="plugins-list-header font-mono">
                <span className="col-identity">PLUGIN KIT & DETAILS</span>
                <span className="col-meta">CATEGORY & SOURCE</span>
                <span className="col-agents">EQUIPPED IN</span>
                <span className="col-status">STATUS / PREREQ</span>
                <span className="col-actions right">ACTIONS</span>
              </div>
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
                const domainTheme = getDomainTheme(plugin.category, 'plugin');

                return (
                  <div
                    key={plugin.id}
                    id={`plugin-card-${plugin.id}`}
                    className={`plugin-row-card ${isHighlighted ? 'item-card-highlighted' : ''} ${plugin.isDisabled ? 'is-card-disabled' : ''}`}
                    onClick={() => setSelectedPluginForDetails(plugin)}
                  >
                    {/* Identity Col */}
                    <div className="list-col col-identity">
                      <div
                        className="card-icon-avatar list-avatar plugin"
                        style={{
                          background: domainTheme.bg,
                          borderColor: domainTheme.border,
                        }}
                      >
                        <CapabilityIcon type="plugin" category={plugin.category} name={plugin.name} size={15} />
                      </div>
                      <div className="list-identity-text">
                        <div className="list-title-row">
                          <span className="card-item-name" title={plugin.name}>{plugin.name}</span>
                          <span className="version-badge font-mono">v{plugin.version}</span>
                          {plugin.bundledSkills && plugin.bundledSkills.length > 0 && (
                            <span className="meta-subtle-badge font-mono" title={`${plugin.bundledSkills.length} bundled skills`}>
                              <Sparkles size={10} />
                              <span>{plugin.bundledSkills.length} skills</span>
                            </span>
                          )}
                          {plugin.bundledMcps && plugin.bundledMcps.length > 0 && (
                            <span className="meta-subtle-badge font-mono" title={`${plugin.bundledMcps.length} bundled MCP servers`}>
                              <Server size={10} />
                              <span>{plugin.bundledMcps.length} mcps</span>
                            </span>
                          )}
                        </div>
                        <p className="list-description-snippet" title={plugin.description}>{plugin.description}</p>
                      </div>
                    </div>

                    {/* Meta Col */}
                    <div className="list-col col-meta">
                      {plugin.category && (
                        <span className="card-cat-text font-mono" style={{ color: domainTheme.color }}>
                          {plugin.category}
                        </span>
                      )}
                      {plugin.author && (
                        <span className="author-text font-mono">by {plugin.author}</span>
                      )}
                      {plugin.sourceRegistry && (() => {
                        const badge = formatSourceBadge(plugin.sourceRegistry);
                        return (
                          <span
                            className={`source-registry-pill font-mono ${badge.badgeClass}`}
                            title={`${badge.tooltip} · License: ${plugin.license || 'MIT'}`}
                          >
                            {badge.badgeText}
                          </span>
                        );
                      })()}
                    </div>

                    {/* Equipped Agents Col */}
                    <div className="list-col col-agents">
                      {renderListAgentTargetsDeck(plugin.installedAgents, plugin.id)}
                    </div>

                    {/* Status & Prereqs Col */}
                    <div className="list-col col-status">
                      {depStatus.status !== 'none' && (
                        <div className="dep-badge-cluster">
                          <button
                            type="button"
                            className={`dep-badge ${depStatus.status === 'ready'
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
                                ? `Prerequisites: ${requiredBinaries.join(', ')} (Verified on system PATH)`
                                : `Missing prerequisite: ${depStatus.missingBinaries.join(', ')}`
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
                          title={plugin.isDisabled ? 'Plugin kit is disabled on equipped agents. Click to enable.' : `Equipped on ${plugin.installedAgents.length}/${selectedAgents.length} agents.`}
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

                    {/* Actions Col */}
                    <div className="list-col col-actions right">
                      {renderPluginActions(plugin, isInstalledOnAll, isPartiallyInstalled, isLoading)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

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

      {/* Floating More Options Dropdown */}
      {moreMenuPluginId && moreMenuPosition && (() => {
        const activePlugin = filteredPlugins.find((p) => p.id === moreMenuPluginId);
        if (!activePlugin) return null;
        const isInstalled = activePlugin.installedAgents.length > 0;

        return createPortal(
          <div
            className="card-options-dropdown"
            style={{
              position: 'fixed',
              top: moreMenuPosition.top !== undefined ? `${moreMenuPosition.top}px` : undefined,
              bottom: moreMenuPosition.bottom !== undefined ? `${moreMenuPosition.bottom}px` : undefined,
              right: `${moreMenuPosition.right}px`,
              maxHeight: moreMenuPosition.maxHeight ? `${moreMenuPosition.maxHeight}px` : undefined,
              zIndex: 9999,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="dropdown-item"
              onClick={() => {
                setSelectedPluginForDetails(activePlugin);
                setMoreMenuPluginId(null);
                setMoreMenuPosition(null);
              }}
            >
              <Info size={13} className="item-icon" style={{ color: '#fbbf24' }} />
              <span>Plugin Details</span>
            </button>

            {isInstalled && activePlugin.sourcePath && (
              <button
                className="dropdown-item"
                disabled={loadingEditPluginId === activePlugin.id}
                onClick={() => {
                  handleEditPlugin(activePlugin);
                  setMoreMenuPluginId(null);
                  setMoreMenuPosition(null);
                }}
              >
                {loadingEditPluginId === activePlugin.id ? (
                  <Loader2 size={13} className="item-icon spin" />
                ) : (
                  <Edit3 size={13} className="item-icon" />
                )}
                <span>Edit Plugin Kit</span>
              </button>
            )}

            {isInstalled && (
              <button
                className="dropdown-item"
                onClick={() => {
                  handleOpenPluginFolder(activePlugin);
                  setMoreMenuPluginId(null);
                  setMoreMenuPosition(null);
                }}
              >
                <FolderOpen size={13} className="item-icon" />
                <span>Open in Explorer</span>
              </button>
            )}

            {isInstalled && activePlugin.sourcePath && (
              <button
                className="dropdown-item"
                onClick={() => {
                  handleExportPluginZip(activePlugin);
                  setMoreMenuPluginId(null);
                  setMoreMenuPosition(null);
                }}
              >
                <Archive size={13} className="item-icon" />
                <span>Export as .ZIP</span>
              </button>
            )}

            <button
              className="dropdown-item"
              onClick={() => {
                handleCopyPluginCommand(activePlugin);
                setMoreMenuPluginId(null);
                setMoreMenuPosition(null);
              }}
            >
              {copiedPluginId === activePlugin.id ? (
                <Check size={13} className="item-icon" style={{ color: '#34d399' }} />
              ) : (
                <Copy size={13} className="item-icon" />
              )}
              <span>{copiedPluginId === activePlugin.id ? 'Copied Command!' : 'Copy CLI Command'}</span>
            </button>

            {isInstalled && (
              <>
                <div className="dropdown-divider" />
                <button
                  className="dropdown-item item-danger"
                  onClick={() => {
                    handleUninstallPlugin(activePlugin);
                    setMoreMenuPluginId(null);
                    setMoreMenuPosition(null);
                  }}
                >
                  <Trash2 size={13} className="item-icon" />
                  <span>Uninstall Plugin</span>
                </button>
              </>
            )}
          </div>,
          document.body
        );
      })()}

      {/* Plugin Details Modal */}
      {isDetailsModalRendered && selectedPluginForDetails && createPortal(
        <div
          className={`item-modal-backdrop ${isDetailsModalClosing ? 'is-closing' : ''}`}
          onClick={handleCloseDetailsModal}
        >
          <div
            className={`item-modal-card ${isDetailsModalClosing ? 'is-closing' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="item-modal-header">
              <div className="item-modal-title-area">
                <div className="item-modal-icon-wrap plugin">
                  <CapabilityIcon
                    type="plugin"
                    category={selectedPluginForDetails.category}
                    name={selectedPluginForDetails.name}
                    size={20}
                  />
                </div>
                <div className="item-modal-title-content">
                  <div className="item-modal-title-row">
                    <h3 className="item-modal-title">{selectedPluginForDetails.name}</h3>
                    <span className="item-modal-cat font-mono">v{selectedPluginForDetails.version}</span>
                  </div>
                  <div className="item-modal-subtitle">
                    <span className="badge badge-amber font-mono">PLUGIN</span>
                    <span className={`status-pill-clean ${selectedPluginForDetails.installedAgents.length > 0 ? (selectedPluginForDetails.isDisabled ? 'disabled' : 'installed') : 'available'} font-mono`}>
                      <span className={`status-dot ${selectedPluginForDetails.installedAgents.length > 0 ? (selectedPluginForDetails.isDisabled ? 'disabled' : 'installed') : 'available'}`} />
                      <span>
                        {selectedPluginForDetails.installedAgents.length > 0
                          ? selectedPluginForDetails.isDisabled
                            ? 'DISABLED'
                            : 'INSTALLED'
                          : 'AVAILABLE'}
                      </span>
                    </span>
                    {selectedPluginForDetails.author && (() => {
                      const authorInfo = formatAuthor(selectedPluginForDetails.author);
                      return (
                        <span
                          className={`author-text font-mono ${authorInfo.isLink ? 'clickable' : ''}`}
                          title={authorInfo.url || `Author: ${selectedPluginForDetails.author}`}
                          onClick={(e) => {
                            if (authorInfo.url) {
                              e.stopPropagation();
                              window.electronAPI?.openExternal(authorInfo.url);
                            }
                          }}
                        >
                          <span>by {authorInfo.displayText}</span>
                          {authorInfo.isLink && <ExternalLink size={10} className="author-link-icon" />}
                        </span>
                      );
                    })()}
                  </div>
                </div>
              </div>
              <button
                className="item-modal-close-btn"
                onClick={handleCloseDetailsModal}
                title="Close (Esc)"
                aria-label="Close modal"
              >
                <X size={15} strokeWidth={2} />
              </button>
            </div>

            {/* Body */}
            <div className="item-modal-body">
              {selectedPluginForDetails.description && (
                <div className="detail-section">
                  <div className="detail-label-row">
                    <span className="detail-label">DESCRIPTION</span>
                  </div>
                  <div className="detail-desc-card">
                    <p className="detail-description">{selectedPluginForDetails.description}</p>
                  </div>
                </div>
              )}

              {/* Location on Disk / Path */}
              {resolvePluginPath(selectedPluginForDetails) && (
                <div className="detail-section">
                  <div className="detail-label-row">
                    <span className="detail-label">LOCATION ON DISK</span>
                    <button
                      className="copy-path-btn font-mono"
                      onClick={() => handleCopyPluginPath(selectedPluginForDetails)}
                      title="Copy plugin path"
                    >
                      {copiedPathPluginId === selectedPluginForDetails.id ? (
                        <>
                          <Check size={11} className="text-emerald" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy size={11} />
                          <span>Copy Path</span>
                        </>
                      )}
                    </button>
                  </div>
                  <div className="detail-path-card">
                    <FolderOpen size={13} className="detail-path-icon" />
                    <span className="detail-path-text font-mono">
                      {resolvePluginPath(selectedPluginForDetails)}
                    </span>
                  </div>
                </div>
              )}

              {/* Equipped Agents */}
              {selectedPluginForDetails.installedAgents.length > 0 && (
                <div className="detail-section">
                  <div className="detail-label-row">
                    <span className="detail-label">
                      EQUIPPED AGENTS ({selectedPluginForDetails.installedAgents.length})
                    </span>
                  </div>
                  <div className="detail-agents-list">
                    {selectedPluginForDetails.installedAgents.map((agent) => {
                      const AgentIcon = AGENT_ICON_MAP[agent.id] || AGENT_ICON_MAP[agent.iconName] || Bot;
                      return (
                        <div
                          key={agent.id}
                          className="agent-modal-pill font-mono"
                          style={{
                            borderColor: `${agent.color || '#fbbf24'}40`,
                            background: `${agent.color || '#fbbf24'}10`,
                          }}
                        >
                          <AgentIcon size={12} style={{ color: agent.color || '#fbbf24' }} />
                          <span className="agent-modal-pill-name">{agent.name}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Bundled Skills */}
              {selectedPluginForDetails.bundledSkills && selectedPluginForDetails.bundledSkills.length > 0 && (
                <div className="detail-section">
                  <div className="detail-label-row">
                    <span className="detail-label">BUNDLED SKILLS ({selectedPluginForDetails.bundledSkills.length})</span>
                  </div>
                  <div className="detail-tags-flow">
                    {selectedPluginForDetails.bundledSkills.map((sk) => (
                      <span key={sk} className="meta-subtle-badge font-mono" style={{ color: '#c084fc' }}>
                        <Sparkles size={10} style={{ marginRight: '3px' }} />
                        {sk}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Bundled MCPs */}
              {selectedPluginForDetails.bundledMcps && selectedPluginForDetails.bundledMcps.length > 0 && (
                <div className="detail-section">
                  <div className="detail-label-row">
                    <span className="detail-label">BUNDLED MCP SERVERS ({selectedPluginForDetails.bundledMcps.length})</span>
                  </div>
                  <div className="detail-tags-flow">
                    {selectedPluginForDetails.bundledMcps.map((m) => (
                      <span key={m} className="meta-subtle-badge font-mono" style={{ color: '#38bdf8' }}>
                        <Server size={10} style={{ marginRight: '3px' }} />
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Metadata Grid */}
              <div className="detail-meta-grid">
                <div className="meta-card">
                  <div className="meta-k">BUNDLED SKILLS</div>
                  <div className="meta-v">{selectedPluginForDetails.bundledSkills.length} skills</div>
                </div>
                <div className="meta-card">
                  <div className="meta-k">BUNDLED MCPS</div>
                  <div className="meta-v">{selectedPluginForDetails.bundledMcps.length} servers</div>
                </div>
                <div className="meta-card">
                  <div className="meta-k">BEHAVIORAL RULES</div>
                  <div className="meta-v">{selectedPluginForDetails.rulesCount || 0} rules</div>
                </div>
                <div className="meta-card">
                  <div className="meta-k">CATEGORY</div>
                  <div className="meta-v">{selectedPluginForDetails.category || 'Productivity'}</div>
                </div>
                <div className="meta-card">
                  <div className="meta-k">AUTHOR</div>
                  {(() => {
                    const authorInfo = formatAuthor(selectedPluginForDetails.author);
                    return (
                      <div
                        className={`meta-v ${authorInfo.isLink ? 'clickable' : ''}`}
                        title={authorInfo.url || `Author: ${selectedPluginForDetails.author}`}
                        onClick={(e) => {
                          if (authorInfo.url) {
                            e.stopPropagation();
                            window.electronAPI?.openExternal(authorInfo.url);
                          }
                        }}
                      >
                        <span>{authorInfo.displayText}</span>
                        {authorInfo.isLink && <ExternalLink size={11} className="meta-link-icon" />}
                      </div>
                    );
                  })()}
                </div>
                <div className="meta-card">
                  <div className="meta-k">SOURCE / LICENSE</div>
                  <div className="meta-v font-mono">{selectedPluginForDetails.license || 'MIT'}</div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="item-modal-footer">
              {selectedPluginForDetails.installedAgents.length > 0 ? (
                <button
                  className="modal-action-btn btn-danger"
                  onClick={() => {
                    handleUninstallPlugin(selectedPluginForDetails);
                    handleCloseDetailsModal();
                  }}
                  title="Uninstall this plugin kit"
                >
                  <Trash2 size={13} />
                  <span>Uninstall</span>
                </button>
              ) : <div />}

              <div className="item-modal-footer-right">
                {selectedPluginForDetails.installedAgents.length > 0 && (
                  <>
                    <button
                      className="modal-action-btn"
                      onClick={() => handleOpenPluginFolder(selectedPluginForDetails)}
                      title="Open plugin directory in File Explorer"
                    >
                      <FolderOpen size={13} />
                      <span>Open Folder</span>
                    </button>
                    {selectedPluginForDetails.sourcePath && (
                      <>
                        <button
                          className="modal-action-btn"
                          onClick={() => handleExportPluginZip(selectedPluginForDetails)}
                          title="Export plugin as a .zip distribution package"
                        >
                          <Archive size={13} />
                          <span>Export .ZIP</span>
                        </button>
                        <button
                          className="modal-action-btn"
                          disabled={loadingEditPluginId === selectedPluginForDetails.id}
                          onClick={() => {
                            handleEditPlugin(selectedPluginForDetails);
                            handleCloseDetailsModal();
                          }}
                          title="Edit plugin in authoring studio"
                        >
                          {loadingEditPluginId === selectedPluginForDetails.id ? (
                            <Loader2 size={13} className="spin" />
                          ) : (
                            <Edit3 size={13} />
                          )}
                          <span>Edit</span>
                        </button>
                      </>
                    )}
                    <button
                      className="modal-action-btn"
                      onClick={() => handleReinstallPlugin(selectedPluginForDetails)}
                      title="Reinstall clean copy from registry"
                    >
                      <RotateCcw size={13} />
                      <span>Reinstall</span>
                    </button>
                    <button
                      className={`modal-action-btn ${selectedPluginForDetails.isDisabled ? 'btn-enable' : 'btn-disable'}`}
                      onClick={() => handleTogglePlugin(selectedPluginForDetails)}
                      title={selectedPluginForDetails.isDisabled ? 'Enable plugin' : 'Disable plugin'}
                    >
                      {selectedPluginForDetails.isDisabled ? <Power size={13} /> : <PowerOff size={13} />}
                      <span>{selectedPluginForDetails.isDisabled ? 'Enable Plugin' : 'Disable Plugin'}</span>
                    </button>
                    <button
                      className="modal-action-btn btn-done"
                      onClick={handleCloseDetailsModal}
                      title="Close plugin details"
                    >
                      <Check size={13} />
                      <span>Done</span>
                    </button>
                  </>
                )}
                {selectedPluginForDetails.installedAgents.length === 0 && selectedPluginForDetails.isCatalog && (
                  <>
                    <button
                      className="modal-action-btn"
                      onClick={handleCloseDetailsModal}
                    >
                      Close
                    </button>
                    <button
                      className="modal-action-btn btn-primary"
                      onClick={() => {
                        handleInstallPluginKit(selectedPluginForDetails);
                        handleCloseDetailsModal();
                      }}
                    >
                      <Download size={13} />
                      <span>Install Kit</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
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
          gap: 14px;
          background: #121826;
          border: 1px solid #1e283d;
          border-radius: 10px;
          padding: 10px 16px;
          margin-bottom: 12px;
          box-sizing: border-box;
          min-width: 0;
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
          gap: 8px;
          flex-wrap: wrap;
          min-width: 0;
        }

        .view-title {
          font-size: 16px;
          font-weight: 700;
          color: #f8fafc;
          margin: 0;
          white-space: nowrap;
        }

        .plugins-view-header .count-pill {
          font-size: 10px;
          font-weight: 700;
          color: #38bdf8;
          background: rgba(56, 189, 248, 0.12);
          padding: 2px 7px;
          border-radius: 4px;
          border: 1px solid rgba(56, 189, 248, 0.25);
          white-space: nowrap;
          flex-shrink: 0;
        }

        .catalog-pill {
          font-size: 10px;
          font-weight: 700;
          color: #c084fc;
          background: rgba(192, 132, 252, 0.12);
          padding: 2px 7px;
          border-radius: 4px;
          border: 1px solid rgba(192, 132, 252, 0.25);
          white-space: nowrap;
          flex-shrink: 0;
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
          white-space: nowrap;
          flex-shrink: 0;
        }

        .view-desc {
          font-size: 12px;
          color: #8899ac;
          margin: 0;
          line-height: 1.4;
        }

        .header-actions-wrap {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-shrink: 0;
        }

        .header-buttons-row {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
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
          color: #818cf8;
        }

        .segment-sync-btn.syncing {
          color: #818cf8;
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
          position: relative;
          display: flex;
          align-items: center;
          height: 28px;
          background: #0b0f19;
          border: 1px solid #223048;
          border-radius: 6px;
          padding: 2px;
          gap: 2px;
          box-sizing: border-box;
          overflow: hidden;
        }

        .segment-indicator-pill {
          position: absolute;
          top: 2px;
          left: 0;
          height: 22px;
          background: #1e2a42;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 4px;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
          pointer-events: none;
          z-index: 0;
          will-change: transform, width;
        }

        .segment-btn {
          position: relative;
          z-index: 1;
          background: transparent;
          border: 1px solid transparent;
          color: #8899ac;
          font-size: 11px;
          font-weight: 550;
          padding: 0 9px;
          height: 22px;
          border-radius: 4px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          transition: color 0.18s ease;
          white-space: nowrap;
          box-sizing: border-box;
          user-select: none;
        }

        .segment-btn:hover {
          color: #f1f5f9;
        }

        .segment-btn.active {
          background: transparent;
          color: #ffffff;
          font-weight: 600;
          border-color: transparent;
          box-shadow: none;
        }

        .segment-btn.active .segment-count {
          background: rgba(255, 255, 255, 0.14);
          color: #ffffff;
        }

        .segment-count {
          font-size: 9.5px;
          background: rgba(255, 255, 255, 0.08);
          padding: 1px 5px;
          border-radius: 10px;
          font-family: monospace;
          transition: background-color 0.18s ease, color 0.18s ease;
        }

        .segment-content-animated {
          animation: segmentContentEnter 0.22s cubic-bezier(0.16, 1, 0.3, 1) both;
        }

        @keyframes segmentContentEnter {
          from {
            opacity: 0.2;
            transform: translateY(4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .segment-short-label {
          display: none;
        }

        @media (max-width: 1240px) {
          .plugins-view-header .sync-pill,
          .plugins-view-header .security-hub-pill {
            display: none !important;
          }
        }

        @media (max-width: 1100px) {
          .plugins-view-header {
            flex-wrap: wrap;
            gap: 10px;
            padding: 10px 14px;
          }

          .header-info {
            flex: 1 1 auto;
            min-width: 200px;
          }

          .header-actions-wrap {
            flex: 1 1 auto;
            justify-content: flex-start;
            flex-wrap: wrap;
            gap: 8px;
          }

          .plugins-view-header .view-desc {
            display: none !important;
          }

          .title-long {
            display: none !important;
          }

          .pill-text-long {
            display: none !important;
          }

          .segment-full-label {
            display: none !important;
          }

          .segment-short-label {
            display: inline !important;
          }
        }

        @media (max-width: 800px) {
          .header-actions-wrap {
            width: 100%;
            justify-content: space-between;
          }
        }

        /* Unified Category Toolbar Row - Linear Glass Style */
        .category-toolbar-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          background: rgba(13, 19, 32, 0.7);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.06);
          padding: 0 12px;
          height: 40px;
          min-height: 40px;
          max-height: 40px;
          border-radius: 8px;
          box-sizing: border-box;
          position: relative;
          z-index: 50;
        }

        .category-toolbar-right {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-shrink: 0;
        }

        .view-mode-toggle {
          display: inline-flex;
          align-items: center;
          background: rgba(9, 13, 22, 0.85);
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 6px;
          padding: 2px;
          gap: 2px;
        }

        .view-mode-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 26px;
          height: 24px;
          border-radius: 4px;
          border: none;
          background: transparent;
          color: #64748b;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .view-mode-btn:hover {
          color: #cbd5e1;
          background: rgba(255, 255, 255, 0.06);
        }

        .view-mode-btn.active {
          background: rgba(255, 255, 255, 0.1);
          color: #818cf8;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
        }

        .toolbar-filters-group {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
          flex-wrap: nowrap;
        }

        /* Linear-Style Filter Chip */
        .filter-chip-wrapper {
          position: relative;
          display: inline-flex;
          align-items: center;
          width: 195px;
          max-width: 220px;
          min-width: 130px;
          height: 30px;
          flex-shrink: 1;
          z-index: 60;
        }

        @media (max-width: 850px) {
          .filter-chip-wrapper {
            width: 150px;
          }
        }

        .filter-chip-trigger {
          display: inline-flex;
          align-items: center;
          width: 100%;
          gap: 6px;
          height: 30px;
          min-height: 30px;
          max-height: 30px;
          padding: 0 10px;
          background: rgba(20, 28, 45, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 6px;
          color: #94a3b8;
          font-size: 11.5px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
          user-select: none;
          white-space: nowrap;
          box-sizing: border-box;
        }

        .filter-chip-trigger:hover {
          background: rgba(27, 38, 62, 0.9);
          border-color: rgba(255, 255, 255, 0.16);
          color: #f8fafc;
        }

        .filter-chip-trigger.active {
          background: rgba(129, 140, 248, 0.12);
          border-color: rgba(129, 140, 248, 0.45);
          color: #e0e7ff;
        }

        .filter-chip-trigger.active:hover {
          background: rgba(129, 140, 248, 0.18);
          border-color: rgba(129, 140, 248, 0.65);
        }

        .filter-chip-label {
          display: inline-flex;
          align-items: center;
          color: #64748b;
          font-size: 11px;
          line-height: 1;
          font-weight: 500;
          letter-spacing: 0.01em;
          flex-shrink: 0;
        }

        .filter-chip-trigger.active .filter-chip-label {
          color: #a5b4fc;
        }

        .filter-chip-value {
          display: inline-flex;
          align-items: center;
          color: #f1f5f9;
          font-weight: 600;
          font-size: 11px;
          line-height: 1;
          flex: 1;
          min-width: 0;
          text-align: left;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .filter-chip-icon {
          flex-shrink: 0;
        }

        .filter-chip-icon.text-indigo {
          color: #818cf8;
        }

        .filter-chip-chevron {
          color: #64748b;
          transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          flex-shrink: 0;
          margin-left: auto;
        }

        .filter-chip-chevron.open {
          transform: rotate(180deg);
        }

        .toolbar-reset-filters-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 30px;
          height: 30px;
          min-width: 30px;
          min-height: 30px;
          max-width: 30px;
          max-height: 30px;
          padding: 0;
          background: rgba(20, 28, 45, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 6px;
          color: #94a3b8;
          cursor: pointer;
          transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
          box-sizing: border-box;
          flex-shrink: 0;
        }

        .toolbar-reset-filters-btn:hover {
          background: rgba(239, 68, 68, 0.14);
          border-color: rgba(239, 68, 68, 0.35);
          color: #f87171;
          box-shadow: 0 0 10px rgba(239, 68, 68, 0.18);
        }

        .toolbar-reset-filters-btn:hover .reset-btn-icon {
          transform: rotate(-45deg);
        }

        .toolbar-reset-filters-btn .reset-btn-icon {
          transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          display: block;
        }

        .toolbar-reset-filters-btn:active {
          transform: scale(0.94);
        }

        .toolbar-items-count {
          font-size: 11px;
          color: #64748b;
          font-family: monospace;
          white-space: nowrap;
        }

        /* Floating Filter Popover Menu - Perfectly matched to dropdown box width */
        .filter-popover-menu {
          position: absolute;
          top: calc(100% + 5px);
          left: 0;
          right: 0;
          width: 100%;
          min-width: 100%;
          max-width: 100%;
          background: rgba(13, 19, 32, 0.95);
          backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 18px 40px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.05);
          border-radius: 8px;
          padding: 6px;
          z-index: 1000;
          animation: filterPopoverSlide 0.14s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          box-sizing: border-box;
        }

        @keyframes filterPopoverSlide {
          from {
            opacity: 0;
            transform: translateY(-4px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .filter-popover-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 4px 8px 6px;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #64748b;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          margin-bottom: 4px;
        }

        .filter-popover-reset {
          background: transparent;
          border: none;
          color: #f87171;
          font-size: 10px;
          font-weight: 600;
          cursor: pointer;
          padding: 0;
          transition: color 0.12s ease;
        }

        .filter-popover-reset:hover {
          color: #ef4444;
          text-decoration: underline;
        }

        .toolbar-combobox-search-wrap {
          display: flex;
          align-items: center;
          gap: 6px;
          height: 28px;
          padding: 0 8px;
          margin-bottom: 5px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 5px;
          transition: all 0.15s ease;
          box-sizing: border-box;
        }

        .toolbar-combobox-search-wrap:focus-within {
          background: rgba(255, 255, 255, 0.07);
          border-color: rgba(129, 140, 248, 0.55);
          box-shadow: 0 0 0 1px rgba(129, 140, 248, 0.25);
        }

        .toolbar-combobox-search-icon {
          color: #64748b;
          flex-shrink: 0;
        }

        .toolbar-combobox-search-input {
          flex: 1;
          min-width: 0;
          background: transparent;
          border: none;
          outline: none;
          color: #f1f5f9;
          font-size: 11px;
          font-family: inherit;
          padding: 0;
        }

        .toolbar-combobox-search-input::placeholder {
          color: #64748b;
          font-size: 11px;
        }

        .toolbar-combobox-clear-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 14px;
          height: 14px;
          padding: 0;
          background: rgba(255, 255, 255, 0.08);
          border: none;
          border-radius: 3px;
          color: #94a3b8;
          cursor: pointer;
          transition: all 0.1s ease;
          flex-shrink: 0;
        }

        .toolbar-combobox-clear-btn:hover {
          background: rgba(239, 68, 68, 0.25);
          color: #f87171;
        }

        .toolbar-dropdown-empty {
          padding: 16px 8px;
          text-align: center;
          color: #64748b;
          font-size: 11px;
          font-style: italic;
        }

        .filter-popover-list {
          display: flex;
          flex-direction: column;
          gap: 2px;
          max-height: min(240px, calc(100vh - 280px));
          overflow-y: auto;
          padding-right: 2px;
        }

        .filter-popover-list::-webkit-scrollbar {
          width: 4px;
        }

        .filter-popover-list::-webkit-scrollbar-track {
          background: transparent;
        }

        .filter-popover-list::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.15);
          border-radius: 4px;
        }

        .filter-popover-list::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.3);
        }

        .filter-popover-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
          width: 100%;
          min-height: 28px;
          padding: 5px 8px;
          background: transparent;
          border: 1px solid transparent;
          border-radius: 5px;
          cursor: pointer;
          color: #cbd5e1;
          font-size: 11px;
          text-align: left;
          transition: all 0.12s ease;
          box-sizing: border-box;
        }

        .filter-popover-item:hover {
          background: rgba(255, 255, 255, 0.05);
          border-color: rgba(255, 255, 255, 0.06);
          color: #ffffff;
        }

        .filter-popover-item.selected {
          background: rgba(129, 140, 248, 0.12);
          border-color: rgba(129, 140, 248, 0.25);
          color: #c7d2fe;
          font-weight: 600;
        }

        .filter-popover-item-left {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
          flex: 1;
        }

        .filter-popover-item-left span {
          white-space: normal;
          word-break: break-word;
          line-height: 1.25;
          font-size: 11px;
        }

        .filter-popover-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .filter-popover-item-right {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
        }

        .filter-popover-count {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 19px;
          height: 16px;
          padding: 0 4.5px;
          font-size: 9.5px;
          font-family: var(--font-mono, monospace);
          font-weight: 600;
          line-height: 1;
          border-radius: 4px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #7f91a7;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
          flex-shrink: 0;
          user-select: none;
          box-sizing: border-box;
          transition: all 0.14s ease;
        }

        .filter-popover-item:hover .filter-popover-count {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.16);
          color: #f1f5f9;
        }

        .filter-popover-item.selected .filter-popover-count {
          background: rgba(129, 140, 248, 0.22);
          border-color: rgba(129, 140, 248, 0.45);
          color: #e0e7ff;
          box-shadow: 0 0 8px rgba(129, 140, 248, 0.2);
        }

        .filter-popover-check {
          color: #818cf8;
          flex-shrink: 0;
        }

        .filter-popover-divider {
          height: 1px;
          background: rgba(255, 255, 255, 0.06);
          margin: 3px 0;
        }

        /* Plugins List View */
        .plugins-list {
          display: flex;
          flex-direction: column;
          gap: 7px;
          width: 100%;
          overflow-x: auto;
          padding-bottom: 8px;
          box-sizing: border-box;
        }

        .plugins-list::-webkit-scrollbar {
          height: 6px;
        }

        .plugins-list::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.2);
          border-radius: 9999px;
        }

        .plugins-list::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.12);
          border-radius: 9999px;
        }

        .plugins-list-header {
          position: sticky;
          top: 0;
          z-index: 10;
          display: grid;
          grid-template-columns: minmax(260px, 1fr) 150px 180px 140px 140px;
          min-width: 900px;
          width: 100%;
          gap: 14px;
          padding: 10px 16px;
          font-size: 10px;
          font-weight: 700;
          color: #94a3b8;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          background: rgba(13, 18, 30, 0.92);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          align-items: center;
          user-select: none;
          box-sizing: border-box;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
        }

        .plugins-list-header span {
          display: flex;
          align-items: center;
          justify-content: flex-start;
          min-width: 0;
          text-align: left;
        }

        .plugins-list-header .col-meta,
        .plugins-list-header .col-agents,
        .plugins-list-header .col-status {
          display: flex;
          align-items: center;
          justify-content: flex-start;
          text-align: left;
        }

        .plugins-list-header .right {
          justify-content: flex-end;
          text-align: right;
        }

        .plugin-row-card {
          background: #0f1626;
          border: 1px solid rgba(255, 255, 255, 0.065);
          border-radius: 9px;
          padding: 10px 16px;
          display: grid;
          grid-template-columns: minmax(260px, 1fr) 150px 180px 140px 140px;
          min-width: 900px;
          width: 100%;
          gap: 14px;
          align-items: center;
          min-height: 56px;
          transition: border-color 0.12s ease, background 0.12s ease;
          position: relative;
          box-sizing: border-box;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
          cursor: pointer;
          contain: layout style;
          content-visibility: auto;
          contain-intrinsic-size: auto 56px;
        }

        .plugin-row-card:hover {
          border-color: rgba(245, 158, 11, 0.3);
          background: #131c30;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        }

        .plugin-row-card.is-card-disabled {
          opacity: 0.72;
          background: #0d121f;
        }

        /* List Column Base */
        .plugin-row-card .list-col {
          display: flex;
          align-items: center;
          min-width: 0;
          box-sizing: border-box;
        }

        .plugin-row-card .col-identity {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }

        .card-icon-avatar.list-avatar.plugin {
          width: 34px;
          height: 34px;
          min-width: 34px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.035);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #94a3b8;
          box-shadow: none;
          flex-shrink: 0;
          transition: all 0.15s ease;
        }

        .plugin-row-card:hover .card-icon-avatar.list-avatar.plugin {
          border-color: rgba(168, 85, 247, 0.45);
          color: #f8fafc;
          background: rgba(255, 255, 255, 0.06);
          box-shadow: none;
          transform: none;
        }

        .plugin-row-card .list-identity-text {
          display: flex;
          flex-direction: column;
          gap: 3px;
          min-width: 0;
          overflow: hidden;
          flex: 1;
        }

        .plugin-row-card .list-title-row {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
          line-height: 1.25;
        }

        .plugin-row-card .list-title-row .card-item-name {
          font-size: 13px;
          font-weight: 600;
          color: #f8fafc;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          letter-spacing: -0.01em;
          flex-shrink: 1;
        }

        .plugin-row-card .list-description-snippet {
          margin: 0;
          font-size: 11px;
          color: #94a3b8;
          line-height: 1.35;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          flex: 1;
          min-width: 0;
        }

        .plugin-row-card .col-meta {
          flex-direction: column;
          align-items: flex-start;
          justify-content: center;
          gap: 3px;
          min-width: 0;
        }

        .plugin-row-card .col-agents {
          min-width: 0;
          display: flex;
          align-items: center;
        }

        .list-agents-deck {
          display: flex;
          flex-direction: column;
          min-width: 0;
          width: 100%;
        }

        .list-agents-base-row,
        .list-agents-pills-row {
          display: flex;
          align-items: center;
          gap: 4px;
          flex-wrap: wrap;
          min-width: 0;
          width: 100%;
        }

        .agent-deck-pill.compact {
          padding: 1.5px 6.5px;
          font-size: 9px;
          gap: 3.5px;
          border-radius: 4px;
          line-height: 13px;
        }

        .agent-deck-more-btn.compact {
          padding: 1.5px 5.5px;
          font-size: 8.5px;
          gap: 2.5px;
          border-radius: 4px;
          line-height: 13px;
        }

        .plugin-row-card .col-status {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          justify-content: center;
          gap: 4px;
          min-width: 0;
          width: 100%;
        }

        .plugin-row-card .col-actions.right {
          justify-content: flex-end;
          align-items: center;
          min-width: 0;
          width: 100%;
          overflow: visible;
        }

        .plugin-row-card .col-actions.right .toolbar-right-actions {
          margin: 0;
          display: flex;
          align-items: center;
          gap: 4px;
          flex-wrap: nowrap;
          justify-content: flex-end;
          margin-left: auto;
        }
        .plugins-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 14px;
        }

        .plugin-card {
          background: linear-gradient(180deg, #131b2f 0%, #0d1424 100%);
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 12px;
          padding: 16px 18px;
          display: flex;
          flex-direction: column;
          min-width: 0;
          min-height: 226px;
          box-sizing: border-box;
          transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
          position: relative;
          overflow: hidden;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 2px 8px rgba(0, 0, 0, 0.28);
          cursor: pointer;
          contain: layout style;
          content-visibility: auto;
          contain-intrinsic-size: auto 226px;
        }

        .plugin-card:hover {
          border-color: rgba(168, 85, 247, 0.42);
          background: linear-gradient(180deg, #16203a 0%, #0f182c 100%);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.09), 0 8px 24px -4px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(168, 85, 247, 0.2);
        }

        /* Header: Clean decoupled flex header */
        .card-header-cluster {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 8px;
          min-height: 38px;
          flex-shrink: 0;
        }

        .card-header-left {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          min-width: 0;
          flex: 1;
        }

        .card-icon-avatar.plugin {
          width: 36px;
          height: 36px;
          border-radius: 9px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: none;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .plugin-card:hover .card-icon-avatar.plugin {
          box-shadow: 0 0 16px -2px rgba(168, 85, 247, 0.35);
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
          max-width: 130px;
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
          color: #94a3b8;
          background: rgba(255, 255, 255, 0.035);
          border: 1px solid rgba(255, 255, 255, 0.08);
          padding: 0.5px 5px;
          border-radius: 3px;
          font-weight: 600;
          letter-spacing: 0.03em;
          text-transform: uppercase;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 140px;
          flex-shrink: 0;
          transition: all 0.12s ease;
        }

        .source-registry-pill:hover {
          color: #f1f5f9;
          border-color: rgba(255, 255, 255, 0.16);
          background: rgba(255, 255, 255, 0.06);
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
          border-radius: 4px;
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
          border-radius: 4px;
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
          border-radius: 4px;
          font-size: 9.5px;
          font-weight: 600;
          letter-spacing: 0.02em;
          white-space: nowrap;
          flex-shrink: 0;
          background: rgba(255, 255, 255, 0.035);
          border: 1px solid rgba(255, 255, 255, 0.07);
          color: #94a3b8;
        }

        .status-pill-clean.installed {
          color: #e2e8f0;
          background: rgba(16, 185, 129, 0.06);
          border-color: rgba(16, 185, 129, 0.18);
        }

        .status-pill-clean.disabled {
          color: #fb7185;
          background: rgba(244, 63, 94, 0.06);
          border-color: rgba(244, 63, 94, 0.2);
        }

        .status-pill-clean.partial {
          color: #e2e8f0;
          background: rgba(245, 158, 11, 0.06);
          border-color: rgba(245, 158, 11, 0.18);
        }

        .status-pill-clean.available {
          color: #64748b;
          background: rgba(255, 255, 255, 0.025);
          border-color: rgba(255, 255, 255, 0.05);
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

        .card-description-text.empty-desc {
          color: #64748b;
          font-style: italic;
        }

        /* Prerequisite Alert Banner in Card Body */
        .card-prereq-alert {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
          background: rgba(244, 63, 94, 0.08);
          border: 1px solid rgba(244, 63, 94, 0.25);
          border-radius: 5px;
          padding: 2px 7px;
          height: 24px;
          box-sizing: border-box;
        }

        .prereq-alert-label {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 9.5px;
          color: #fb7185;
          cursor: pointer;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          min-width: 0;
          flex: 1;
        }

        .prereq-alert-label strong {
          color: #fda4af;
        }

        .prereq-alert-icon {
          flex-shrink: 0;
          color: #fb7185;
        }

        .prereq-quick-copy {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          background: rgba(244, 63, 94, 0.15);
          border: 1px solid rgba(244, 63, 94, 0.35);
          color: #fb7185;
          font-size: 8.5px;
          font-weight: 700;
          letter-spacing: 0.04em;
          padding: 1px 5px;
          border-radius: 3px;
          cursor: pointer;
          flex-shrink: 0;
          transition: all 0.15s ease;
          height: 18px;
          box-sizing: border-box;
        }

        .prereq-quick-copy:hover {
          background: rgba(244, 63, 94, 0.25);
          color: #ffffff;
        }

        .prereq-quick-copy.copied {
          background: rgba(52, 211, 153, 0.2);
          border-color: rgba(52, 211, 153, 0.4);
          color: #34d399;
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
          min-width: 0;
          overflow: hidden;
          box-sizing: border-box;
        }

        .meta-subtle-badge svg {
          flex-shrink: 0;
        }

        .meta-subtle-badge span {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          min-width: 0;
          display: block;
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
          max-width: 150px;
          min-width: 0;
          flex-shrink: 1;
          overflow: hidden;
        }

        .meta-subtle-badge.source-badge span {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          min-width: 0;
          display: block;
        }

        /* Modern Agent Targets Deck (Grid View) */
        .agent-deck-container {
          display: flex;
          flex-direction: column;
          gap: 5px;
          background: transparent;
          border: none;
          padding: 2px 0;
          box-sizing: border-box;
          width: 100%;
          min-width: 0;
        }

        .agent-deck-container.empty {
          padding: 2px 0;
        }

        .agent-deck-pills {
          display: flex;
          flex-direction: column;
          width: 100%;
          min-width: 0;
        }

        .agent-deck-base-row {
          display: flex;
          align-items: center;
          gap: 5px;
          flex-wrap: wrap;
          width: 100%;
          min-width: 0;
        }

        .agent-deck-expandable {
          display: grid;
          grid-template-rows: 0fr;
          transition: grid-template-rows 0.3s cubic-bezier(0.16, 1, 0.3, 1),
                      opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1),
                      margin-top 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          opacity: 0;
          margin-top: 0;
          width: 100%;
          min-width: 0;
        }

        .agent-deck-expandable.is-expanded {
          grid-template-rows: 1fr;
          opacity: 1;
          margin-top: 5px;
        }

        .agent-deck-expandable.list-expandable.is-expanded {
          margin-top: 4px;
        }

        .agent-deck-expandable-content {
          overflow: hidden;
          min-height: 0;
          transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          transform: translateY(-5px);
        }

        .agent-deck-expandable.is-expanded .agent-deck-expandable-content {
          transform: translateY(0);
        }

        .agent-deck-overflow-pills,
        .list-agents-overflow-pills {
          display: flex;
          align-items: center;
          gap: 5px;
          flex-wrap: wrap;
          padding-top: 1px;
          padding-bottom: 2px;
          width: 100%;
          min-width: 0;
        }

        .list-agents-overflow-pills {
          gap: 4px;
        }

        .agent-deck-expandable.is-expanded .agent-deck-pill {
          animation: deckPillReveal 0.24s cubic-bezier(0.16, 1, 0.3, 1) backwards;
        }

        @keyframes deckPillReveal {
          from {
            opacity: 0;
            transform: translateY(-4px) scale(0.94);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .agent-deck-pill {
          display: inline-flex;
          align-items: center;
          gap: 4.5px;
          padding: 2.5px 7.5px;
          border-radius: 5px;
          font-size: 10px;
          font-weight: 500;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.035);
          color: #94a3b8;
          cursor: pointer;
          user-select: none;
          white-space: nowrap;
          flex-shrink: 0;
          line-height: 14px;
          outline: none !important;
          box-shadow: none !important;
          transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .agent-deck-pill:focus,
        .agent-deck-pill:focus-visible {
          outline: none !important;
          box-shadow: none !important;
        }

        .agent-deck-pill:hover {
          background: rgba(255, 255, 255, 0.07);
          border-color: rgba(255, 255, 255, 0.16);
          color: #f1f5f9;
        }

        .agent-deck-pill.installed {
          color: #cbd5e1;
          border-color: rgba(255, 255, 255, 0.1);
        }

        .agent-deck-pill.pending {
          color: #64748b;
          border: 1px solid rgba(255, 255, 255, 0.06) !important;
          background: rgba(255, 255, 255, 0.018) !important;
        }

        .agent-deck-pill.pending:hover {
          color: #94a3b8;
          border-color: rgba(255, 255, 255, 0.14) !important;
          background: rgba(255, 255, 255, 0.05) !important;
        }

        .agent-deck-pill.is-filtered {
          font-weight: 600;
          border-color: rgba(168, 85, 247, 0.45) !important;
          background: rgba(168, 85, 247, 0.12) !important;
          color: #f3e8ff !important;
        }
        }

        .agent-deck-pill .pill-brand-icon {
          flex-shrink: 0;
        }

        .agent-deck-pill .pill-name {
          font-family: inherit;
        }

        .agent-deck-pill .pill-check-icon {
          flex-shrink: 0;
        }

        .agent-deck-more-btn {
          display: inline-flex;
          align-items: center;
          gap: 3.5px;
          padding: 2px 7px;
          border-radius: 5px;
          font-size: 9.5px;
          font-weight: 600;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.12);
          color: #cbd5e1;
          cursor: pointer;
          user-select: none;
          white-space: nowrap;
          flex-shrink: 0;
          line-height: 14px;
          transition: background 0.18s ease,
                      border-color 0.18s ease,
                      color 0.18s ease,
                      transform 0.18s ease,
                      box-shadow 0.18s ease;
        }

        .agent-deck-more-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.25);
          color: #ffffff;
        }

        .agent-deck-more-btn.is-expanded {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.22);
          color: #f1f5f9;
        }

        .agent-deck-more-btn .deck-chevron {
          transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
          flex-shrink: 0;
        }

        .agent-deck-more-btn .deck-chevron.rotated {
          transform: rotate(180deg);
        }

        /* List View Equipped Agents styling */
        .equipped-agents-bar {
          display: flex;
          align-items: flex-start;
          gap: 6px;
          background: rgba(0, 0, 0, 0.28);
          border: 1px solid rgba(255, 255, 255, 0.06);
          padding: 5px 8px;
          border-radius: 6px;
          min-height: 28px;
          box-sizing: border-box;
          width: 100%;
          min-width: 0;
        }

        .equipped-agents-bar.inactive {
          background: rgba(0, 0, 0, 0.15);
          border-color: rgba(255, 255, 255, 0.03);
        }

        .equipped-label {
          font-size: 9.5px;
          color: #64748b;
          font-weight: 600;
          flex-shrink: 0;
          white-space: nowrap;
          line-height: 20px;
        }

        .equipped-pills-list {
          display: flex;
          align-items: center;
          gap: 4px;
          flex-wrap: wrap;
          flex: 1;
          min-width: 0;
        }

        .equipped-pills-list.compact {
          flex-wrap: wrap;
          gap: 3.5px;
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

        .agent-pill.compact {
          padding: 1px 5px;
          font-size: 9px;
          gap: 3px;
        }

        .agent-pill.clickable {
          cursor: pointer;
          user-select: none;
        }

        .agent-pill.clickable:hover {
          filter: brightness(1.15);
        }

        .agent-pill.filtered-active {
          font-weight: 600;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
        }

        .agent-pill.unequipped {
          border: 1px solid rgba(255, 255, 255, 0.06) !important;
          background: rgba(255, 255, 255, 0.018) !important;
          color: #64748b !important;
        }

        .agent-pill.unequipped:hover {
          color: #94a3b8 !important;
          border-color: rgba(255, 255, 255, 0.14) !important;
          background: rgba(255, 255, 255, 0.05) !important;
        }

        /* Bottom Toolbar: Clean 36px height, consistent across tabs */
        .card-bottom-toolbar {
          margin-top: auto;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
          padding-top: 10px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          min-height: 36px;
          height: 36px;
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
          gap: 4px;
          flex-shrink: 0;
          margin-left: auto;
        }

        .card-action-icon-btn {
          width: 28px;
          height: 28px;
          min-width: 28px;
          max-width: 28px;
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #8fa0b5;
          border-radius: 6px;
          cursor: pointer;
          transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
          padding: 0;
          box-sizing: border-box;
        }

        .card-action-icon-btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.09);
          color: #ffffff;
          border-color: rgba(255, 255, 255, 0.2);
        }

        .card-action-icon-btn.edit:hover:not(:disabled) {
          background: rgba(245, 158, 11, 0.14);
          color: #fbbf24;
          border-color: rgba(245, 158, 11, 0.35);
        }

        .card-action-icon-btn.reinstall {
          color: #fbbf24;
          border-color: rgba(245, 158, 11, 0.2);
          background: rgba(245, 158, 11, 0.05);
        }

        .card-action-icon-btn.reinstall:hover:not(:disabled) {
          background: rgba(245, 158, 11, 0.14);
          color: #ffffff;
          border-color: rgba(245, 158, 11, 0.35);
        }

        .security-hub-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          background: rgba(168, 85, 247, 0.08);
          border: 1px solid rgba(168, 85, 247, 0.24);
          color: #c084fc;
          font-size: 10px;
          font-weight: 600;
          padding: 2px 7px;
          border-radius: 4px;
          letter-spacing: 0.04em;
          user-select: none;
        }

        .card-action-icon-btn.danger {
          color: #f87171;
          border-color: rgba(239, 68, 68, 0.2);
          background: rgba(239, 68, 68, 0.05);
        }

        .card-action-icon-btn.danger:hover:not(:disabled) {
          background: rgba(239, 68, 68, 0.15);
          color: #ffffff;
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
          gap: 5.5px;
          height: 28px;
          padding: 0 12px;
          background: rgba(245, 158, 11, 0.12);
          border: 1px solid rgba(245, 158, 11, 0.3);
          color: #fef3c7;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.01em;
          border-radius: 6px;
          cursor: pointer;
          transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
          white-space: nowrap;
          box-sizing: border-box;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
        }

        .plugins-view-container .card-primary-action-btn:hover:not(:disabled) {
          background: rgba(245, 158, 11, 0.22);
          border-color: rgba(245, 158, 11, 0.55);
          color: #ffffff;
        }

        .card-primary-action-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .spin {
          animation: spin 1s linear infinite;
        }

        /* Highlighted Plugin Card with genuine GPU animated fade-out */
        .plugin-card.item-card-highlighted,
        .plugin-row-card.item-card-highlighted,
        .item-card-highlighted {
          position: relative;
          z-index: 10;
          animation: highlightPluginBorder 2.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        .plugin-card.item-card-highlighted > *,
        .plugin-row-card.item-card-highlighted > *,
        .item-card-highlighted > * {
          position: relative;
          z-index: 1;
        }

        .plugin-card.item-card-highlighted::before,
        .plugin-row-card.item-card-highlighted::before,
        .item-card-highlighted::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: linear-gradient(135deg, rgba(245, 158, 11, 0.09), rgba(217, 119, 6, 0.03));
          pointer-events: none;
          z-index: 0;
          animation: highlightPluginOverlay 2.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        @keyframes highlightPluginBorder {
          0% {
            border-color: rgba(245, 158, 11, 0.85);
            box-shadow: 0 0 20px rgba(245, 158, 11, 0.4);
          }
          20% {
            border-color: rgba(245, 158, 11, 0.8);
            box-shadow: 0 0 16px rgba(245, 158, 11, 0.3);
          }
          45% {
            border-color: rgba(245, 158, 11, 0.6);
            box-shadow: 0 0 12px rgba(245, 158, 11, 0.2);
          }
          70% {
            border-color: rgba(245, 158, 11, 0.3);
            box-shadow: 0 0 8px rgba(245, 158, 11, 0.1);
          }
          100% {
            border-color: rgba(255, 255, 255, 0.07);
            box-shadow: none;
          }
        }

        @keyframes highlightPluginOverlay {
          0%, 25% {
            opacity: 1;
          }
          50% {
            opacity: 0.65;
          }
          75% {
            opacity: 0.25;
          }
          100% {
            opacity: 0;
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

        /* Floating 3-dots Context Menu */
        .card-options-dropdown {
          background: #111827;
          border: 1px solid #1f293d;
          border-radius: 8px;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.6), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
          padding: 5px;
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 175px;
          max-height: calc(100vh - 24px);
          overflow-y: auto;
          overflow-x: hidden;
          animation: dropdownFadeIn 0.12s ease-out;
        }

        .card-options-dropdown::-webkit-scrollbar {
          width: 4px;
        }

        .card-options-dropdown::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.2);
          border-radius: 4px;
        }

        @keyframes dropdownFadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .card-options-dropdown .dropdown-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 7px 10px;
          border-radius: 5px;
          font-size: 12px;
          font-weight: 500;
          color: #cbd5e1;
          background: transparent;
          border: none;
          cursor: pointer;
          text-align: left;
          width: 100%;
          transition: background 0.1s ease, color 0.1s ease;
          white-space: nowrap;
        }

        .card-options-dropdown .dropdown-item:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.07);
          color: #ffffff;
        }

        .card-options-dropdown .dropdown-item .item-icon {
          flex-shrink: 0;
          color: #94a3b8;
        }

        .card-options-dropdown .dropdown-item:hover .item-icon {
          color: #f8fafc;
        }

        .card-options-dropdown .dropdown-item.item-danger {
          color: #f87171;
        }

        .card-options-dropdown .dropdown-item.item-danger:hover {
          background: rgba(239, 68, 68, 0.14);
          color: #fca5a5;
        }

        .card-options-dropdown .dropdown-item.item-danger .item-icon {
          color: #f87171;
        }

        .card-options-dropdown .dropdown-divider {
          height: 1px;
          background: #1e293b;
          margin: 4px 0;
        }

        /* Package Details Modal */
        .item-modal-backdrop {
          position: fixed;
          inset: 0;
          background: radial-gradient(ellipse at 50% 40%, rgba(13, 19, 36, 0.62) 0%, rgba(4, 7, 15, 0.74) 100%);
          backdrop-filter: blur(16px) saturate(180%) contrast(105%);
          -webkit-backdrop-filter: blur(16px) saturate(180%) contrast(105%);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          padding: 18px 16px;
          animation: itemModalFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          will-change: opacity;
        }

        .item-modal-backdrop.is-closing {
          animation: itemModalFadeOut 0.16s cubic-bezier(0.4, 0, 1, 1) forwards !important;
          pointer-events: none !important;
        }

        @keyframes itemModalFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes itemModalFadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }

        .item-modal-card {
          background: #0d1322;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 14px;
          width: 100%;
          max-width: 760px;
          min-width: 0;
          box-sizing: border-box;
          box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5), 0 25px 65px -12px rgba(0, 0, 0, 0.85), inset 0 1px 0 0 rgba(255, 255, 255, 0.1);
          overflow: hidden;
          overflow-x: hidden;
          animation: itemModalScaleIn 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          display: flex;
          flex-direction: column;
          max-height: min(94vh, calc(100vh - 36px));
          position: relative;
        }

        .item-modal-card.is-closing {
          animation: itemModalScaleOut 0.16s cubic-bezier(0.4, 0, 1, 1) forwards !important;
        }

        @keyframes itemModalScaleIn {
          from { opacity: 0; transform: scale(0.97) translateY(8px); }
          to { opacity: 1; transform: none; }
        }

        @keyframes itemModalScaleOut {
          from { opacity: 1; transform: none; }
          to { opacity: 0; transform: scale(0.97) translateY(8px); }
        }

        .item-modal-header {
          padding: 16px 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.07);
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.02) 0%, transparent 100%), #0e1526;
          flex-shrink: 0;
          gap: 14px;
          min-width: 0;
          width: 100%;
          box-sizing: border-box;
        }

        .item-modal-title-area {
          display: flex;
          align-items: center;
          gap: 14px;
          min-width: 0;
          flex-1;
        }

        .item-modal-title-content {
          min-width: 0;
          flex: 1;
        }

        .item-modal-icon-wrap {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .item-modal-icon-wrap.plugin {
          background: rgba(245, 158, 11, 0.14);
          border: 1px solid rgba(245, 158, 11, 0.35);
          color: #fbbf24;
          box-shadow: 0 0 16px rgba(245, 158, 11, 0.15);
        }

        .item-modal-title-row {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
          flex-wrap: wrap;
        }

        .item-modal-title {
          font-size: 16px;
          font-weight: 700;
          color: #f8fafc;
          margin: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          letter-spacing: -0.015em;
        }

        .item-modal-cat {
          font-size: 10.5px;
          font-weight: 600;
          color: #fbbf24;
          background: rgba(245, 158, 11, 0.08);
          border: 1px solid rgba(245, 158, 11, 0.2);
          padding: 1.5px 7px;
          border-radius: 4px;
        }

        .item-modal-subtitle {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 4px;
          flex-wrap: wrap;
          min-width: 0;
          max-width: 100%;
        }

        .item-modal-subtitle .author-text {
          font-size: 10px;
          color: #64748b;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          min-width: 0;
          max-width: 320px;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          line-height: 1.2;
        }

        .item-modal-subtitle .author-text.clickable {
          cursor: pointer;
          transition: color 0.12s ease;
        }

        .item-modal-subtitle .author-text.clickable:hover {
          color: #fbbf24;
          text-decoration: underline;
        }

        .author-link-icon {
          flex-shrink: 0;
          opacity: 0.7;
        }

        .item-modal-close-btn {
          align-self: flex-start;
          margin-top: 2px;
          width: 28px;
          height: 28px;
          padding: 0;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #94a3b8;
          cursor: pointer;
          border-radius: 7px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
          flex-shrink: 0;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
          user-select: none;
        }

        .item-modal-close-btn:hover {
          color: #f8fafc;
          background: rgba(255, 255, 255, 0.09);
          border-color: rgba(255, 255, 255, 0.18);
          transform: translateY(-0.5px);
        }

        .item-modal-close-btn:active {
          transform: translateY(0.5px);
          background: rgba(255, 255, 255, 0.14);
        }

        .item-modal-body {
          padding: 16px 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          overflow-y: auto;
          overflow-x: hidden;
          min-height: 0;
          min-width: 0;
          width: 100%;
          box-sizing: border-box;
          flex: 1 1 auto;
          overscroll-behavior-y: contain;
        }

        .item-modal-body::-webkit-scrollbar {
          width: 5px;
        }

        .item-modal-body::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.15);
          border-radius: 4px;
        }

        .item-modal-body::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.25);
        }

        .detail-section {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .detail-label-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .detail-label {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.08em;
          color: #64748b;
          font-family: var(--font-mono, monospace);
        }

        .detail-desc-card {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 9px;
          padding: 9px 13px;
        }

        .detail-description {
          font-size: 13px;
          line-height: 1.6;
          color: #cbd5e1;
          word-break: break-word;
          margin: 0;
        }

        .detail-path-card {
          background: #080c14;
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 8px;
          padding: 9px 12px;
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
        }

        .detail-path-icon {
          color: #64748b;
          flex-shrink: 0;
        }

        .detail-path-text {
          font-size: 11.5px;
          color: #93c5fd;
          word-break: break-all;
          flex: 1;
          user-select: text;
        }

        .copy-path-btn {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #cbd5e1;
          font-size: 11px;
          font-weight: 500;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          cursor: pointer;
          padding: 2px 7px;
          border-radius: 5px;
          transition: all 0.12s;
        }

        .copy-path-btn:hover {
          background: rgba(255, 255, 255, 0.09);
          color: #ffffff;
          border-color: rgba(255, 255, 255, 0.15);
        }

        .detail-agents-list {
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
        }

        .agent-modal-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 3px 9px;
          border-radius: 6px;
          border: 1px solid transparent;
          font-size: 11px;
          font-weight: 600;
          color: #f1f5f9;
        }

        .agent-modal-pill-name {
          font-size: 11px;
        }

        .detail-meta-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
          width: 100%;
          min-width: 0;
          box-sizing: border-box;
        }

        .meta-card {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 8px;
          padding: 8px 11px;
          display: flex;
          flex-direction: column;
          gap: 3px;
          min-width: 0;
          overflow: hidden;
          box-sizing: border-box;
          transition: border-color 0.15s, background 0.15s;
        }

        .meta-card:hover {
          border-color: rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.035);
        }

        .meta-k {
          font-size: 9.5px;
          font-weight: 700;
          letter-spacing: 0.06em;
          color: #64748b;
          font-family: var(--font-mono, monospace);
        }

        .meta-v {
          font-size: 12px;
          font-weight: 600;
          color: #e2e8f0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 5px;
        }

        .meta-v.clickable {
          cursor: pointer;
          color: #fbbf24;
          transition: color 0.12s ease;
        }

        .meta-v.clickable:hover {
          color: #fde68a;
          text-decoration: underline;
        }

        .meta-link-icon {
          flex-shrink: 0;
          opacity: 0.7;
        }

        .detail-tags-flow {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .item-modal-footer {
          padding: 12px 20px;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #090e1a;
          flex-shrink: 0;
          gap: 12px;
          box-sizing: border-box;
        }

        .item-modal-footer-right {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: nowrap;
          flex-shrink: 0;
        }

        .modal-action-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          height: 32px;
          padding: 0 13px;
          border-radius: 6px;
          font-size: 11.5px;
          font-weight: 600;
          letter-spacing: 0.01em;
          cursor: pointer;
          border: 1px solid rgba(255, 255, 255, 0.09);
          background: rgba(255, 255, 255, 0.05);
          color: #cbd5e1;
          transition: all 0.14s cubic-bezier(0.16, 1, 0.3, 1);
          white-space: nowrap;
          box-sizing: border-box;
          user-select: none;
        }

        .modal-action-btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.1);
          color: #ffffff;
          border-color: rgba(255, 255, 255, 0.2);
          transform: translateY(-1px);
        }

        .modal-action-btn:active:not(:disabled) {
          transform: translateY(0);
        }

        .modal-action-btn.btn-danger {
          color: #f87171;
          border-color: rgba(239, 68, 68, 0.25);
          background: rgba(239, 68, 68, 0.06);
        }

        .modal-action-btn.btn-danger:hover:not(:disabled) {
          background: rgba(239, 68, 68, 0.16);
          border-color: rgba(239, 68, 68, 0.45);
          color: #fca5a5;
        }

        .modal-action-btn.btn-primary {
          background: linear-gradient(135deg, #d97706, #b45309);
          border-color: rgba(245, 158, 11, 0.45);
          color: #ffffff;
          box-shadow: 0 2px 8px rgba(245, 158, 11, 0.25);
        }

        .modal-action-btn.btn-primary:hover:not(:disabled) {
          background: linear-gradient(135deg, #f59e0b, #d97706);
          border-color: rgba(245, 158, 11, 0.65);
          box-shadow: 0 4px 14px rgba(245, 158, 11, 0.4);
          color: #ffffff;
        }

        .modal-action-btn.btn-done {
          background: linear-gradient(135deg, #059669, #10b981);
          border-color: rgba(16, 185, 129, 0.45);
          color: #ffffff;
          box-shadow: 0 2px 8px rgba(5, 150, 105, 0.25);
        }

        .modal-action-btn.btn-done:hover:not(:disabled) {
          background: linear-gradient(135deg, #047857, #059669);
          border-color: rgba(16, 185, 129, 0.65);
          box-shadow: 0 4px 14px rgba(5, 150, 105, 0.4);
          color: #ffffff;
        }

        .modal-action-btn.btn-enable {
          background: rgba(16, 185, 129, 0.12);
          border-color: rgba(16, 185, 129, 0.35);
          color: #6ee7b7;
        }

        .modal-action-btn.btn-enable:hover:not(:disabled) {
          background: rgba(16, 185, 129, 0.22);
          border-color: rgba(16, 185, 129, 0.55);
          color: #ffffff;
        }

        .modal-action-btn.btn-disable {
          background: rgba(244, 63, 94, 0.1);
          border-color: rgba(244, 63, 94, 0.3);
          color: #fda4af;
        }

        .modal-action-btn.btn-disable:hover:not(:disabled) {
          background: rgba(244, 63, 94, 0.2);
          border-color: rgba(244, 63, 94, 0.5);
          color: #ffffff;
        }

        @media (max-width: 620px) {
          .item-modal-footer {
            flex-direction: column-reverse;
            align-items: stretch;
            gap: 10px;
          }
          .item-modal-footer-right {
            flex-wrap: wrap;
            justify-content: flex-end;
          }
          .item-modal-footer .btn-danger {
            width: 100%;
            justify-content: center;
          }
        }
      `}</style>
    </div>
  );
};

export const PluginsView = React.memo(PluginsViewComponent, (prev, next) => {
  if (prev.isActive === false && next.isActive === false) {
    return true;
  }
  if (prev.isActive !== next.isActive) {
    return false;
  }
  return (
    prev.plugins === next.plugins &&
    prev.selectedAgents === next.selectedAgents &&
    prev.allAgents === next.allAgents &&
    prev.skills === next.skills &&
    prev.mcpServers === next.mcpServers &&
    prev.pluginsCatalog === next.pluginsCatalog &&
    prev.skillsCatalog === next.skillsCatalog &&
    prev.searchQuery === next.searchQuery &&
    prev.highlightedId === next.highlightedId &&
    prev.isSyncingCatalog === next.isSyncingCatalog &&
    prev.catalogSyncedAt === next.catalogSyncedAt &&
    prev.activeAgentFilter === next.activeAgentFilter &&
    prev.dependencyReport === next.dependencyReport
  );
});
