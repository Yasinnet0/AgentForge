import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ScannedMcpServer, SupportedAgent } from '../types/agent';
import { CatalogMcpServer } from '../types/catalog';
import { MCP_CATALOG } from '../data/mcpCatalog';
import { 
  Server, 
  Bot, 
  Sparkles, 
  Terminal, 
  Cpu, 
  Boxes, 
  Compass, 
  Plus, 
  Globe, 
  KeyRound, 
  CheckCircle2, 
  Package,
  Layers,
  Trash2,
  Loader2,
  Filter,
  FolderOpen,
  Check,
  X,
  ChevronDown,
  RefreshCw,
  AlertCircle,
  Copy,
  Power,
  PowerOff,
} from 'lucide-react';
import { logActivity } from '../services/activityLogger';
import { useToast } from '../context/ToastContext';
import { formatSourceBadge } from '../services/catalogSync';
import { DependencyReport } from '../types/dependencies';
import { getRequiredDependencies, evaluateDependencyStatus, getInstallSnippetForPlatform } from '../utils/dependencyResolver';
import { DependencyInstallDrawer } from './DependencyInstallDrawer';

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
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
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
          envKeys: s.envKeys,
          sourceRegistry: 'Local Config',
          license: 'Custom',
          isCatalog: false,
          installedAgents: installedOn,
          disabledAgentIds,
          isDisabled,
          pluginName: s.pluginName,
          sourcePath: s.sourcePath,
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
    return ['All', ...Array.from(set)];
  }, [unifiedServers]);

  const counts = useMemo(() => {
    const installed = unifiedServers.filter((s) => s.installedAgents.length > 0).length;
    const available = unifiedServers.filter((s) => s.isCatalog && (selectedAgents.length === 0 || s.installedAgents.length < selectedAgents.length)).length;
    return {
      all: unifiedServers.length,
      installed,
      available,
    };
  }, [unifiedServers, selectedAgents]);

  const indexedServers = useMemo(() => {
    return unifiedServers.map((s) => ({
      item: s,
      searchStr: `${s.name} ${s.description || ''} ${s.command || ''} ${s.url || ''} ${s.transport} ${s.category || ''} ${(s.tags || []).join(' ')}`.toLowerCase(),
    }));
  }, [unifiedServers]);

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

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
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
  }, [indexedServers, activeSegment, selectedCategory, searchQuery, selectedAgents.length, currentAgentFilter]);

  const [visibleCount, setVisibleCount] = useState(36);

  useEffect(() => {
    setVisibleCount(36);
  }, [searchQuery, activeSegment, selectedCategory, currentAgentFilter]);

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

  return (
    <div className="mcp-view-container">
      {/* Header */}
      <div className="mcp-view-header">
        <div className="header-info">
          <div className="title-line">
            <h2 className="view-title">Model Context Protocol (MCP) Servers</h2>
            <span className="count-pill font-mono">{mcpServers.length} CONFIGURED</span>
            <span className="catalog-pill font-mono">{activeMcpCatalog.length} IN CLOUD CATALOG</span>
            {catalogSyncedAt && (
              <span className="sync-pill font-mono" title={`Synced with AAS: ${new Date(catalogSyncedAt).toLocaleString()}`}>
                <CheckCircle2 size={10} /> AAS SYNCED
              </span>
            )}
          </div>
          <p className="view-desc">
            Model Context Protocol servers declared across your agent configs or ready to equip from the catalog.
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
              Configured <span className="segment-count">{counts.installed}</span>
            </button>
            <button
              className={`segment-btn ${activeSegment === 'available' ? 'active' : ''}`}
              onClick={() => setActiveSegment('available')}
            >
              Available in Catalog <span className="segment-count">{counts.available}</span>
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
              title="Filter MCP servers to specific target agents"
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
                    const agentMcpsCount = mcpServers.filter((s) => s.sourceAgentId === ag.id && !s.pluginName).length;
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
                          <span className="toolbar-dropdown-item-count">{agentMcpsCount}</span>
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
            Select one or more target agents in the top bar to inspect or equip their MCP servers.
          </div>
        </div>
      ) : filteredServers.length === 0 ? (
        <div className="empty-state-card">
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
          <div className="mcp-grid">
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
              >
                {/* 1. Header: Icon Avatar + Title/Transport/Category + Status Pill */}
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
                        {server.sourceRegistry && (() => {
                          const badge = formatSourceBadge(server.sourceRegistry);
                          return (
                            <>
                              <span className="card-meta-dot">·</span>
                              <span
                                className={`source-registry-pill font-mono ${badge.badgeClass}`}
                                title={`${badge.tooltip} · License: ${server.license || 'MIT / Apache-2.0'}`}
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
                              targetName: server.name,
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
                            className={`dep-badge-quick-copy ${copiedDepKey === `dep-${server.id}` ? 'copied' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyMissingDep(`dep-${server.id}`, depStatus.firstMissing!);
                            }}
                            title={`Copy install command: ${getInstallSnippetForPlatform(depStatus.firstMissing)}`}
                            aria-label="Copy prerequisite install command"
                          >
                            {copiedDepKey === `dep-${server.id}` ? <Check size={10} /> : <Copy size={10} />}
                          </button>
                        )}
                      </div>
                    )}

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

                {/* 2. Body: Description + Command Preview Snippet + Equipped Agents */}
                <div className="card-content-body">
                  {server.description && (
                    <p className="card-description-text">{server.description}</p>
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

                  {server.installedAgents.length > 0 && (
                    <div className="equipped-agents-bar">
                      <span className="equipped-label font-mono">Active in:</span>
                      <div className="equipped-pills-list">
                        {server.installedAgents.map((ag) => {
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

                  <div className="toolbar-right-actions">
                    {/* Enable / Disable Toggle Button */}
                    {server.installedAgents.length > 0 && (
                      <button
                        type="button"
                        className={`card-action-icon-btn toggle-state-btn ${server.isDisabled ? 'disabled-state' : 'active-state'}`}
                        onClick={() => handleToggleMcp(server)}
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

                    {/* Open Folder / Config Button for Configured Servers */}
                    {server.installedAgents.length > 0 && (
                      <button
                        type="button"
                        className="card-action-icon-btn"
                        onClick={() => handleOpenMcpFolder(server)}
                        title="Open MCP configuration directory in File Explorer"
                      >
                        <FolderOpen size={13} />
                      </button>
                    )}

                    {/* Copy Config JSON Button for Manual Setup */}
                    <button
                      type="button"
                      className={`card-action-icon-btn ${copiedCmdId === `config-${server.id}` ? 'active-copied' : ''}`}
                      onClick={() => handleCopyMcpConfig(server)}
                      title="Copy MCP JSON configuration snippet for manual agent setup"
                      aria-label="Copy MCP JSON configuration"
                    >
                      {copiedCmdId === `config-${server.id}` ? <Check size={13} style={{ color: '#34d399' }} /> : <Copy size={13} />}
                    </button>

                    {/* Docs Link */}
                    {server.docsUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          if (window.electronAPI?.openExternal) {
                            window.electronAPI.openExternal(server.docsUrl!);
                          } else {
                            window.open(server.docsUrl, '_blank');
                          }
                        }}
                        className="card-action-icon-btn"
                        title="Open documentation in default browser"
                      >
                        <Globe size={13} />
                      </button>
                    )}

                    {/* Remove Button */}
                    {server.installedAgents.length > 0 && (
                      <button
                        type="button"
                        className="card-action-icon-btn danger"
                        onClick={() => handleUninstallMcp(server)}
                        disabled={isLoading}
                        title={`Remove from ${server.installedAgents.map((a) => a.name).join(', ')}`}
                      >
                        {isLoading ? (
                          <Loader2 size={12} className="spin" />
                        ) : (
                          <Trash2 size={13} />
                        )}
                      </button>
                    )}

                    {/* Add to Agent Button */}
                    {(!isInstalledOnAll && server.isCatalog) && (
                      <button
                        type="button"
                        className="card-primary-action-btn mcp"
                        onClick={() => handleInstallMcp(server)}
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
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filteredServers.length > visibleCount && (
          <div className="load-more-wrap">
            <button
              type="button"
              className="load-more-btn font-mono"
              onClick={() => setVisibleCount((prev) => prev + 36)}
            >
              <span>Show more servers ({displayedServers.length} of {filteredServers.length})</span>
            </button>
          </div>
        )}
        </>
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

        .mcp-view-header .count-pill {
          font-size: 10px;
          font-weight: 700;
          color: #818cf8;
          background: rgba(129, 140, 248, 0.12);
          padding: 2px 7px;
          border-radius: 4px;
          border: 1px solid rgba(129, 140, 248, 0.25);
        }

        .catalog-pill {
          font-size: 10px;
          font-weight: 700;
          color: #38bdf8;
          background: rgba(56, 189, 248, 0.12);
          padding: 2px 7px;
          border-radius: 4px;
          border: 1px solid rgba(56, 189, 248, 0.25);
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
          color: #60a5fa;
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

        .mcp-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
          gap: 14px;
        }

        .mcp-card {
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

        .mcp-card:hover {
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

        .card-icon-avatar.mcp {
          width: 34px;
          height: 34px;
          border-radius: 8px;
          background: rgba(99, 102, 241, 0.12);
          border: 1px solid rgba(99, 102, 241, 0.25);
          color: #818cf8;
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

        .transport-badge {
          font-size: 8.5px;
          font-weight: 700;
          padding: 0.5px 5px;
          border-radius: 3px;
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
          color: #818cf8;
          background: rgba(129, 140, 248, 0.08);
          border: 1px solid rgba(129, 140, 248, 0.2);
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

        .command-snippet {
          background: rgba(0, 0, 0, 0.35);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 6px;
          padding: 4px 8px;
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

        .meta-subtle-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 10px;
          color: #72849a;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          padding: 2px 6px;
          border-radius: 4px;
          white-space: nowrap;
          flex-shrink: 0;
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
          max-width: 120px;
          overflow: hidden;
          text-overflow: ellipsis;
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

        .card-action-icon-btn.danger {
          color: #f87171;
          border-color: rgba(239, 68, 68, 0.2);
          background: rgba(239, 68, 68, 0.05);
        }

        .card-action-icon-btn.danger:hover:not(:disabled) {
          background: rgba(239, 68, 68, 0.18);
          color: #ffffff;
          border-color: rgba(239, 68, 68, 0.45);
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

        .mcp-view-container .card-primary-action-btn:hover:not(:disabled) {
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
          border-color: rgba(56, 189, 248, 0.95) !important;
          background: linear-gradient(135deg, rgba(56, 189, 248, 0.12), rgba(14, 165, 233, 0.04)) !important;
          box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.7), 0 0 32px rgba(56, 189, 248, 0.38) !important;
          animation: highlightMcpSoft 3.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          z-index: 10;
          position: relative;
        }

        @keyframes highlightMcpSoft {
          0% {
            transform: scale(1.025);
            border-color: rgba(56, 189, 248, 1);
            box-shadow: 0 0 0 2.5px rgba(56, 189, 248, 0.85), 0 0 40px rgba(56, 189, 248, 0.5);
          }
          15% {
            transform: scale(1);
            border-color: rgba(56, 189, 248, 0.95);
            box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.75), 0 0 32px rgba(56, 189, 248, 0.4);
          }
          65% {
            transform: scale(1);
            border-color: rgba(56, 189, 248, 0.8);
            box-shadow: 0 0 0 1.5px rgba(56, 189, 248, 0.55), 0 0 22px rgba(56, 189, 248, 0.25);
          }
          88% {
            transform: scale(1);
            border-color: rgba(56, 189, 248, 0.45);
            box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.2), 0 0 10px rgba(56, 189, 248, 0.1);
          }
          100% {
            transform: scale(1);
            border-color: #1e283d;
            background: #121826;
            box-shadow: none;
          }
        }
      `}</style>
    </div>
  );
};
