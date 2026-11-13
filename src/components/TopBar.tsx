import React, { useState, useEffect, useRef, useMemo, useDeferredValue } from 'react';
import {
  Search,
  Minus,
  Square,
  X,
  Bot,
  Server,
  Sparkles,
  Boxes,
  CornerDownLeft,
} from 'lucide-react';
import {
  SupportedAgent,
  AgentCapabilitiesPayload
} from '../types/agent';
import { CatalogSkill, CatalogPlugin, CatalogMcpServer } from '../types/catalog';
import { AgentSelectorDropdown } from './AgentSelectorDropdown';
import { NavTab } from './Sidebar';
import { AGENT_ICON_MAP } from './AgentIcon';
import { Tooltip } from './Tooltip';
import appLogo from '../assets/icon.png';

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
  skillsCatalog?: CatalogSkill[];
  mcpCatalog?: CatalogMcpServer[];
  pluginsCatalog?: CatalogPlugin[];
  onSelectSearchResult?: (tab: NavTab, itemId: string) => void;
}

interface SearchSkillItem {
  id: string;
  name: string;
  description?: string;
  pluginName?: string;
  sourceAgentName: string;
  sourceAgentColor: string;
  isCatalog?: boolean;
}

interface SearchMcpItem {
  id: string;
  name: string;
  transport: 'stdio' | 'sse';
  command?: string;
  url?: string;
  sourceAgentName: string;
  sourceAgentColor: string;
  isCatalog?: boolean;
}

interface SearchPluginItem {
  id: string;
  name: string;
  description?: string;
  skillsCount?: number;
  sourceAgentName: string;
  sourceAgentColor: string;
  isCatalog?: boolean;
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

const TopBarComponent: React.FC<TopBarProps> = ({
  agents,
  onToggleAgent,
  onSelectOnly,
  searchQuery = '',
  onSearchChange,
  activeTab = 'overview',
  onNavigateTab,
  capabilities,
  skillsCatalog,
  mcpCatalog,
  pluginsCatalog,
  onSelectSearchResult,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'skills' | 'mcp' | 'plugins' | 'agents'>('all');
  const [localInput, setLocalInput] = useState(searchQuery);
  const deferredInput = useDeferredValue(localInput);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const topBarCenterRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync external search only when input is not actively focused by the user
  useEffect(() => {
    if (document.activeElement === searchInputRef.current) {
      return;
    }
    setLocalInput(searchQuery || '');
  }, [searchQuery]);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.isMaximized().then(setIsMaximized).catch(() => { });
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

    // Debounce propagation to heavy background page views (250ms)
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      onSearchChange?.(val);
    }, 250);
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

  // Index collections
  const indexedAgents = useMemo(() => {
    return agents.map((a) => ({
      item: a,
      searchStr: `${a.name} ${a.tagline}`.toLowerCase(),
    }));
  }, [agents]);

  const indexedMcps = useMemo(() => {
    const list: Array<{ item: SearchMcpItem; searchStr: string }> = [];
    const seen = new Set<string>();

    (capabilities?.mcpServers || []).forEach((m) => {
      seen.add(m.name.toLowerCase());
      list.push({
        item: {
          id: m.id,
          name: m.name,
          transport: m.transport,
          command: m.command,
          url: m.url,
          sourceAgentName: m.sourceAgentName,
          sourceAgentColor: m.sourceAgentColor,
          isCatalog: false,
        },
        searchStr: `${m.name} ${m.sourceAgentName} ${m.command || ''} ${m.url || ''} ${m.transport}`.toLowerCase(),
      });
    });

    (mcpCatalog || []).forEach((c) => {
      if (!seen.has(c.name.toLowerCase())) {
        list.push({
          item: {
            id: c.id,
            name: c.name,
            transport: c.transport,
            command: c.command,
            url: c.url,
            sourceAgentName: c.category || 'Catalog',
            sourceAgentColor: '#38bdf8',
            isCatalog: true,
          },
          searchStr: `${c.name} ${c.description || ''} ${c.category || ''} ${c.author || ''} ${(c.tags || []).join(' ')} ${c.command || ''}`.toLowerCase(),
        });
      }
    });

    return list;
  }, [capabilities?.mcpServers, mcpCatalog]);

