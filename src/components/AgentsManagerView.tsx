import React, { useState, useEffect, useMemo, useRef, useLayoutEffect, useCallback } from 'react';
import { SupportedAgent } from '../types/agent';
import { 
  Bot, 
  CheckCircle2,
  FolderOpen,
  CheckSquare,
  Square,
  LayoutGrid,
  List as ListIcon,
  ShieldCheck,
} from 'lucide-react';
import { AGENT_ICON_MAP } from './AgentIcon';

interface AgentsManagerViewProps {
  agents: SupportedAgent[];
  onToggleAgent: (id: string) => void;
  onSelectOnly: (id: string) => void;
  onSelectAll?: (select: boolean) => void;
  searchQuery?: string;
  highlightedId?: string | null;
}

const ICON_MAP = AGENT_ICON_MAP;

export const AgentsManagerView: React.FC<AgentsManagerViewProps> = ({
  agents,
  onToggleAgent,
  onSelectOnly,
  onSelectAll,
  searchQuery = '',
  highlightedId,
}) => {
  const activeCount = agents.filter((a) => a.selected).length;
  const allSelected = agents.length > 0 && agents.every((a) => a.selected);
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'standby'>('all');
  const segmentedControlsRef = useRef<HTMLDivElement>(null);
  const isPillAnimatedRef = useRef(false);
  const [segmentPillStyle, setSegmentPillStyle] = useState<{ left: number; width: number; isReady: boolean }>({
    left: 0,
    width: 0,
    isReady: false,
  });

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
  }, [updateSegmentPill, filterStatus, agents.length, activeCount]);

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
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    return (localStorage.getItem('agentforge_view_mode_agents') as 'grid' | 'list') || 'grid';
  });

  const listContainerRef = useRef<HTMLDivElement>(null);
  const prevPositionsRef = useRef<Map<string, DOMRect>>(new Map());
  const prevViewModeRef = useRef(viewMode);
  const prevSearchQueryRef = useRef(searchQuery);
  const prevFilterStatusRef = useRef(filterStatus);

  // Snapshot current visual positions of all cards in the container
  const capturePositions = () => {
    const container = listContainerRef.current;
    if (!container) return;
    const cards = container.querySelectorAll<HTMLElement>('.agent-row-card, .agent-card');
    cards.forEach((card) => {
      if (card.id) {
        prevPositionsRef.current.set(card.id, card.getBoundingClientRect());
      }
    });
  };

  const handleToggleAgentWrapped = (id: string) => {
    capturePositions();
    onToggleAgent(id);
  };

  const handleSelectOnlyWrapped = (id: string) => {
    capturePositions();
    onSelectOnly(id);
  };

  const handleViewModeChange = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    localStorage.setItem('agentforge_view_mode_agents', mode);
  };

  const handleToggleSelectAll = () => {
    capturePositions();
    const nextState = !allSelected;
    if (onSelectAll) {
      onSelectAll(nextState);
    } else {
      agents.forEach((a) => {
        if (nextState ? !a.selected : a.selected) {
          onToggleAgent(a.id);
        }
      });
    }
  };

  // Scroll into view with multi-attempt polling to handle tab transition & render delays
  useEffect(() => {
    if (!highlightedId) return;

    let attempts = 0;
    const maxAttempts = 14;
    const intervalId = setInterval(() => {
      attempts++;
      const el =
        document.getElementById(`agent-${highlightedId}`) ||
        document.querySelector('.item-card-highlighted');

      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        clearInterval(intervalId);
      } else if (attempts >= maxAttempts) {
        clearInterval(intervalId);
      }
    }, 50);

    return () => clearInterval(intervalId);
  }, [highlightedId]);

  const filteredAgents = useMemo(() => {
    let list = agents;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (a) => a.name.toLowerCase().includes(q) || a.tagline.toLowerCase().includes(q)
      );
    }
    if (filterStatus === 'active') {
      list = list.filter((a) => a.selected);
    } else if (filterStatus === 'standby') {
      list = list.filter((a) => !a.selected);
    }
    // Active agents come first, then detected, then alphabetical A-Z
    return [...list].sort((a, b) => {
      if (a.selected !== b.selected) return a.selected ? -1 : 1;
      if (a.detected !== b.detected) return a.detected ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [agents, searchQuery, filterStatus]);

  // Snappy, lightweight FLIP animation:
  // Glides smoothly to top/bottom in 220ms without heavy floating shadows, zIndex wars, or visual crowding.
  useLayoutEffect(() => {
    // If viewMode, searchQuery, or filterStatus changed, snapshot positions and skip transition
    if (
      prevViewModeRef.current !== viewMode ||
      prevSearchQueryRef.current !== searchQuery ||
      prevFilterStatusRef.current !== filterStatus
    ) {
      prevViewModeRef.current = viewMode;
      prevSearchQueryRef.current = searchQuery;
      prevFilterStatusRef.current = filterStatus;
      capturePositions();
      return;
    }

    const container = listContainerRef.current;
    if (!container) return;

    const cards = container.querySelectorAll<HTMLElement>('.agent-row-card, .agent-card');
    if (cards.length === 0) return;

    const newPositions = new Map<string, DOMRect>();
    cards.forEach((card) => {
      if (card.id) {
        newPositions.set(card.id, card.getBoundingClientRect());
      }
    });

    const animatingCards: HTMLElement[] = [];

    cards.forEach((card) => {
      if (!card.id) return;
      const prevRect = prevPositionsRef.current.get(card.id);
      const newRect = newPositions.get(card.id);

      if (prevRect && newRect) {
        const deltaX = prevRect.left - newRect.left;
        const deltaY = prevRect.top - newRect.top;

        // Animate only if displacement is noticeable (> 2px)
        if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
          card.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0)`;
          card.style.transition = 'none';
          animatingCards.push(card);
        }
      }
    });

    if (animatingCards.length > 0) {
      void container.offsetHeight;

      requestAnimationFrame(() => {
        animatingCards.forEach((card) => {
          card.style.transition = 'transform 220ms cubic-bezier(0.16, 1, 0.3, 1)';
          card.style.transform = 'translate3d(0, 0, 0)';

          const cleanup = () => {
            card.style.transition = '';
            card.style.transform = '';
          };

          card.addEventListener(
            'transitionend',
            (e) => {
              if (e.target === card && e.propertyName === 'transform') {
                cleanup();
              }
            },
            { once: true }
          );

          setTimeout(cleanup, 260);
        });
      });
    }

    prevPositionsRef.current = newPositions;
  }, [filteredAgents, viewMode, searchQuery, filterStatus]);

  return (
    <div className="agents-manager-container" ref={listContainerRef}>
      {/* Header */}
      <div className="agents-manager-header">
        <div>
          <div className="header-title-line">
            <h2 className="view-title">Connected AI Agents</h2>
            <span className="active-pill font-mono">
              {activeCount} ACTIVE TARGETS
            </span>
          </div>
          <p className="view-desc">
            Select one or multiple target agents. Skills, MCP servers, and context bundles will install directly into their respective configuration folders.
          </p>
        </div>

        <div className="header-actions">
          {/* Status Filter Tabs */}
          <div className="segmented-controls font-mono" ref={segmentedControlsRef} role="group" aria-label="Filter agents">
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
              type="button"
              className={`segment-btn ${filterStatus === 'all' ? 'active' : ''}`}
              onClick={() => setFilterStatus('all')}
              title="Show all agents"
            >
              <span>All</span>
              <span className="segment-count">{agents.length}</span>
            </button>
            <button
              type="button"
              className={`segment-btn ${filterStatus === 'active' ? 'active' : ''}`}
              onClick={() => setFilterStatus('active')}
              title="Show only active targets"
            >
              <span>Active</span>
              <span className="segment-count">{activeCount}</span>
            </button>
            <button
              type="button"
              className={`segment-btn ${filterStatus === 'standby' ? 'active' : ''}`}
              onClick={() => setFilterStatus('standby')}
              title="Show standby agents"
            >
              <span>Standby</span>
              <span className="segment-count">{agents.length - activeCount}</span>
            </button>
          </div>

          {/* Select All */}
          <button 
            type="button"
            className={`select-all-btn ${allSelected ? 'deselect-mode' : 'select-mode'}`}
            onClick={handleToggleSelectAll}
            title={allSelected ? 'Deselect all target agents' : 'Select all target agents'}
          >
            <span className="btn-icon-swap" key={allSelected ? 'icon-deselect' : 'icon-select'}>
              {allSelected ? <Square size={13} className="btn-icon" /> : <CheckSquare size={13} className="btn-icon" />}
            </span>
            <span className="btn-text-swap" key={allSelected ? 'text-deselect' : 'text-select'}>
              {allSelected ? 'Deselect All' : 'Select All'}
            </span>
          </button>

          {/* View Mode Toggle */}
          <div className="view-mode-toggle font-mono" role="group" aria-label="View mode">
            <button
              type="button"
              className={`view-mode-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => handleViewModeChange('grid')}
              title="Grid View"
              aria-label="Grid View"
            >
              <LayoutGrid size={13} />
            </button>
            <button
              type="button"
              className={`view-mode-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => handleViewModeChange('list')}
              title="List View"
              aria-label="List View"
            >
              <ListIcon size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* Agents List / Grid */}
      {filteredAgents.length === 0 ? (
        <div key={`${filterStatus}-empty`} className="empty-agents-card segment-content-animated">
          <div className="empty-icon-wrap">
            <Bot size={28} />
          </div>
          <div className="empty-title">
            {searchQuery
              ? 'No matching agents found'
              : filterStatus === 'active'
              ? 'No active target agents'
              : 'No standby agents'}
          </div>
          <div className="empty-desc">
            {searchQuery
              ? `No agents match "${searchQuery}". Try a different search term.`
              : filterStatus === 'active'
              ? 'Enable one or more agents using the toggles to designate them as targets.'
              : 'All supported agents are currently marked as active targets.'}
          </div>
          {filterStatus !== 'all' && (
            <button
              type="button"
              className="empty-reset-filter-btn font-mono"
              onClick={() => setFilterStatus('all')}
            >
              Show All Agents
            </button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        <div key={`${filterStatus}-grid`} className="agents-cards-grid segment-content-animated">
          {filteredAgents.map((agent) => {
          const Icon = ICON_MAP[agent.id] || ICON_MAP[agent.iconName] || Bot;
          const isSelected = agent.selected;

            return (
              <div
                key={agent.id}
                id={`agent-${agent.id}`}
                className={`agent-card ${isSelected ? 'agent-card-selected' : ''} ${highlightedId === agent.id ? 'item-card-highlighted' : ''}`}
              >
              {/* Card Top */}
              <div className="agent-card-header">
                <div className="agent-avatar-group">
                  <div
                    className="agent-avatar"
                    style={{ color: agent.color, background: `${agent.color}18`, borderColor: `${agent.color}35` }}
                  >
                    <Icon size={20} />
                  </div>
                  <div>
                    <div className="agent-title-row">
                      <span className="agent-name">{agent.name}</span>
                      {agent.detected ? (
                        <span className="status-badge detected font-mono">
                          <CheckCircle2 size={10} />
                          DETECTED
                        </span>
                      ) : (
                        <span className="status-badge standby font-mono">STANDBY</span>
                      )}
                    </div>
                    <span className="agent-tagline">{agent.tagline}</span>
                  </div>
                </div>

                <label className="toggle-switch" title={isSelected ? 'Disable as target' : 'Enable as target'}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleToggleAgentWrapped(agent.id)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              {/* Configuration Paths */}
              {(() => {
                const effectiveBase = agent.resolvedPaths?.baseDir || agent.paths.baseDir;
                const effectiveSkills = agent.resolvedPaths?.skillsDir || agent.paths.skillsDir;
                const effectiveMcp = agent.resolvedPaths?.mcpConfigPath || agent.paths.mcpConfigPath;
                const effectiveRules = agent.resolvedPaths?.rulesPath || agent.paths.rulesPath;
                const effectivePlugins = agent.resolvedPaths?.pluginsDir || agent.paths.pluginsDir;

                return (
                  <>
                    <div className="agent-paths-section">
                      <div className="path-row">
                        <span className="path-label font-mono">BASE DIR:</span>
                        <span className="path-value font-mono" title={effectiveBase}>
                          {effectiveBase}
                        </span>
                        <button
                          type="button"
                          className="path-open-btn"
                          onClick={() => window.electronAPI?.openPath(effectiveBase)}
                          title={`Open ${effectiveBase} in File Explorer`}
                        >
                          <FolderOpen size={11} />
                        </button>
                      </div>
                      <div className="path-row">
                        <span className="path-label font-mono">SKILLS DIR:</span>
                        <span className="path-value font-mono" title={effectiveSkills}>
                          {effectiveSkills}
                        </span>
                        <button
                          type="button"
                          className="path-open-btn"
                          onClick={() => window.electronAPI?.openPath(effectiveSkills)}
                          title={`Open ${effectiveSkills} in File Explorer`}
                        >
                          <FolderOpen size={11} />
                        </button>
                      </div>
                      <div className="path-row">
                        <span className="path-label font-mono">MCP CONFIG:</span>
                        <span className="path-value font-mono" title={effectiveMcp}>
                          {effectiveMcp}
                        </span>
                        <button
                          type="button"
                          className="path-open-btn"
                          onClick={() => window.electronAPI?.openPath(effectiveMcp)}
                          title={`Open ${effectiveMcp} in File Explorer`}
                        >
                          <FolderOpen size={11} />
                        </button>
                      </div>
                      <div className="path-row">
                        <span className="path-label font-mono">RULES PATH:</span>
                        <span className="path-value font-mono" title={effectiveRules}>
                          {effectiveRules}
                        </span>
                        <button
                          type="button"
                          className="path-open-btn"
                          onClick={() => window.electronAPI?.openPath(effectiveRules)}
                          title={`Open ${effectiveRules} in File Explorer`}
                        >
                          <FolderOpen size={11} />
                        </button>
                      </div>
                      <div className="path-row">
                        <span className="path-label font-mono">PLUGINS:</span>
                        <span className="path-value font-mono" title={effectivePlugins}>
                          {effectivePlugins}
                        </span>
                        <button
                          type="button"
                          className="path-open-btn"
                          onClick={() => window.electronAPI?.openPath(effectivePlugins)}
                          title={`Open ${effectivePlugins} in File Explorer`}
                        >
                          <FolderOpen size={11} />
                        </button>
                      </div>
                    </div>

                    {/* Card Footer */}
                    <div className="agent-card-footer">
                      <div className="agent-stats font-mono">
                        <span>{agent.installedCounts.skills} Skills</span>
                        <span className="divider">•</span>
                        <span>{agent.installedCounts.mcps} MCPs</span>
                        <span className="divider">•</span>
                        <span>{agent.installedCounts.rules} Rules</span>
                      </div>

                      <div className="card-actions">
                        <button
                          type="button"
                          className="open-folder-btn font-mono"
                          onClick={() => window.electronAPI?.openPath(effectiveBase)}
                          title={`Open ${agent.name} folder in File Explorer`}
                        >
                          <FolderOpen size={12} />
                          <span>Open Folder</span>
                        </button>
                        <button
                          className="select-only-btn font-mono"
                          onClick={() => handleSelectOnlyWrapped(agent.id)}
                        >
                          Target Only
                        </button>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          );
        })}
      </div>
    ) : (
      <div key={`${filterStatus}-list`} className="agents-cards-list segment-content-animated">
        <div className="agents-list-header font-mono">
          <span className="col-identity">AGENT & IDENTITY</span>
          <span className="col-paths">BASE DIRECTORY</span>
          <span className="col-stats">CAPABILITIES</span>
          <span className="col-status">TARGET STATUS</span>
          <span className="col-actions right">ACTIONS</span>
        </div>
        {filteredAgents.map((agent) => {
          const Icon = ICON_MAP[agent.id] || ICON_MAP[agent.iconName] || Bot;
          const isSelected = agent.selected;
          const effectiveBase = agent.resolvedPaths?.baseDir || agent.paths.baseDir;

          return (
            <div
              key={agent.id}
              id={`agent-${agent.id}`}
              className={`agent-row-card ${isSelected ? 'agent-card-selected' : ''} ${highlightedId === agent.id ? 'item-card-highlighted' : ''}`}
            >
              {/* Identity Col */}
              <div className="list-col col-identity">
                <div
                  className="card-icon-avatar list-avatar"
                  style={{ color: agent.color, background: `${agent.color}18`, borderColor: `${agent.color}35` }}
                >
                  <Icon size={16} />
                </div>
                <div className="list-identity-text">
                  <div className="list-title-row">
                    <span className="card-item-name" title={agent.name}>{agent.name}</span>
                    {agent.detected ? (
                      <span className="status-badge detected font-mono">
                        <CheckCircle2 size={10} />
                        DETECTED
                      </span>
                    ) : (
                      <span className="status-badge standby font-mono">STANDBY</span>
                    )}
                  </div>
                  <span className="list-description-snippet" title={agent.tagline}>{agent.tagline}</span>
                </div>
              </div>

              {/* Paths Col */}
              <div className="list-col col-paths">
                <div
                  className="path-row-compact"
                  title={`Open folder: ${effectiveBase}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    window.electronAPI?.openPath(effectiveBase);
                  }}
                >
                  <FolderOpen size={11} className="path-icon" />
                  <span className="path-value font-mono">
                    {effectiveBase}
                  </span>
                </div>
              </div>

              {/* Stats Col */}
              <div className="list-col col-stats">
                <div className="agent-stats font-mono">
                  <span className="agent-stat-pill font-mono">{agent.installedCounts.skills} Skills</span>
                  <span className="agent-stat-pill font-mono">{agent.installedCounts.mcps} MCPs</span>
                  <span className="agent-stat-pill font-mono">{agent.installedCounts.rules} Rules</span>
                </div>
              </div>

              {/* Status / Toggle Col */}
              <div className="list-col col-status">
                <div className="toggle-switch-wrapper">
                  <label className="toggle-switch" title={isSelected ? 'Disable as target' : 'Enable as target'}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleAgentWrapped(agent.id)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                  <span className={`toggle-status-label font-mono ${isSelected ? 'active' : 'standby'}`}>
                    {isSelected ? 'ACTIVE' : 'STANDBY'}
                  </span>
                </div>
              </div>

              {/* Actions Col */}
              <div className="list-col col-actions right">
                <button
                  type="button"
                  className="card-action-icon-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.electronAPI?.openPath(effectiveBase);
                  }}
                  title={`Open ${agent.name} folder (${effectiveBase}) in File Explorer`}
                  aria-label="Open folder"
                >
                  <FolderOpen size={12} />
                </button>
                <button
                  type="button"
                  className={`select-only-btn font-mono ${isSelected ? 'active-target' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectOnlyWrapped(agent.id);
                  }}
                  title={`Target exclusively ${agent.name}`}
                >
                  Target Only
                </button>
              </div>
            </div>
          );
        })}
      </div>
    )}

      {/* Nominative Fair Use & Trademark Disclaimer Banner */}
      <div className="agents-trademark-banner">
        <ShieldCheck size={14} className="trademark-banner-icon" />
        <span>
          AgentForge is an independent workspace utility. Claude, Cursor, Windsurf, Google Antigravity / Gemini, GitHub Copilot, Codex, and other agent marks are trademarks™ of their respective holders. Logos are displayed under nominative fair use solely to identify local compatibility targets.
        </span>
      </div>

      <style>{`
        .agents-manager-container {
          container-type: inline-size;
          container-name: agentsmanager;
          display: flex;
          flex-direction: column;
          gap: 18px;
          width: 100%;
          min-width: 0;
          box-sizing: border-box;
        }

        .agents-trademark-banner {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 18px;
          background: rgba(15, 21, 35, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 9px;
          font-size: 11.5px;
          color: #64748b;
          line-height: 1.5;
          margin-top: 8px;
        }

        .trademark-banner-icon {
          flex-shrink: 0;
          color: #8b5cf6;
        }

        .agents-manager-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #121826;
          border: 1px solid #1e283d;
          border-radius: 9px;
          padding: 10px 16px;
          gap: 12px;
          flex-wrap: wrap;
          width: 100%;
          min-width: 0;
          box-sizing: border-box;
          margin-bottom: 12px;
        }

        @media (max-width: 1080px) {
          .agents-manager-header .view-desc {
            display: none !important;
          }
        }

        .header-title-line {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 4px;
          flex-wrap: wrap;
        }

        .view-title {
          font-size: 16px;
          font-weight: 700;
          color: #f8fafc;
        }

        .active-pill {
          font-size: 10px;
          font-weight: 700;
          color: #c084fc;
          background: rgba(168, 85, 247, 0.15);
          padding: 2px 8px;
          border-radius: 4px;
          border: 1px solid rgba(168, 85, 247, 0.32);
        }

        .view-desc {
          font-size: 12px;
          color: #94a3b8;
          max-width: 650px;
          line-height: 1.4;
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

        .resort-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          height: 28px;
          padding: 0 9px;
          font-size: 10.5px;
          font-weight: 600;
          color: #94a3b8;
          background: #141b2a;
          border: 1px solid #1f2b42;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s ease;
          user-select: none;
          white-space: nowrap;
        }

        .resort-btn:hover {
          background: #1c263b;
          border-color: #2e3e5c;
          color: #f1f5f9;
        }

        .empty-reset-filter-btn {
          margin-top: 10px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          color: #c084fc;
          background: rgba(139, 92, 246, 0.1);
          border: 1px solid rgba(139, 92, 246, 0.25);
          border-radius: 5px;
          padding: 5px 12px;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .empty-reset-filter-btn:hover {
          background: rgba(139, 92, 246, 0.2);
          border-color: rgba(139, 92, 246, 0.4);
        }

        .select-all-btn {
          background: #182032;
          border: 1px solid #22304a;
          color: #cbd5e1;
          font-size: 11px;
          font-weight: 600;
          height: 28px;
          width: 112px;
          padding: 0;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          box-sizing: border-box;
          user-select: none;
        }

        .select-all-btn:hover {
          background: #202b42;
          border-color: #334466;
          color: #ffffff;
          transform: translateY(-1px);
        }

        .select-all-btn:active {
          transform: scale(0.95);
        }

        .select-all-btn.select-mode:hover {
          box-shadow: 0 0 14px rgba(99, 102, 241, 0.18);
        }

        .select-all-btn.deselect-mode {
          background: rgba(99, 102, 241, 0.12);
          border-color: rgba(99, 102, 241, 0.35);
          color: #c7d2fe;
        }

        .select-all-btn.deselect-mode:hover {
          background: rgba(239, 68, 68, 0.12);
          border-color: rgba(239, 68, 68, 0.38);
          color: #fca5a5;
          box-shadow: 0 0 14px rgba(239, 68, 68, 0.18);
        }

        .btn-icon-swap,
        .btn-text-swap {
          display: inline-flex;
          align-items: center;
          animation: btnFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        @keyframes btnFadeIn {
          0% {
            opacity: 0;
            transform: translateY(2px) scale(0.96);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .header-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .view-mode-toggle {
          display: inline-flex;
          align-items: center;
          background: #090d16;
          border: 1px solid #1c263c;
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
          color: #94a3b8;
          background: rgba(255, 255, 255, 0.05);
        }

        .view-mode-btn.active {
          background: #1e293b;
          color: #38bdf8;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
        }

        /* Agents List View */
        .agents-cards-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
          width: 100%;
          min-width: 0;
          box-sizing: border-box;
        }

        .agents-list-header {
          display: grid;
          grid-template-columns: minmax(0, 1.4fr) minmax(0, 1.6fr) minmax(0, 1.1fr) auto auto;
          gap: 12px;
          padding: 6px 14px;
          font-size: 10px;
          font-weight: 600;
          color: #64748b;
          letter-spacing: 0.05em;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          align-items: center;
          width: 100%;
          min-width: 0;
          box-sizing: border-box;
        }

        .agents-list-header .right {
          text-align: right;
        }

        .agent-row-card {
          position: relative;
          background: #121826;
          border: 1px solid #1e283d;
          border-radius: 9px;
          padding: 8px 14px;
          display: grid;
          grid-template-columns: minmax(0, 1.4fr) minmax(0, 1.6fr) minmax(0, 1.1fr) auto auto;
          gap: 12px;
          align-items: center;
          width: 100%;
          min-width: 0;
          box-sizing: border-box;
          overflow: hidden;
          transition: border-color 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease;
        }

        .agent-row-card:hover {
          border-color: #2b3a56;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
          background: #141b2c;
        }

        .agent-row-card.agent-card-selected {
          border-color: rgba(56, 189, 248, 0.45);
          background: #131a2b;
          box-shadow: 0 0 16px -4px rgba(56, 189, 248, 0.12);
        }

        .list-col {
          display: flex;
          align-items: center;
          min-width: 0;
          overflow: hidden;
        }

        .list-col.col-identity {
          gap: 10px;
          min-width: 0;
        }

        .list-avatar {
          width: 30px;
          height: 30px;
          border-radius: 7px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          border: 1px solid;
        }

        .list-identity-text {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
          overflow: hidden;
        }

        .list-title-row {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
          white-space: nowrap;
        }

        .card-item-name {
          font-size: 13px;
          font-weight: 700;
          color: #f8fafc;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .list-description-snippet {
          font-size: 10.5px;
          color: #7d90a6;
          margin: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .path-row-compact {
          display: flex;
          align-items: center;
          gap: 6px;
          background: rgba(0, 0, 0, 0.35);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 5px;
          padding: 3px 8px;
          height: 24px;
          min-width: 0;
          width: 100%;
          box-sizing: border-box;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .path-row-compact:hover {
          background: rgba(0, 0, 0, 0.5);
          border-color: rgba(56, 189, 248, 0.3);
        }

        .path-row-compact .path-icon {
          color: #64748b;
          flex-shrink: 0;
          transition: color 0.15s ease;
        }

        .path-row-compact:hover .path-icon {
          color: #38bdf8;
        }

        .path-row-compact .path-value {
          font-size: 10.5px;
          color: #7d90a6;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          flex: 1;
          min-width: 0;
          letter-spacing: -0.01em;
          transition: color 0.15s ease;
        }

        .path-row-compact:hover .path-value {
          color: #e2e8f0;
        }

        .col-stats .agent-stats {
          display: flex;
          align-items: center;
          gap: 4px;
          min-width: 0;
          overflow: hidden;
        }

        .agent-stat-pill {
          display: inline-flex;
          align-items: center;
          font-size: 9.5px;
          font-weight: 600;
          color: #7d90a6;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 4px;
          padding: 2px 6px;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .toggle-switch-wrapper {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }

        .toggle-switch-labeled {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          user-select: none;
        }

        .toggle-status-label {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.05em;
        }

        .toggle-status-label.active {
          color: #38bdf8;
        }

        .toggle-status-label.standby {
          color: #64748b;
        }

        .list-col.col-status {
          flex-shrink: 0;
          justify-content: flex-start;
          min-width: 90px;
        }

        .list-col.col-actions {
          justify-content: flex-end;
          gap: 6px;
          flex-shrink: 0;
          min-width: 108px;
        }

        .card-action-icon-btn {
          width: 26px;
          height: 26px;
          border-radius: 5px;
          background: #141b2a;
          border: 1px solid #1f2b42;
          color: #818cf8;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex-shrink: 0;
          box-sizing: border-box;
          transition: all 0.15s ease;
          padding: 0;
        }

        .card-action-icon-btn:hover {
          background: rgba(129, 140, 248, 0.15);
          border-color: rgba(129, 140, 248, 0.4);
          color: #a5b4fc;
        }

        @container agentsmanager (max-width: 860px) {
          .agents-list-header {
            grid-template-columns: minmax(0, 1.3fr) minmax(0, 1.4fr) minmax(0, 0.9fr) auto auto;
            gap: 8px;
            padding: 6px 10px;
          }

          .agent-row-card {
            grid-template-columns: minmax(0, 1.3fr) minmax(0, 1.4fr) minmax(0, 0.9fr) auto auto;
            gap: 8px;
            padding: 8px 10px;
          }

          .agent-stat-pill {
            padding: 2px 4px;
            font-size: 9px;
          }

          .list-col.col-status {
            min-width: auto;
          }

          .list-col.col-actions {
            min-width: auto;
            gap: 4px;
          }

          .select-only-btn {
            padding: 3px 7px;
            font-size: 9px;
          }
        }

        @container agentsmanager (max-width: 730px) {
          .agents-list-header {
            display: none;
          }

          .agent-row-card {
            display: grid;
            grid-template-columns: 1fr auto auto;
            grid-template-rows: auto auto;
            grid-template-areas:
              "identity status actions"
              "paths paths stats";
            gap: 8px 10px;
            padding: 10px 12px;
          }

          .list-col.col-identity {
            grid-area: identity;
          }

          .list-col.col-status {
            grid-area: status;
            justify-content: flex-end;
          }

          .list-col.col-actions {
            grid-area: actions;
            justify-content: flex-end;
          }

          .list-col.col-paths {
            grid-area: paths;
          }

          .list-col.col-stats {
            grid-area: stats;
            justify-content: flex-end;
          }

          .col-stats .agent-stats {
            justify-content: flex-end;
          }
        }

        @container agentsmanager (max-width: 480px) {
          .agent-row-card {
            grid-template-columns: 1fr auto;
            grid-template-areas:
              "identity actions"
              "status status"
              "paths paths"
              "stats stats";
            gap: 8px 8px;
          }

          .list-col.col-status {
            justify-content: flex-start;
          }

          .list-col.col-stats {
            justify-content: flex-start;
          }

          .col-stats .agent-stats {
            justify-content: flex-start;
          }
        }

        @container agentsmanager (max-width: 700px) {
          .agents-cards-grid {
            grid-template-columns: 1fr;
          }
        }

        .agents-cards-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 14px;
        }

        .agent-card {
          background: #121826;
          border: 1px solid #1e283d;
          border-radius: 10px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          transition: all 0.15s ease;
        }

        .agent-card:hover {
          border-color: #2b3a56;
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3);
          transform: translateY(-1px);
        }

        .agent-card-selected {
          border-color: rgba(59, 130, 246, 0.4);
          background: #131a2b;
        }

        .agent-card-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
        }

        .agent-avatar-group {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .agent-avatar {
          width: 38px;
          height: 38px;
          border-radius: 9px;
          border: 1px solid transparent;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .agent-title-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .agent-name {
          font-size: 14px;
          font-weight: 700;
          color: #f8fafc;
        }

        .status-badge {
          font-size: 9px;
          font-weight: 700;
          padding: 1px 6px;
          border-radius: 4px;
          display: inline-flex;
          align-items: center;
          gap: 3px;
        }

        .status-badge.detected {
          color: #10b981;
          background: rgba(16, 185, 129, 0.12);
          border: 1px solid rgba(16, 185, 129, 0.25);
        }

        .status-badge.standby {
          color: #64748b;
          background: rgba(100, 116, 139, 0.1);
          border: 1px solid rgba(100, 116, 139, 0.2);
        }

        .agent-tagline {
          font-size: 11px;
          color: #8899ac;
          display: block;
          margin-top: 1px;
        }

        /* Toggle Switch */
        .toggle-switch {
          position: relative;
          display: inline-block;
          width: 36px;
          height: 20px;
          flex-shrink: 0;
        }

        .toggle-switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }

        .toggle-slider {
          position: absolute;
          cursor: pointer;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: #1e293b;
          transition: 0.2s;
          border-radius: 20px;
          border: 1px solid #334155;
        }

        .toggle-slider:before {
          position: absolute;
          content: "";
          height: 14px;
          width: 14px;
          left: 2px;
          bottom: 2px;
          background-color: #94a3b8;
          transition: 0.2s;
          border-radius: 50%;
        }

        .toggle-switch input:checked + .toggle-slider {
          background-color: #8b5cf6;
          border-color: #8b5cf6;
        }

        .toggle-switch input:checked + .toggle-slider:before {
          transform: translateX(16px);
          background-color: #ffffff;
        }

        /* Paths Section */
        .agent-paths-section {
          background: #090d16;
          border: 1px solid #1a2336;
          border-radius: 7px;
          padding: 8px 10px;
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .path-row {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 10.5px;
        }

        .path-label {
          color: #475569;
          font-weight: 700;
          width: 80px;
          flex-shrink: 0;
        }

        .path-value {
          color: #94a3b8;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          flex: 1;
        }

        .path-open-btn {
          background: transparent;
          border: none;
          color: #475569;
          cursor: pointer;
          padding: 2px 4px;
          border-radius: 4px;
          display: inline-flex;
          align-items: center;
          opacity: 0.6;
          transition: all 0.15s ease;
        }

        .path-row:hover .path-open-btn {
          opacity: 1;
          color: #818cf8;
        }

        .path-open-btn:hover {
          background: rgba(129, 140, 248, 0.15);
          color: #a5b4fc;
        }

        /* Footer */
        .agent-card-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-top: 6px;
          border-top: 1px solid #182236;
          margin-top: auto;
        }

        .agent-stats {
          font-size: 11px;
          color: #64748b;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .divider {
          color: #334155;
        }

        .card-actions {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .open-folder-btn {
          background: #141b2a;
          border: 1px solid #1f2b42;
          color: #818cf8;
          font-size: 11px;
          font-weight: 600;
          height: 26px;
          padding: 0 9px;
          border-radius: 5px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          box-sizing: border-box;
          transition: all 0.15s ease;
        }

        .open-folder-btn:hover {
          background: rgba(129, 140, 248, 0.12);
          border-color: rgba(129, 140, 248, 0.35);
          color: #a5b4fc;
        }

        .select-only-btn {
          background: transparent;
          border: 1px solid #22304a;
          color: #818cf8;
          font-size: 11px;
          font-weight: 600;
          height: 26px;
          padding: 0 9px;
          border-radius: 5px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          box-sizing: border-box;
          transition: all 0.15s ease;
        }

        .select-only-btn:hover {
          background: rgba(129, 140, 248, 0.12);
          border-color: #818cf8;
        }

        .select-only-btn.active-target {
          background: rgba(56, 189, 248, 0.1);
          border-color: rgba(56, 189, 248, 0.35);
          color: #38bdf8;
        }

        .empty-agents-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 60px 20px;
          background: #111726;
          border: 1px dashed #1e283d;
          border-radius: 12px;
          text-align: center;
          color: #8899ac;
          gap: 12px;
          margin-top: 10px;
        }

        .empty-agents-card .empty-icon-wrap {
          width: 52px;
          height: 52px;
          border-radius: 12px;
          background: #162035;
          border: 1px solid #223250;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #818cf8;
        }

        .empty-agents-card .empty-title {
          font-size: 15px;
          font-weight: 700;
          color: #f1f5f9;
        }

        .empty-agents-card .empty-desc {
          font-size: 12.5px;
          color: #7d90a6;
          max-width: 360px;
          line-height: 1.45;
        }

        /* Highlighted Agent Card with genuine GPU animated fade-out */
        .agent-card.item-card-highlighted,
        .agent-row-card.item-card-highlighted,
        .item-card-highlighted {
          position: relative;
          z-index: 10;
          animation: highlightAgentBorder 2.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        .agent-card.item-card-highlighted > *,
        .agent-row-card.item-card-highlighted > *,
        .item-card-highlighted > * {
          position: relative;
          z-index: 1;
        }

        .agent-card.item-card-highlighted::before,
        .agent-row-card.item-card-highlighted::before,
        .item-card-highlighted::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: linear-gradient(135deg, rgba(96, 165, 250, 0.09), rgba(59, 130, 246, 0.03));
          pointer-events: none;
          z-index: 0;
          animation: highlightAgentOverlay 2.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        @keyframes highlightAgentBorder {
          0% {
            border-color: rgba(59, 130, 246, 0.85);
            box-shadow: 0 0 20px rgba(59, 130, 246, 0.4);
          }
          20% {
            border-color: rgba(59, 130, 246, 0.8);
            box-shadow: 0 0 16px rgba(59, 130, 246, 0.3);
          }
          45% {
            border-color: rgba(59, 130, 246, 0.6);
            box-shadow: 0 0 12px rgba(59, 130, 246, 0.2);
          }
          70% {
            border-color: rgba(59, 130, 246, 0.3);
            box-shadow: 0 0 8px rgba(59, 130, 246, 0.1);
          }
          100% {
            border-color: rgba(255, 255, 255, 0.07);
            box-shadow: none;
          }
        }

        @keyframes highlightAgentOverlay {
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
      `}</style>
    </div>
  );
};
