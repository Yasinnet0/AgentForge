import React, { useState, useEffect, useMemo, useRef, useLayoutEffect, useCallback, useDeferredValue } from 'react';
import { createPortal } from 'react-dom';
import { ScannedMcpServer, SupportedAgent } from '../types/agent';
import { CatalogMcpServer } from '../types/catalog';
import { MCP_CATALOG } from '../data/mcpCatalog';
import { 
  Server, 
  Bot, 
  Terminal, 
  Plus, 
  Globe, 
  KeyRound, 
  CheckCircle2, 
  Package,
  Trash2,
  Loader2,
  Filter,
  FolderOpen,
  Check,
  ChevronDown,
  Search,
  X,
  RefreshCw,
  AlertCircle,
  Copy,
  Power,
  PowerOff,
  LayoutGrid,
  List as ListIcon,
  RotateCcw,
  Eye,
  EyeOff,
  ShieldCheck,
  MoreVertical,
  Info,
  ExternalLink,
} from 'lucide-react';
import { formatAuthor } from '../utils/formatUtils';
import { useModalTransition } from '../hooks/useModalTransition';
import { logActivity } from '../services/activityLogger';
import { useToast } from '../context/ToastContext';
import { formatSourceBadge } from '../services/catalogSync';
import { DependencyReport } from '../types/dependencies';
import { getRequiredDependencies, evaluateDependencyStatus, getInstallSnippetForPlatform } from '../utils/dependencyResolver';
import { DependencyInstallDrawer } from './DependencyInstallDrawer';
import { AGENT_ICON_MAP } from './AgentIcon';
import { Tooltip } from './Tooltip';

interface McpServersViewProps {
  mcpServers: ScannedMcpServer[];
  selectedAgents: SupportedAgent[];
  mcpCatalog?: CatalogMcpServer[];
  catalogSyncedAt?: string | null;
  onAddServer?: () => void;
  onRefreshCapabilities?: () => Promise<void>;
  searchQuery?: string;
  highlightedId?: string | null;
  activeAgentFilter?: string[];
  onAgentFilterChange?: (agentIds: string[]) => void;
  isSyncingCatalog?: boolean;
  onSyncCatalog?: () => void;
  dependencyReport?: DependencyReport | null;
  onRefreshDependencies?: () => Promise<void>;
}

type SegmentTab = 'all' | 'installed' | 'available';

interface UnifiedMcpCard {
  id: string;
  name: string;
  description?: string;
  category?: string;
  transport: 'stdio' | 'sse';
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  envKeys?: string[];
  author?: string;
  tags?: string[];
  docsUrl?: string;
  isCatalog: boolean;
  installedAgents: SupportedAgent[];
  pluginName?: string;
  sourcePath?: string;
  sourceRegistry?: string;
  license?: string;
  disabledAgentIds?: string[];
  isDisabled?: boolean;
  currentEnv?: Record<string, string>;
}

