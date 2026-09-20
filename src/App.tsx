import React, { useState, useEffect, useMemo } from 'react';
import { TopBar } from './components/TopBar';
import { Sidebar, NavTab } from './components/Sidebar';
import { StatCards } from './components/StatCards';
import { QuickActionsBar } from './components/QuickActionsBar';
import { RecentlyInstalledPackages, InstalledPackage } from './components/RecentlyInstalledPackages';
import { RightPanel } from './components/RightPanel';
import { INITIAL_SUPPORTED_AGENTS } from './config/supportedAgents';
import { 
  SupportedAgent, 
  AgentCapabilitiesPayload 
} from './types/agent';
import { CatalogSkill, CatalogPlugin, CatalogMcpServer } from './types/catalog';
import { SKILLS_CATALOG } from './data/skillsCatalog';
import { PLUGINS_CATALOG } from './data/pluginsCatalog';
import { MCP_CATALOG } from './data/mcpCatalog';
import { loadCatalogData, AAS_MCP_SERVER } from './services/catalogSync';
import { AgentsManagerView } from './components/AgentsManagerView';
import { SkillsView } from './components/SkillsView';
import { McpServersView } from './components/McpServersView';
import { PluginsView } from './components/PluginsView';
import {
  Shield,
  Layers,
  Plus
} from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<NavTab>('overview');
  const [currentEnv, setCurrentEnv] = useState('Default');
  const [searchQuery, setSearchQuery] = useState('');
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

  // Dynamic cloud catalog state (synced with sickn33/agentic-awesome-skills)
  const [skillsCatalog, setSkillsCatalog] = useState<CatalogSkill[]>(SKILLS_CATALOG);
  const [pluginsCatalog, setPluginsCatalog] = useState<CatalogPlugin[]>(PLUGINS_CATALOG);
  const [mcpCatalog, setMcpCatalog] = useState<CatalogMcpServer[]>([
    AAS_MCP_SERVER,
    ...MCP_CATALOG.filter((m) => m.id !== 'aas-mcp'),
  ]);
  const [isSyncingCatalog, setIsSyncingCatalog] = useState(false);
  const [catalogSyncedAt, setCatalogSyncedAt] = useState<string | null>(null);

  // Manual & automated catalog sync handler
  const handleSyncCloudCatalog = async () => {
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
  };

  // Load cached or fresh cloud catalogs on startup
  useEffect(() => {
    const initCatalog = async () => {
      try {
        const res = await loadCatalogData(false);
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

  // Auto-clear transient card highlight after 1.4s
  useEffect(() => {
    if (highlightTarget) {
      const timer = setTimeout(() => {
        setHighlightTarget(null);
      }, 1400);
      return () => clearTimeout(timer);
    }
  }, [highlightTarget]);

  const handleSelectSearchResult = (tab: NavTab, itemId: string) => {
    setActiveTab(tab);
    setHighlightTarget({ tab, id: itemId });
  };

  const refreshCapabilities = async () => {
    // Ingest real agent capabilities (skills, MCP servers, plugins)
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

    // Re-detect agent counts
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
            };
          })
        );
      } catch (err) {
        console.warn('Failed to re-detect agents:', err);
      }
    }
  };

  // Auto-detect installed agents on host filesystem & restore persisted user choices
  useEffect(() => {
    const detectAndLoadAgents = async () => {
      let detectionMap: Record<string, { detected: boolean; installedCounts: { skills: number; mcps: number; rules: number } }> = {};

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

      // Check for user-saved selection in localStorage
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

          // If user previously saved choices, respect them.
          // Otherwise (first run), auto-select by default if detected!
          const isSelected = savedSelectedIds !== null
            ? savedSelectedIds.includes(agent.id)
            : isDetected;

          return {
            ...agent,
            detected: isDetected,
            selected: isSelected,
            installedCounts: counts,
          };
        });
      });

      // Ingest real agent capabilities
      await refreshCapabilities();
    };

    detectAndLoadAgents();
  }, []);

  const handleToggleAgent = (id: string) => {
    setAgents((prev) => {
      const updated = prev.map((agent) =>
        agent.id === id ? { ...agent, selected: !agent.selected } : agent
      );
      const selectedIds = updated.filter((a) => a.selected).map((a) => a.id);
      localStorage.setItem('agentforge_selected_agents', JSON.stringify(selectedIds));
      return updated;
    });
  };

  const handleSelectOnly = (id: string) => {
    setAgents((prev) => {
      const updated = prev.map((agent) => ({
        ...agent,
        selected: agent.id === id,
      }));
      const selectedIds = [id];
      localStorage.setItem('agentforge_selected_agents', JSON.stringify(selectedIds));
      return updated;
    });
  };

  const handleEnvChange = (newEnv: string) => {
    setCurrentEnv(newEnv);
  };

  // Derive selected agents and filter capabilities by user selection
  const selectedAgentIds = useMemo(() => agents.filter((a) => a.selected).map((a) => a.id), [agents]);
  const selectedAgents = useMemo(() => agents.filter((a) => a.selected), [agents]);

  const filteredSkills = useMemo(
    () => capabilities.skills.filter((s) => selectedAgentIds.includes(s.sourceAgentId)),
    [capabilities.skills, selectedAgentIds]
  );
  const filteredMcps = useMemo(
    () => capabilities.mcpServers.filter((m) => selectedAgentIds.includes(m.sourceAgentId)),
    [capabilities.mcpServers, selectedAgentIds]
  );
  const filteredPlugins = useMemo(
    () => capabilities.plugins.filter((p) => selectedAgentIds.includes(p.sourceAgentId)),
    [capabilities.plugins, selectedAgentIds]
  );

  const overviewPackages = useMemo<InstalledPackage[]>(() => {
    const list: InstalledPackage[] = [];
    filteredMcps.slice(0, 5).forEach((m) => {
      list.push({
        id: m.id,
        name: m.name,
        version: '1.0.0',
        type: 'MCP SERVER',
        source: 'COMMUNITY',
        installedDate: 'Installed',
        status: 'Active',
      });
    });
    filteredPlugins.slice(0, 5).forEach((p) => {
      list.push({
        id: p.id,
        name: p.name,
        version: p.version || '1.0.0',
        type: 'SKILL BUNDLE',
        source: 'OFFICIAL',
        installedDate: 'Installed',
        status: 'Active',
      });
    });
    return list;
  }, [filteredMcps, filteredPlugins]);

  return (
    <div className="app-container">
      {/* Top Bar with window controls, search & agent selector */}
      <TopBar
        agents={agents}
        onToggleAgent={handleToggleAgent}
        onSelectOnly={handleSelectOnly}
        currentEnv={currentEnv}
        onEnvChange={handleEnvChange}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        activeTab={activeTab}
        onNavigateTab={setActiveTab}
        capabilities={capabilities}
        onSelectSearchResult={handleSelectSearchResult}
      />

      <div className="app-body">
        {/* Left Navigation Sidebar with dynamic capability counts */}
        <Sidebar 
          activeTab={activeTab} 
          onTabChange={setActiveTab}
          badgeCounts={{
            agents: selectedAgents.length,
            mcp: filteredMcps.length,
            skills: filteredSkills.length,
            plugins: filteredPlugins.length,
          }}
        />

        {/* Center Main Content Area with Keep-Alive for Visited Tabs */}
        <main className="main-content">
          {visitedTabs.has('overview') && (
            <div
              className={`tab-pane-container ${activeTab === 'overview' ? 'active tab-pane-animated' : ''}`}
              style={{ display: activeTab === 'overview' ? 'block' : 'none' }}
            >
              <div className="overview-view">
                {/* 4 Metric Cards showing live dynamic counts */}
                <StatCards 
                  stats={{
                    agentsCount: selectedAgents.length,
                    mcpCount: filteredMcps.length,
                    skillsCount: filteredSkills.length,
                    rulesCount: 0,
                  }}
                />

                {/* Quick Actions Launchpad */}
                <QuickActionsBar onNavigate={setActiveTab} />

                {/* Installed Packages Table */}
                <RecentlyInstalledPackages
                  packages={overviewPackages}
                  searchQuery={searchQuery}
                  onNavigate={setActiveTab}
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
                agents={agents}
                onToggleAgent={handleToggleAgent}
                onSelectOnly={handleSelectOnly}
                searchQuery={searchQuery}
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
                mcpServers={filteredMcps}
                selectedAgents={selectedAgents}
                mcpCatalog={mcpCatalog}
                catalogSyncedAt={catalogSyncedAt}
                onRefreshCapabilities={refreshCapabilities}
                searchQuery={searchQuery}
                highlightedId={highlightTarget?.tab === 'mcp' ? highlightTarget.id : null}
              />
            </div>
          )}

          {visitedTabs.has('skills') && (
            <div
              className={`tab-pane-container ${activeTab === 'skills' ? 'active tab-pane-animated' : ''}`}
              style={{ display: activeTab === 'skills' ? 'block' : 'none' }}
            >
              <SkillsView
                skills={filteredSkills}
                selectedAgents={selectedAgents}
                allAgents={agents}
                skillsCatalog={skillsCatalog}
                isSyncingCatalog={isSyncingCatalog}
                onSyncCatalog={handleSyncCloudCatalog}
                catalogSyncedAt={catalogSyncedAt}
                onRefreshCapabilities={refreshCapabilities}
                searchQuery={searchQuery}
                highlightedId={highlightTarget?.tab === 'skills' ? highlightTarget.id : null}
              />
            </div>
          )}

          {visitedTabs.has('plugins') && (
            <div
              className={`tab-pane-container ${activeTab === 'plugins' ? 'active tab-pane-animated' : ''}`}
              style={{ display: activeTab === 'plugins' ? 'block' : 'none' }}
            >
              <PluginsView
                plugins={filteredPlugins}
                selectedAgents={selectedAgents}
                pluginsCatalog={pluginsCatalog}
                skillsCatalog={skillsCatalog}
                isSyncingCatalog={isSyncingCatalog}
                onSyncCatalog={handleSyncCloudCatalog}
                catalogSyncedAt={catalogSyncedAt}
                onRefreshCapabilities={refreshCapabilities}
                searchQuery={searchQuery}
                highlightedId={highlightTarget?.tab === 'plugins' ? highlightTarget.id : null}
              />
            </div>
          )}

          {visitedTabs.has('rules') && (
            <div
              className={`tab-pane-container ${activeTab === 'rules' ? 'active tab-pane-animated' : ''}`}
              style={{ display: activeTab === 'rules' ? 'block' : 'none' }}
            >
              <div className="secondary-view">
                <div className="view-header">
                  <div>
                    <h2 className="view-title">Active Rules</h2>
                    <p className="view-desc">0 active workspace directives and guidelines</p>
                  </div>
                  <button className="primary-action-btn">
                    <Plus size={14} />
                    <span>Add Rule</span>
                  </button>
                </div>

                <div className="empty-state-card">
                  <div className="empty-icon-wrap">
                    <Shield size={26} />
                  </div>
                  <div className="empty-title">No rules configured</div>
                  <div className="empty-desc">Define guidelines, style constraints, and behavioral boundaries for agents</div>
                  <button className="empty-action-btn">
                    <Plus size={13} />
                    <span>Add Rule</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {['hooks', 'environments', 'snapshots', 'marketplace', 'security', 'settings'].includes(activeTab) && (
            <div className="tab-pane-container active tab-pane-animated">
              <div className="secondary-view placeholder-tab">
                <div className="placeholder-box">
                  <div className="placeholder-icon-wrap">
                    <Layers size={28} />
                  </div>
                  <h3>{activeTab.toUpperCase()}</h3>
                  <p>Configured for current environment: <strong className="font-mono">{currentEnv}</strong></p>
                  <button className="primary-action-btn" onClick={() => setActiveTab('overview')}>
                    Return to Dashboard Overview
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* Right Activity & Updates Panel */}
        <RightPanel />
      </div>

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
        }

        .main-content {
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 20px 24px 30px;
          background: #090d16;
        }

        .tab-pane-container {
          width: 100%;
        }

        .tab-pane-animated {
          animation: tabShiftIn 0.16s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          will-change: opacity, transform;
        }

        @keyframes tabShiftIn {
          0% {
            opacity: 0;
            transform: translate3d(8px, 0, 0);
          }
          100% {
            opacity: 1;
            transform: translate3d(0, 0, 0);
          }
        }

        .overview-view {
          display: flex;
          flex-direction: column;
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
