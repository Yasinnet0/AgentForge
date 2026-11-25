import React, { useState, useRef, useEffect, useCallback, useMemo, startTransition } from 'react';
import { SupportedAgent } from '../types/agent';
import { ChevronDown, Check, Bot } from 'lucide-react';
import { AGENT_ICON_MAP } from './AgentIcon';

interface AgentSelectorDropdownProps {
  agents: SupportedAgent[];
  onToggleAgent: (id: string) => void;
  onSelectOnly: (id: string) => void;
}

const ICON_MAP = AGENT_ICON_MAP;

interface AgentRowProps {
  agent: SupportedAgent;
  onToggle: (id: string) => void;
  onOnly: (id: string) => void;
}

const AgentRow = React.memo<AgentRowProps>(({ agent, onToggle, onOnly }) => {
  const Icon = ICON_MAP[agent.id] || ICON_MAP[agent.iconName] || Bot;
  const effectiveBase = agent.resolvedPaths?.baseDir || agent.paths.baseDir;

  return (
    <div
      className={`agent-dropdown-row ${agent.selected ? 'selected' : ''}`}
      onClick={() => onToggle(agent.id)}
    >
      <div
        className={`custom-checkbox ${agent.selected ? 'checked' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          onToggle(agent.id);
        }}
      >
        {agent.selected && <Check size={11} strokeWidth={2.8} />}
      </div>

      <div
        className="agent-icon-pill"
        style={{
          color: agent.color,
          background: `${agent.color}16`,
          border: `1px solid ${agent.color}38`,
        }}
      >
        <Icon size={14} />
      </div>

      <div className="agent-row-info">
        <div className="agent-row-name-line">
          <span className="agent-row-name" title={agent.name}>{agent.name}</span>
          {agent.detected && (
            <span className="detected-pill" title="Installed and detected on this machine">
              <span className="detected-indicator" />
              <span>Detected</span>
            </span>
          )}
        </div>
        <span className="agent-row-path font-mono" title={effectiveBase}>{effectiveBase}</span>
      </div>

      <button
        type="button"
        className="only-btn font-mono"
        onClick={(e) => {
          e.stopPropagation();
          onOnly(agent.id);
        }}
        title={`Select only ${agent.name}`}
      >
        Only
      </button>
    </div>
  );
}, (prev, next) => {
  return (
    prev.agent.id === next.agent.id &&
    prev.agent.selected === next.agent.selected &&
    prev.agent.detected === next.agent.detected &&
    prev.agent.paths.baseDir === next.agent.paths.baseDir &&
    prev.agent.color === next.agent.color
  );
});

const AgentSelectorDropdownComponent: React.FC<AgentSelectorDropdownProps> = ({
  agents,
  onToggleAgent,
  onSelectOnly,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isOpenRef = useRef(false);
  const isClosingRef = useRef(false);

  // Optimistic local state: updates instantly in 0ms without waiting for heavy background tree renders
  const [localAgents, setLocalAgents] = useState<SupportedAgent[]>(agents);
  const syncTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isPendingSyncRef = useRef(false);
  const pendingQueueRef = useRef<string[]>([]);

  useEffect(() => {
    if (!isPendingSyncRef.current) {
      setLocalAgents((prev) => {
        if (
          prev.length === agents.length &&
          prev.every(
            (p, i) =>
              p.id === agents[i].id &&
              p.selected === agents[i].selected &&
              p.detected === agents[i].detected
          )
        ) {
          return prev;
        }
        return agents;
      });
    }
  }, [agents]);

  useEffect(() => {
    isOpenRef.current = isOpen;
    isClosingRef.current = isClosing;
  }, [isOpen, isClosing]);

  const flushPending = useCallback(() => {
    if (pendingQueueRef.current.length === 0) return;
    const queue = [...new Set(pendingQueueRef.current)];
    pendingQueueRef.current = [];
    isPendingSyncRef.current = false;
    startTransition(() => {
      for (const id of queue) {
        onToggleAgent(id);
      }
    });
  }, [onToggleAgent]);

  useEffect(() => {
    return () => {
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
      }
    };
  }, []);

  const openDropdown = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setIsClosing(false);
    setIsOpen(true);
  };

  const closeDropdown = () => {
    if (!isOpenRef.current || isClosingRef.current) return;
    setIsClosing(true);
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }
    flushPending();
    closeTimerRef.current = setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
      closeTimerRef.current = null;
    }, 180);
  };

  const toggleDropdown = () => {
    if (isOpen) {
      closeDropdown();
    } else {
      openDropdown();
    }
  };

  const handleToggle = useCallback((id: string) => {
    // 1. Instant local toggle: only the clicked row re-renders in 0ms immediately
    setLocalAgents((prev) =>
      prev.map((a) => (a.id === id ? { ...a, selected: !a.selected } : a))
    );
    isPendingSyncRef.current = true;
    pendingQueueRef.current.push(id);

    // 2. Schedule non-blocking flush after paint
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
    }
    syncTimerRef.current = setTimeout(() => {
      flushPending();
    }, 30);
  }, [flushPending]);

  const handleOnly = useCallback((id: string) => {
    // 1. Instant local select only
    setLocalAgents((prev) =>
      prev.map((a) => ({ ...a, selected: a.id === id }))
    );
    isPendingSyncRef.current = true;
    pendingQueueRef.current = [];

    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
    }
    syncTimerRef.current = setTimeout(() => {
      isPendingSyncRef.current = false;
      startTransition(() => {
        onSelectOnly(id);
      });
    }, 30);
  }, [onSelectOnly]);

  const selectedAgents = useMemo(() => localAgents.filter((a) => a.selected), [localAgents]);
  const selectedCount = selectedAgents.length;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        closeDropdown();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpenRef.current) {
        event.preventDefault();
        event.stopPropagation();
        closeDropdown();
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  const getLabel = () => {
    if (selectedCount === 0) return 'No Agent Selected';
    if (selectedCount === 1) return selectedAgents[0].name;
    return `${selectedAgents[0].name} +${selectedCount - 1}`;
  };

  return (
    <div className="agent-selector-wrapper" ref={dropdownRef}>
      <button
        className={`agent-selector-trigger ${isOpen && !isClosing ? 'open' : ''}`}
        onClick={toggleDropdown}
        title="Select target AI agents"
      >
        <div className="trigger-left">
          <Bot size={13} className="trigger-agent-icon" />
          <span className="target-label">Agent:</span>
          <span className="target-name">{getLabel()}</span>
        </div>
        <div className="trigger-right">
          <span className="agent-count-pill count-pill font-mono">{selectedCount}</span>
          <ChevronDown size={12} className={`dropdown-chevron ${isOpen && !isClosing ? 'rotated' : ''}`} />
        </div>
      </button>

      {isOpen && (
        <div className={`agent-dropdown-menu ${isClosing ? 'closing' : ''}`}>
          <div className="dropdown-header">
            <span className="dropdown-title">TARGET AGENTS</span>
            <span className="dropdown-active-pill font-mono">{selectedCount} / {localAgents.length}</span>
          </div>

          <div className="agent-items-list">
            {localAgents.map((agent) => (
              <AgentRow
                key={agent.id}
                agent={agent}
                onToggle={handleToggle}
                onOnly={handleOnly}
              />
            ))}
          </div>
        </div>
      )}

      <style>{`
        .agent-selector-wrapper {
          position:relative;
          display:inline-block;
          width:284px;
          min-width:140px;
          flex-shrink:0;
        }

        @media (max-width: 1340px) {
          .agent-selector-wrapper {
            width:244px;
          }
        }

        @media (max-width: 1150px) {
          .agent-selector-wrapper {
            width:210px;
          }
          .target-label {
            display:none;
          }
        }

        @media (max-width: 960px) {
          .agent-selector-wrapper {
            width:176px;
          }
          .agent-selector-trigger {
            padding:0 8px !important;
          }
        }

        .agent-selector-trigger {
          width:100%;
          height:34px;
          box-sizing:border-box;
          background:var(--bg-pill);
          border:1px solid var(--border-subtle);
          border-radius:8px;
          padding:0 10px;
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:8px;
          cursor:pointer;
          transition:background 0.14s ease, border-color 0.14s ease, box-shadow 0.14s ease;
        }

        .agent-selector-trigger:hover {
          background:var(--bg-pill-hover);
          border-color:var(--border-hover);
        }

        .agent-selector-trigger.open {
          background:var(--bg-surface);
          border-color:var(--border-hover);
          box-shadow:var(--shadow-card);
        }

        .trigger-left {
          display:flex;
          align-items:center;
          gap:6px;
          min-width:0;
          flex:1;
        }

        .trigger-right {
          display:flex;
          align-items:center;
          gap:6px;
          flex-shrink:0;
        }

        .trigger-agent-icon {
          color:var(--text-muted);
          flex-shrink:0;
          transition:color 0.14s ease;
        }

        .agent-selector-trigger:hover .trigger-agent-icon,
        .agent-selector-trigger.open .trigger-agent-icon {
          color:var(--text-primary);
        }

        .target-label {
          font-size:11px;
          color:var(--text-muted);
          flex-shrink:0;
        }

        .target-name {
          font-size:11.5px;
          color:var(--text-primary);
          font-weight:600;
          overflow:hidden;
          text-overflow:ellipsis;
          white-space:nowrap;
          flex:1;
          text-align:left;
        }

        .agent-count-pill,
        .agent-selector-trigger .count-pill {
          display:inline-flex;
          align-items:center;
          justify-content:center;
          height:20px;
          min-width:22px;
          padding:0 6px;
          font-size:10.5px;
          font-weight:600;
          color:var(--text-secondary);
          background:var(--bg-surface);
          border:1px solid var(--border-subtle);
          border-radius:5px;
          flex-shrink:0;
          line-height:1;
        }

        .agent-selector-trigger.open .agent-count-pill {
          background:var(--bg-pill);
          color:var(--text-primary);
          border-color:var(--border-hover);
        }

        .dropdown-chevron {
          color:var(--text-muted);
          transition:transform 0.18s cubic-bezier(0.16, 1, 0.3, 1), color 0.14s ease;
          flex-shrink:0;
        }

        .dropdown-chevron.rotated {
          transform:rotate(180deg);
          color:var(--text-primary);
        }

        @keyframes agentDropdownOpen {
          0% {
            opacity:0;
            transform:translateY(-4px) scale(0.985);
          }
          100% {
            opacity:1;
            transform:translateY(0) scale(1);
          }
        }

        @keyframes agentDropdownClose {
          0% {
            opacity:1;
            transform:translateY(0) scale(1);
          }
          100% {
            opacity:0;
            transform:translateY(-4px) scale(0.985);
          }
        }

        .agent-selector-wrapper .agent-dropdown-menu {
          position:absolute;
          top:calc(100% + 5px);
          left:0;
          right:0;
          width:100%;
          min-width:100%;
          max-width:100%;
          box-sizing:border-box;
          background:var(--bg-surface);
          border:1px solid var(--border-hover);
          border-radius:9px;
          box-shadow:var(--shadow-dropdown);
          padding:0;
          z-index:1000;
          display:flex;
          flex-direction:column;
          gap:0;
          transform-origin:top center;
          animation:agentDropdownOpen 0.14s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          overflow:hidden;
        }

        .agent-selector-wrapper .agent-dropdown-menu.closing {
          animation:agentDropdownClose 0.13s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          pointer-events:none;
        }

        .dropdown-header {
          padding:7px 11px;
          background:var(--bg-surface-alt);
          border-bottom:1px solid var(--border-subtle);
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:8px;
        }

        .dropdown-title {
          font-size:10px;
          font-weight:700;
          letter-spacing:0.06em;
          color:var(--text-muted);
          font-family:var(--font-mono);
        }

        .dropdown-active-pill {
          font-size:10px;
          font-weight:600;
          color:var(--text-secondary);
          background:var(--bg-pill);
          border:1px solid var(--border-subtle);
          border-radius:4px;
          padding:1px 6px;
          line-height:1.3;
        }

        .agent-items-list {
          display:flex;
          flex-direction:column;
          gap:2px;
          max-height:312px;
          overflow-y:auto;
          overflow-x:hidden !important;
          overscroll-behavior:contain;
          padding:5px;
        }

        .agent-items-list::-webkit-scrollbar:horizontal {
          display:none !important;
          height:0 !important;
          width:0 !important;
        }

        .agent-dropdown-row {
          position:relative;
          display:flex;
          align-items:center;
          gap:8px;
          padding:6px 8px;
          border-radius:6px;
          cursor:pointer;
          transition:background-color 0.1s ease;
          white-space:nowrap;
          box-sizing:border-box;
          width:100%;
          max-width:100%;
          min-width:0;
          border:none;
          user-select:none;
          contain:layout style;
        }

        .agent-dropdown-row:hover {
          background:var(--bg-surface-hover);
        }

        .agent-dropdown-row.selected {
          background:var(--bg-elevated);
        }

        .agent-dropdown-row.selected:hover {
          background:var(--bg-elevated-hover);
        }

        .custom-checkbox {
          width:15px;
          height:15px;
          border-radius:4px;
          border:1.5px solid var(--border-hover);
          background:var(--bg-surface);
          display:flex;
          align-items:center;
          justify-content:center;
          color:#ffffff;
          flex-shrink:0;
          transition:background-color 0.08s ease, border-color 0.08s ease;
          contain:layout paint;
        }

        .custom-checkbox.checked {
          background:var(--accent-indigo);
          border-color:var(--accent-indigo);
          color:#ffffff;
        }

        .custom-checkbox svg {
          display:block;
          flex-shrink:0;
        }

        .agent-icon-pill {
          width:24px;
          height:24px;
          border-radius:6px;
          display:flex;
          align-items:center;
          justify-content:center;
          flex-shrink:0;
        }

        .agent-row-info {
          display:flex;
          flex-direction:column;
          gap:1px;
          min-width:0;
          flex:1;
          overflow:hidden;
        }

        .agent-row-name-line {
          display:flex;
          align-items:center;
          gap:6px;
          white-space:nowrap;
          flex-wrap:nowrap;
          min-width:0;
          overflow:hidden;
        }

        .agent-row-name {
          font-size:12px;
          font-weight:600;
          color:var(--text-primary);
          white-space:nowrap;
          overflow:hidden;
          text-overflow:ellipsis;
          min-width:0;
          flex-shrink:1;
        }

        .detected-pill {
          display:inline-flex;
          align-items:center;
          gap:4px;
          font-size:9.5px;
          font-weight:600;
          color:var(--status-green-text);
          flex-shrink:0;
          white-space:nowrap;
        }

        .detected-indicator {
          width:5px;
          height:5px;
          border-radius:50%;
          background:var(--status-green);
          flex-shrink:0;
        }

        .agent-row-path {
          font-size:10px;
          color:var(--text-muted);
          overflow:hidden;
          text-overflow:ellipsis;
          white-space:nowrap;
        }

        .only-btn {
          position:absolute;
          right:8px;
          top:50%;
          transform:translateY(-50%);
          background:var(--bg-surface);
          border:1px solid var(--border-hover);
          color:var(--text-secondary);
          font-size:10px;
          font-weight:600;
          padding:0 7px;
          height:20px;
          border-radius:4px;
          box-shadow:var(--shadow-card);
          cursor:pointer;
          opacity:0;
          pointer-events:none;
          display:inline-flex;
          align-items:center;
          justify-content:center;
          box-sizing:border-box;
          transition:opacity 0.12s ease, background-color 0.12s ease, border-color 0.12s ease, color 0.12s ease;
          flex-shrink:0;
        }

        .agent-dropdown-row:hover .only-btn {
          opacity:1;
          pointer-events:auto;
        }

        .only-btn:hover {
          color:var(--text-primary);
          border-color:var(--border-hover);
          background:var(--bg-pill-hover);
        }
      `}</style>
    </div>
  );
};

export const AgentSelectorDropdown = React.memo(AgentSelectorDropdownComponent);