  const indexedSkills = useMemo(() => {
    const list: Array<{ item: SearchSkillItem; searchStr: string }> = [];
    const seen = new Set<string>();

    (capabilities?.skills || []).forEach((s) => {
      seen.add(s.name.toLowerCase());
      list.push({
        item: {
          id: s.id,
          name: s.name,
          description: s.description,
          pluginName: s.pluginName,
          sourceAgentName: s.sourceAgentName,
          sourceAgentColor: s.sourceAgentColor,
          isCatalog: false,
        },
        searchStr: `${s.name} ${s.description || ''} ${s.pluginName || ''} ${s.sourceAgentName}`.toLowerCase(),
      });
    });

    (skillsCatalog || []).forEach((c) => {
      if (!seen.has(c.name.toLowerCase())) {
        list.push({
          item: {
            id: c.id,
            name: c.name,
            description: c.description,
            pluginName: c.category,
            sourceAgentName: c.author || 'Catalog',
            sourceAgentColor: '#c084fc',
            isCatalog: true,
          },
          searchStr: `${c.name} ${c.description || ''} ${c.category || ''} ${c.author || ''} ${(c.tags || []).join(' ')}`.toLowerCase(),
        });
      }
    });

    return list;
  }, [capabilities?.skills, skillsCatalog]);

  const indexedPlugins = useMemo(() => {
    const list: Array<{ item: SearchPluginItem; searchStr: string }> = [];
    const seen = new Set<string>();

    (capabilities?.plugins || []).forEach((p) => {
      seen.add(p.name.toLowerCase());
      list.push({
        item: {
          id: p.id,
          name: p.name,
          description: p.description,
          skillsCount: p.skillsCount,
          sourceAgentName: p.sourceAgentName,
          sourceAgentColor: p.sourceAgentColor,
          isCatalog: false,
        },
        searchStr: `${p.name} ${p.description || ''} ${p.sourceAgentName}`.toLowerCase(),
      });
    });

    (pluginsCatalog || []).forEach((c) => {
      if (!seen.has(c.name.toLowerCase())) {
        list.push({
          item: {
            id: c.id,
            name: c.name,
            description: c.description,
            skillsCount: c.bundledSkills?.length || 0,
            sourceAgentName: c.category || 'Catalog',
            sourceAgentColor: '#fbbf24',
            isCatalog: true,
          },
          searchStr: `${c.name} ${c.description || ''} ${c.category || ''} ${c.author || ''} ${(c.tags || []).join(' ')}`.toLowerCase(),
        });
      }
    });

    return list;
  }, [capabilities?.plugins, pluginsCatalog]);

  // Category counts
  const categoryCounts = useMemo(() => {
    if (!deferredInput.trim()) return { skills: 0, mcps: 0, plugins: 0, agents: 0 };
    const q = deferredInput.toLowerCase().trim();
    let sCount = 0;
    for (const s of indexedSkills) if (s.searchStr.includes(q)) sCount++;
    let mCount = 0;
    for (const m of indexedMcps) if (m.searchStr.includes(q)) mCount++;
    let pCount = 0;
    for (const p of indexedPlugins) if (p.searchStr.includes(q)) pCount++;
    let aCount = 0;
    for (const a of indexedAgents) if (a.searchStr.includes(q)) aCount++;
    return { skills: sCount, mcps: mCount, plugins: pCount, agents: aCount };
  }, [deferredInput, indexedSkills, indexedMcps, indexedPlugins, indexedAgents]);

  const totalRawMatches =
    categoryCounts.skills +
    categoryCounts.mcps +
    categoryCounts.plugins +
    categoryCounts.agents;

