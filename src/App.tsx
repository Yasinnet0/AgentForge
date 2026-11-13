import React, { useState, useEffect, useMemo, useCallback, useRef, useTransition, useDeferredValue } from 'react';
import { ArrowUp } from 'lucide-react';
import { TopBar } from './components/TopBar';
import { Sidebar, NavTab } from './components/Sidebar';
import { StatCards } from './components/StatCards';
import { QuickActionsBar } from './components/QuickActionsBar';
import { RecentlyInstalledPackages, InstalledPackage } from './components/RecentlyInstalledPackages';
import { INITIAL_SUPPORTED_AGENTS } from './config/supportedAgents';
import { 
  SupportedAgent, 
  AgentCapabilitiesPayload 
} from './types/agent';
import { CatalogSkill, CatalogPlugin, CatalogMcpServer } from './types/catalog';
import { DependencyReport } from './types/dependencies';
import { SKILLS_CATALOG } from './data/skillsCatalog';
import { PLUGINS_CATALOG } from './data/pluginsCatalog';
import { MCP_CATALOG } from './data/mcpCatalog';
import { loadCatalogData, AAS_MCP_SERVER } from './services/catalogSync';
import { AgentsManagerView } from './components/AgentsManagerView';
import { SkillsView } from './components/SkillsView';
import { McpServersView } from './components/McpServersView';
import { PluginsView } from './components/PluginsView';
import { RulesBuilderView } from './components/RulesBuilderView';
import { ComingSoonView } from './components/ComingSoonView';
import { SecurityView } from './components/SecurityView';
import { SettingsModal } from './components/SettingsModal';
import { Tooltip } from './components/Tooltip';

