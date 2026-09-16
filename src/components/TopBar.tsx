import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  Bell,
  Minus,
  Square,
  X,
  Command,
  Bot,
  Server,
  Sparkles,
  Boxes,
  CornerDownLeft
} from 'lucide-react';
import { 
  SupportedAgent, 
  AgentCapabilitiesPayload,
  ScannedSkill,
  ScannedMcpServer,
  ScannedPlugin 
} from '../types/agent';
import { AgentSelectorDropdown } from './AgentSelectorDropdown';
import { NavTab } from './Sidebar';

interface TopBarProps {
  currentEnv?: string;
  onEnvChange?: (env: string) => void;
  agents: SupportedAgent[];
  onToggleAgent: (id: string) => void;
  onSelectOnly: (id: string) => void;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  activeTab?: NavTab;
  onNavigateTab?: (tab: NavTab) => void;
  capabilities?: AgentCapabilitiesPayload;
  onSelectSearchResult?: (tab: NavTab, itemId: string) => void;
}

interface SearchResultItem {
  id: string;
  rawId: string;
  type: 'agent' | 'mcp' | 'skill' | 'plugin';
  title: string;
  subtitle: string;
  badge?: string;
  badgeColor?: string;
  agentName?: string;
  agentColor?: string;
  tab: NavTab;
}