  // Search matches
  const searchResults = useMemo(() => {
    if (!deferredInput.trim()) {
      return { agents: [], mcps: [], skills: [], plugins: [], flatItems: [], totalCount: 0 };
    }
    const q = deferredInput.toLowerCase().trim();

    // Skills
    const shouldSearchSkills = categoryFilter === 'all' || categoryFilter === 'skills';
    const matchingSkills: SearchSkillItem[] = [];
    if (shouldSearchSkills) {
      const limit = categoryFilter === 'skills' ? 24 : 6;
      for (const entry of indexedSkills) {
        if (entry.searchStr.includes(q)) {
          matchingSkills.push(entry.item);
          if (matchingSkills.length >= limit) break;
        }
      }
    }

    // MCP Servers
    const shouldSearchMcps = categoryFilter === 'all' || categoryFilter === 'mcp';
    const matchingMcps: SearchMcpItem[] = [];
    if (shouldSearchMcps) {
      const limit = categoryFilter === 'mcp' ? 20 : 5;
      for (const entry of indexedMcps) {
        if (entry.searchStr.includes(q)) {
          matchingMcps.push(entry.item);
          if (matchingMcps.length >= limit) break;
        }
      }
    }

    // Plugins
    const shouldSearchPlugins = categoryFilter === 'all' || categoryFilter === 'plugins';
    const matchingPlugins: SearchPluginItem[] = [];
    if (shouldSearchPlugins) {
      const limit = categoryFilter === 'plugins' ? 16 : 4;
      for (const entry of indexedPlugins) {
        if (entry.searchStr.includes(q)) {
          matchingPlugins.push(entry.item);
          if (matchingPlugins.length >= limit) break;
        }
      }
    }

    // Agents
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
        subtitle: s.description || 'Specialized agent instructions and workflows',
        badge: s.pluginName ? s.pluginName : (s.isCatalog ? 'Catalog' : 'Skill'),
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
        subtitle: p.description || 'Pre-configured capability kit',
        badge: `${p.skillsCount || 0} skills`,
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
  }, [deferredInput, categoryFilter, indexedAgents, indexedMcps, indexedSkills, indexedPlugins]);

  const handleSelectItem = (item: SearchResultItem) => {
    setLocalInput('');
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    onSearchChange?.('');
    setIsDropdownOpen(false);
    onSelectSearchResult?.(item.tab, item.rawId);
    onNavigateTab?.(item.tab);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setIsDropdownOpen(false);
      handleClearSearch();
      searchInputRef.current?.blur();
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
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
        <div
          className="brand-badge clickable"
          onClick={() => onNavigateTab && onNavigateTab('overview')}
          title="AgentForge Dashboard Overview"
        >
          <img src={appLogo} alt="AgentForge Logo" className="brand-logo-img" />
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
            onBlur={() => {
              if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
                onSearchChange?.(localInput);
              }
            }}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {localInput ? (
            <Tooltip content="Clear search" shortcut="Esc" position="bottom">
              <button
                type="button"
                className="search-clear-btn"
                onClick={handleClearSearch}
                aria-label="Clear search"
              >
                <X size={13} />
              </button>
            </Tooltip>
          ) : (
            <div className="search-shortcut font-mono">
              <kbd>Ctrl</kbd>
              <kbd>K</kbd>
            </div>
          )}
        </div>

        {/* Floating Search Results Dropdown Popover */}
        {isDropdownOpen && localInput.trim().length > 0 && (
          <div className="search-results-popover">
            {/* Popover Filter Bar Tabs */}
            <div className="popover-filter-bar">
              <div className="filter-tabs-group" role="tablist" aria-label="Search category filters">
                <button
                  type="button"
                  className={`filter-tab-pill ${categoryFilter === 'all' ? 'active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCategoryFilter('all');
                  }}
                  title="Show all results"
                >
                  <span>All</span>
                  <span className="tab-pill-count font-mono">{totalRawMatches}</span>
                </button>

                {categoryCounts.skills > 0 && (
                  <button
                    type="button"
                    className={`filter-tab-pill ${categoryFilter === 'skills' ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCategoryFilter((prev) => (prev === 'skills' ? 'all' : 'skills'));
                    }}
                    title="Filter by Skills"
                  >
                    <Sparkles size={11} className="tab-icon" />
                    <span>Skills</span>
                    <span className="tab-pill-count font-mono">{categoryCounts.skills}</span>
                  </button>
                )}