export const App: React.FC = () => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [activeTab, setActiveTab] = useState<NavTab>(() => {
    try {
      const remember = localStorage.getItem('agentforge_remember_last_tab') === 'true';
      if (remember) {
        const last = localStorage.getItem('agentforge_last_active_tab') as NavTab;
        if (last && last !== 'settings') return last;
      }
      const def = localStorage.getItem('agentforge_default_tab') as NavTab;
      if (def && def !== 'settings') return def;
    } catch {}
    return 'overview';
  });

  const handleNavigateTab = useCallback((tab: NavTab) => {
    if (tab === 'settings') {
      setIsSettingsOpen(true);
    } else {
      setActiveTab(tab);
    }
  }, []);

  // Global Keyboard Shortcut: Ctrl+, or Cmd+, to toggle Settings Modal
  useEffect(() => {
    const handleGlobalShortcuts = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        setIsSettingsOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalShortcuts);
    return () => window.removeEventListener('keydown', handleGlobalShortcuts);
  }, []);

  useEffect(() => {
    try {
      if (activeTab !== 'settings') {
        localStorage.setItem('agentforge_last_active_tab', activeTab);
      }
    } catch {}
  }, [activeTab]);
  const [currentEnv, setCurrentEnv] = useState('Default');
  const [searchQuery, setSearchQuery] = useState('');
  const [, startSearchTransition] = useTransition();

  const handleSearchChange = useCallback((query: string) => {
    startSearchTransition(() => {
      setSearchQuery(query);
    });
  }, [startSearchTransition]);
  const [highlightTarget, setHighlightTarget] = useState<{ tab: NavTab; id: string } | null>(null);
  const [agents, setAgents] = useState<SupportedAgent[]>(INITIAL_SUPPORTED_AGENTS);
  const [visitedTabs, setVisitedTabs] = useState<Set<NavTab>>(() => new Set([activeTab]));

  useEffect(() => {
    setVisitedTabs((prev) => {
      if (prev.has(activeTab)) return prev;
      const next = new Set(prev);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);
  const [capabilities, setCapabilities] = useState<AgentCapabilitiesPayload>({
    skills: [],
    mcpServers: [],
    plugins: [],
  });

  // Cloud Catalog Sync
  const [skillsCatalog, setSkillsCatalog] = useState<CatalogSkill[]>(SKILLS_CATALOG);
  const [pluginsCatalog, setPluginsCatalog] = useState<CatalogPlugin[]>(PLUGINS_CATALOG);
  const [mcpCatalog, setMcpCatalog] = useState<CatalogMcpServer[]>([
    AAS_MCP_SERVER,
    ...MCP_CATALOG.filter((m) => m.id !== 'aas-mcp'),
  ]);
  const [isSyncingCatalog, setIsSyncingCatalog] = useState(false);
  const [catalogSyncedAt, setCatalogSyncedAt] = useState<string | null>(null);
  const [activeAgentFilter, setActiveAgentFilter] = useState<string[]>([]);
  const [dependencyReport, setDependencyReport] = useState<DependencyReport | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('agentforge_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const mainContentRef = useRef<HTMLElement>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  const handleMainScroll = useCallback((e: React.UIEvent<HTMLElement>) => {
    setShowScrollTop(e.currentTarget.scrollTop > 240);
  }, []);

  const handleScrollToTop = useCallback(() => {
    if (mainContentRef.current) {
      mainContentRef.current.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    }
  }, []);

  const handleToggleSidebarCollapse = useCallback(() => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('agentforge_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      const isB = e.key?.toLowerCase() === 'b' || e.code === 'KeyB';
      const isBackslash = e.key === '\\' || e.code === 'Backslash';

      if (isCtrlOrCmd && (isB || isBackslash)) {
        const target = e.target as HTMLElement | null;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        handleToggleSidebarCollapse();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [handleToggleSidebarCollapse]);

  const refreshDependencies = useCallback(async (): Promise<void> => {
    if (window.electronAPI?.checkDependencies) {
      try {
        const rep = await window.electronAPI.checkDependencies();
        setDependencyReport(rep);
      } catch (err) {
        console.warn('Failed to check dependencies:', err);
      }
    }
  }, []);

  useEffect(() => {
    refreshDependencies();
  }, [refreshDependencies]);

  const handleSyncCloudCatalog = useCallback(async () => {
    setIsSyncingCatalog(true);
    try {
      const res = await loadCatalogData(true);
      setSkillsCatalog(res.skills);
      setPluginsCatalog(res.plugins);
      setMcpCatalog(res.mcpServers);
      if (res.syncedAt) {
        setCatalogSyncedAt(res.syncedAt);
      }
    } catch (err) {
      console.warn('Failed to sync cloud catalog:', err);
    } finally {
      setIsSyncingCatalog(false);
    }
  }, []);

  // Lifecycle
  useEffect(() => {
    const initCatalog = async () => {
      try {
        const autoSync = localStorage.getItem('agentforge_auto_sync_startup') !== 'false';
        const res = await loadCatalogData(autoSync);
        setSkillsCatalog(res.skills);
        setPluginsCatalog(res.plugins);
        setMcpCatalog(res.mcpServers);
        if (res.syncedAt) {
          setCatalogSyncedAt(res.syncedAt);
        }
      } catch (err) {
        console.warn('Initial catalog load failed:', err);
      }
    };
    initCatalog();
  }, []);

  useEffect(() => {
    if (highlightTarget) {
      const timer = setTimeout(() => {
        setHighlightTarget(null);
      }, 2900);
      return () => clearTimeout(timer);
    }
  }, [highlightTarget]);

  const handleSelectSearchResult = useCallback((tab: NavTab, itemId: string) => {
    setSearchQuery('');
    setActiveTab(tab);
    setHighlightTarget({ tab, id: itemId });
  }, []);

  const handleNavigateFromOverview = useCallback((tab: NavTab, itemId?: string) => {
    setActiveTab(tab);
    if (itemId) {
      setHighlightTarget({ tab, id: itemId });
    }
  }, []);

  // Capability Scanning
  const refreshCapabilities = useCallback(async () => {
    if (window.electronAPI?.scanCapabilities) {
      try {
        const scanPayloads = INITIAL_SUPPORTED_AGENTS.map((a) => ({
          id: a.id,
          name: a.name,
          color: a.color,
          iconName: a.iconName,
          baseDir: a.paths.baseDir,
          skillsDir: a.paths.skillsDir,
          mcpConfigPath: a.paths.mcpConfigPath,
          rulesPath: a.paths.rulesPath,
          pluginsDir: a.paths.pluginsDir,
        }));
        const scanned = await window.electronAPI.scanCapabilities(scanPayloads);
        setCapabilities(scanned);
      } catch (err) {
        console.warn('Failed to scan capabilities via electronAPI:', err);
      }
    }

    if (window.electronAPI?.detectAgents) {
      try {
        const payloads = INITIAL_SUPPORTED_AGENTS.map((a) => ({
          id: a.id,
          baseDir: a.paths.baseDir,
          skillsDir: a.paths.skillsDir,
          mcpConfigPath: a.paths.mcpConfigPath,
          rulesPath: a.paths.rulesPath,
          pluginsDir: a.paths.pluginsDir,
        }));
        const detectionMap = await window.electronAPI.detectAgents(payloads);
        setAgents((prev) =>
          prev.map((agent) => {
            const info = detectionMap[agent.id];
            if (!info) return agent;
            return {
              ...agent,
              detected: info.detected,
              installedCounts: info.installedCounts,
              paths: info.resolvedPaths
                ? {
                    baseDir: info.resolvedPaths.baseDir || agent.paths.baseDir,
                    skillsDir: info.resolvedPaths.skillsDir || agent.paths.skillsDir,
                    mcpConfigPath: info.resolvedPaths.mcpConfigPath || agent.paths.mcpConfigPath,
                    rulesPath: info.resolvedPaths.rulesPath || agent.paths.rulesPath,
                    pluginsDir: info.resolvedPaths.pluginsDir || agent.paths.pluginsDir,
                  }
                : agent.paths,
            };
          })
        );
      } catch (err) {
        console.warn('Failed to re-detect agents:', err);
      }
    }
  }, []);

  // Window Focus: Rescan capabilities when window regains focus if enabled
  useEffect(() => {
    const handleFocus = () => {
      try {
        const enabled = localStorage.getItem('agentforge_auto_rescan_focus');
        if (enabled !== 'false') {
          refreshCapabilities();
        }
      } catch {}
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [refreshCapabilities]);

  useEffect(() => {
    const detectAndLoadAgents = async () => {
      let detectionMap: Record<string, { detected: boolean; installedCounts: { skills: number; mcps: number; rules: number }; resolvedPaths?: any }> = {};

      if (window.electronAPI?.detectAgents) {
        try {
          const payloads = INITIAL_SUPPORTED_AGENTS.map((a) => ({
            id: a.id,
            baseDir: a.paths.baseDir,
            skillsDir: a.paths.skillsDir,
            mcpConfigPath: a.paths.mcpConfigPath,
            rulesPath: a.paths.rulesPath,
            pluginsDir: a.paths.pluginsDir,
          }));
          detectionMap = await window.electronAPI.detectAgents(payloads);
        } catch (err) {
          console.warn('Failed to auto-detect agents via electronAPI:', err);
        }
      }

      let savedSelectedIds: string[] | null = null;
      try {
        const raw = localStorage.getItem('agentforge_selected_agents');
        if (raw) {
          savedSelectedIds = JSON.parse(raw);
        }
      } catch (err) {
        console.warn('Failed to parse saved agent selection:', err);
      }

      setAgents((prev) => {
        return prev.map((agent) => {
          const info = detectionMap[agent.id];
          const isDetected = info ? info.detected : agent.detected;
          const counts = info ? info.installedCounts : agent.installedCounts;
          const isSelected = savedSelectedIds !== null
            ? savedSelectedIds.includes(agent.id)
            : isDetected;

          return {
            ...agent,
            detected: isDetected,
            selected: isSelected,
            installedCounts: counts,
            paths: info?.resolvedPaths
              ? {
                  baseDir: info.resolvedPaths.baseDir || agent.paths.baseDir,
                  skillsDir: info.resolvedPaths.skillsDir || agent.paths.skillsDir,
                  mcpConfigPath: info.resolvedPaths.mcpConfigPath || agent.paths.mcpConfigPath,
                  rulesPath: info.resolvedPaths.rulesPath || agent.paths.rulesPath,
                  pluginsDir: info.resolvedPaths.pluginsDir || agent.paths.pluginsDir,
                }
              : agent.paths,
          };
        });
      });

      await refreshCapabilities();
    };

    detectAndLoadAgents();
  }, []);

  const [, startAgentTransition] = useTransition();

  const handleToggleAgent = useCallback((id: string) => {
    startAgentTransition(() => {
      setAgents((prev) => {
        const updated = prev.map((agent) =>
          agent.id === id ? { ...agent, selected: !agent.selected } : agent
        );
        const selectedIds = updated.filter((a) => a.selected).map((a) => a.id);
        try {
          localStorage.setItem('agentforge_selected_agents', JSON.stringify(selectedIds));
        } catch {}
        return updated;
      });
    });
  }, [startAgentTransition]);

  const handleSelectOnly = useCallback((id: string) => {
    startAgentTransition(() => {
      setAgents((prev) => {
        const updated = prev.map((agent) => ({
          ...agent,
          selected: agent.id === id,
        }));
        const selectedIds = [id];
        try {
          localStorage.setItem('agentforge_selected_agents', JSON.stringify(selectedIds));
        } catch {}
        return updated;
      });
    });
  }, [startAgentTransition]);

  const handleSelectAllAgents = useCallback((select: boolean) => {
    startAgentTransition(() => {
      setAgents((prev) => {
        const updated = prev.map((agent) => ({
          ...agent,
          selected: select,
        }));
        const selectedIds = updated.filter((a) => a.selected).map((a) => a.id);
        try {
          localStorage.setItem('agentforge_selected_agents', JSON.stringify(selectedIds));
        } catch {}
        return updated;
      });
    });
  }, [startAgentTransition]);

  const handleEnvChange = useCallback((newEnv: string) => {
    setCurrentEnv(newEnv);
  }, []);

  const handleOpenSettings = useCallback(() => {
    setIsSettingsOpen(true);
  }, []);

  // Selection filtering
  const selectedAgentIds = useMemo(() => agents.filter((a) => a.selected).map((a) => a.id), [agents]);
  const selectedAgents = useMemo(() => agents.filter((a) => a.selected), [agents]);

  // Reference-stable allAgents that does not trigger re-renders on selection toggle
  const stableAllAgents = useMemo(() => {
    return agents;
  }, [agents.map((a) => `${a.id}:${a.detected}:${a.paths.baseDir}`).join('|')]);

  // Automatically remove any filtered agents that get deselected
  useEffect(() => {
    const selectedIds = new Set(selectedAgents.map((a) => a.id));
    setActiveAgentFilter((prev) => {
      if (prev.length === 0) return prev;
      if (!prev.some((id) => !selectedIds.has(id))) return prev;
      return prev.filter((id) => selectedIds.has(id));
    });
  }, [selectedAgents]);

  // Defer heavy filtering so topbar dropdown click never lags
  const deferredSelectedAgentIds = useDeferredValue(selectedAgentIds);
  const deferredSelectedAgents = useDeferredValue(selectedAgents);

  const filteredSkills = useMemo(
    () => capabilities.skills.filter((s) => deferredSelectedAgentIds.includes(s.sourceAgentId)),
    [capabilities.skills, deferredSelectedAgentIds]
  );
  const filteredMcps = useMemo(
    () => capabilities.mcpServers.filter((m) => deferredSelectedAgentIds.includes(m.sourceAgentId)),
    [capabilities.mcpServers, deferredSelectedAgentIds]
  );
  const filteredPlugins = useMemo(
    () => capabilities.plugins.filter((p) => deferredSelectedAgentIds.includes(p.sourceAgentId)),
    [capabilities.plugins, deferredSelectedAgentIds]
  );

  const sidebarBadgeCounts = useMemo(() => ({
    agents: selectedAgents.length,
    mcp: filteredMcps.length,
    skills: filteredSkills.length,
    plugins: filteredPlugins.length,
  }), [selectedAgents.length, filteredMcps.length, filteredSkills.length, filteredPlugins.length]);

  const overviewStats = useMemo(() => ({
    agentsCount: selectedAgents.length,
    mcpCount: filteredMcps.length,
    skillsCount: filteredSkills.length,
    rulesCount: 0,
  }), [selectedAgents.length, filteredMcps.length, filteredSkills.length]);

  const overviewPackages = useMemo<InstalledPackage[]>(() => {
    if (activeTab !== 'overview' || !visitedTabs.has('overview')) {
      return [];
    }
    const list: InstalledPackage[] = [];

    const formatRelativeTime = (time?: number) => {
      if (!time || time <= 0) return 'Installed';
      const diff = Date.now() - time;
      if (diff < 0) return 'Installed';
      const mins = Math.floor(diff / 60000);
      const hours = Math.floor(diff / 3600000);
      const days = Math.floor(diff / 86400000);
      if (mins < 5) return 'Just now';
      if (mins < 60) return `${mins}m ago`;
      if (hours < 24) return `${hours}h ago`;
      if (days < 7) return `${days}d ago`;
      return new Date(time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    };

    filteredMcps.forEach((m) => {
      list.push({
        id: `mcp-${m.id}`,
        name: m.name,
        version: '1.0.0',
        type: 'MCP SERVER',
        source: m.pluginName ? 'OFFICIAL' : 'COMMUNITY',
        installedDate: formatRelativeTime(m.mtimeMs),
        status: 'Active',
        rawType: 'mcp',
        sourcePath: m.sourcePath,
        sourceAgentId: m.sourceAgentId,
        sourceAgentName: m.sourceAgentName,
        sourceAgentColor: m.sourceAgentColor,
        sourceAgentIcon: m.sourceAgentIcon,
        folderName: m.name,
        description: m.command
          ? `Command: ${m.command} ${(m.args || []).join(' ')}`
          : m.url
          ? `URL: ${m.url}`
          : 'Model Context Protocol server configuration',
        command: m.command,
        args: m.args,
        transport: m.transport,
        url: m.url,
        mtimeMs: m.mtimeMs,
      });
    });

    filteredPlugins.forEach((p) => {
      list.push({
        id: `plugin-${p.id}`,
        name: p.name,
        version: p.version || '1.0.0',
        type: 'PLUGIN',
        source: 'OFFICIAL',
        installedDate: formatRelativeTime(p.mtimeMs),
        status: 'Active',
        rawType: 'plugin',
        sourcePath: p.sourcePath,
        sourceAgentId: p.sourceAgentId,
        sourceAgentName: p.sourceAgentName,
        sourceAgentColor: p.sourceAgentColor,
        sourceAgentIcon: p.sourceAgentIcon,
        folderName: p.folderName || p.id,
        description: p.description || 'Pre-configured capability kit containing bundled skills and tools',
        author: p.author,
        skillsCount: p.skillsCount,
        mcpsCount: p.mcpsCount,
        mtimeMs: p.mtimeMs,
      });
    });

    filteredSkills.forEach((s) => {
      list.push({
        id: `skill-${s.id}`,
        name: s.name,
        version: '1.0.0',
        type: 'SKILL',
        source: 'LOCAL',
        installedDate: formatRelativeTime(s.mtimeMs),
        status: 'Active',
        rawType: 'skill',
        sourcePath: s.sourcePath,
        sourceAgentId: s.sourceAgentId,
        sourceAgentName: s.sourceAgentName,
        sourceAgentColor: s.sourceAgentColor,
        sourceAgentIcon: s.sourceAgentIcon,
        folderName: s.folderName || s.name,
        description: s.description || 'Specialized agent instructions and workflows',
        hasScripts: s.hasScripts,
        hasReferences: s.hasReferences,
        mtimeMs: s.mtimeMs,
      });
    });

    list.sort((a, b) => (b.mtimeMs || 0) - (a.mtimeMs || 0));
    return list;
  }, [filteredMcps, filteredPlugins, filteredSkills, activeTab]);

  return (
    <div className="app-container">
      {/* Top Bar */}
      <TopBar
        agents={agents}
        onToggleAgent={handleToggleAgent}
        onSelectOnly={handleSelectOnly}
        currentEnv={currentEnv}
        onEnvChange={handleEnvChange}
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        activeTab={activeTab}
        onNavigateTab={handleNavigateTab}
        capabilities={capabilities}
        skillsCatalog={skillsCatalog}
        mcpCatalog={mcpCatalog}
        pluginsCatalog={pluginsCatalog}
        onSelectSearchResult={handleSelectSearchResult}
      />

      <div className="app-body">
        {/* Sidebar */}
        <Sidebar 
          activeTab={activeTab} 
          onTabChange={handleNavigateTab}
          isSettingsOpen={isSettingsOpen}
          onOpenSettings={handleOpenSettings}
          badgeCounts={sidebarBadgeCounts}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={handleToggleSidebarCollapse}
        />

        {/* Main Content */}
        <main ref={mainContentRef} className="main-content" onScroll={handleMainScroll}>
          {visitedTabs.has('overview') && (
            <div
              className={`tab-pane-container ${activeTab === 'overview' ? 'active tab-pane-animated' : ''}`}
              style={{ display: activeTab === 'overview' ? 'block' : 'none' }}
            >
              <div className="overview-view">
                {/* Metric Cards */}
                <StatCards 
                  stats={overviewStats}
                />

                {/* Quick Actions */}
                <QuickActionsBar onNavigate={handleNavigateTab} />

                {/* Installed Packages */}
                <RecentlyInstalledPackages
                  packages={overviewPackages}
                  searchQuery={activeTab === 'overview' ? searchQuery : ''}
                  onNavigate={handleNavigateFromOverview}
                  agents={stableAllAgents}
                  onRefreshCapabilities={refreshCapabilities}
                />
              </div>
            </div>
          )}

          {visitedTabs.has('agents') && (
            <div
              className={`tab-pane-container ${activeTab === 'agents' ? 'active tab-pane-animated' : ''}`}
              style={{ display: activeTab === 'agents' ? 'block' : 'none' }}
            >
              <AgentsManagerView
                isActive={activeTab === 'agents'}
                agents={agents}
                onToggleAgent={handleToggleAgent}
                onSelectOnly={handleSelectOnly}
                onSelectAll={handleSelectAllAgents}
                searchQuery={activeTab === 'agents' ? searchQuery : ''}
                highlightedId={highlightTarget?.tab === 'agents' ? highlightTarget.id : null}
              />
            </div>
          )}

          {visitedTabs.has('mcp') && (
            <div
              className={`tab-pane-container ${activeTab === 'mcp' ? 'active tab-pane-animated' : ''}`}
              style={{ display: activeTab === 'mcp' ? 'block' : 'none' }}
            >
              <McpServersView
                isActive={activeTab === 'mcp'}
                mcpServers={filteredMcps}
                selectedAgents={deferredSelectedAgents}
                allAgents={stableAllAgents}
                mcpCatalog={mcpCatalog}
                catalogSyncedAt={catalogSyncedAt}
                onRefreshCapabilities={refreshCapabilities}
                searchQuery={activeTab === 'mcp' ? searchQuery : ''}
                highlightedId={highlightTarget?.tab === 'mcp' ? highlightTarget.id : null}
                activeAgentFilter={activeAgentFilter}
                onAgentFilterChange={setActiveAgentFilter}
                isSyncingCatalog={isSyncingCatalog}
                onSyncCatalog={handleSyncCloudCatalog}
                dependencyReport={dependencyReport}
                onRefreshDependencies={refreshDependencies}
              />
            </div>
          )}

          {visitedTabs.has('skills') && (
            <div
              className={`tab-pane-container ${activeTab === 'skills' ? 'active tab-pane-animated' : ''}`}
              style={{ display: activeTab === 'skills' ? 'block' : 'none' }}
            >
              <SkillsView
                isActive={activeTab === 'skills'}
                skills={filteredSkills}
                selectedAgents={deferredSelectedAgents}
                allAgents={stableAllAgents}
                skillsCatalog={skillsCatalog}
                isSyncingCatalog={isSyncingCatalog}
                onSyncCatalog={handleSyncCloudCatalog}
                catalogSyncedAt={catalogSyncedAt}
                onRefreshCapabilities={refreshCapabilities}
                searchQuery={activeTab === 'skills' ? searchQuery : ''}
                highlightedId={highlightTarget?.tab === 'skills' ? highlightTarget.id : null}
                activeAgentFilter={activeAgentFilter}
                onAgentFilterChange={setActiveAgentFilter}
                dependencyReport={dependencyReport}
                onRefreshDependencies={refreshDependencies}
              />
            </div>
          )}

          {visitedTabs.has('plugins') && (
            <div
              className={`tab-pane-container ${activeTab === 'plugins' ? 'active tab-pane-animated' : ''}`}
              style={{ display: activeTab === 'plugins' ? 'block' : 'none' }}
            >
              <PluginsView
                isActive={activeTab === 'plugins'}
                plugins={filteredPlugins}
                selectedAgents={deferredSelectedAgents}
                allAgents={stableAllAgents}
                skills={filteredSkills}
                mcpServers={filteredMcps}
                pluginsCatalog={pluginsCatalog}
                skillsCatalog={skillsCatalog}
                isSyncingCatalog={isSyncingCatalog}
                onSyncCatalog={handleSyncCloudCatalog}
                catalogSyncedAt={catalogSyncedAt}
                onRefreshCapabilities={refreshCapabilities}
                searchQuery={activeTab === 'plugins' ? searchQuery : ''}
                highlightedId={highlightTarget?.tab === 'plugins' ? highlightTarget.id : null}
                activeAgentFilter={activeAgentFilter}
                onAgentFilterChange={setActiveAgentFilter}
                dependencyReport={dependencyReport}
                onRefreshDependencies={refreshDependencies}
              />
            </div>
          )}

          {visitedTabs.has('rules') && (
            <div
              className={`tab-pane-container ${activeTab === 'rules' ? 'active tab-pane-animated' : ''}`}
              style={{ display: activeTab === 'rules' ? 'block' : 'none' }}
            >
              <RulesBuilderView
                selectedAgents={selectedAgents}
                allAgents={agents}
                searchQuery={activeTab === 'rules' ? searchQuery : ''}
                onRefreshCapabilities={refreshCapabilities}
              />
            </div>
          )}

          {visitedTabs.has('security') && (
            <div
              className={`tab-pane-container ${activeTab === 'security' ? 'active tab-pane-animated' : ''}`}
              style={{ display: activeTab === 'security' ? 'block' : 'none' }}
            >
              <SecurityView onNavigate={handleNavigateTab} />
            </div>
          )}

          {['updates', 'hooks', 'environments'].includes(activeTab) && (
            <div className="tab-pane-container active tab-pane-animated">
              <ComingSoonView tab={activeTab} onNavigate={handleNavigateTab} />
            </div>
          )}
        </main>

        {/* Scroll-to-Top Upward Floating Action */}
        <div className={`scroll-to-top-container ${showScrollTop ? 'visible' : ''}`}>
          <Tooltip content="Scroll to top" position="left">
            <button
              type="button"
              className="scroll-to-top-btn"
              onClick={handleScrollToTop}
              aria-label="Scroll to top"
            >
              <ArrowUp size={16} />
            </button>
          </Tooltip>
        </div>

      </div>

      {/* Global Desktop Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onNavigateTab={handleNavigateTab}
        onRefreshCapabilities={refreshCapabilities}
        onSyncCatalog={handleSyncCloudCatalog}
        isSyncingCatalog={isSyncingCatalog}
        catalogSyncedAt={catalogSyncedAt}
        agents={agents}
      />

      <style>{`
        .app-container {
          display: flex;
          flex-direction: column;
          height: 100vh;
          width: 100vw;
          background: var(--bg-app);
          overflow: hidden;
        }

        .app-body {
          display: flex;
          flex: 1;
          height: calc(100vh - 48px);
          overflow: hidden;
          position: relative;
        }

        .scroll-to-top-container {
          position: absolute;
          right: 28px;
          bottom: 26px;
          z-index: 50;
          opacity: 0;
          transform: translateY(12px) scale(0.92);
          pointer-events: none;
          transition: opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1), transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .scroll-to-top-container.visible {
          opacity: 1;
          transform: translateY(0) scale(1);
          pointer-events: auto;
        }

        .scroll-to-top-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 38px;
          height: 38px;
          border-radius: 8px;
          background: rgba(13, 20, 36, 0.94);
          backdrop-filter: blur(14px);
          border: 1px solid rgba(56, 189, 248, 0.3);
          color: #38bdf8;
          cursor: pointer;
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5), 0 0 14px rgba(56, 189, 248, 0.12);
          transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .scroll-to-top-btn:hover {
          background: rgba(20, 32, 56, 0.98);
          border-color: rgba(56, 189, 248, 0.65);
          color: #7dd3fc;
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6), 0 0 18px rgba(56, 189, 248, 0.25);
        }

        .scroll-to-top-btn:active {
          transform: translateY(0);
        }

        .main-content {
          flex: 1;
          min-width: 0;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 20px 24px 30px;
          background: #090d16;
          box-sizing: border-box;
        }

        .tab-pane-container {
          width: 100%;
          min-width: 0;
          box-sizing: border-box;
        }

        .tab-pane-animated {
          animation: tabShiftIn 0.14s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        @keyframes tabShiftIn {
          0% {
            opacity: 0.9;
            transform: translate3d(4px, 0, 0);
          }
          100% {
            opacity: 1;
            transform: translate3d(0, 0, 0);
          }
        }

        .overview-view {
          display: flex;
          flex-direction: column;
          width: 100%;
          min-width: 0;
          box-sizing: border-box;
        }

        .secondary-view {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .view-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid #1c2638;
          padding-bottom: 14px;
        }

        .view-title {
          font-size: 18px;
          font-weight: 700;
          color: #f8fafc;
        }

        .view-desc {
          font-size: 12.5px;
          color: #8899ac;
          margin-top: 2px;
        }

        .empty-state-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 64px 24px;
          background: #111726;
          border: 1px dashed #1f2c42;
          border-radius: 12px;
          gap: 12px;
          margin-top: 10px;
        }

        .empty-icon-wrap {
          width: 52px;
          height: 52px;
          border-radius: 12px;
          background: #162035;
          border: 1px solid #223250;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #7d90a6;
          margin-bottom: 4px;
        }

        .empty-title {
          font-size: 15px;
          font-weight: 700;
          color: #f1f5f9;
        }

        .empty-desc {
          font-size: 12.5px;
          color: #7d90a6;
          max-width: 360px;
          line-height: 1.45;
        }

        .empty-action-btn {
          margin-top: 6px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #172033;
          border: 1px solid #283650;
          color: #93c5fd;
          font-size: 12px;
          font-weight: 600;
          padding: 6px 14px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .empty-action-btn:hover {
          background: #1e2c47;
          border-color: #3b5077;
          color: #ffffff;
        }

        .placeholder-tab {
          min-height: 400px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .placeholder-box {
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          max-width: 360px;
        }

        .placeholder-icon-wrap {
          width: 56px;
          height: 56px;
          border-radius: 14px;
          background: #141b2b;
          border: 1px solid #23304a;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #818cf8;
        }

        .placeholder-box h3 {
          font-size: 16px;
          font-weight: 700;
          color: #f8fafc;
          letter-spacing: 0.02em;
        }

        .placeholder-box p {
          font-size: 13px;
          color: #8899ac;
        }
      `}</style>
    </div>
  );
};