export const McpServersView: React.FC<McpServersViewProps> = ({
  mcpServers,
  selectedAgents,
  mcpCatalog,
  catalogSyncedAt,
  onAddServer,
  onRefreshCapabilities,
  searchQuery = '',
  highlightedId,
  activeAgentFilter: propActiveAgentFilter,
  onAgentFilterChange,
  isSyncingCatalog = false,
  onSyncCatalog,
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
    return (localStorage.getItem('agentforge_view_mode_mcp') as 'grid' | 'list') || 'grid';
  });

  const handleViewModeChange = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    localStorage.setItem('agentforge_view_mode_mcp', mode);
  };
  const [localAgentFilter, setLocalAgentFilter] = useState<string[]>([]);
  const currentAgentFilter = propActiveAgentFilter !== undefined ? propActiveAgentFilter : localAgentFilter;
  const setAgentFilter = onAgentFilterChange || setLocalAgentFilter;
  const [loadingServerKey, setLoadingServerKey] = useState<string | null>(null);
  const [depDrawerTarget, setDepDrawerTarget] = useState<{
    targetName: string;
    requiredBinaries: string[];
  } | null>(null);
  const [copiedCmdId, setCopiedCmdId] = useState<string | null>(null);
  const [copiedDepKey, setCopiedDepKey] = useState<string | null>(null);
  const [togglingMcpId, setTogglingMcpId] = useState<string | null>(null);
  const [moreMenuMcpId, setMoreMenuMcpId] = useState<string | null>(null);
  const [moreMenuPosition, setMoreMenuPosition] = useState<{
    top?: number;
    bottom?: number;
    right: number;
    maxHeight?: number;
  } | null>(null);
  const [selectedMcpForDetails, setSelectedMcpForDetails] = useState<UnifiedMcpCard | null>(null);
  const [copiedPathMcpId, setCopiedPathMcpId] = useState<string | null>(null);

  const {
    isRendered: isDetailsModalRendered,
    isClosing: isDetailsModalClosing,
    handleClose: handleCloseDetailsModal,
  } = useModalTransition(
    Boolean(selectedMcpForDetails),
    () => setSelectedMcpForDetails(null),
    180
  );

  const resolveMcpPath = (server: UnifiedMcpCard) => {
    if (server.sourcePath) return server.sourcePath;
    if (server.installedAgents.length > 0) {
      const agent = server.installedAgents[0];
      const p = agent.resolvedPaths?.mcpConfigPath || agent.paths?.mcpConfigPath;
      if (p) return p;
    }
    return '';
  };

  const handleCopyMcpPath = async (server: UnifiedMcpCard) => {
    const path = resolveMcpPath(server);
    if (!path) return;
    try {
      await navigator.clipboard.writeText(path);
      setCopiedPathMcpId(server.id);
      toast.success('Configuration path copied to clipboard');
      setTimeout(() => setCopiedPathMcpId(null), 2000);
    } catch {
      toast.error('Failed to copy config path');
    }
  };
  const [keyPromptModal, setKeyPromptModal] = useState<{
    server: UnifiedMcpCard;
    envKeys: string[];
    inputValues: Record<string, string>;
  } | null>(null);
  const [showKeySecret, setShowKeySecret] = useState<Record<string, boolean>>({});
  const toast = useToast();

  const handleCopyCommand = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCmdId(id);
      toast.success('Copied execution command to clipboard!');
      setTimeout(() => setCopiedCmdId(null), 2000);
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  };

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

  const handleCopyMcpConfig = async (server: UnifiedMcpCard) => {
    try {
      const configObj: Record<string, any> = {
        transport: server.transport,
      };
      if (server.transport === 'sse' && server.url) {
        configObj.url = server.url;
      } else {
        if (server.command) configObj.command = server.command;
        if (server.args && server.args.length > 0) configObj.args = server.args;
      }
      if (server.env && Object.keys(server.env).length > 0) {
        configObj.env = server.env;
      }
      const jsonStr = JSON.stringify({ [server.id]: configObj }, null, 2);
      await navigator.clipboard.writeText(jsonStr);
      setCopiedCmdId(`config-${server.id}`);
      toast.success(`Copied MCP JSON config for "${server.name}"!`);
      setTimeout(() => setCopiedCmdId(null), 2000);
    } catch {
      toast.error('Failed to copy configuration');
    }
  };
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
        setMoreMenuMcpId(null);
        setMoreMenuPosition(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMoreMenuMcpId(null);
        setMoreMenuPosition(null);
        handleCloseDetailsModal();
      }
    };
    const handleScroll = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (target && target.closest && target.closest('.card-options-dropdown')) {
        return;
      }
      setMoreMenuMcpId(null);
      setMoreMenuPosition(null);
    };
    const handleResize = () => {
      setMoreMenuMcpId(null);
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

  const activeMcpCatalog = mcpCatalog || MCP_CATALOG;

  // Data Processing
  const unifiedServers = useMemo<UnifiedMcpCard[]>(() => {
    const list: UnifiedMcpCard[] = [];
    const processedKeys = new Set<string>();

    for (const cat of activeMcpCatalog) {
      processedKeys.add(cat.id.toLowerCase());
      const installedMatches = mcpServers.filter(
        (s) =>
          s.name.toLowerCase() === cat.id.toLowerCase() &&
          selectedAgents.some((a) => a.id === s.sourceAgentId)
      );
      const installedOn = selectedAgents.filter((agent) =>
        installedMatches.some((s) => s.sourceAgentId === agent.id)
      );
      const disabledAgentIds = installedMatches
        .filter((s) => s.disabled)
        .map((s) => s.sourceAgentId);
      const isDisabled = installedOn.length > 0 && disabledAgentIds.length >= installedOn.length;

      const localMatch = installedMatches[0];

      list.push({
        id: cat.id,
        name: cat.name,
        description: cat.description,
        category: cat.category,
        transport: localMatch?.transport || cat.transport,
        command: localMatch?.command || cat.command,
        args: localMatch?.args || cat.args,
        url: localMatch?.url || cat.url,
        env: cat.env,
        envKeys: localMatch?.envKeys || cat.envKeys || Object.keys(cat.env || {}),
        author: cat.author,
        tags: cat.tags,
        docsUrl: cat.docsUrl,
        sourceRegistry: cat.sourceRegistry || 'Official MCP',
        license: cat.license || 'MIT / Apache-2.0',
        isCatalog: true,
        installedAgents: installedOn,
        disabledAgentIds,
        isDisabled,
        pluginName: localMatch?.pluginName,
        sourcePath: localMatch?.sourcePath,
        currentEnv: localMatch?.env,
      });
    }

    for (const s of mcpServers) {
      const key = s.name.toLowerCase();
      if (!processedKeys.has(key)) {
        processedKeys.add(key);
        const installedMatches = mcpServers.filter(
          (other) =>
            other.name.toLowerCase() === key &&
            selectedAgents.some((a) => a.id === other.sourceAgentId)
        );
        const installedOn = selectedAgents.filter((agent) =>
          installedMatches.some((other) => other.sourceAgentId === agent.id)
        );
        const disabledAgentIds = installedMatches
          .filter((other) => other.disabled)
          .map((other) => other.sourceAgentId);
        const isDisabled = installedOn.length > 0 && disabledAgentIds.length >= installedOn.length;

        list.push({
          id: s.name,
          name: s.name,
          description: `Custom configured MCP server in ${installedOn.map((a) => a.name).join(', ')}`,
          category: 'Custom Local',
          transport: s.transport,
          command: s.command,
          args: s.args,
          url: s.url,
          env: s.env,
          envKeys: s.envKeys,
          sourceRegistry: 'Local Config',
          license: 'Custom',
          isCatalog: false,
          installedAgents: installedOn,
          disabledAgentIds,
          isDisabled,
          pluginName: s.pluginName,
          sourcePath: s.sourcePath,
          currentEnv: s.env,
        });
      }
    }

    return list;
  }, [mcpServers, selectedAgents]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    unifiedServers.forEach((s) => {
      if (s.category) set.add(s.category);
    });
    return ['All', ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [unifiedServers]);

  // Compute category item counts dynamically based on active segment and agent filter
  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = { All: 0 };
    for (let i = 0; i < unifiedServers.length; i++) {
      const s = unifiedServers[i];
      if (activeSegment === 'installed' && s.installedAgents.length === 0) continue;
      if (activeSegment === 'available' && s.isCatalog && (selectedAgents.length === 0 || s.installedAgents.length >= selectedAgents.length)) continue;
      if (currentAgentFilter.length > 0 && !currentAgentFilter.some((agId) => s.installedAgents.some((a) => a.id === agId))) continue;

      map.All = (map.All || 0) + 1;
      const cat = s.category || 'Other';
      map[cat] = (map[cat] || 0) + 1;
    }
    return map;
  }, [unifiedServers, activeSegment, selectedAgents.length, currentAgentFilter]);

  // Combobox filtering for dropdown menus
  const filteredCategories = useMemo(() => {
    if (!categorySearchQuery.trim()) return categories;
    const q = categorySearchQuery.trim().toLowerCase();
    return categories.filter((cat) => cat.toLowerCase().includes(q));
  }, [categories, categorySearchQuery]);

  const filteredTargetAgents = useMemo(() => {
    if (!agentSearchQuery.trim()) return selectedAgents;
    const q = agentSearchQuery.trim().toLowerCase();
    return selectedAgents.filter((ag) => ag.name.toLowerCase().includes(q) || ag.id.toLowerCase().includes(q));
  }, [selectedAgents, agentSearchQuery]);

  const counts = useMemo(() => {
    const installed = unifiedServers.filter((s) => s.installedAgents.length > 0).length;
    const available = unifiedServers.filter((s) => s.isCatalog && (selectedAgents.length === 0 || s.installedAgents.length < selectedAgents.length)).length;
    return {
      all: unifiedServers.length,
      installed,
      available,
    };
  }, [unifiedServers, selectedAgents]);

  const updateSegmentPill = useCallback(() => {
    const container = segmentedControlsRef.current;
    if (!container) return;
    const activeBtn = container.querySelector<HTMLButtonElement>('.segment-btn.active');
    if (!activeBtn) return;
    const containerRect = container.getBoundingClientRect();
    const btnRect = activeBtn.getBoundingClientRect();
    setSegmentPillStyle({
      left: btnRect.left - containerRect.left,
      width: btnRect.width,
      isReady: true,
    });
  }, []);

  useLayoutEffect(() => {
    updateSegmentPill();
  }, [updateSegmentPill, activeSegment, counts]);

  useEffect(() => {
    const timer = setTimeout(() => {
      isPillAnimatedRef.current = true;
    }, 60);
    window.addEventListener('resize', updateSegmentPill);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateSegmentPill);
    };
  }, [updateSegmentPill]);

  const indexedServers = useMemo(() => {
    return unifiedServers.map((s) => ({
      item: s,
      searchStr: `${s.name} ${s.description || ''} ${s.command || ''} ${s.url || ''} ${s.transport} ${s.category || ''} ${(s.tags || []).join(' ')}`.toLowerCase(),
    }));
  }, [unifiedServers]);

  const deferredSearchQuery = useDeferredValue(searchQuery);

  const filteredServers = useMemo(() => {
    let result = indexedServers;

    if (activeSegment === 'installed') {
      result = result.filter((s) => s.item.installedAgents.length > 0);
    } else if (activeSegment === 'available') {
      result = result.filter((s) => s.item.isCatalog && (selectedAgents.length === 0 || s.item.installedAgents.length < selectedAgents.length));
    }

    if (selectedCategory !== 'All') {
      result = result.filter((s) => s.item.category === selectedCategory);
    }

    if (deferredSearchQuery.trim()) {
      const q = deferredSearchQuery.toLowerCase().trim();
      result = result.filter((s) => s.searchStr.includes(q));
    }

    // Agent Filter
    if (currentAgentFilter.length > 0) {
      result = result.filter((s) => {
        const hasFilteredAgent = s.item.installedAgents.some((a) => currentAgentFilter.includes(a.id));
        if (activeSegment === 'installed') {
          return hasFilteredAgent;
        } else if (activeSegment === 'available') {
          const installedFilteredCount = s.item.installedAgents.filter((a) => currentAgentFilter.includes(a.id)).length;
          return installedFilteredCount < currentAgentFilter.length;
        } else {
          if (s.item.installedAgents.length > 0 && !hasFilteredAgent) {
            return false;
          }
          return true;
        }
      });
    }

    return result.map((s) => s.item);
  }, [indexedServers, activeSegment, selectedCategory, deferredSearchQuery, selectedAgents.length, currentAgentFilter]);

  const [visibleCount, setVisibleCount] = useState(36);

  useEffect(() => {
    setVisibleCount(36);
  }, [deferredSearchQuery, activeSegment, selectedCategory, currentAgentFilter]);

  const displayedServers = useMemo(() => {
    return filteredServers.slice(0, visibleCount);
  }, [filteredServers, visibleCount]);

  // Identify target MCP match from highlightedId
  const targetMcpMatch = useMemo(() => {
    if (!highlightedId) return null;
    const hLower = highlightedId.toLowerCase();
    return (
      unifiedServers.find(
        (s) =>
          s.id.toLowerCase() === hLower ||
          s.name.toLowerCase() === hLower ||
          mcpServers.some(
            (ms) =>
              ms.id === highlightedId &&
              (ms.name.toLowerCase() === s.name.toLowerCase() ||
                ms.name.toLowerCase() === s.id.toLowerCase())
          )
      ) || null
    );
  }, [highlightedId, unifiedServers, mcpServers]);

  // If highlighted item is hidden by category or segment filters, auto-reveal it
  useEffect(() => {
    if (!targetMcpMatch) return;

    // Reset segment if it hides the target
    if (activeSegment === 'installed' && targetMcpMatch.installedAgents.length === 0) {
      setActiveSegment('all');
    } else if (
      activeSegment === 'available' &&
      targetMcpMatch.isCatalog &&
      targetMcpMatch.installedAgents.length >= selectedAgents.length
    ) {
      setActiveSegment('all');
    }

    // Reset category if it hides the target
    if (selectedCategory !== 'All' && targetMcpMatch.category && targetMcpMatch.category !== selectedCategory) {
      setSelectedCategory('All');
    }

    // Reset agent filter if it hides the target
    if (
      currentAgentFilter.length > 0 &&
      !targetMcpMatch.installedAgents.some((a) => currentAgentFilter.includes(a.id))
    ) {
      setAgentFilter([]);
    }
  }, [targetMcpMatch, activeSegment, selectedCategory, currentAgentFilter, selectedAgents.length, setAgentFilter]);

  // Expand pagination if target is beyond current slice
  useEffect(() => {
    if (!targetMcpMatch) return;
    const targetIdx = filteredServers.findIndex((s) => s.id === targetMcpMatch.id);
    if (targetIdx !== -1 && targetIdx >= visibleCount) {
      setVisibleCount(targetIdx + 12);
    }
  }, [targetMcpMatch, filteredServers, visibleCount]);

  // Scroll into view with multi-attempt polling to handle tab transition & render delays
  useEffect(() => {
    if (!targetMcpMatch && !highlightedId) return;
    const targetCardId = targetMcpMatch ? targetMcpMatch.id : highlightedId;

    let attempts = 0;
    const maxAttempts = 14;
    const intervalId = setInterval(() => {
      attempts++;
      const el =
        document.getElementById(`mcp-card-${targetCardId}`) ||
        document.getElementById(`mcp-card-${highlightedId}`) ||
        document.querySelector('.item-card-highlighted');

      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        clearInterval(intervalId);
      } else if (attempts >= maxAttempts) {
        clearInterval(intervalId);
      }
    }, 50);

    return () => clearInterval(intervalId);
  }, [targetMcpMatch, highlightedId, visibleCount]);

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

    let title = 'TARGET AGENTS';
    let badgeText = '';
    if (installedAgents.length > 0) {
      if (selectedAgents.length > 0) {
        title = installedAgents.length >= selectedAgents.length ? 'Active in' : 'Active / Target';
        badgeText = `${installedAgents.length}/${selectedAgents.length}`;
      } else {
        title = 'Active in';
        badgeText = `${installedAgents.length}`;
      }
    } else if (selectedAgents.length > 0) {
      title = selectedAgents.length === 1 ? 'Target agent' : 'Target agents';
      badgeText = `${selectedAgents.length}`;
    } else {
      title = 'Target agents';
      badgeText = '0';
    }

    if (items.length === 0) {
      return (
        <div className="agent-deck-container empty">
          <div className="agent-deck-header">
            <div className="agent-deck-label-group">
              <Bot size={11} className="agent-deck-icon" />
              <span className="agent-deck-title font-mono">{title}</span>
            </div>
          </div>
          <div className="agent-deck-empty-hint font-mono">No target agents selected</div>
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
        <div className="agent-deck-header">
          <div className="agent-deck-label-group">
            <Bot size={11} className="agent-deck-icon" />
            <span className="agent-deck-title font-mono">{title}</span>
            <span className="agent-deck-count-badge font-mono">{badgeText}</span>
          </div>
          {items.length > 0 && (
            <span className="agent-deck-filter-hint font-mono">
              {currentAgentFilter.length > 0 && items.some((i) => i.isFiltered) ? 'filtered' : 'click to filter'}
            </span>
          )}
        </div>

        <div className="agent-deck-pills">
          <div className="agent-deck-base-row">
            {initialItems.map(({ agent: ag, isInstalled, isFiltered }) => {
              const AgentIcon = AGENT_ICON_MAP[ag.id] || AGENT_ICON_MAP[ag.iconName] || Bot;
              return (
                <button
                  type="button"
                  key={ag.id}
                  className={`agent-deck-pill ${isInstalled ? 'installed' : 'pending'} ${isFiltered ? 'is-filtered' : ''}`}
                  style={{
                    color: ag.color,
                    borderColor: isFiltered
                      ? `${ag.color}75`
                      : isInstalled
                      ? `${ag.color}40`
                      : `${ag.color}28`,
                    background: isFiltered
                      ? `${ag.color}16`
                      : isInstalled
                      ? `${ag.color}0e`
                      : `${ag.color}06`,
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
                  <AgentIcon size={11} className="pill-brand-icon" />
                  <span className="pill-name">{isInstalled ? ag.name : `+${ag.name}`}</span>
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
                          color: ag.color,
                          borderColor: isFiltered
                            ? `${ag.color}75`
                            : isInstalled
                            ? `${ag.color}40`
                            : `${ag.color}28`,
                          background: isFiltered
                            ? `${ag.color}16`
                            : isInstalled
                            ? `${ag.color}0e`
                            : `${ag.color}06`,
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
                            ? `Active in ${ag.name} (click to filter)`
                            : `Pending target: ${ag.name} (click to filter)`
                        }
                      >
                        <AgentIcon size={11} className="pill-brand-icon" />
                        <span className="pill-name">{isInstalled ? ag.name : `+${ag.name}`}</span>
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
                style={{
                  color: ag.color,
                  borderColor: isFiltered
                    ? `${ag.color}75`
                    : isInstalled
                    ? `${ag.color}40`
                    : `${ag.color}28`,
                  background: isFiltered
                    ? `${ag.color}16`
                    : isInstalled
                    ? `${ag.color}0e`
                    : `${ag.color}06`,
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
                <AgentIcon size={10} className="pill-brand-icon" />
                <span className="pill-name">{isInstalled ? ag.name : `+${ag.name}`}</span>
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
                        color: ag.color,
                        borderColor: isFiltered
                          ? `${ag.color}75`
                          : isInstalled
                          ? `${ag.color}40`
                          : `${ag.color}28`,
                        background: isFiltered
                          ? `${ag.color}16`
                          : isInstalled
                          ? `${ag.color}0e`
                          : `${ag.color}06`,
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
                      <AgentIcon size={10} className="pill-brand-icon" />
                      <span className="pill-name">{isInstalled ? ag.name : `+${ag.name}`}</span>
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
  const handleInstallMcp = async (server: UnifiedMcpCard) => {
    if (!window.electronAPI?.installMcp) return;

    const targetAgents = selectedAgents.filter(
      (agent) => !server.installedAgents.some((inst) => inst.id === agent.id)
    );

    if (targetAgents.length === 0) return;

    setLoadingServerKey(server.id);
    try {
      const serverConfig: any = {
        command: server.command,
        args: server.args || [],
      };
      if (server.url) {
        serverConfig.url = server.url;
      }
      if (server.env && Object.keys(server.env).length > 0) {
        serverConfig.env = server.env;
      }

      const res = await window.electronAPI.installMcp({
        serverKey: server.id,
        serverConfig,
        targets: targetAgents.map((a) => ({
          agentId: a.id,
          mcpConfigPath: a.paths.mcpConfigPath,
        })),
      });

      if (res.success) {
        toast.success(`Configured "${server.name}" in ${targetAgents.map((a) => a.name).join(', ')}`);
        logActivity({
          type: 'MCP',
          title: 'MCP Server Configured',
          description: `Configured "${server.name}" (${server.transport.toUpperCase()}) in ${targetAgents.map((a) => a.name).join(', ')}`,
          status: 'success',
        });
        if (onRefreshCapabilities) {
          await onRefreshCapabilities();
        }
      } else {
        toast.error(`Error: ${res.error || 'Failed to configure MCP server'}`);
        logActivity({
          type: 'MCP',
          title: 'MCP Configure Failed',
          description: `Failed to configure "${server.name}": ${res.error || 'Unknown error'}`,
          status: 'error',
        });
      }
    } catch (err: any) {
      toast.error(`Error: ${err.message || 'Configuration failed'}`);
      logActivity({
        type: 'MCP',
        title: 'MCP Configure Error',
        description: `Error configuring "${server.name}": ${err.message || 'Unknown error'}`,
        status: 'error',
      });
    } finally {
      setLoadingServerKey(null);
    }
  };

  // Uninstall
  const handleUninstallMcp = async (server: UnifiedMcpCard) => {
    if (!window.electronAPI?.uninstallMcp) return;

    const targetAgents = server.installedAgents.filter((agent) =>
      selectedAgents.some((sel) => sel.id === agent.id)
    );

    if (targetAgents.length === 0) return;

    setLoadingServerKey(server.id);
    try {
      const res = await window.electronAPI.uninstallMcp({
        serverKey: server.id,
        targets: targetAgents.map((a) => ({
          agentId: a.id,
          mcpConfigPath: a.paths.mcpConfigPath,
        })),
      });

      if (res.success) {
        toast.success(`Removed "${server.name}" from ${targetAgents.map((a) => a.name).join(', ')}`);
        logActivity({
          type: 'MCP',
          title: 'MCP Server Removed',
          description: `Removed "${server.name}" from ${targetAgents.map((a) => a.name).join(', ')}`,
          status: 'warning',
        });
        if (onRefreshCapabilities) {
          await onRefreshCapabilities();
        }
      } else {
        toast.error(`Error: ${res.error || 'Failed to remove MCP server'}`);
        logActivity({
          type: 'MCP',
          title: 'MCP Removal Failed',
          description: `Failed to remove "${server.name}": ${res.error || 'Unknown error'}`,
          status: 'error',
        });
      }
    } catch (err: any) {
      toast.error(`Error: ${err.message || 'Removal failed'}`);
      logActivity({
        type: 'MCP',
        title: 'MCP Removal Error',
        description: `Error removing "${server.name}": ${err.message || 'Unknown error'}`,
        status: 'error',
      });
    } finally {
      setLoadingServerKey(null);
    }
  };

  // Reinstall MCP server: cleanly updates definition from registry while safely preserving user tokens & keys
  const handleReinstallMcp = async (server: UnifiedMcpCard, userProvidedEnv?: Record<string, string>) => {
    if (!window.electronAPI?.installMcp) return;

    const targetAgents = server.installedAgents.filter((agent) =>
      selectedAgents.length === 0 || selectedAgents.some((sel) => sel.id === agent.id)
    );
    const effectiveTargets = targetAgents.length > 0 ? targetAgents : server.installedAgents;
    if (effectiveTargets.length === 0) return;

    // Check required env keys
    const catMatch = activeMcpCatalog.find((c) => c.id.toLowerCase() === server.id.toLowerCase());
    const requiredEnvKeys = Array.from(new Set([
      ...(catMatch?.envKeys || []),
      ...(server.envKeys || []),
      ...Object.keys(catMatch?.env || {}),
      ...Object.keys(server.env || {}),
    ])).filter((k) => k.trim() !== '');

    const currentEnv = server.currentEnv || {};

    // If user has not provided env explicitly and there are missing keys, prompt them!
    if (!userProvidedEnv && requiredEnvKeys.length > 0) {
      const hasMissingKey = requiredEnvKeys.some((k) => {
        const val = currentEnv[k];
        return !val || val.trim() === '' || val.startsWith('<') || val.toLowerCase().includes('your_token') || val.toLowerCase().includes('your_api_key');
      });

      if (hasMissingKey) {
        const initialInput: Record<string, string> = {};
        requiredEnvKeys.forEach((k) => {
          initialInput[k] = currentEnv[k] || '';
        });
        setKeyPromptModal({
          server,
          envKeys: requiredEnvKeys,
          inputValues: initialInput,
        });
        return;
      }
    }

    setLoadingServerKey(server.id);
    try {
      const baseCommand = catMatch?.command || server.command || 'npx';
      const baseArgs = catMatch?.args || server.args || [];
      const baseUrl = catMatch?.url || server.url;

      // Merge env: catalog default -> existing currentEnv -> userProvidedEnv
      const mergedEnv: Record<string, string> = {
        ...(catMatch?.env || {}),
        ...(currentEnv || {}),
        ...(userProvidedEnv || {}),
      };

      const serverConfig: any = {
        command: baseCommand,
        args: baseArgs,
      };
      if (baseUrl) {
        serverConfig.url = baseUrl;
      }
      if (Object.keys(mergedEnv).length > 0) {
        serverConfig.env = mergedEnv;
      }

      const res = await window.electronAPI.installMcp({
        serverKey: server.id,
        serverConfig,
        targets: effectiveTargets.map((a) => ({
          agentId: a.id,
          mcpConfigPath: a.paths.mcpConfigPath,
        })),
      });

      if (res.success) {
        toast.success(`Reinstalled "${server.name}". Credentials & configuration safely preserved.`);
        logActivity({
          type: 'MCP',
          title: 'MCP Server Reinstalled',
          description: `Cleanly reconfigured "${server.name}" on ${effectiveTargets.map((a) => a.name).join(', ')} with keys preserved`,
          status: 'success',
        });
        if (onRefreshCapabilities) {
          await onRefreshCapabilities();
        }
      } else {
        toast.error(`Reinstall failed: ${res.error || 'Failed to reconfigure MCP server'}`);
      }
    } catch (err: any) {
      toast.error(`Reinstall error: ${err.message || 'Unknown error'}`);
    } finally {
      setLoadingServerKey(null);
    }
  };

  // Enable / Disable MCP Toggle
  const handleToggleMcp = async (server: UnifiedMcpCard) => {
    if (!window.electronAPI?.toggleMcp) return;

    const targetAgents = server.installedAgents.filter((agent) =>
      selectedAgents.length === 0 || selectedAgents.some((sel) => sel.id === agent.id)
    );
    const effectiveTargets = targetAgents.length > 0 ? targetAgents : server.installedAgents;
    if (effectiveTargets.length === 0) return;

    const newEnabledState = Boolean(server.isDisabled);
    setTogglingMcpId(server.id);
    try {
      const res = await window.electronAPI.toggleMcp({
        serverKey: server.id,
        enabled: newEnabledState,
        targets: effectiveTargets.map((a) => ({
          agentId: a.id,
          mcpConfigPath: a.paths.mcpConfigPath,
        })),
      });

      if (res.success) {
        toast.success(`${newEnabledState ? 'Enabled' : 'Disabled'} MCP server "${server.name}" on ${effectiveTargets.map((a) => a.name).join(', ')}`);
        logActivity({
          type: 'MCP',
          title: newEnabledState ? 'MCP Server Enabled' : 'MCP Server Disabled',
          description: `${newEnabledState ? 'Enabled' : 'Disabled'} "${server.name}" on ${effectiveTargets.map((a) => a.name).join(', ')}`,
          status: newEnabledState ? 'success' : 'info',
        });
        if (onRefreshCapabilities) {
          await onRefreshCapabilities();
        }
      } else {
        toast.error(`Error: ${res.error || 'Failed to toggle MCP server'}`);
      }
    } catch (err: any) {
      toast.error(`Error: ${err.message || 'Toggle failed'}`);
    } finally {
      setTogglingMcpId(null);
    }
  };

  // Open folder
  const handleOpenMcpFolder = (server: UnifiedMcpCard) => {
    if (!window.electronAPI?.openPath) return;
    if (server.sourcePath) {
      window.electronAPI.openPath(server.sourcePath);
      return;
    }
    const agent = server.installedAgents[0];
    if (agent?.paths?.mcpConfigPath) {
      window.electronAPI.openPath(agent.paths.mcpConfigPath);
    }
  };

  const renderMcpActions = (
    server: UnifiedMcpCard,
    isInstalledOnAll: boolean,
    isPartiallyInstalled: boolean,
    isLoading: boolean
  ) => (
    <div className="toolbar-right-actions" onClick={(e) => e.stopPropagation()}>
      {/* 1. Enable / Disable Toggle Button */}
      {server.installedAgents.length > 0 && (
        <button
          type="button"
          className={`card-action-icon-btn toggle-state-btn ${server.isDisabled ? 'disabled-state' : 'active-state'}`}
          onClick={(e) => {
            e.stopPropagation();
            handleToggleMcp(server);
          }}
          disabled={togglingMcpId === server.id}
          title={server.isDisabled ? 'Enable MCP server in equipped agent(s)' : 'Disable MCP server without removing configuration'}
          aria-label={server.isDisabled ? 'Enable MCP server' : 'Disable MCP server'}
        >
          {togglingMcpId === server.id ? (
            <Loader2 size={13} className="spin" />
          ) : server.isDisabled ? (
            <PowerOff size={13} style={{ color: '#fb7185' }} />
          ) : (
            <Power size={13} style={{ color: '#34d399' }} />
          )}
        </button>
      )}

      {/* 2. Reinstall (if installed) OR Add to Agent (if catalog uninstalled) */}
      {server.installedAgents.length > 0 ? (
        <button
          type="button"
          className="card-action-icon-btn reinstall"
          onClick={(e) => {
            e.stopPropagation();
            handleReinstallMcp(server);
          }}
          disabled={isLoading}
          title="Reinstall latest MCP configuration from registry (API keys preserved)"
          aria-label="Reinstall MCP Server"
        >
          {isLoading ? (
            <Loader2 size={12} className="spin" />
          ) : (
            <RotateCcw size={13} />
          )}
        </button>
      ) : (
        (!isInstalledOnAll && server.isCatalog) && (
          <button
            type="button"
            className="card-primary-action-btn mcp"
            onClick={(e) => {
              e.stopPropagation();
              handleInstallMcp(server);
            }}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 size={11} className="spin" />
                <span>Configuring...</span>
              </>
            ) : (
              <>
                <Plus size={12} />
                <span>
                  {isPartiallyInstalled
                    ? `Add (${selectedAgents.length - server.installedAgents.length})`
                    : selectedAgents.length > 1
                    ? `Add to ${selectedAgents.length}`
                    : 'Add to Agent'}
                </span>
              </>
            )}
          </button>
        )
      )}

      {/* 3. More Options Menu Button (...) */}
      <button
        type="button"
        className={`card-action-icon-btn more-options-btn ${moreMenuMcpId === server.id ? 'active' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          if (moreMenuMcpId === server.id) {
            setMoreMenuMcpId(null);
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
            setMoreMenuMcpId(server.id);
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
    <div className="mcp-view-container">
      {/* Header */}
      <div className="mcp-view-header">
        <div className="header-info">
          <div className="title-line">
            <h2 className="view-title"><span className="title-long">Model Context Protocol </span>MCP Servers</h2>
            <span className="count-pill font-mono">{mcpServers.length} CONFIGURED</span>
            <span className="catalog-pill font-mono">{activeMcpCatalog.length} <span className="pill-text-long">IN CLOUD </span>CATALOG</span>
            {catalogSyncedAt && (
              <span className="sync-pill font-mono" title={`Synced with AAS: ${new Date(catalogSyncedAt).toLocaleString()}`}>
                <CheckCircle2 size={10} /> AAS SYNCED
              </span>
            )}
            <span
              className="security-hub-pill font-mono"
              title="AgentForge is an open hub: MCP servers execute locally. API keys are stored on your local machine."
            >
              <ShieldCheck size={10} /> COMMUNITY HUB
            </span>
          </div>
          <p className="view-desc">
            Model Context Protocol servers declared across your agent configs or ready to equip from the catalog.
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
                opacity: segmentPillStyle.isReady ? 1 : 0,
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
              Configured <span className="segment-count">{counts.installed}</span>
            </button>
            <button
              className={`segment-btn ${activeSegment === 'available' ? 'active' : ''}`}
              onClick={() => setActiveSegment('available')}
            >
              <span className="segment-full-label">Available in Catalog</span>
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
                  title={isSyncingCatalog ? 'Syncing latest MCP servers from upstream registries...' : 'Sync latest MCP servers from Official Registry & Community Hubs'}
                  aria-label="Sync Catalog"
                >
                  <RefreshCw size={12} className={isSyncingCatalog ? 'spin' : ''} />
                </button>
              </>
            )}
          </div>

          {onAddServer && (
            <div className="header-buttons-row">
              <button className="import-action-btn" onClick={onAddServer}>
                <Plus size={12} />
                <span>Add Server</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Linear-Style Sleek Filter Toolbar with Category & Agent Filter Chips */}
      <div className="category-toolbar-row">
        {/* Left: Filter Controls Group */}
        <div className="toolbar-filters-group">
          {/* Category Filter Dropdown Chip */}
          <div className="filter-dropdown-wrapper" ref={categoryMenuRef}>
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
              title="Filter MCP servers by category"
            >
              <Filter size={12} className="filter-chip-icon text-cyan" />
              <span className="filter-chip-label">Category:</span>
              <span className="filter-chip-value">
                {selectedCategory === 'All' ? 'All' : selectedCategory}
              </span>
              <ChevronDown
                size={11}
                className={`filter-chip-chevron ${isCategoryMenuOpen ? 'open' : ''}`}
              />
            </button>

            {isCategoryMenuOpen && (
              <div className="toolbar-dropdown-menu">
                <div className="toolbar-dropdown-header">
                  <span>Filter by Category</span>
                  {selectedCategory !== 'All' && (
                    <button
                      type="button"
                      className="toolbar-dropdown-reset-btn"
                      onClick={() => {
                        setSelectedCategory('All');
                        setIsCategoryMenuOpen(false);
                      }}
                    >
                      Reset
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

                <div className="toolbar-dropdown-list">
                  {filteredCategories.includes('All') && (
                    <button
                      type="button"
                      className={`toolbar-dropdown-item ${selectedCategory === 'All' ? 'selected' : ''}`}
                      onClick={() => {
                        setSelectedCategory('All');
                        setIsCategoryMenuOpen(false);
                      }}
                    >
                      <div className="toolbar-dropdown-item-left">
                        <Filter size={12} className="text-cyan" />
                        <span className="toolbar-dropdown-item-name">All Categories</span>
                      </div>
                      <div className="toolbar-dropdown-item-right">
                        <span className="toolbar-dropdown-item-count">{categoryCounts['All'] ?? 0}</span>
                        {selectedCategory === 'All' && <Check size={12} className="toolbar-dropdown-item-check text-cyan" />}
                      </div>
                    </button>
                  )}

                  {filteredCategories.includes('All') && filteredCategories.filter(c => c !== 'All').length > 0 && (
                    <div className="toolbar-dropdown-divider" />
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
                          className={`toolbar-dropdown-item ${isSelected ? 'selected' : ''}`}
                          onClick={() => {
                            setSelectedCategory(cat);
                            setIsCategoryMenuOpen(false);
                          }}
                        >
                          <div className="toolbar-dropdown-item-left">
                            <span className="toolbar-dropdown-item-name">{cat}</span>
                          </div>
                          <div className="toolbar-dropdown-item-right">
                            <span className="toolbar-dropdown-item-count">{count}</span>
                            {isSelected && <Check size={12} className="toolbar-dropdown-item-check text-cyan" />}
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

          {/* Agent Filter Dropdown Chip */}
          {selectedAgents.length > 1 && (() => {
            const singleFilteredAgent = currentAgentFilter.length === 1
              ? selectedAgents.find((a) => a.id === currentAgentFilter[0])
              : null;
            const AgentTriggerIcon = singleFilteredAgent
              ? (AGENT_ICON_MAP[singleFilteredAgent.id] || AGENT_ICON_MAP[singleFilteredAgent.iconName] || Bot)
              : Bot;

            return (
              <div className="filter-dropdown-wrapper agent-dropdown-wrapper" ref={agentMenuRef}>
                <button
                  type="button"
                  className={`filter-chip-trigger ${currentAgentFilter.length > 0 ? 'active' : ''}`}
                  style={
                    singleFilteredAgent
                      ? {
                          borderColor: `${singleFilteredAgent.color}55`,
                          background: `${singleFilteredAgent.color}14`,
                        }
                      : currentAgentFilter.length > 1
                      ? {
                          borderColor: 'rgba(139, 92, 246, 0.4)',
                          background: 'rgba(139, 92, 246, 0.1)',
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
                  title="Filter MCP servers to specific target agents"
                >
                  <AgentTriggerIcon
                    size={12}
                    style={
                      singleFilteredAgent
                        ? { color: singleFilteredAgent.color }
                        : currentAgentFilter.length > 1
                        ? { color: '#8b5cf6' }
                        : { color: '#94a3b8' }
                    }
                  />
                  <span className="filter-chip-label">Agent:</span>
                  <span
                    className="filter-chip-value"
                    style={singleFilteredAgent ? { color: singleFilteredAgent.color } : undefined}
                  >
                    {currentAgentFilter.length === 0
                      ? `All (${selectedAgents.length})`
                      : singleFilteredAgent?.name || (currentAgentFilter.length === 1 ? '1 Agent' : `${currentAgentFilter.length} Agents`)}
                  </span>
                  <ChevronDown
                    size={11}
                    className={`filter-chip-chevron ${isAgentMenuOpen ? 'open' : ''}`}
                  />
                </button>

                {isAgentMenuOpen && (
                  <div className="toolbar-dropdown-menu">
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

                    <div className="toolbar-dropdown-list">
                      {(!agentSearchQuery.trim() || 'all selected agents'.includes(agentSearchQuery.toLowerCase())) && (
                        <button
                          type="button"
                          className={`toolbar-dropdown-item ${currentAgentFilter.length === 0 ? 'selected' : ''}`}
                          onClick={() => {
                            handleToggleAgentFilter(null);
                            setIsAgentMenuOpen(false);
                          }}
                        >
                          <div className="toolbar-dropdown-item-left">
                            <Bot size={13} className="text-muted" />
                            <span className="toolbar-dropdown-item-name">All Selected Agents</span>
                          </div>
                          <div className="toolbar-dropdown-item-right">
                            <span className="toolbar-dropdown-item-count">{selectedAgents.length}</span>
                            {currentAgentFilter.length === 0 && <Check size={12} className="toolbar-dropdown-item-check text-cyan" />}
                          </div>
                        </button>
                      )}

                      {(!agentSearchQuery.trim() || 'all selected agents'.includes(agentSearchQuery.toLowerCase())) && filteredTargetAgents.length > 0 && (
                        <div className="toolbar-dropdown-divider" />
                      )}

                      {filteredTargetAgents.map((ag) => {
                        const isFiltered = currentAgentFilter.includes(ag.id);
                        const agentMcpsCount = mcpServers.filter((s) => s.sourceAgentId === ag.id && !s.pluginName).length;
                        const AgentIcon = AGENT_ICON_MAP[ag.id] || AGENT_ICON_MAP[ag.iconName] || Bot;
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
                              <span className="toolbar-dropdown-item-count">{agentMcpsCount}</span>
                              {isFiltered && <Check size={12} className="toolbar-dropdown-item-check" style={{ color: ag.color }} />}
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

          {/* Quick Reset All Filters Button */}
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
          <span className="toolbar-items-count font-mono">
            {filteredServers.length} {filteredServers.length === 1 ? 'server' : 'servers'}
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
            Select one or more target agents in the top bar to inspect or equip their MCP servers.
          </div>
        </div>
      ) : filteredServers.length === 0 ? (
        <div key={`${activeSegment}-empty`} className="empty-state-card segment-content-animated">
          <div className="empty-icon-wrap">
            <Server size={28} />
          </div>
          <div className="empty-title">
            {searchQuery ? 'No matching MCP servers found' : 'No servers in this view'}
          </div>
          <div className="empty-desc">
            {searchQuery
              ? `No servers match "${searchQuery}". Try a different search query.`
              : activeSegment === 'installed'
              ? 'No MCP servers are configured in your selected agents. Switch to "Available in Catalog" to add servers with 1-click.'
              : 'All catalog MCP servers are already configured in your selected agents.'}
          </div>
        </div>
      ) : (
        <>
          {viewMode === 'grid' ? (
            <div key={`${activeSegment}-grid`} className="mcp-grid segment-content-animated">
          {displayedServers.map((server) => {
            const isInstalledOnAll =
              selectedAgents.length > 0 && server.installedAgents.length === selectedAgents.length;
            const isPartiallyInstalled =
              server.installedAgents.length > 0 && server.installedAgents.length < selectedAgents.length;
            const isHighlighted = targetMcpMatch
              ? targetMcpMatch.id === server.id
              : highlightedId === server.id ||
                mcpServers.some((s) => s.id === highlightedId && s.name.toLowerCase() === server.id.toLowerCase());
            const isLoading = loadingServerKey === server.id;

            const fullCommand = server.command
              ? `${server.command} ${(server.args || []).join(' ')}`.trim()
              : server.url || 'Configured Server';

            const requiredBinaries = getRequiredDependencies({
              command: server.command,
              args: server.args,
              tags: server.tags,
              category: server.category,
              description: server.description,
              name: server.name,
            });
            const depStatus = evaluateDependencyStatus(requiredBinaries, dependencyReport || null);

            return (
              <div
                key={server.id}
                id={`mcp-card-${server.id}`}
                className={`mcp-card ${isHighlighted ? 'item-card-highlighted' : ''} ${server.isDisabled ? 'is-card-disabled' : ''}`}
                onClick={() => setSelectedMcpForDetails(server)}
              >
                {/* 1. Header: Icon Avatar + Title/Category + Status Pill */}
                <div className="card-header-cluster">
                  <div className="card-header-left">
                    <div className="card-icon-avatar mcp">
                      <Server size={16} />
                    </div>
                    <div className="card-identity-text">
                      <div className="card-title-row">
                        <span className="card-item-name" title={server.name}>{server.name}</span>
                        <span className={`transport-badge font-mono ${server.transport}`}>
                          {server.transport.toUpperCase()}
                        </span>
                      </div>
                      <div className="card-sub-meta">
                        {server.category && (
                          <span className="card-cat-text font-mono">{server.category}</span>
                        )}
                        {server.category && server.author && (
                          <span className="card-meta-dot">·</span>
                        )}
                        {server.author && (
                          <span className="author-text font-mono">by {server.author}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="card-header-right">
                    {isInstalledOnAll ? (
                      <button
                        type="button"
                        className={`status-pill-clean ${server.isDisabled ? 'disabled' : 'installed'} font-mono clickable`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleMcp(server);
                        }}
                        title={server.isDisabled ? 'MCP server is disabled. Click to enable.' : 'MCP server is enabled. Click to disable.'}
                      >
                        <span className={`status-dot ${server.isDisabled ? 'disabled' : 'installed'}`} />
                        <span>{server.isDisabled ? 'DISABLED' : 'CONFIGURED'}</span>
                      </button>
                    ) : isPartiallyInstalled ? (
                      <button
                        type="button"
                        className={`status-pill-clean ${server.isDisabled ? 'disabled' : 'partial'} font-mono clickable`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleMcp(server);
                        }}
                        title={server.isDisabled ? 'MCP server is disabled. Click to enable.' : `Configured in ${server.installedAgents.length}/${selectedAgents.length} agents. Click to toggle.`}
                      >
                        <span className={`status-dot ${server.isDisabled ? 'disabled' : 'partial'}`} />
                        <span>{server.isDisabled ? 'DISABLED' : `PARTIAL (${server.installedAgents.length}/${selectedAgents.length})`}</span>
                      </button>
                    ) : (
                      <span className="status-pill-clean available font-mono">
                        <span className="status-dot available" />
                        <span>AVAILABLE</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* 2. Body: Description + Prerequisite Alert (if missing) + Command Preview + Equipped Agents */}
                <div className="card-content-body">
                  <p className={`card-description-text ${!server.description ? 'empty-desc' : ''}`}>
                    {server.description || 'No description provided for this MCP server.'}
                  </p>

                  {depStatus.status === 'missing' && depStatus.firstMissing && (
                    <div className="card-prereq-alert font-mono">
                      <div
                        className="prereq-alert-label"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDepDrawerTarget({
                            targetName: server.name,
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
                        className={`prereq-quick-copy ${copiedDepKey === `dep-${server.id}` ? 'copied' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopyMissingDep(`dep-${server.id}`, depStatus.firstMissing!);
                        }}
                        title={`Copy install command: ${getInstallSnippetForPlatform(depStatus.firstMissing)}`}
                        aria-label="Copy install command"
                      >
                        {copiedDepKey === `dep-${server.id}` ? <Check size={10} /> : <Copy size={10} />}
                        <span>{copiedDepKey === `dep-${server.id}` ? 'COPIED' : 'INSTALL'}</span>
                      </button>
                    </div>
                  )}

                  <div className="command-snippet">
                    {server.transport === 'sse' ? (
                      <Globe size={12} className="cmd-icon sse" />
                    ) : (
                      <Terminal size={12} className="cmd-icon" />
                    )}
                    <span className="cmd-text font-mono" title={fullCommand}>
                      {fullCommand}
                    </span>
                    <button
                      type="button"
                      className={`cmd-copy-btn ${copiedCmdId === server.id ? 'copied' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyCommand(server.id, fullCommand);
                      }}
                      title="Copy command to run or install manually in terminal"
                      aria-label="Copy command"
                    >
                      {copiedCmdId === server.id ? (
                        <>
                          <Check size={9} />
                          <span>COPIED</span>
                        </>
                      ) : (
                        <>
                          <Copy size={9} />
                          <span>COPY</span>
                        </>
                      )}
                    </button>
                  </div>

                  {renderAgentTargetsDeck(server.installedAgents, server.id)}
                </div>

                {/* 3. Bottom Toolbar: Metadata chips (left) + Action Group (right) */}
                <div className="card-bottom-toolbar">
                  <div className="toolbar-left-chips">
                    {server.sourceRegistry && (
                      <span
                        className="meta-subtle-badge source-badge font-mono"
                        title={`Source: ${server.sourceRegistry} (${server.license || 'MIT / Apache-2.0'})`}
                      >
                        <Globe size={11} />
                        <span>{server.sourceRegistry}</span>
                      </span>
                    )}
                    {server.pluginName && (
                      <span className="meta-subtle-badge font-mono" title={`Part of ${server.pluginName}`}>
                        <Package size={11} />
                        <span>{server.pluginName}</span>
                      </span>
                    )}
                    {server.envKeys && server.envKeys.length > 0 && (
                      <span className="meta-subtle-badge env-chip font-mono" title={`Environment variables: ${server.envKeys.join(', ')}`}>
                        <KeyRound size={11} />
                        <span>{server.envKeys.length} ENV</span>
                      </span>
                    )}
                  </div>

                  {renderMcpActions(server, isInstalledOnAll, isPartiallyInstalled, isLoading)}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div key={`${activeSegment}-list`} className="mcp-list segment-content-animated">
          <div className="mcp-list-header font-mono">
            <span className="col-identity">MCP SERVER & COMMAND</span>
            <span className="col-meta">CATEGORY & SOURCE</span>
            <span className="col-agents">EQUIPPED IN</span>
            <span className="col-status">STATUS / PREREQ</span>
            <span className="col-actions right">ACTIONS</span>
          </div>
          {displayedServers.map((server) => {
            const isInstalledOnAll =
              selectedAgents.length > 0 && server.installedAgents.length === selectedAgents.length;
            const isPartiallyInstalled =
              server.installedAgents.length > 0 && server.installedAgents.length < selectedAgents.length;
            const isHighlighted = targetMcpMatch
              ? targetMcpMatch.id === server.id
              : highlightedId === server.id ||
                mcpServers.some((s) => s.id === highlightedId && s.name.toLowerCase() === server.id.toLowerCase());
            const isLoading = loadingServerKey === server.id;

            const fullCommand = server.command
              ? `${server.command} ${(server.args || []).join(' ')}`.trim()
              : server.url || 'stdio-process';

            const requiredBinaries = getRequiredDependencies({
              name: server.name,
              command: server.command,
              description: server.description,
              category: server.category,
              tags: server.tags,
            });
            const depStatus = evaluateDependencyStatus(requiredBinaries, dependencyReport || null);

            return (
              <div
                key={server.id}
                id={`mcp-card-${server.id}`}
                className={`mcp-row-card ${isHighlighted ? 'item-card-highlighted' : ''} ${server.isDisabled ? 'is-card-disabled' : ''}`}
                onClick={() => setSelectedMcpForDetails(server)}
              >
                {/* Identity Col */}
                <div className="list-col col-identity">
                  <div className="card-icon-avatar list-avatar mcp">
                    {server.transport === 'sse' ? <Globe size={15} /> : <Server size={15} />}
                  </div>
                  <div className="list-identity-text">
                    <div className="list-title-row">
                      <span className="card-item-name" title={server.name}>{server.name}</span>
                      <span className={`transport-badge font-mono ${server.transport || 'stdio'}`}>
                        {(server.transport || 'stdio').toUpperCase()}
                      </span>
                      {server.envKeys && server.envKeys.length > 0 && (
                        <span className="meta-subtle-badge env-chip font-mono" title={`Environment variables: ${server.envKeys.join(', ')}`}>
                          <KeyRound size={9} />
                          <span>{server.envKeys.length} ENV</span>
                        </span>
                      )}
                    </div>
                    <div className="list-subline">
                      {server.description && (
                        <span className="list-description-snippet" title={server.description}>{server.description}</span>
                      )}
                      <div
                        className="list-cmd-chip font-mono clickable"
                        title={`Click to copy execution command: ${fullCommand}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopyCommand(server.id, fullCommand);
                        }}
                      >
                        {server.transport === 'sse' ? (
                          <Globe size={9} className="cmd-icon sse" />
                        ) : (
                          <Terminal size={9} className="cmd-icon" />
                        )}
                        <span className="list-cmd-text">{fullCommand}</span>
                        <span className={`list-cmd-copy-icon ${copiedCmdId === server.id ? 'copied' : ''}`}>
                          {copiedCmdId === server.id ? <Check size={8} /> : <Copy size={8} />}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Meta Col */}
                <div className="list-col col-meta">
                  {server.category && (
                    <span className="mcp-list-cat-pill font-mono">{server.category}</span>
                  )}
                  <div className="mcp-list-meta-subrow font-mono">
                    {server.sourceRegistry && (() => {
                      const badge = formatSourceBadge(server.sourceRegistry);
                      return (
                        <span
                          className={`source-registry-pill ${badge.badgeClass}`}
                          title={`${badge.tooltip} · License: ${server.license || 'MIT'}`}
                        >
                          {badge.badgeText}
                        </span>
                      );
                    })()}
                    {server.author && (
                      <span className="mcp-author-text font-mono" title={`Author: ${server.author}`}>
                        by {server.author}
                      </span>
                    )}
                    {server.pluginName && (
                      <span className="mcp-list-plugin-badge font-mono" title={`Part of ${server.pluginName}`}>
                        <Package size={8} />
                        <span>{server.pluginName}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Equipped Agents Col */}
                <div className="list-col col-agents">
                  {renderListAgentTargetsDeck(server.installedAgents, server.id)}
                </div>

                {/* Status & Prereqs Col */}
                <div className="list-col col-status">
                  {isInstalledOnAll ? (
                    <button
                      type="button"
                      className={`status-pill-clean ${server.isDisabled ? 'disabled' : 'installed'} font-mono clickable`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleMcp(server);
                      }}
                      title={server.isDisabled ? 'MCP server is disabled. Click to enable.' : 'MCP server is enabled. Click to disable.'}
                    >
                      <span className={`status-dot ${server.isDisabled ? 'disabled' : 'installed'}`} />
                      <span>{server.isDisabled ? 'DISABLED' : 'CONFIGURED'}</span>
                    </button>
                  ) : isPartiallyInstalled ? (
                    <button
                      type="button"
                      className={`status-pill-clean ${server.isDisabled ? 'disabled' : 'partial'} font-mono clickable`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleMcp(server);
                      }}
                      title={server.isDisabled ? 'MCP server is disabled. Click to enable.' : `Configured in ${server.installedAgents.length}/${selectedAgents.length} agents.`}
                    >
                      <span className={`status-dot ${server.isDisabled ? 'disabled' : 'partial'}`} />
                      <span>{server.isDisabled ? 'DISABLED' : `PARTIAL (${server.installedAgents.length}/${selectedAgents.length})`}</span>
                    </button>
                  ) : (
                    <span className="status-pill-clean available font-mono">
                      <span className="status-dot available" />
                      <span>AVAILABLE</span>
                    </span>
                  )}

                  {depStatus.status === 'missing' && depStatus.firstMissing && (
                    <button
                      type="button"
                      className="mcp-list-dep-alert font-mono"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDepDrawerTarget({
                          targetName: server.name,
                          requiredBinaries,
                        });
                      }}
                      title={`Missing prerequisite: ${depStatus.missingBinaries.join(', ')}. Click to inspect install instructions.`}
                    >
                      <AlertCircle size={10} className="dep-alert-icon" />
                      <span>Missing: {depStatus.firstMissing}</span>
                    </button>
                  )}
                </div>

                {/* Actions Col */}
                <div className="list-col col-actions right">
                  {renderMcpActions(server, isInstalledOnAll, isPartiallyInstalled, isLoading)}
                </div>
              </div>
            );
          })}
        </div>
      )}

        {filteredServers.length > visibleCount && (
          <div className="load-more-wrap">
            <button
              type="button"
              className="load-more-btn font-mono"
              onClick={() => setVisibleCount((prev) => prev + 36)}
            >
              <span>Show more MCPs ({displayedServers.length} of {filteredServers.length})</span>
            </button>
          </div>
        )}
        </>
      )}

      {/* Floating More Options Dropdown */}
      {moreMenuMcpId && moreMenuPosition && (() => {
        const activeServer = filteredServers.find((s) => s.id === moreMenuMcpId);
        if (!activeServer) return null;
        const isInstalled = activeServer.installedAgents.length > 0;

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
                setSelectedMcpForDetails(activeServer);
                setMoreMenuMcpId(null);
                setMoreMenuPosition(null);
              }}
            >
              <Info size={13} className="item-icon" style={{ color: '#38bdf8' }} />
              <span>Server Details</span>
            </button>

            {isInstalled && (
              <button
                className="dropdown-item"
                onClick={() => {
                  handleOpenMcpFolder(activeServer);
                  setMoreMenuMcpId(null);
                  setMoreMenuPosition(null);
                }}
              >
                <FolderOpen size={13} className="item-icon" />
                <span>Open Config Folder</span>
              </button>
            )}

            <button
              className="dropdown-item"
              onClick={() => {
                handleCopyMcpConfig(activeServer);
                setMoreMenuMcpId(null);
                setMoreMenuPosition(null);
              }}
            >
              {copiedCmdId === `config-${activeServer.id}` ? (
                <Check size={13} className="item-icon" style={{ color: '#34d399' }} />
              ) : (
                <Copy size={13} className="item-icon" />
              )}
              <span>{copiedCmdId === `config-${activeServer.id}` ? 'Copied Config!' : 'Copy JSON Config'}</span>
            </button>

            {activeServer.docsUrl && (
              <button
                className="dropdown-item"
                onClick={() => {
                  if (window.electronAPI?.openExternal) {
                    window.electronAPI.openExternal(activeServer.docsUrl!);
                  } else {
                    window.open(activeServer.docsUrl, '_blank');
                  }
                  setMoreMenuMcpId(null);
                  setMoreMenuPosition(null);
                }}
              >
                <Globe size={13} className="item-icon" />
                <span>View Documentation</span>
              </button>
            )}

            {isInstalled && (
              <>
                <div className="dropdown-divider" />
                <button
                  className="dropdown-item item-danger"
                  onClick={() => {
                    handleUninstallMcp(activeServer);
                    setMoreMenuMcpId(null);
                    setMoreMenuPosition(null);
                  }}
                >
                  <Trash2 size={13} className="item-icon" />
                  <span>Remove MCP Server</span>
                </button>
              </>
            )}
          </div>,
          document.body
        );
      })()}

      {/* MCP Details Modal */}
      {isDetailsModalRendered && selectedMcpForDetails && createPortal(
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
                <div className="item-modal-icon-wrap mcp">
                  {selectedMcpForDetails.transport === 'sse' ? <Globe size={20} /> : <Server size={20} />}
                </div>
                <div className="item-modal-title-content">
                  <div className="item-modal-title-row">
                    <h3 className="item-modal-title">{selectedMcpForDetails.name}</h3>
                    <span className="item-modal-cat font-mono">{selectedMcpForDetails.transport.toUpperCase()}</span>
                  </div>
                  <div className="item-modal-subtitle">
                    <span className="badge badge-cyan font-mono">MCP SERVER</span>
                    <span className={`status-pill-clean ${selectedMcpForDetails.installedAgents.length > 0 ? (selectedMcpForDetails.isDisabled ? 'disabled' : 'installed') : 'available'} font-mono`}>
                      <span className={`status-dot ${selectedMcpForDetails.installedAgents.length > 0 ? (selectedMcpForDetails.isDisabled ? 'disabled' : 'installed') : 'available'}`} />
                      <span>
                        {selectedMcpForDetails.installedAgents.length > 0
                          ? selectedMcpForDetails.isDisabled
                            ? 'DISABLED'
                            : 'INSTALLED'
                          : 'AVAILABLE'}
                      </span>
                    </span>
                    {selectedMcpForDetails.author && (() => {
                      const authorInfo = formatAuthor(selectedMcpForDetails.author);
                      return (
                        <span
                          className={`author-text font-mono ${authorInfo.isLink ? 'clickable' : ''}`}
                          title={authorInfo.url || `Author: ${selectedMcpForDetails.author}`}
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
                <X size={12} strokeWidth={2.2} />
                <kbd className="modal-esc-hint font-mono">ESC</kbd>
              </button>
            </div>

            {/* Body */}
            <div className="item-modal-body">
              {selectedMcpForDetails.description && (
                <div className="detail-section">
                  <div className="detail-label-row">
                    <span className="detail-label">DESCRIPTION</span>
                  </div>
                  <div className="detail-desc-card">
                    <p className="detail-description">{selectedMcpForDetails.description}</p>
                  </div>
                </div>
              )}

              {/* Command / Endpoint Box */}
              <div className="detail-section">
                <div className="detail-label-row">
                  <span className="detail-label">
                    {selectedMcpForDetails.transport === 'sse' ? 'SSE ENDPOINT URL' : 'COMMAND & ARGUMENTS'}
                  </span>
                  <button
                    className="copy-path-btn font-mono"
                    onClick={() => {
                      const cmd = selectedMcpForDetails.transport === 'sse'
                        ? (selectedMcpForDetails.url || '')
                        : `${selectedMcpForDetails.command || ''} ${(selectedMcpForDetails.args || []).join(' ')}`.trim();
                      handleCopyCommand(`modal-${selectedMcpForDetails.id}`, cmd);
                    }}
                    title="Copy command to clipboard"
                  >
                    {copiedCmdId === `modal-${selectedMcpForDetails.id}` ? (
                      <>
                        <Check size={11} className="text-emerald" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy size={11} />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="detail-path-card">
                  <Terminal size={13} className="detail-path-icon" />
                  <span className="detail-path-text font-mono">
                    {selectedMcpForDetails.transport === 'sse'
                      ? selectedMcpForDetails.url || 'No URL specified'
                      : `${selectedMcpForDetails.command || ''} ${(selectedMcpForDetails.args || []).join(' ')}`.trim() || 'No command specified'}
                  </span>
                </div>
              </div>

              {/* Location on Disk / Config Path */}
              {resolveMcpPath(selectedMcpForDetails) && (
                <div className="detail-section">
                  <div className="detail-label-row">
                    <span className="detail-label">CONFIGURATION PATH</span>
                    <button
                      className="copy-path-btn font-mono"
                      onClick={() => handleCopyMcpPath(selectedMcpForDetails)}
                      title="Copy configuration path"
                    >
                      {copiedPathMcpId === selectedMcpForDetails.id ? (
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
                      {resolveMcpPath(selectedMcpForDetails)}
                    </span>
                  </div>
                </div>
              )}

              {/* Equipped Agents */}
              {selectedMcpForDetails.installedAgents.length > 0 && (
                <div className="detail-section">
                  <div className="detail-label-row">
                    <span className="detail-label">
                      EQUIPPED AGENTS ({selectedMcpForDetails.installedAgents.length})
                    </span>
                  </div>
                  <div className="detail-agents-list">
                    {selectedMcpForDetails.installedAgents.map((agent) => {
                      const AgentIcon = AGENT_ICON_MAP[agent.id] || AGENT_ICON_MAP[agent.iconName] || Bot;
                      return (
                        <div
                          key={agent.id}
                          className="agent-modal-pill font-mono"
                          style={{
                            borderColor: `${agent.color || '#38bdf8'}40`,
                            background: `${agent.color || '#38bdf8'}10`,
                          }}
                        >
                          <AgentIcon size={12} style={{ color: agent.color || '#38bdf8' }} />
                          <span className="agent-modal-pill-name">{agent.name}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Environment Variables */}
              {((selectedMcpForDetails.envKeys && selectedMcpForDetails.envKeys.length > 0) ||
                (selectedMcpForDetails.currentEnv && Object.keys(selectedMcpForDetails.currentEnv).length > 0)) && (
                <div className="detail-section">
                  <div className="detail-label-row">
                    <span className="detail-label">ENVIRONMENT KEYS</span>
                  </div>
                  <div className="detail-tags-flow">
                    {(selectedMcpForDetails.envKeys || Object.keys(selectedMcpForDetails.currentEnv || {})).map((k) => (
                      <span key={k} className="meta-subtle-badge font-mono" style={{ color: '#38bdf8' }}>
                        <KeyRound size={10} style={{ marginRight: '3px' }} />
                        {k}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Metadata Grid */}
              <div className="detail-meta-grid">
                <div className="meta-card">
                  <div className="meta-k">TRANSPORT</div>
                  <div className="meta-v font-mono">{selectedMcpForDetails.transport.toUpperCase()}</div>
                </div>
                <div className="meta-card">
                  <div className="meta-k">CATEGORY</div>
                  <div className="meta-v">{selectedMcpForDetails.category || 'Tools & Integration'}</div>
                </div>
                <div className="meta-card">
                  <div className="meta-k">AUTHOR</div>
                  {(() => {
                    const authorInfo = formatAuthor(selectedMcpForDetails.author);
                    return (
                      <div
                        className={`meta-v ${authorInfo.isLink ? 'clickable' : ''}`}
                        title={authorInfo.url || `Author: ${selectedMcpForDetails.author}`}
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
                  <div className="meta-k">SOURCE</div>
                  <div className="meta-v font-mono">{selectedMcpForDetails.sourceRegistry || 'Registry'}</div>
                </div>
                <div className="meta-card">
                  <div className="meta-k">LICENSE</div>
                  <div className="meta-v font-mono">{selectedMcpForDetails.license || 'MIT / Apache-2.0'}</div>
                </div>
                <div className="meta-card">
                  <div className="meta-k">HOST AGENTS</div>
                  <div className="meta-v">{selectedMcpForDetails.installedAgents.length > 0 ? `${selectedMcpForDetails.installedAgents.length} Agents` : 'Available'}</div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="item-modal-footer">
              {selectedMcpForDetails.installedAgents.length > 0 ? (
                <button
                  className="modal-action-btn btn-danger"
                  onClick={() => {
                    handleUninstallMcp(selectedMcpForDetails);
                    handleCloseDetailsModal();
                  }}
                  title="Remove this MCP server"
                >
                  <Trash2 size={13} />
                  <span>Remove</span>
                </button>
              ) : <div />}

              <div className="item-modal-footer-right">
                {selectedMcpForDetails.installedAgents.length > 0 && (
                  <>
                    <button
                      className="modal-action-btn"
                      onClick={() => handleOpenMcpFolder(selectedMcpForDetails)}
                      title="Open configuration folder in File Explorer"
                    >
                      <FolderOpen size={13} />
                      <span>Open Folder</span>
                    </button>
                    <button
                      className="modal-action-btn"
                      onClick={() => handleReinstallMcp(selectedMcpForDetails)}
                      title="Reinstall clean configuration"
                    >
                      <RotateCcw size={13} />
                      <span>Reinstall</span>
                    </button>
                    <button
                      className={`modal-action-btn ${selectedMcpForDetails.isDisabled ? 'btn-enable' : 'btn-disable'}`}
                      onClick={() => handleToggleMcp(selectedMcpForDetails)}
                      title={selectedMcpForDetails.isDisabled ? 'Enable MCP server' : 'Disable MCP server'}
                    >
                      {selectedMcpForDetails.isDisabled ? <Power size={13} /> : <PowerOff size={13} />}
                      <span>{selectedMcpForDetails.isDisabled ? 'Enable Server' : 'Disable Server'}</span>
                    </button>
                    <button
                      className="modal-action-btn btn-done"
                      onClick={handleCloseDetailsModal}
                      title="Close server details"
                    >
                      <Check size={13} />
                      <span>Done</span>
                    </button>
                  </>
                )}
                {selectedMcpForDetails.installedAgents.length === 0 && selectedMcpForDetails.isCatalog && (
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
                        handleInstallMcp(selectedMcpForDetails);
                        handleCloseDetailsModal();
                      }}
                    >
                      <Plus size={13} />
                      <span>Add to Agent</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {keyPromptModal && createPortal(
        <div className="mcp-key-modal-overlay" onClick={() => setKeyPromptModal(null)}>
          <div className="mcp-key-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="mcp-key-modal-header">
              <div className="mcp-key-header-icon-box">
                <KeyRound size={18} className="text-amber-400" />
              </div>
              <div className="mcp-key-header-text">
                <h3 className="mcp-key-modal-title">Configure API Key</h3>
                <p className="mcp-key-modal-subtitle">
                  {keyPromptModal.server.name} requires credentials to connect to external services.
                </p>
              </div>
              <button
                type="button"
                className="close-btn"
                onClick={() => setKeyPromptModal(null)}
                aria-label="Close modal"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mcp-key-modal-body">
              <div className="mcp-key-security-note">
                <ShieldCheck size={14} className="text-emerald-400" style={{ flexShrink: 0 }} />
                <span>
                  Keys are stored locally in your agent's config file (<code>mcpServers.env</code>). They never leave your device.
                </span>
              </div>

              <div className="mcp-key-inputs-list">
                {keyPromptModal.envKeys.map((envKey) => {
                  const isVisible = Boolean(showKeySecret[envKey]);
                  const val = keyPromptModal.inputValues[envKey] || '';
                  return (
                    <div key={envKey} className="mcp-key-field">
                      <div className="mcp-key-field-header">
                        <label className="mcp-key-label font-mono">{envKey}</label>
                        {envKey.toLowerCase().includes('github') && (
                          <span className="mcp-key-hint font-mono">e.g. ghp_xxxxxxxxxxxx (repo scope)</span>
                        )}
                      </div>
                      <div className="mcp-key-input-wrapper">
                        <input
                          type={isVisible ? 'text' : 'password'}
                          className="mcp-key-input font-mono"
                          placeholder={`Enter ${envKey}...`}
                          value={val}
                          onChange={(e) => {
                            const next = { ...keyPromptModal.inputValues, [envKey]: e.target.value };
                            setKeyPromptModal({ ...keyPromptModal, inputValues: next });
                          }}
                        />
                        <button
                          type="button"
                          className="mcp-key-eye-btn"
                          onClick={() => setShowKeySecret((prev) => ({ ...prev, [envKey]: !prev[envKey] }))}
                          title={isVisible ? 'Hide value' : 'Show value'}
                        >
                          {isVisible ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mcp-key-manual-tip">
                <span>💡 Tip: If you prefer, you can also add or edit your key manually in your agent's configuration file anytime.</span>
              </div>
            </div>

            <div className="mcp-key-modal-footer">
              <button
                type="button"
                className="mcp-key-btn-secondary"
                onClick={() => {
                  const s = keyPromptModal.server;
                  setKeyPromptModal(null);
                  handleReinstallMcp(s, keyPromptModal.inputValues);
                }}
              >
                Reinstall without Key (Configure Later)
              </button>
              <button
                type="button"
                className="mcp-key-btn-primary"
                onClick={() => {
                  const s = keyPromptModal.server;
                  const env = keyPromptModal.inputValues;
                  setKeyPromptModal(null);
                  handleReinstallMcp(s, env);
                }}
              >
                Save Key & Reinstall
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

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
        .mcp-view-container {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .mcp-view-header {
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

        .mcp-view-header .count-pill {
          font-size: 10px;
          font-weight: 700;
          color: #818cf8;
          background: rgba(129, 140, 248, 0.12);
          padding: 2px 7px;
          border-radius: 4px;
          border: 1px solid rgba(129, 140, 248, 0.25);
          white-space: nowrap;
          flex-shrink: 0;
        }

        .catalog-pill {
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
        }

        .import-action-btn:hover {
          filter: brightness(1.08);
          box-shadow: 0 2px 8px rgba(124, 58, 237, 0.28);
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
          will-change: opacity, transform;
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

        .segment-divider {
          width: 1px;
          height: 14px;
          background: #1f2b42;
          margin: 0 1px;
        }

        .segment-sync-btn {
          background: transparent;
          border: none;
          color: #64748b;
          width: 22px;
          height: 22px;
          border-radius: 4px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.15s ease;
          padding: 0;
        }

        .segment-sync-btn:hover {
          color: #38bdf8;
          background: rgba(56, 189, 248, 0.1);
        }

        .segment-sync-btn.syncing {
          color: #38bdf8;
        }

        .segment-sync-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .segment-short-label {
          display: none;
        }

        @media (max-width: 1240px) {
          .mcp-view-header .sync-pill,
          .mcp-view-header .security-hub-pill {
            display: none !important;
          }
        }

        @media (max-width: 1100px) {
          .mcp-view-header {
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

          .mcp-view-header .view-desc {
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

        /* Category Toolbar Row - Linear Style */
        .category-toolbar-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          background: rgba(13, 19, 32, 0.55);
          border: 1px solid rgba(255, 255, 255, 0.06);
          padding: 0 10px;
          height: 40px;
          min-height: 40px;
          max-height: 40px;
          border-radius: 8px;
          box-sizing: border-box;
          position: relative;
          z-index: 50;
          backdrop-filter: blur(12px);
          margin-bottom: 14px;
        }

        .toolbar-filters-group {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
          flex-wrap: wrap;
        }

        .filter-dropdown-wrapper {
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
          .filter-dropdown-wrapper {
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
          cursor: pointer;
          transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
          box-sizing: border-box;
          user-select: none;
          white-space: nowrap;
        }

        .filter-chip-trigger:hover {
          background: rgba(27, 38, 62, 0.9);
          border-color: rgba(255, 255, 255, 0.16);
          color: #f8fafc;
        }

        .filter-chip-trigger.active {
          background: rgba(56, 189, 248, 0.12);
          border-color: rgba(56, 189, 248, 0.35);
          color: #f8fafc;
        }

        .filter-chip-icon {
          flex-shrink: 0;
        }

        .filter-chip-label {
          font-size: 11px;
          font-weight: 500;
          color: #64748b;
          letter-spacing: 0.01em;
          flex-shrink: 0;
        }

        .filter-chip-value {
          font-size: 11.5px;
          font-weight: 600;
          color: #e2e8f0;
          flex: 1;
          min-width: 0;
          text-align: left;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .filter-chip-trigger.active .filter-chip-value {
          color: #ffffff;
        }

        .filter-chip-chevron {
          color: #64748b;
          transition: transform 0.18s ease;
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

        .category-toolbar-right {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-shrink: 0;
        }

        .toolbar-items-count {
          font-size: 11px;
          font-family: var(--font-mono);
          font-weight: 600;
          color: #64748b;
          letter-spacing: 0.02em;
          white-space: nowrap;
        }

        .view-mode-toggle {
          display: inline-flex;
          align-items: center;
          background: rgba(14, 21, 35, 0.85);
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
          transition: all 0.12s ease;
        }

        .view-mode-btn:hover {
          color: #cbd5e1;
          background: rgba(255, 255, 255, 0.06);
        }

        .view-mode-btn.active {
          background: #1e293b;
          color: #38bdf8;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
        }

        /* Floating Linear-Style Popover Menu - Perfectly matched to dropdown box width */
        .toolbar-dropdown-menu {
          position: absolute;
          top: calc(100% + 5px);
          left: 0;
          right: 0;
          width: 100%;
          min-width: 100%;
          max-width: 100%;
          background: #0d1322;
          border: 1px solid rgba(255, 255, 255, 0.09);
          box-shadow: 0 16px 36px -4px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.04);
          border-radius: 8px;
          padding: 5px;
          z-index: 1000;
          backdrop-filter: blur(16px);
          animation: dropdownFadeIn 0.15s cubic-bezier(0.16, 1, 0.3, 1) forwards;
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
          padding: 5px 8px 6px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #64748b;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
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
          border-color: rgba(6, 182, 212, 0.55);
          box-shadow: 0 0 0 1px rgba(6, 182, 212, 0.25);
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

        .toolbar-dropdown-list {
          display: flex;
          flex-direction: column;
          gap: 2px;
          max-height: 280px;
          overflow-y: auto;
          overflow-x: hidden;
          padding-right: 2px;
        }

        .toolbar-dropdown-list::-webkit-scrollbar {
          width: 4px;
        }

        .toolbar-dropdown-list::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.18);
          border-radius: 4px;
        }

        .toolbar-dropdown-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          height: 30px;
          padding: 0 8px;
          border-radius: 5px;
          background: transparent;
          border: 1px solid transparent;
          cursor: pointer;
          transition: all 0.12s ease;
          width: 100%;
          box-sizing: border-box;
          text-align: left;
        }

        .toolbar-dropdown-item:hover {
          background: rgba(255, 255, 255, 0.06);
          color: #ffffff;
        }

        .toolbar-dropdown-item.selected {
          background: rgba(56, 189, 248, 0.12);
          border-color: rgba(56, 189, 248, 0.28);
          color: #ffffff;
          font-weight: 600;
        }

        .toolbar-dropdown-item-left {
          display: flex;
          align-items: center;
          gap: 7px;
          min-width: 0;
          flex: 1;
        }

        .toolbar-dropdown-item-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .toolbar-dropdown-item-name {
          font-size: 11.5px;
          font-weight: 500;
          color: #cbd5e1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .toolbar-dropdown-item.selected .toolbar-dropdown-item-name {
          color: #ffffff;
          font-weight: 600;
        }

        .toolbar-dropdown-item-right {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
        }

        .toolbar-dropdown-item-count {
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

        .toolbar-dropdown-item:hover .toolbar-dropdown-item-count {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.16);
          color: #f1f5f9;
        }

        .toolbar-dropdown-item.selected .toolbar-dropdown-item-count {
          background: rgba(56, 189, 248, 0.22);
          border-color: rgba(56, 189, 248, 0.45);
          color: #e0f2fe;
          box-shadow: 0 0 8px rgba(56, 189, 248, 0.2);
        }

        .toolbar-dropdown-item-check {
          flex-shrink: 0;
        }

        .toolbar-dropdown-divider {
          height: 1px;
          background: rgba(255, 255, 255, 0.06);
          margin: 3px 0;
        }

        .load-more-wrap {
          display: flex;
          justify-content: center;
          margin-top: 14px;
        }

        .load-more-btn {
          background: #141324;
          border: 1px solid #2e2348;
          color: #38bdf8;
          font-size: 11.5px;
          font-weight: 600;
          padding: 8px 20px;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .load-more-btn:hover {
          background: #1c263c;
          border-color: #38bdf8;
          color: #ffffff;
        }

        /* MCP List View */
        .mcp-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          width: 100%;
          min-width: 0;
          overflow-x: auto;
          padding-bottom: 6px;
          box-sizing: border-box;
        }

        .mcp-list::-webkit-scrollbar {
          height: 6px;
        }

        .mcp-list::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.2);
          border-radius: 9999px;
        }

        .mcp-list::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.12);
          border-radius: 9999px;
        }

        .mcp-list::-webkit-scrollbar-thumb:hover {
          background: rgba(99, 102, 241, 0.4);
        }

        .mcp-list-header {
          display: grid;
          grid-template-columns: minmax(260px, 1fr) 150px 180px 140px 140px;
          min-width: 900px;
          width: 100%;
          gap: 14px;
          padding: 10px 18px;
          font-size: 10px;
          font-weight: 700;
          color: #718096;
          letter-spacing: 0.08em;
          background: rgba(13, 18, 30, 0.92);
          backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 8px;
          align-items: center;
          user-select: none;
          box-sizing: border-box;
          position: sticky;
          top: 0;
          z-index: 10;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
        }

        .mcp-list-header span {
          display: flex;
          align-items: center;
          justify-content: flex-start;
          min-width: 0;
          text-align: left;
        }

        .mcp-list-header .col-meta,
        .mcp-list-header .col-agents,
        .mcp-list-header .col-status {
          display: flex;
          align-items: center;
          justify-content: flex-start;
          text-align: left;
        }

        .mcp-list-header .right {
          justify-content: flex-end;
          text-align: right;
        }

        .mcp-row-card {
          background: #0f1626;
          border: 1px solid rgba(255, 255, 255, 0.065);
          border-radius: 9px;
          padding: 10px 18px;
          display: grid;
          grid-template-columns: minmax(260px, 1fr) 150px 180px 140px 140px;
          min-width: 900px;
          width: 100%;
          min-height: 56px;
          gap: 14px;
          align-items: center;
          transition: border-color 0.12s ease, background 0.12s ease;
          position: relative;
          box-sizing: border-box;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
          cursor: pointer;
        }

        .mcp-row-card:hover {
          border-color: rgba(56, 189, 248, 0.3);
          background: #131c30;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        }

        .mcp-row-card.is-card-disabled {
          opacity: 0.72;
          background: #0b0f19;
          border-color: rgba(244, 63, 94, 0.18);
        }

        /* List Column Base */
        .list-col {
          display: flex;
          align-items: center;
          min-width: 0;
          box-sizing: border-box;
        }

        .col-identity {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }

        .card-icon-avatar.list-avatar.mcp {
          width: 34px;
          height: 34px;
          min-width: 34px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, rgba(56, 189, 248, 0.18), rgba(14, 165, 233, 0.08));
          border: 1px solid rgba(56, 189, 248, 0.3);
          color: #38bdf8;
          box-shadow: none;
          flex-shrink: 0;
          transition: border-color 0.15s ease;
        }

        .mcp-row-card:hover .card-icon-avatar.list-avatar.mcp {
          border-color: rgba(56, 189, 248, 0.55);
          color: #7dd3fc;
          box-shadow: none;
          transform: none;
        }

        .list-identity-text {
          display: flex;
          flex-direction: column;
          gap: 3px;
          min-width: 0;
          overflow: hidden;
          flex: 1;
        }

        .list-title-row {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
          line-height: 1.25;
        }

        .list-title-row .card-item-name {
          font-size: 13.5px;
          font-weight: 600;
          color: #f8fafc;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          letter-spacing: -0.01em;
          flex-shrink: 1;
          transition: color 0.15s ease;
        }

        .mcp-row-card:hover .list-title-row .card-item-name {
          color: #ffffff;
        }

        .list-subline {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
          max-width: 100%;
        }

        .list-description-snippet {
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

        .list-cmd-chip {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          background: rgba(0, 0, 0, 0.38);
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 4px;
          padding: 1.5px 6px;
          font-size: 9.5px;
          color: #7dd3fc;
          max-width: 190px;
          flex-shrink: 0;
          cursor: pointer;
          transition: all 0.15s ease;
          box-sizing: border-box;
          height: 20px;
        }

        .list-cmd-chip:hover {
          background: rgba(0, 0, 0, 0.58);
          border-color: rgba(56, 189, 248, 0.35);
          color: #bae6fd;
        }

        .list-cmd-chip .cmd-icon {
          color: #38bdf8;
          flex-shrink: 0;
        }

        .list-cmd-chip .list-cmd-text {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .list-cmd-chip .list-cmd-copy-icon {
          color: #64748b;
          display: inline-flex;
          align-items: center;
          margin-left: 2px;
          opacity: 0.7;
          transition: opacity 0.15s ease, color 0.15s ease;
        }

        .list-cmd-chip:hover .list-cmd-copy-icon {
          opacity: 1;
          color: #38bdf8;
        }

        .list-cmd-chip .list-cmd-copy-icon.copied {
          color: #34d399 !important;
          opacity: 1 !important;
        }

        /* Meta Column */
        .list-col.col-meta,
        .mcp-row-card .col-meta {
          flex-direction: column;
          align-items: flex-start;
          justify-content: center;
          gap: 3px;
          min-width: 0;
        }

        .mcp-list-cat-pill {
          display: inline-flex;
          align-items: center;
          font-size: 9.5px;
          font-weight: 600;
          color: #7dd3fc;
          background: rgba(56, 189, 248, 0.08);
          border: 1px solid rgba(56, 189, 248, 0.22);
          padding: 1.5px 6px;
          border-radius: 4px;
          white-space: nowrap;
          letter-spacing: 0.02em;
        }

        .mcp-list-meta-subrow {
          display: flex;
          align-items: center;
          gap: 5px;
          flex-wrap: wrap;
          min-width: 0;
        }

        .source-registry-pill {
          display: inline-flex;
          align-items: center;
          font-size: 8.5px;
          font-weight: 600;
          padding: 1px 4.5px;
          border-radius: 3px;
          white-space: nowrap;
          line-height: 1.2;
          letter-spacing: 0.03em;
        }

        .source-registry-pill.pill-official {
          color: #60a5fa;
          background: rgba(37, 99, 235, 0.1);
          border: 1px solid rgba(59, 130, 246, 0.25);
        }

        .source-registry-pill.pill-aas {
          color: #a855f7;
          background: rgba(168, 85, 247, 0.1);
          border: 1px solid rgba(168, 85, 247, 0.25);
        }

        .source-registry-pill.pill-smithery {
          color: #f59e0b;
          background: rgba(245, 158, 11, 0.1);
          border: 1px solid rgba(245, 158, 11, 0.25);
        }

        .source-registry-pill.pill-addy {
          color: #34d399;
          background: rgba(16, 185, 129, 0.1);
          border: 1px solid rgba(16, 185, 129, 0.25);
        }

        .source-registry-pill.pill-custom,
        .source-registry-pill.pill-default {
          color: #94a3b8;
          background: rgba(148, 163, 184, 0.08);
          border: 1px solid rgba(148, 163, 184, 0.2);
        }

        .mcp-author-text {
          font-size: 9.5px;
          color: #64748b;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .mcp-list-plugin-badge {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          font-size: 8.5px;
          color: #c084fc;
          background: rgba(168, 85, 247, 0.08);
          border: 1px solid rgba(168, 85, 247, 0.22);
          padding: 1px 4.5px;
          border-radius: 3px;
          white-space: nowrap;
        }

        /* Equipped Agents Column */
        .list-col.col-agents {
          display: flex;
          align-items: center;
          min-width: 0;
          overflow: hidden;
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

        .list-col.col-agents .agent-pill.compact.filtered-active {
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
        }

        .list-col.col-agents .agent-pill.compact span {
          white-space: nowrap;
        }

        .list-col.col-agents .agent-pill.compact.unequipped {
          border-style: dashed !important;
          opacity: 0.85;
        }

        .list-col.col-agents .agent-pill.compact.unequipped:hover {
          opacity: 1 !important;
          border-style: solid !important;
        }

        /* Status & Prereqs Column */
        .list-col.col-status {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          justify-content: center;
          gap: 4px;
          min-width: 0;
          width: 100%;
        }

        .list-col.col-status .status-pill-clean {
          padding: 2.5px 8px;
          font-size: 9.5px;
          letter-spacing: 0.04em;
        }

        .mcp-list-dep-alert {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          background: rgba(244, 63, 94, 0.09);
          border: 1px solid rgba(244, 63, 94, 0.3);
          color: #fb7185;
          font-size: 9px;
          font-weight: 600;
          padding: 1.5px 5.5px;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.15s ease;
          letter-spacing: 0.02em;
          white-space: nowrap;
          box-sizing: border-box;
          line-height: 1.2;
        }

        .mcp-list-dep-alert:hover {
          background: rgba(244, 63, 94, 0.18);
          border-color: rgba(244, 63, 94, 0.5);
          color: #fda4af;
        }

        .mcp-list-dep-alert .dep-alert-icon {
          flex-shrink: 0;
        }

        /* Actions Column */
        .list-col.col-actions.right {
          justify-content: flex-end;
          align-items: center;
          min-width: 0;
          width: 100%;
          overflow: visible;
        }

        .list-col.col-actions.right .toolbar-right-actions {
          margin: 0;
          display: flex;
          align-items: center;
          gap: 4px;
          flex-wrap: nowrap;
          justify-content: flex-end;
          margin-left: auto;
        }

        .mcp-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 14px;
        }

        .mcp-card {
          background: #0f1626;
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 12px;
          padding: 16px 18px;
          display: flex;
          flex-direction: column;
          min-width: 0;
          min-height: 226px;
          box-sizing: border-box;
          transition: border-color 0.12s ease, background 0.12s ease;
          position: relative;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
          cursor: pointer;
        }

        .mcp-card:hover {
          border-color: rgba(56, 189, 248, 0.32);
          background: #131c30;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
        }

        /* Header: Natural, non-colliding flex row */
        .card-header-cluster {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 10px;
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

        .card-icon-avatar.mcp {
          width: 36px;
          height: 36px;
          border-radius: 9px;
          background: linear-gradient(135deg, rgba(56, 189, 248, 0.18), rgba(14, 165, 233, 0.08));
          border: 1px solid rgba(56, 189, 248, 0.32);
          color: #38bdf8;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          box-shadow: none;
          transition: border-color 0.15s ease;
        }

        .mcp-card:hover .card-icon-avatar.mcp {
          border-color: rgba(56, 189, 248, 0.55);
          box-shadow: none;
          transform: none;
        }

        .card-identity-text {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
          flex: 1;
        }

        .card-title-row {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
          line-height: 1.25;
        }

        .card-item-name {
          font-size: 14px;
          font-weight: 600;
          color: #f8fafc;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          letter-spacing: -0.01em;
          min-width: 0;
          flex-shrink: 1;
          transition: color 0.15s ease;
        }

        .mcp-card:hover .card-item-name {
          color: #ffffff;
        }

        .card-sub-meta {
          display: flex;
          align-items: center;
          gap: 5px;
          min-width: 0;
          font-size: 10.5px;
          line-height: 1.2;
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
          max-width: 110px;
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

        .transport-badge {
          font-size: 8.5px;
          font-weight: 700;
          padding: 1px 5px;
          border-radius: 4px;
          flex-shrink: 0;
          white-space: nowrap;
        }

        .transport-badge.stdio {
          color: #38bdf8;
          background: rgba(56, 189, 248, 0.12);
          border: 1px solid rgba(56, 189, 248, 0.25);
        }

        .transport-badge.sse {
          color: #34d399;
          background: rgba(52, 211, 153, 0.12);
          border: 1px solid rgba(52, 211, 153, 0.25);
        }

        .source-registry-pill {
          font-size: 8.5px;
          color: #38bdf8;
          background: rgba(56, 189, 248, 0.08);
          border: 1px solid rgba(56, 189, 248, 0.22);
          padding: 0.5px 5px;
          border-radius: 4px;
          font-weight: 600;
          letter-spacing: 0.03em;
          text-transform: uppercase;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 140px;
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
        }

        /* Prerequisite Alert Strip in Card Body */
        .card-prereq-alert {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
          background: rgba(244, 63, 94, 0.08);
          border: 1px solid rgba(244, 63, 94, 0.25);
          border-radius: 5px;
          padding: 3px 8px;
          font-size: 10px;
          color: #fda4af;
          box-sizing: border-box;
          min-height: 24px;
        }

        .prereq-alert-label {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          cursor: pointer;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          min-width: 0;
          flex: 1;
        }

        .prereq-alert-label:hover {
          color: #ffffff;
        }

        .prereq-alert-icon {
          color: #fb7185;
          flex-shrink: 0;
        }

        .prereq-quick-copy {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          padding: 1px 6px;
          border-radius: 4px;
          background: rgba(244, 63, 94, 0.15);
          border: 1px solid rgba(244, 63, 94, 0.35);
          color: #fb7185;
          font-size: 9px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s ease;
          flex-shrink: 0;
          height: 18px;
        }

        .prereq-quick-copy:hover {
          background: rgba(244, 63, 94, 0.25);
          color: #ffffff;
          border-color: rgba(244, 63, 94, 0.6);
        }

        .prereq-quick-copy.copied {
          background: rgba(52, 211, 153, 0.2);
          border-color: rgba(52, 211, 153, 0.5);
          color: #34d399;
        }

        .status-pill-clean {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          height: 22px;
          padding: 0 8px;
          border-radius: 4px;
          font-size: 9.5px;
          font-weight: 700;
          letter-spacing: 0.03em;
          white-space: nowrap;
          flex-shrink: 0;
          box-sizing: border-box;
        }

        .status-pill-clean.installed {
          color: #34d399;
          background: rgba(16, 185, 129, 0.08);
          border: 1px solid rgba(16, 185, 129, 0.25);
        }

        .status-pill-clean.disabled {
          color: #fb7185;
          background: rgba(244, 63, 94, 0.08);
          border: 1px solid rgba(244, 63, 94, 0.28);
        }

        .status-pill-clean.partial {
          color: #fbbf24;
          background: rgba(245, 158, 11, 0.08);
          border: 1px solid rgba(245, 158, 11, 0.25);
        }

        .status-pill-clean.available {
          color: #818cf8;
          background: rgba(129, 140, 248, 0.08);
          border: 1px solid rgba(129, 140, 248, 0.25);
        }

        .status-pill-clean.clickable {
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .status-pill-clean.clickable:hover {
          transform: translateY(-0.5px);
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

        .mcp-card.is-card-disabled {
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
          background: #818cf8;
          box-shadow: 0 0 6px rgba(129, 140, 248, 0.5);
        }

        /* Body */
        .card-content-body {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 8px;
          min-width: 0;
        }

        .card-description-text {
          font-size: 11.5px;
          color: #94a3b8;
          line-height: 1.45;
          margin: 0;
          height: 34px;
          min-height: 34px;
          max-height: 34px;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .card-description-text.empty-desc {
          color: #475569;
          font-style: italic;
        }

        /* Modern Agent Targets Deck (Grid View) */
        .agent-deck-container {
          display: flex;
          flex-direction: column;
          gap: 7px;
          background: rgba(15, 23, 42, 0.45);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 8px;
          padding: 8px 10px;
          box-sizing: border-box;
          width: 100%;
          min-width: 0;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .agent-deck-container:hover {
          background: rgba(15, 23, 42, 0.65);
          border-color: rgba(255, 255, 255, 0.09);
        }

        .agent-deck-container.pending-only {
          background: rgba(15, 23, 42, 0.25);
          border-color: rgba(255, 255, 255, 0.035);
          border-style: dashed;
        }

        .agent-deck-container.empty {
          padding: 7px 10px;
        }

        .agent-deck-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          width: 100%;
          min-width: 0;
        }

        .agent-deck-label-group {
          display: flex;
          align-items: center;
          gap: 5.5px;
          min-width: 0;
        }

        .agent-deck-icon {
          color: #64748b;
          flex-shrink: 0;
        }

        .agent-deck-title {
          font-size: 9.5px;
          font-weight: 700;
          letter-spacing: 0.05em;
          color: #718096;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .agent-deck-count-badge {
          display: inline-flex;
          align-items: center;
          font-size: 9px;
          font-weight: 600;
          color: #94a3b8;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.07);
          padding: 0 5px;
          border-radius: 9999px;
          line-height: 14px;
        }

        .agent-deck-filter-hint {
          font-size: 9px;
          color: #475569;
          font-style: italic;
          white-space: nowrap;
          letter-spacing: 0.01em;
          transition: color 0.15s ease;
        }

        .agent-deck-container:hover .agent-deck-filter-hint {
          color: #64748b;
        }

        .agent-deck-empty-hint {
          font-size: 10px;
          color: #475569;
          font-style: italic;
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
          font-weight: 600;
          border: 1px solid;
          cursor: pointer;
          user-select: none;
          white-space: nowrap;
          flex-shrink: 0;
          line-height: 14px;
          transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .agent-deck-pill:hover {
          filter: brightness(1.12);
        }

        .agent-deck-pill.pending {
          border-style: dashed !important;
          opacity: 0.85;
        }

        .agent-deck-pill.pending:hover {
          opacity: 1;
          border-style: solid !important;
        }

        .agent-deck-pill.is-filtered {
          font-weight: 600;
          box-shadow: none;
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
          background: rgba(255, 255, 255, 0.015);
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
          transform: translateY(-0.5px);
          filter: brightness(1.15);
        }

        .agent-pill.filtered-active {
          font-weight: 600;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
        }

        .agent-pill.unequipped {
          border-style: dashed !important;
          opacity: 0.85;
        }

        .agent-pill.unequipped:hover {
          opacity: 1 !important;
          border-style: solid !important;
        }

        .uninstalled-muted-label {
          font-size: 9.5px;
          color: #475569;
          font-style: italic;
        }

        .command-snippet {
          background: rgba(0, 0, 0, 0.35);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 5px;
          padding: 3px 8px;
          display: flex;
          align-items: center;
          gap: 7px;
          min-width: 0;
          height: 24px;
          box-sizing: border-box;
        }

        .cmd-icon {
          color: #38bdf8;
          flex-shrink: 0;
        }

        .cmd-icon.sse {
          color: #34d399;
        }

        .cmd-text {
          color: #cbd5e1;
          font-size: 10px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          flex: 1;
        }

        .cmd-copy-btn {
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          gap: 3px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.12);
          color: #94a3b8;
          font-size: 8.5px;
          font-weight: 700;
          padding: 1px 5px;
          border-radius: 3px;
          cursor: pointer;
          transition: all 0.15s ease;
          height: 16px;
        }

        .cmd-copy-btn:hover {
          background: rgba(255, 255, 255, 0.14);
          color: #f1f5f9;
          border-color: rgba(255, 255, 255, 0.3);
        }

        .cmd-copy-btn.copied {
          background: rgba(52, 211, 153, 0.18);
          border-color: rgba(52, 211, 153, 0.45);
          color: #34d399;
        }

        .card-action-icon-btn.active-copied {
          background: rgba(52, 211, 153, 0.15);
          border-color: rgba(52, 211, 153, 0.4);
        }

        /* Bottom Toolbar: Perfectly aligned, never overflowing */
        .card-bottom-toolbar {
          margin-top: auto;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
          padding-top: 8px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          min-height: 34px;
          box-sizing: border-box;
        }

        .toolbar-left-chips {
          display: flex;
          align-items: center;
          gap: 5px;
          flex-wrap: nowrap;
          min-width: 0;
          flex: 1;
          overflow: hidden;
        }

        .meta-subtle-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 9.5px;
          color: #72849a;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          padding: 2px 6px;
          border-radius: 4px;
          white-space: nowrap;
          flex-shrink: 0;
          min-width: 0;
          overflow: hidden;
          height: 22px;
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

        .meta-subtle-badge.env-chip {
          color: #fbbf24;
          background: rgba(251, 191, 36, 0.06);
          border-color: rgba(251, 191, 36, 0.2);
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

        .card-action-icon-btn.reinstall {
          color: #38bdf8;
          border-color: rgba(56, 189, 248, 0.2);
          background: rgba(56, 189, 248, 0.05);
        }

        .card-action-icon-btn.reinstall:hover:not(:disabled) {
          background: rgba(56, 189, 248, 0.14);
          color: #ffffff;
          border-color: rgba(56, 189, 248, 0.35);
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

        /* MCP API Key Modal */
        .mcp-key-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(4, 7, 14, 0.75);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 999999;
          padding: 20px;
          box-sizing: border-box;
          animation: modalFadeIn 0.15s ease-out;
        }

        .mcp-key-modal-card {
          width: 100%;
          max-width: 490px;
          background: #0d1320;
          border: 1px solid #1f2b42;
          border-radius: 12px;
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.06);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          animation: modalCardScale 0.18s cubic-bezier(0.16, 1, 0.3, 1);
          user-select: none;
          -webkit-user-select: none;
        }

        .mcp-key-modal-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px 20px;
          background: #0f1728;
          border-bottom: 1px solid #19243a;
        }

        .mcp-key-header-icon-box {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          background: rgba(245, 158, 11, 0.12);
          border: 1px solid rgba(245, 158, 11, 0.25);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .mcp-key-header-text {
          flex: 1;
          min-width: 0;
        }

        .mcp-key-modal-title {
          margin: 0;
          font-size: 14px;
          font-weight: 600;
          color: #f1f5f9;
        }

        .mcp-key-modal-subtitle {
          margin: 2px 0 0 0;
          font-size: 11px;
          color: #8da2be;
        }

        .mcp-key-modal-body {
          padding: 18px 20px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .mcp-key-security-note {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          background: rgba(16, 185, 129, 0.08);
          border: 1px solid rgba(16, 185, 129, 0.2);
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 11px;
          color: #a7f3d0;
          line-height: 1.45;
        }

        .mcp-key-inputs-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .mcp-key-field {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .mcp-key-field-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .mcp-key-label {
          font-size: 11px;
          font-weight: 600;
          color: #cbd5e1;
        }

        .mcp-key-hint {
          font-size: 10px;
          color: #64748b;
        }

        .mcp-key-input-wrapper {
          display: flex;
          align-items: center;
          background: #090e18;
          border: 1px solid #1c273c;
          border-radius: 6px;
          overflow: hidden;
          transition: border-color 0.15s ease;
        }

        .mcp-key-input-wrapper:focus-within {
          border-color: #8b5cf6;
          box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.2);
        }

        .mcp-key-input {
          flex: 1;
          height: 32px;
          background: transparent;
          border: none;
          outline: none;
          padding: 0 10px;
          color: #f1f5f9;
          font-size: 11.5px;
          width: 100%;
        }

        .mcp-key-eye-btn {
          background: transparent;
          border: none;
          color: #64748b;
          padding: 0 10px;
          height: 32px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .mcp-key-eye-btn:hover {
          color: #cbd5e1;
        }

        .mcp-key-manual-tip {
          font-size: 10.5px;
          color: #71829a;
          line-height: 1.4;
        }

        .mcp-key-modal-footer {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          padding: 14px 20px;
          background: #0a0f1b;
          border-top: 1px solid #19243a;
        }

        .mcp-key-btn-secondary {
          height: 30px;
          padding: 0 12px;
          background: #141c2c;
          border: 1px solid #202d44;
          color: #94a3b8;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .mcp-key-btn-secondary:hover {
          background: #1c273e;
          color: #f1f5f9;
        }

        .mcp-key-btn-primary {
          height: 30px;
          padding: 0 14px;
          background: rgba(139, 92, 246, 0.15);
          border: 1px solid rgba(139, 92, 246, 0.35);
          color: #c4b5fd;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
          transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
        }

        .mcp-key-btn-primary:hover {
          background: rgba(139, 92, 246, 0.25);
          border-color: rgba(139, 92, 246, 0.6);
          color: #ffffff;
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

        .mcp-view-container .card-primary-action-btn,
        .card-primary-action-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5.5px;
          height: 28px;
          padding: 0 12px;
          background: rgba(56, 189, 248, 0.12);
          border: 1px solid rgba(56, 189, 248, 0.3);
          color: #e0f2fe;
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

        .mcp-view-container .card-primary-action-btn:hover:not(:disabled) {
          background: rgba(56, 189, 248, 0.22);
          border-color: rgba(56, 189, 248, 0.55);
          color: #ffffff;
        }

        .card-primary-action-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .spin {
          animation: spin 1s linear infinite;
        }

        /* Highlighted MCP Card with genuine GPU animated fade-out */
        .mcp-card.item-card-highlighted,
        .mcp-row-card.item-card-highlighted,
        .item-card-highlighted {
          position: relative;
          z-index: 10;
          animation: highlightMcpBorder 2.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        .mcp-card.item-card-highlighted > *,
        .mcp-row-card.item-card-highlighted > *,
        .item-card-highlighted > * {
          position: relative;
          z-index: 1;
        }

        .mcp-card.item-card-highlighted::before,
        .mcp-row-card.item-card-highlighted::before,
        .item-card-highlighted::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: linear-gradient(135deg, rgba(56, 189, 248, 0.09), rgba(14, 165, 233, 0.03));
          pointer-events: none;
          z-index: 0;
          animation: highlightMcpOverlay 2.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        @keyframes highlightMcpBorder {
          0% {
            border-color: rgba(14, 165, 233, 0.85);
            box-shadow: 0 0 20px rgba(14, 165, 233, 0.4);
          }
          20% {
            border-color: rgba(14, 165, 233, 0.8);
            box-shadow: 0 0 16px rgba(14, 165, 233, 0.3);
          }
          45% {
            border-color: rgba(14, 165, 233, 0.6);
            box-shadow: 0 0 12px rgba(14, 165, 233, 0.2);
          }
          70% {
            border-color: rgba(14, 165, 233, 0.3);
            box-shadow: 0 0 8px rgba(14, 165, 233, 0.1);
          }
          100% {
            border-color: rgba(255, 255, 255, 0.07);
            box-shadow: none;
          }
        }

        @keyframes highlightMcpOverlay {
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
          background: rgba(3, 7, 18, 0.78);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
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
          max-width: 720px;
          min-width: 0;
          box-sizing: border-box;
          box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5), 0 25px 65px -12px rgba(0, 0, 0, 0.85), inset 0 1px 0 0 rgba(255, 255, 255, 0.1);
          overflow: hidden;
          overflow-x: hidden;
          animation: itemModalScaleIn 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          will-change: transform, opacity;
          display: flex;
          flex-direction: column;
          max-height: min(94vh, calc(100vh - 36px));
          position: relative;
        }

        .item-modal-card.is-closing {
          animation: itemModalScaleOut 0.16s cubic-bezier(0.4, 0, 1, 1) forwards !important;
        }

        @keyframes itemModalScaleIn {
          from { opacity: 0; transform: scale(0.96) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }

        @keyframes itemModalScaleOut {
          from { opacity: 1; transform: scale(1) translateY(0); }
          to { opacity: 0; transform: scale(0.96) translateY(8px); }
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
          flex: 1;
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

        .item-modal-icon-wrap.mcp {
          background: rgba(56, 189, 248, 0.14);
          border: 1px solid rgba(56, 189, 248, 0.35);
          color: #38bdf8;
          box-shadow: 0 0 16px rgba(56, 189, 248, 0.15);
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
          color: #38bdf8;
          background: rgba(56, 189, 248, 0.08);
          border: 1px solid rgba(56, 189, 248, 0.2);
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
          color: #93c5fd;
          text-decoration: underline;
        }

        .author-link-icon {
          flex-shrink: 0;
          opacity: 0.7;
        }

        .item-modal-close-btn {
          align-self: flex-start;
          margin-top: 2px;
          height: 26px;
          padding: 0 7px 0 6px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #94a3b8;
          cursor: pointer;
          border-radius: 6px;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          transition: all 0.14s cubic-bezier(0.16, 1, 0.3, 1);
          flex-shrink: 0;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
          user-select: none;
        }

        .item-modal-close-btn:hover {
          color: #f8fafc;
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.18);
        }

        .item-modal-close-btn:active {
          transform: translateY(0.5px);
          background: rgba(255, 255, 255, 0.12);
        }

        .item-modal-close-btn .modal-esc-hint,
        .modal-esc-hint {
          font-size: 9px;
          font-weight: 600;
          letter-spacing: 0.04em;
          color: #64748b;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 1px 0 rgba(0, 0, 0, 0.35);
          padding: 1px 4.5px;
          border-radius: 3.5px;
          line-height: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          height: 15px;
          box-sizing: border-box;
          transition: all 0.14s ease;
        }

        .item-modal-close-btn:hover .modal-esc-hint {
          color: #e2e8f0;
          background: rgba(255, 255, 255, 0.09);
          border-color: rgba(255, 255, 255, 0.2);
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
          color: #38bdf8;
          transition: color 0.12s ease;
        }

        .meta-v.clickable:hover {
          color: #bae6fd;
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
          background: linear-gradient(135deg, #0284c7, #0ea5e9);
          border-color: rgba(14, 165, 233, 0.45);
          color: #ffffff;
          box-shadow: 0 2px 8px rgba(14, 165, 233, 0.25);
        }

        .modal-action-btn.btn-primary:hover:not(:disabled) {
          background: linear-gradient(135deg, #0369a1, #0284c7);
          border-color: rgba(14, 165, 233, 0.65);
          box-shadow: 0 4px 14px rgba(14, 165, 233, 0.4);
          color: #ffffff;
        }

        .modal-action-btn.btn-done {
          background: linear-gradient(135deg, #0284c7, #0ea5e9);
          border-color: rgba(14, 165, 233, 0.45);
          color: #ffffff;
          box-shadow: 0 2px 8px rgba(14, 165, 233, 0.25);
        }

        .modal-action-btn.btn-done:hover:not(:disabled) {
          background: linear-gradient(135deg, #0369a1, #0284c7);
          border-color: rgba(14, 165, 233, 0.65);
          box-shadow: 0 4px 14px rgba(14, 165, 233, 0.4);
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