                {categoryCounts.mcps > 0 && (
                  <button
                    type="button"
                    className={`filter-tab-pill ${categoryFilter === 'mcp' ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCategoryFilter((prev) => (prev === 'mcp' ? 'all' : 'mcp'));
                    }}
                    title="Filter by MCP Servers"
                  >
                    <Server size={11} className="tab-icon" />
                    <span>MCPs</span>
                    <span className="tab-pill-count font-mono">{categoryCounts.mcps}</span>
                  </button>
                )}

                {categoryCounts.plugins > 0 && (
                  <button
                    type="button"
                    className={`filter-tab-pill ${categoryFilter === 'plugins' ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCategoryFilter((prev) => (prev === 'plugins' ? 'all' : 'plugins'));
                    }}
                    title="Filter by Plugins"
                  >
                    <Boxes size={11} className="tab-icon" />
                    <span>Plugins</span>
                    <span className="tab-pill-count font-mono">{categoryCounts.plugins}</span>
                  </button>
                )}

                {categoryCounts.agents > 0 && (
                  <button
                    type="button"
                    className={`filter-tab-pill ${categoryFilter === 'agents' ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCategoryFilter((prev) => (prev === 'agents' ? 'all' : 'agents'));
                    }}
                    title="Filter by Agents"
                  >
                    <Bot size={11} className="tab-icon" />
                    <span>Agents</span>
                    <span className="tab-pill-count font-mono">{categoryCounts.agents}</span>
                  </button>
                )}
              </div>

              {categoryFilter !== 'all' && (
                <button
                  type="button"
                  className="filter-clear-pill font-mono"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCategoryFilter('all');
                  }}
                  title="Clear category filter and show all"
                >
                  <X size={10} />
                  <span>Reset</span>
                </button>
              )}
            </div>

            {searchResults.totalCount === 0 ? (
              <div className="popover-empty">
                <Search size={22} className="empty-search-icon" />
                <div className="empty-search-title">No results matching "{localInput}"</div>
                <div className="empty-search-subtitle">
                  {categoryFilter !== 'all'
                    ? `No ${categoryFilter} match this query.`
                    : 'Try searching by skill name, MCP command, agent name, or plugin keyword.'}
                </div>
                {categoryFilter !== 'all' && (
                  <button
                    type="button"
                    className="empty-reset-btn font-mono"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCategoryFilter('all');
                    }}
                  >
                    Reset to All Categories
                  </button>
                )}
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
                      <span>PLUGINS ({searchResults.plugins.length})</span>
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
                      <Bot size={12} className="section-icon text-indigo" />
                      <span>AGENTS ({searchResults.agents.length})</span>
                    </div>
                    {searchResults.agents.map((a) => {
                      const flatIndex = searchResults.flatItems.findIndex((x) => x.id === `agent-${a.id}`);
                      const isItemActive = flatIndex === selectedIndex;
                      const AgentIcon = AGENT_ICON_MAP[a.id] || AGENT_ICON_MAP[a.iconName] || Bot;
                      return (
                        <div
                          key={a.id}
                          className={`result-item ${isItemActive ? 'item-active' : ''}`}
                          onClick={() => handleSelectItem(searchResults.flatItems[flatIndex])}
                          onMouseEnter={() => setSelectedIndex(flatIndex)}
                        >
                          <div className="item-icon-wrapper" style={{ color: a.color, background: `${a.color}15`, borderColor: `${a.color}35` }}>
                            <AgentIcon size={14} />
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

            {/* Popover Footer with Result Count & Keyboard Navigation */}
            <div className="popover-footer">
              <div className="footer-summary font-mono">
                <span className="results-indicator-dot" />
                <span>
                  {searchResults.totalCount} {searchResults.totalCount === 1 ? 'match' : 'matches'}
                  {categoryFilter !== 'all' && (
                    <span className="filtered-scope-tag">in {categoryFilter}</span>
                  )}
                </span>
              </div>
              <div className="footer-keys font-mono">
                <span className="key-hint">
                  <kbd>↑</kbd><kbd>↓</kbd>
                  <span>Navigate</span>
                </span>
                <span className="key-hint">
                  <kbd>↵</kbd>
                  <span>Select</span>
                </span>
                <span className="key-hint">
                  <kbd>Esc</kbd>
                  <span>Close</span>
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right: Window Controls */}
      <div className="topbar-right no-drag">
        {/* Custom Window Controls */}
        <div className="window-controls">
          <Tooltip content="Minimize" position="bottom">
            <button
              type="button"
              className="window-control-btn minimize"
              onClick={handleMinimize}
              aria-label="Minimize"
            >
              <Minus size={13} />
            </button>
          </Tooltip>
          <Tooltip content={isMaximized ? "Restore down" : "Maximize"} position="bottom">
            <button
              type="button"
              className="window-control-btn maximize"
              onClick={handleMaximize}
              aria-label={isMaximized ? "Restore Down" : "Maximize"}
            >
              {isMaximized ? (
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 11 11"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M3 1.5H9.5V8"
                    stroke="currentColor"
                    strokeWidth="1.1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <rect
                    x="1.5"
                    y="3"
                    width="6.5"
                    height="6.5"
                    rx="0.5"
                    stroke="currentColor"
                    strokeWidth="1.1"
                  />
                </svg>
              ) : (
                <Square size={11} />
              )}
            </button>
          </Tooltip>
          <Tooltip content="Close window" position="bottom">
            <button
              type="button"
              className="window-control-btn close"
              onClick={handleClose}
              aria-label="Close"
            >
              <X size={14} />
            </button>
          </Tooltip>
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
          padding: 0 10px 0 14px;
          position: relative;
          z-index: 50;
          gap: 12px;
          min-width: 0;
        }

        .topbar-left {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
          flex-shrink: 0;
        }

        @media (max-width: 768px) {
          .brand-name {
            display: none;
          }
        }

        .brand-badge {
          display: flex;
          align-items: center;
          gap: 9px;
        }

        .brand-badge.clickable {
          cursor: pointer;
          user-select: none;
        }

        .brand-logo-img {
          width: 26px;
          height: 26px;
          object-fit: contain;
          filter: drop-shadow(0 2px 7px rgba(56, 189, 248, 0.45));
          transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), filter 0.2s ease;
          user-select: none;
          -webkit-user-drag: none;
        }

        .brand-badge:hover .brand-logo-img {
          transform: scale(1.1) rotate(-3deg);
          filter: drop-shadow(0 3px 12px rgba(168, 85, 247, 0.65));
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
          left: 0;
          right: 0;
          margin-left: auto;
          margin-right: auto;
          top: 6px;
          height: 36px;
          width: 100%;
          max-width: 500px;
          min-width: 140px;
          pointer-events: auto;
          z-index: 10;
        }

        @media (max-width: 1100px) {
          .topbar-center {
            max-width: 420px;
          }
        }

        @media (max-width: 960px) {
          .topbar-center {
            max-width: 320px;
          }
        }

        .search-bar-container {
          display: flex;
          align-items: center;
          height: 36px;
          width: 100%;
          box-sizing: border-box;
          background: #111726;
          border: 1px solid #1f2c42;
          border-radius: 8px;
          padding: 0 12px;
          transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
        }

        .search-bar-container:hover {
          border-color: #2b3d5b;
        }

        .search-bar-container:focus-within {
          border-color: #6366f1;
          box-shadow: 0 0 0 1px #6366f1, 0 0 14px rgba(99, 102, 241, 0.18);
          background: #131b2e;
        }

        .search-icon {
          color: #64748b;
          margin-right: 8px;
          flex-shrink: 0;
        }

        .search-input {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          color: #f1f5f9;
          font-size: 12.5px;
          font-family: inherit;
          min-width: 0;
        }

        .search-input::placeholder {
          color: #55657e;
        }

        .search-shortcut {
          display: flex;
          align-items: center;
          gap: 3px;
          user-select: none;
          flex-shrink: 0;
        }

        .search-shortcut kbd {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          height: 18px;
          min-width: 16px;
          padding: 0 5px;
          font-size: 9.5px;
          font-weight: 600;
          color: #7b8ea6;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.09);
          border-radius: 4px;
          line-height: 1;
        }

        @media (max-width: 950px) {
          .search-shortcut {
            display: none;
          }
        }

        .search-clear-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          color: #7b8ea6;
          padding: 3px;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.15s ease;
          flex-shrink: 0;
        }

        .search-clear-btn:hover {
          color: #f1f5f9;
          background: #1e2a42;
        }
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

        .icon-button.active {
          background: rgba(99, 102, 241, 0.18);
          color: #a5b4fc;
          border-color: rgba(99, 102, 241, 0.4);
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
          top: calc(100% + 6px);
          left: 0;
          right: 0;
          width: 100%;
          box-sizing: border-box;
          background: #0d1322;
          border: 1px solid #1f2c42;
          border-radius: 8px;
          box-shadow: 0 16px 44px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(99, 102, 241, 0.12);
          z-index: 1000;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          animation: popoverSlideIn 0.12s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          text-rendering: optimizeLegibility;
        }

        @keyframes popoverSlideIn {
          from {
            opacity: 0;
            transform: translateY(-4px);
          }
          to {
            opacity: 1;
            transform: none;
          }
        }

        .popover-filter-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 34px;
          min-height: 34px;
          max-height: 34px;
          box-sizing: border-box;
          padding: 0 10px;
          background: #090e18;
          border-bottom: 1px solid #1a2538;
          gap: 8px;
        }

        .filter-tabs-group {
          display: flex;
          align-items: center;
          gap: 5px;
          height: 100%;
        }

        .filter-tab-pill {
          height: 22px;
          min-height: 22px;
          max-height: 22px;
          box-sizing: border-box;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 0 8px;
          background: #111724;
          border: 1px solid #1d283c;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 500;
          color: #8ea1b8;
          cursor: pointer;
          white-space: nowrap;
          line-height: 1;
          transition: all 0.12s ease;
          user-select: none;
        }

        .filter-tab-pill:hover {
          background: #182235;
          border-color: #2b3b55;
          color: #e2e8f0;
        }

        .filter-tab-pill.active {
          background: rgba(99, 102, 241, 0.18);
          border-color: #6366f1;
          color: #c7d2fe;
        }

        .filter-tab-pill .tab-icon {
          flex-shrink: 0;
          opacity: 0.8;
        }

        .filter-tab-pill.active .tab-icon {
          opacity: 1;
          color: #a5b4fc;
        }

        .tab-pill-count {
          font-size: 10px;
          font-weight: 600;
          color: #64748b;
          background: rgba(255, 255, 255, 0.04);
          padding: 1px 4px;
          border-radius: 3px;
          line-height: 1;
        }

        .filter-tab-pill.active .tab-pill-count {
          color: #818cf8;
          background: rgba(99, 102, 241, 0.2);
        }

        .filter-clear-pill {
          height: 22px;
          min-height: 22px;
          max-height: 22px;
          box-sizing: border-box;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 0 7px;
          background: rgba(239, 68, 68, 0.08);
          border: 1px solid rgba(239, 68, 68, 0.25);
          border-radius: 4px;
          font-size: 10px;
          font-weight: 600;
          color: #f87171;
          cursor: pointer;
          white-space: nowrap;
          line-height: 1;
          transition: all 0.12s ease;
          user-select: none;
        }

        .filter-clear-pill:hover {
          background: rgba(239, 68, 68, 0.18);
          border-color: #ef4444;
          color: #ffffff;
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
        .section-icon.text-indigo { color: #818cf8; }

        .result-item {
          display: flex;
          align-items: center;
          gap: 10px;
          height: 42px;
          min-height: 42px;
          max-height: 42px;
          box-sizing: border-box;
          padding: 0 10px;
          border-radius: 6px;
          cursor: pointer;
          transition: background 0.12s ease, border-color 0.12s ease;
          border: 1px solid transparent;
          overflow: hidden;
        }

        .result-item:hover,
        .result-item.item-active {
          background: #141c2c;
          border-color: #243550;
        }

        .item-icon-wrapper {
          width: 26px;
          height: 26px;
          min-height: 26px;
          max-height: 26px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          border: 1px solid;
          box-sizing: border-box;
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
          background: rgba(245, 158, 11, 0.12);
          border-color: rgba(245, 158, 11, 0.25);
        }

        .item-content {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 2px;
          overflow: hidden;
        }

        .item-title-row {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
          height: 16px;
          max-height: 16px;
          line-height: 1;
          overflow: hidden;
        }

        .item-title {
          font-size: 12px;
          font-weight: 600;
          color: #f1f5f9;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          line-height: 1;
          flex-shrink: 1;
          min-width: 0;
        }

        .item-desc {
          font-size: 11px;
          color: #7d90a6;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          line-height: 1.2;
          height: 14px;
          max-height: 14px;
        }

        .item-transport-pill,
        .item-badge-pill {
          font-size: 8.5px;
          line-height: 1;
          height: 15px;
          min-height: 15px;
          max-height: 15px;
          box-sizing: border-box;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0 5px;
          border-radius: 3px;
          background: #192336;
          border: 1px solid #23344e;
          color: #93c5fd;
          font-weight: 600;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .item-origin-pill {
          font-size: 9px;
          line-height: 1;
          height: 15px;
          min-height: 15px;
          max-height: 15px;
          box-sizing: border-box;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0 5px;
          border-radius: 3px;
          background: #1e1b38;
          border: 1px solid #362d60;
          color: #d8b4fe;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 120px;
          flex-shrink: 0;
        }

        .item-agent-tag {
          font-size: 9px;
          line-height: 1;
          height: 18px;
          min-height: 18px;
          max-height: 18px;
          box-sizing: border-box;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          padding: 0 6px;
          border-radius: 4px;
          border: 1px solid;
          background: rgba(255, 255, 255, 0.03);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 120px;
          flex-shrink: 0;
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
          height: 28px;
          min-height: 28px;
          max-height: 28px;
          box-sizing: border-box;
          padding: 0 12px;
          background: #080c14;
          border-top: 1px solid #1a2538;
          font-size: 10px;
          color: #64748b;
          user-select: none;
        }

        .footer-summary {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 10px;
          color: #64748b;
          line-height: 1;
        }

        .results-indicator-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #10b981;
          box-shadow: 0 0 6px rgba(16, 185, 129, 0.6);
          flex-shrink: 0;
        }

        .filtered-scope-tag {
          color: #818cf8;
          margin-left: 4px;
          font-weight: 600;
          text-transform: uppercase;
          font-size: 9px;
          letter-spacing: 0.04em;
          background: rgba(99, 102, 241, 0.14);
          padding: 1px 4px;
          border-radius: 3px;
        }

        .footer-keys {
          display: flex;
          align-items: center;
          gap: 12px;
          line-height: 1;
        }

        .key-hint {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 10px;
          color: #64748b;
          line-height: 1;
        }

        .key-hint kbd {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          height: 16px;
          min-width: 16px;
          box-sizing: border-box;
          background: #131b2a;
          border: 1px solid #233146;
          padding: 0 4px;
          border-radius: 3px;
          font-size: 9px;
          font-weight: 600;
          color: #94a3b8;
          font-family: var(--font-mono);
          line-height: 1;
        }

        .empty-reset-btn {
          margin-top: 6px;
          height: 24px;
          padding: 0 10px;
          font-size: 11px;
          font-weight: 500;
          color: #a5b4fc;
          background: rgba(99, 102, 241, 0.12);
          border: 1px solid rgba(99, 102, 241, 0.3);
          border-radius: 4px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          transition: all 0.12s ease;
        }

        .empty-reset-btn:hover {
          background: rgba(99, 102, 241, 0.22);
          border-color: #818cf8;
          color: #ffffff;
        }
      `}</style>
    </header>
  );
};

export const TopBar = React.memo(TopBarComponent);