export const TopBar: React.FC<TopBarProps> = ({
  agents,
  onToggleAgent,
  onSelectOnly,
  searchQuery = '',
  onSearchChange,
  activeTab = 'overview',
  onNavigateTab,
  capabilities,
  onSelectSearchResult,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'skills' | 'mcp' | 'plugins' | 'agents'>('all');
  const [localInput, setLocalInput] = useState(searchQuery);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const topBarCenterRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync external search query changes (e.g. cleared elsewhere)
  useEffect(() => {
    setLocalInput(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.isMaximized().then(setIsMaximized).catch(() => {});
      const unsubscribe = window.electronAPI.onMaximizeChange((maximized) => {
        setIsMaximized(maximized);
      });
      return () => unsubscribe();
    }
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (topBarCenterRef.current && !topBarCenterRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleSearchShortcut = (event: KeyboardEvent) => {
      const isSearchShortcut =
        (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k';

      const isSlashShortcut =
        event.key === '/' &&
        event.target instanceof HTMLElement &&
        !['INPUT', 'TEXTAREA'].includes(event.target.tagName);

      if (isSearchShortcut || isSlashShortcut) {
        event.preventDefault();
        searchInputRef.current?.focus();
        if (localInput.trim()) {
          setIsDropdownOpen(true);
        }
      }
    };

    window.addEventListener('keydown', handleSearchShortcut);
    return () => {
      window.removeEventListener('keydown', handleSearchShortcut);
    };
  }, [localInput]);

  const handleInputChange = (val: string) => {
    setLocalInput(val);
    setIsDropdownOpen(true);
    setSelectedIndex(0);

    // Debounce background tab reconciliation to eliminate FPS drops while typing
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      onSearchChange?.(val);
    }, 120);
  };

  const handleMinimize = () => {
    window.electronAPI?.minimizeWindow();
  };

  const handleMaximize = () => {
    window.electronAPI?.maximizeWindow();
  };

  const handleClose = () => {
    window.electronAPI?.closeWindow();
  };

  const handleClearSearch = () => {
    setLocalInput('');
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    onSearchChange?.('');
    setCategoryFilter('all');
    setIsDropdownOpen(false);
    searchInputRef.current?.focus();
  };

  // Pre-index collections with lowercased search strings to eliminate FPS drops
  const indexedAgents = useMemo(() => {
    return agents.map((a) => ({
      item: a,
      searchStr: `${a.name} ${a.tagline}`.toLowerCase(),
    }));
  }, [agents]);

  const indexedMcps = useMemo(() => {
    return (capabilities?.mcpServers || []).map((m) => ({
      item: m,
      searchStr: `${m.name} ${m.sourceAgentName} ${m.command || ''} ${m.url || ''} ${m.transport}`.toLowerCase(),
    }));
  }, [capabilities?.mcpServers]);

  const indexedSkills = useMemo(() => {
    return (capabilities?.skills || []).map((s) => ({
      item: s,
      searchStr: `${s.name} ${s.description} ${s.pluginName || ''} ${s.sourceAgentName}`.toLowerCase(),
    }));
  }, [capabilities?.skills]);

  const indexedPlugins = useMemo(() => {
    return (capabilities?.plugins || []).map((p) => ({
      item: p,
      searchStr: `${p.name} ${p.description} ${p.sourceAgentName}`.toLowerCase(),
    }));
  }, [capabilities?.plugins]);

  // Fast counts for footer category buttons
  const categoryCounts = useMemo(() => {
    if (!localInput.trim()) return { skills: 0, mcps: 0, plugins: 0, agents: 0 };
    const q = localInput.toLowerCase().trim();
    let sCount = 0;
    for (const s of indexedSkills) if (s.searchStr.includes(q)) sCount++;
    let mCount = 0;
    for (const m of indexedMcps) if (m.searchStr.includes(q)) mCount++;
    let pCount = 0;
    for (const p of indexedPlugins) if (p.searchStr.includes(q)) pCount++;
    let aCount = 0;
    for (const a of indexedAgents) if (a.searchStr.includes(q)) aCount++;
    return { skills: sCount, mcps: mCount, plugins: pCount, agents: aCount };
  }, [localInput, indexedSkills, indexedMcps, indexedPlugins, indexedAgents]);

  // Compute live search matches across filtered categories with early break limits
  const searchResults = useMemo(() => {
    if (!localInput.trim()) {
      return { agents: [], mcps: [], skills: [], plugins: [], flatItems: [], totalCount: 0 };
    }
    const q = localInput.toLowerCase().trim();

    // 1. Skills
    const shouldSearchSkills = categoryFilter === 'all' || categoryFilter === 'skills';
    const matchingSkills: ScannedSkill[] = [];
    if (shouldSearchSkills) {
      const limit = categoryFilter === 'skills' ? 24 : 6;
      for (const entry of indexedSkills) {
        if (entry.searchStr.includes(q)) {
          matchingSkills.push(entry.item);
          if (matchingSkills.length >= limit) break;
        }
      }
    }

    // 2. MCP Servers
    const shouldSearchMcps = categoryFilter === 'all' || categoryFilter === 'mcp';
    const matchingMcps: ScannedMcpServer[] = [];
    if (shouldSearchMcps) {
      const limit = categoryFilter === 'mcp' ? 20 : 5;
      for (const entry of indexedMcps) {
        if (entry.searchStr.includes(q)) {
          matchingMcps.push(entry.item);
          if (matchingMcps.length >= limit) break;
        }
      }
    }

    // 3. Plugins
    const shouldSearchPlugins = categoryFilter === 'all' || categoryFilter === 'plugins';
    const matchingPlugins: ScannedPlugin[] = [];
    if (shouldSearchPlugins) {
      const limit = categoryFilter === 'plugins' ? 16 : 4;
      for (const entry of indexedPlugins) {
        if (entry.searchStr.includes(q)) {
          matchingPlugins.push(entry.item);
          if (matchingPlugins.length >= limit) break;
        }
      }
    }

    // 4. Agents
    const shouldSearchAgents = categoryFilter === 'all' || categoryFilter === 'agents';
    const matchingAgents: SupportedAgent[] = [];
    if (shouldSearchAgents) {
      const limit = categoryFilter === 'agents' ? 12 : 3;
      for (const entry of indexedAgents) {
        if (entry.searchStr.includes(q)) {
          matchingAgents.push(entry.item);
          if (matchingAgents.length >= limit) break;
        }
      }
    }

    const flatItems: SearchResultItem[] = [];

    matchingSkills.forEach((s) => {
      flatItems.push({
        id: `skill-${s.id}`,
        rawId: s.id,
        type: 'skill',
        title: s.name,
        subtitle: s.description,
        badge: s.pluginName ? s.pluginName : 'Skill',
        badgeColor: '#c084fc',
        agentName: s.sourceAgentName,
        agentColor: s.sourceAgentColor,
        tab: 'skills',
      });
    });

    matchingMcps.forEach((m) => {
      flatItems.push({
        id: `mcp-${m.id}`,
        rawId: m.id,
        type: 'mcp',
        title: m.name,
        subtitle: m.command ? `Command: ${m.command}` : (m.url ? `URL: ${m.url}` : 'MCP Server'),
        badge: m.transport.toUpperCase(),
        badgeColor: m.transport === 'sse' ? '#10b981' : '#38bdf8',
        agentName: m.sourceAgentName,
        agentColor: m.sourceAgentColor,
        tab: 'mcp',
      });
    });

    matchingPlugins.forEach((p) => {
      flatItems.push({
        id: `plugin-${p.id}`,
        rawId: p.id,
        type: 'plugin',
        title: p.name,
        subtitle: p.description,
        badge: `${p.skillsCount} skills`,
        badgeColor: '#fbbf24',
        agentName: p.sourceAgentName,
        agentColor: p.sourceAgentColor,
        tab: 'plugins',
      });
    });

    matchingAgents.forEach((a) => {
      flatItems.push({
        id: `agent-${a.id}`,
        rawId: a.id,
        type: 'agent',
        title: a.name,
        subtitle: a.tagline,
        badge: a.detected ? 'DETECTED' : undefined,
        badgeColor: a.color,
        agentName: a.name,
        agentColor: a.color,
        tab: 'agents',
      });
    });

    const totalCount =
      matchingAgents.length +
      matchingMcps.length +
      matchingSkills.length +
      matchingPlugins.length;

    return {
      agents: matchingAgents,
      mcps: matchingMcps,
      skills: matchingSkills,
      plugins: matchingPlugins,
      flatItems,
      totalCount,
    };
  }, [localInput, categoryFilter, indexedAgents, indexedMcps, indexedSkills, indexedPlugins]);

  const handleSelectItem = (item: SearchResultItem) => {
    onSelectSearchResult?.(item.tab, item.rawId);
    onNavigateTab?.(item.tab);
    setIsDropdownOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setIsDropdownOpen(false);
      handleClearSearch();
      searchInputRef.current?.blur();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIsDropdownOpen(true);
      setSelectedIndex((prev) => Math.min(prev + 1, Math.max(0, searchResults.flatItems.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (searchResults.flatItems.length > 0 && selectedIndex < searchResults.flatItems.length) {
        handleSelectItem(searchResults.flatItems[selectedIndex]);
      } else if (activeTab === 'overview' && searchResults.flatItems.length > 0) {
        handleSelectItem(searchResults.flatItems[0]);
      }
    }
  };

  return (
    <header className="topbar-container drag-region">
      {/* Left: Brand / Logo */}
      <div className="topbar-left no-drag">
        <div className="brand-badge">
          <span className="brand-icon">A</span>
          <span className="brand-name">AgentForge</span>
        </div>

        {/* Target Agent Selector Dropdown */}
        <AgentSelectorDropdown
          agents={agents}
          onToggleAgent={onToggleAgent}
          onSelectOnly={onSelectOnly}
        />
      </div>

      {/* Center: Search Bar */}
      <div className="topbar-center no-drag" ref={topBarCenterRef}>
        <div className="search-bar-container">
          <Search size={15} className="search-icon" />
          <input
            ref={searchInputRef}
            type="text"
            className="search-input"
            placeholder={
              activeTab === 'skills'
                ? 'Search active skills, descriptions, or plugins...'
                : activeTab === 'mcp'
                ? 'Search MCP servers, commands, or agents...'
                : activeTab === 'plugins'
                ? 'Search installed plugins, bundles, or agents...'
                : activeTab === 'agents'
                ? 'Search configured AI agents...'
                : 'Search agents, skills, rules, MCP servers...'
            }
            value={localInput}
            onFocus={() => {
              if (localInput.trim()) setIsDropdownOpen(true);
            }}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {localInput ? (
            <button
              className="search-clear-btn"
              onClick={handleClearSearch}
              title="Clear search (Esc)"
            >
              <X size={13} />
            </button>
          ) : (
            <div className="search-shortcut font-mono">
              <Command size={11} />
              <span>K</span>
              <span className="shortcut-divider">/</span>
            </div>
          )}
        </div>

        {/* Floating Search Results Dropdown Popover */}
        {isDropdownOpen && localInput.trim().length > 0 && (
          <div className="search-results-popover">
            <div className="popover-header">
              <span className="results-count font-mono">
                {searchResults.totalCount} {searchResults.totalCount === 1 ? 'RESULT' : 'RESULTS'} FOUND
                {categoryFilter !== 'all' && ` • FILTERED: ${categoryFilter.toUpperCase()}`}
              </span>
              <span className="results-scope font-mono">ACTIVE SEARCH</span>
            </div>

            {searchResults.totalCount === 0 ? (
              <div className="popover-empty">
                <Search size={22} className="empty-search-icon" />
                <div className="empty-search-title">No results matching "{localInput}"</div>
                <div className="empty-search-subtitle">
                  {categoryFilter !== 'all'
                    ? `No ${categoryFilter} match this query. Try resetting category filter or refining search.`
                    : 'Try searching by skill name, MCP command, agent name, or plugin keyword.'}
                </div>
              </div>
            ) : (
              <div className="popover-results-scroll">
                {/* Skills Section */}
                {(categoryFilter === 'all' || categoryFilter === 'skills') && searchResults.skills.length > 0 && (
                  <div className="results-section">
                    <div className="section-title">
                      <Sparkles size={12} className="section-icon text-purple" />
                      <span>SKILLS ({searchResults.skills.length})</span>
                    </div>
                    {searchResults.skills.map((s) => {
                      const flatIndex = searchResults.flatItems.findIndex((x) => x.id === `skill-${s.id}`);
                      const isItemActive = flatIndex === selectedIndex;
                      return (
                        <div
                          key={s.id}
                          className={`result-item ${isItemActive ? 'item-active' : ''}`}
                          onClick={() => handleSelectItem(searchResults.flatItems[flatIndex])}
                          onMouseEnter={() => setSelectedIndex(flatIndex)}
                        >
                          <div className="item-icon-wrapper icon-skill">
                            <Sparkles size={14} />
                          </div>
                          <div className="item-content">
                            <div className="item-title-row">
                              <span className="item-title font-mono">{s.name}</span>
                              {s.pluginName && <span className="item-origin-pill">{s.pluginName}</span>}
                            </div>
                            <div className="item-desc">{s.description}</div>
                          </div>
                          <div className="item-agent-tag" style={{ color: s.sourceAgentColor, borderColor: `${s.sourceAgentColor}40` }}>
                            {s.sourceAgentName}
                          </div>
                          <CornerDownLeft size={12} className="jump-icon" />
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* MCP Servers Section */}
                {(categoryFilter === 'all' || categoryFilter === 'mcp') && searchResults.mcps.length > 0 && (
                  <div className="results-section">
                    <div className="section-title">
                      <Server size={12} className="section-icon text-sky" />
                      <span>MCP SERVERS ({searchResults.mcps.length})</span>
                    </div>
                    {searchResults.mcps.map((m) => {
                      const flatIndex = searchResults.flatItems.findIndex((x) => x.id === `mcp-${m.id}`);
                      const isItemActive = flatIndex === selectedIndex;
                      return (
                        <div
                          key={m.id}
                          className={`result-item ${isItemActive ? 'item-active' : ''}`}
                          onClick={() => handleSelectItem(searchResults.flatItems[flatIndex])}
                          onMouseEnter={() => setSelectedIndex(flatIndex)}
                        >
                          <div className="item-icon-wrapper icon-mcp">
                            <Server size={14} />
                          </div>
                          <div className="item-content">
                            <div className="item-title-row">
                              <span className="item-title font-mono">{m.name}</span>
                              <span className="item-transport-pill font-mono">{m.transport.toUpperCase()}</span>
                            </div>
                            <div className="item-desc">{m.command ? `Command: ${m.command}` : (m.url || 'Configured server')}</div>
                          </div>
                          <div className="item-agent-tag" style={{ color: m.sourceAgentColor, borderColor: `${m.sourceAgentColor}40` }}>
                            {m.sourceAgentName}
                          </div>
                          <CornerDownLeft size={12} className="jump-icon" />
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Plugins Section */}
                {(categoryFilter === 'all' || categoryFilter === 'plugins') && searchResults.plugins.length > 0 && (
                  <div className="results-section">
                    <div className="section-title">
                      <Boxes size={12} className="section-icon text-amber" />
                      <span>PLUGINS & BUNDLES ({searchResults.plugins.length})</span>
                    </div>
                    {searchResults.plugins.map((p) => {
                      const flatIndex = searchResults.flatItems.findIndex((x) => x.id === `plugin-${p.id}`);
                      const isItemActive = flatIndex === selectedIndex;
                      return (
                        <div
                          key={p.id}
                          className={`result-item ${isItemActive ? 'item-active' : ''}`}
                          onClick={() => handleSelectItem(searchResults.flatItems[flatIndex])}
                          onMouseEnter={() => setSelectedIndex(flatIndex)}
                        >
                          <div className="item-icon-wrapper icon-plugin">
                            <Boxes size={14} />
                          </div>
                          <div className="item-content">
                            <div className="item-title-row">
                              <span className="item-title font-mono">{p.name}</span>
                              <span className="item-badge-pill font-mono">{p.skillsCount} skills</span>
                            </div>
                            <div className="item-desc">{p.description}</div>
                          </div>
                          <div className="item-agent-tag" style={{ color: p.sourceAgentColor, borderColor: `${p.sourceAgentColor}40` }}>
                            {p.sourceAgentName}
                          </div>
                          <CornerDownLeft size={12} className="jump-icon" />
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Agents Section */}
                {(categoryFilter === 'all' || categoryFilter === 'agents') && searchResults.agents.length > 0 && (
                  <div className="results-section">
                    <div className="section-title">
                      <Bot size={12} className="section-icon text-blue" />
                      <span>AGENTS ({searchResults.agents.length})</span>
                    </div>
                    {searchResults.agents.map((a) => {
                      const flatIndex = searchResults.flatItems.findIndex((x) => x.id === `agent-${a.id}`);
                      const isItemActive = flatIndex === selectedIndex;
                      return (
                        <div
                          key={a.id}
                          className={`result-item ${isItemActive ? 'item-active' : ''}`}
                          onClick={() => handleSelectItem(searchResults.flatItems[flatIndex])}
                          onMouseEnter={() => setSelectedIndex(flatIndex)}
                        >
                          <div className="item-icon-wrapper" style={{ color: a.color, background: `${a.color}15`, borderColor: `${a.color}35` }}>
                            <Bot size={14} />
                          </div>
                          <div className="item-content">
                            <div className="item-title-row">
                              <span className="item-title">{a.name}</span>
                              {a.detected && <span className="item-badge-pill font-mono">DETECTED</span>}
                            </div>
                            <div className="item-desc">{a.tagline}</div>
                          </div>
                          <CornerDownLeft size={12} className="jump-icon" />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Popover Footer with Category Filters & Shortcuts */}
            <div className="popover-footer">
              <div className="quick-tab-links">
                <span className="filter-label font-mono">FILTER:</span>
                {categoryCounts.skills > 0 && (
                  <button
                    className={`quick-tab-btn ${categoryFilter === 'skills' ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCategoryFilter((prev) => (prev === 'skills' ? 'all' : 'skills'));
                    }}
                    title={categoryFilter === 'skills' ? 'Filtered: Skills (Click to show all)' : 'Click to show only skills'}
                  >
                    Skills ({categoryCounts.skills})
                  </button>
                )}
                {categoryCounts.mcps > 0 && (
                  <button
                    className={`quick-tab-btn ${categoryFilter === 'mcp' ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCategoryFilter((prev) => (prev === 'mcp' ? 'all' : 'mcp'));
                    }}
                    title={categoryFilter === 'mcp' ? 'Filtered: MCPs (Click to show all)' : 'Click to show only MCP servers'}
                  >
                    MCPs ({categoryCounts.mcps})
                  </button>
                )}
                {categoryCounts.plugins > 0 && (
                  <button
                    className={`quick-tab-btn ${categoryFilter === 'plugins' ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCategoryFilter((prev) => (prev === 'plugins' ? 'all' : 'plugins'));
                    }}
                    title={categoryFilter === 'plugins' ? 'Filtered: Plugins (Click to show all)' : 'Click to show only plugins'}
                  >
                    Plugins ({categoryCounts.plugins})
                  </button>
                )}
                {categoryCounts.agents > 0 && (
                  <button
                    className={`quick-tab-btn ${categoryFilter === 'agents' ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCategoryFilter((prev) => (prev === 'agents' ? 'all' : 'agents'));
                    }}
                    title={categoryFilter === 'agents' ? 'Filtered: Agents (Click to show all)' : 'Click to show only agents'}
                  >
                    Agents ({categoryCounts.agents})
                  </button>
                )}
                {categoryFilter !== 'all' && (
                  <button
                    className="filter-reset-btn font-mono"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCategoryFilter('all');
                    }}
                    title="Reset to show all categories"
                  >
                    Reset
                  </button>
                )}
              </div>
              <div className="footer-keys">
                <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
                <span><kbd>↵</kbd> jump & highlight</span>
                <span><kbd>esc</kbd> close</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right: Status, Notifications & Window Controls */}
      <div className="topbar-right no-drag">
        {/* Notification Bell */}
        <button className="icon-button notification-btn" title="Notifications">
          <Bell size={16} />
        </button>

        <div className="controls-divider"></div>

        {/* Custom Window Controls */}
        <div className="window-controls">
          <button
            className="window-control-btn minimize"
            onClick={handleMinimize}
            title="Minimize"
          >
            <Minus size={13} />
          </button>
          <button
            className="window-control-btn maximize"
            onClick={handleMaximize}
            title={isMaximized ? "Restore" : "Maximize"}
          >
            <Square size={11} />
          </button>
          <button
            className="window-control-btn close"
            onClick={handleClose}
            title="Close"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <style>{`
        .topbar-container {
          height: 48px;
          min-height: 48px;
          background: #0d121f;
          border-bottom: 1px solid #1c2538;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 10px 0 16px;
          position: relative;
          z-index: 50;
        }

        .topbar-left {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .brand-badge {
          display: flex;
          align-items: center;
          gap: 9px;
        }

        .brand-icon {
          width: 26px;
          height: 26px;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          border-radius: 6px;
          color: #ffffff;
          font-weight: 800;
          font-size: 15px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 8px rgba(99, 102, 241, 0.4);
        }

        .brand-name {
          font-weight: 700;
          font-size: 15px;
          letter-spacing: -0.01em;
          color: #f8fafc;
        }

        .env-badge {
          display: flex;
          align-items: center;
          gap: 6px;
          background: #131927;
          border: 1px solid #1e283d;
          padding: 4px 9px;
          border-radius: 6px;
          font-size: 11.5px;
        }

        .env-label {
          color: #64748b;
          font-size: 10.5px;
          font-weight: 500;
        }

        .env-value {
          color: #93c5fd;
          font-weight: 600;
        }

        .topbar-center {
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
          width: 480px;
          max-width: calc(100% - 480px);
        }

        .search-bar-container {
          display: flex;
          align-items: center;
          background: #131926;
          border: 1px solid #202b3e;
          border-radius: 8px;
          padding: 5px 12px;
          transition: all 0.18s ease;
        }

        .search-bar-container:focus-within {
          border-color: #6366f1;
          box-shadow: 0 0 0 1px #6366f1;
          background: #161e30;
          animation: search-focus-pulse 0.3s ease-out;
        }

        @keyframes search-focus-pulse {
          0% {
            transform: scale(1);
          }

          50% {
            transform: scale(1.015);
          }

          100% {
            transform: scale(1);
          }
        }
        .search-icon {
          color: #64748b;
          margin-right: 8px;
        }

        .search-input {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          color: #f1f5f9;
          font-size: 12.5px;
          font-family: inherit;
        }

        .search-input::placeholder {
          color: #55657e;
        }

        .search-shortcut {
          display: flex;
          align-items: center;
          gap: 3px;
          background: #1c263c;
          color: #7b8ea6;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 10px;
          border: 1px solid #2b3954;
        }

        .search-clear-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          color: #7b8ea6;
          padding: 2px;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .search-clear-btn:hover {
          color: #f1f5f9;
          background: #1e2a42;
        }

        .shortcut-divider {
          color: #4b5d73;
          margin-left: 2px;
        }

        .topbar-right {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .icon-button {
          position: relative;
          background: #151c2d;
          border: 1px solid #23304a;
          color: #94a3b8;
          width: 32px;
          height: 32px;
          border-radius: 7px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .icon-button:hover {
          background: #1d273e;
          color: #f8fafc;
          border-color: #334466;
        }

        .notification-badge {
          position: absolute;
          top: -4px;
          right: -4px;
          background: #ef4444;
          color: #ffffff;
          font-size: 9.5px;
          font-weight: 700;
          width: 15px;
          height: 15px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2px solid #0d121f;
        }

        .primary-action-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          background: linear-gradient(135deg, #7c3aed, #6366f1);
          border: none;
          color: #ffffff;
          font-size: 12px;
          font-weight: 600;
          padding: 6px 14px;
          border-radius: 7px;
          cursor: pointer;
          box-shadow: 0 2px 10px rgba(124, 58, 237, 0.35);
          transition: all 0.15s ease;
        }

        .primary-action-btn:hover {
          opacity: 0.92;
          transform: translateY(-1px);
        }

        .controls-divider {
          width: 1px;
          height: 20px;
          background: #202b3e;
          margin: 0 4px;
        }

        .window-controls {
          display: flex;
          align-items: center;
          gap: 2px;
        }

        .window-control-btn {
          background: transparent;
          border: none;
          color: #8393a8;
          width: 30px;
          height: 30px;
          border-radius: 5px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.12s ease;
        }

        .window-control-btn:hover {
          background: #1c263c;
          color: #f1f5f9;
        }

        .window-control-btn.close:hover {
          background: #e11d48;
          color: #ffffff;
        }

        /* Search Results Popover Dropdown */
        .search-results-popover {
          position: absolute;
          top: calc(100% + 8px);
          left: 0;
          right: 0;
          background: #0d1322;
          border: 1px solid #23324c;
          border-radius: 10px;
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(99, 102, 241, 0.15);
          z-index: 1000;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          animation: popoverSlideIn 0.16s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes popoverSlideIn {
          from {
            opacity: 0;
            transform: translateY(-6px) scale(0.99);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .popover-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 14px;
          background: #090e18;
          border-bottom: 1px solid #1a2538;
          font-size: 10px;
          color: #64748b;
          font-weight: 700;
          letter-spacing: 0.04em;
        }

        .results-count {
          color: #93c5fd;
        }

        .results-scope {
          color: #64748b;
        }

        .popover-empty {
          padding: 38px 24px;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }

        .empty-search-icon {
          color: #4b5d78;
        }

        .empty-search-title {
          font-size: 13.5px;
          font-weight: 600;
          color: #f1f5f9;
        }

        .empty-search-subtitle {
          font-size: 11.5px;
          color: #64748b;
          max-width: 320px;
          line-height: 1.4;
        }

        .popover-results-scroll {
          max-height: 380px;
          overflow-y: auto;
          padding: 8px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .results-section {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .section-title {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 9.5px;
          font-family: var(--font-mono);
          font-weight: 700;
          color: #64748b;
          padding: 4px 8px;
          letter-spacing: 0.05em;
        }

        .section-icon.text-sky { color: #38bdf8; }
        .section-icon.text-purple { color: #c084fc; }
        .section-icon.text-amber { color: #fbbf24; }
        .section-icon.text-blue { color: #60a5fa; }

        .result-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 7px 10px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.12s ease;
          border: 1px solid transparent;
        }

        .result-item:hover,
        .result-item.item-active {
          background: #141c2c;
          border-color: #243550;
        }

        .item-icon-wrapper {
          width: 26px;
          height: 26px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          border: 1px solid;
        }

        .icon-mcp {
          color: #38bdf8;
          background: rgba(56, 189, 248, 0.12);
          border-color: rgba(56, 189, 248, 0.25);
        }

        .icon-skill {
          color: #c084fc;
          background: rgba(192, 132, 252, 0.12);
          border-color: rgba(192, 132, 252, 0.25);
        }

        .icon-plugin {
          color: #fbbf24;
          background: rgba(251, 191, 36, 0.12);
          border-color: rgba(251, 191, 36, 0.25);
        }

        .item-content {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 1px;
        }

        .item-title-row {
          display: flex;
          align-items: center;
          gap: 7px;
        }

        .item-title {
          font-size: 12px;
          font-weight: 600;
          color: #f1f5f9;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .item-desc {
          font-size: 11px;
          color: #7d90a6;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .item-transport-pill,
        .item-badge-pill {
          font-size: 8.5px;
          padding: 1px 5px;
          border-radius: 4px;
          background: #192336;
          border: 1px solid #23344e;
          color: #93c5fd;
          font-weight: 600;
        }

        .item-origin-pill {
          font-size: 9px;
          padding: 0 5px;
          border-radius: 4px;
          background: #1e1b38;
          border: 1px solid #362d60;
          color: #d8b4fe;
        }

        .item-agent-tag {
          font-size: 9.5px;
          font-weight: 600;
          padding: 1px 6px;
          border-radius: 4px;
          border: 1px solid;
          background: rgba(255, 255, 255, 0.03);
          white-space: nowrap;
        }

        .jump-icon {
          color: #4b5f76;
          opacity: 0;
          transition: opacity 0.12s ease;
          flex-shrink: 0;
        }

        .result-item:hover .jump-icon,
        .result-item.item-active .jump-icon {
          opacity: 1;
          color: #818cf8;
        }

        .popover-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          background: #080c14;
          border-top: 1px solid #1a2538;
          font-size: 10px;
          color: #64748b;
        }

        .quick-tab-links {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .quick-tab-btn {
          background: #121927;
          border: 1px solid #202d42;
          color: #93c5fd;
          font-size: 10px;
          font-weight: 600;
          padding: 2px 7px;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.12s ease;
        }

        .quick-tab-btn:hover {
          background: #1b263b;
          border-color: #3b5072;
          color: #ffffff;
        }

        .quick-tab-btn.active {
          background: #312e81 !important;
          border-color: #a855f7 !important;
          color: #f3e8ff !important;
          box-shadow: 0 0 10px rgba(168, 85, 247, 0.4);
        }

        .filter-label {
          font-size: 9px;
          color: #64748b;
          letter-spacing: 0.05em;
          font-weight: 700;
          margin-right: 2px;
        }

        .filter-reset-btn {
          background: transparent;
          border: 1px dashed #ef4444;
          color: #f87171;
          font-size: 9px;
          font-weight: 600;
          padding: 1px 6px;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.12s ease;
        }

        .filter-reset-btn:hover {
          background: rgba(239, 68, 68, 0.15);
          color: #ffffff;
        }

        .footer-keys {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .footer-keys kbd {
          background: #131b2a;
          border: 1px solid #233146;
          padding: 1px 4px;
          border-radius: 3px;
          font-size: 9px;
          color: #8ea1b8;
          font-family: var(--font-mono);
          margin-right: 2px;
        }
      `}</style>
    </header>
  );
};
