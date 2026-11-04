import React, { useState, useRef, useEffect } from 'react';
import { SupportedAgent } from '../types/agent';
import { ChevronDown, Check, Bot } from 'lucide-react';
import { AGENT_ICON_MAP } from './AgentIcon';

interface AgentSelectorDropdownProps {
  agents: SupportedAgent[];
  onToggleAgent: (id: string) => void;
  onSelectOnly: (id: string) => void;
}

const ICON_MAP = AGENT_ICON_MAP;

export const AgentSelectorDropdown: React.FC<AgentSelectorDropdownProps> = ({
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

  useEffect(() => {
    isOpenRef.current = isOpen;
    isClosingRef.current = isClosing;
  }, [isOpen, isClosing]);

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

  const selectedAgents = agents.filter((a) => a.selected);
  const selectedCount = selectedAgents.length;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        closeDropdown();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeDropdown();
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
    if (selectedCount === 2) return `${selectedAgents[0].name}, ${selectedAgents[1].name}`;
    return `${selectedAgents[0].name} +${selectedCount - 1} more`;
  };

  return (
    <div className="agent-selector-wrapper" ref={dropdownRef}>
      <button
        className={`agent-selector-trigger ${isOpen && !isClosing ? 'open' : ''}`}
        onClick={toggleDropdown}
        title="Select target AI agents"
      >
        <div className="trigger-left">
          <span 
            className="target-dot" 
            style={{ 
              backgroundColor: selectedCount === 1 ? selectedAgents[0].color : '#8b5cf6',
              boxShadow: `0 0 8px ${selectedCount === 1 ? selectedAgents[0].color : '#8b5cf6'}80`
            }} 
          />
          <span className="target-label font-mono">Agent:</span>
          <span className="target-name font-mono">{getLabel()}</span>
        </div>
        <div className="trigger-right">
          <span className="agent-count-pill count-pill font-mono">{selectedCount}</span>
          <ChevronDown size={11} className={`dropdown-chevron ${isOpen && !isClosing ? 'rotated' : ''}`} />
        </div>
      </button>

      {isOpen && (
        <div className={`agent-dropdown-menu ${isClosing ? 'closing' : ''}`}>
          <div className="dropdown-header">
            <span className="dropdown-title">TARGET AGENTS</span>
            <span className="dropdown-sub">Active installation targets</span>
          </div>

          <div className="agent-items-list">
            {agents.map((agent) => {
              const Icon = ICON_MAP[agent.id] || ICON_MAP[agent.iconName] || Bot;
              const effectiveBase = agent.resolvedPaths?.baseDir || agent.paths.baseDir;
              return (
                <div
                  key={agent.id}
                  className={`agent-dropdown-row ${agent.selected ? 'selected' : ''}`}
                  onClick={() => onToggleAgent(agent.id)}
                >
                  <div
                    className={`custom-checkbox ${agent.selected ? 'checked' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleAgent(agent.id);
                    }}
                  >
                    {agent.selected && <Check size={11} />}
                  </div>

                  <div className="agent-icon-pill" style={{ color: agent.color, background: `${agent.color}15` }}>
                    <Icon size={14} />
                  </div>

                  <div className="agent-row-info">
                    <div className="agent-row-name-line">
                      <span className="agent-row-name" title={agent.name}>{agent.name}</span>
                      {agent.detected && <span className="detected-badge font-mono">DETECTED</span>}
                    </div>
                    <span className="agent-row-path font-mono" title={effectiveBase}>{effectiveBase}</span>
                  </div>

                  <button
                    className="only-btn font-mono"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectOnly(agent.id);
                    }}
                    title={`Select only ${agent.name}`}
                  >
                    only
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <style>{`
        .agent-selector-wrapper {
          position: relative;
          display: inline-block;
          width: 240px;
          max-width: 260px;
          min-width: 120px;
          flex-shrink: 1;
        }

        @media (max-width: 1150px) {
          .agent-selector-wrapper {
            width: 190px;
          }
          .target-label {
            display: none;
          }
        }

        @media (max-width: 960px) {
          .agent-selector-wrapper {
            width: 155px;
          }
          .agent-selector-trigger {
            padding: 0 8px !important;
          }
        }

        .agent-selector-trigger {
          width: 100%;
          height: 34px;
          box-sizing: border-box;
          background: #131b2e;
          border: 1px solid #22304a;
          border-radius: 7px;
          padding: 0 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .agent-selector-trigger:hover,
        .agent-selector-trigger.open {
          background: #18233c;
          border-color: #6366f1;
        }

        .trigger-left {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
          flex: 1;
        }

        .trigger-right {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
        }

        .target-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #8b5cf6;
          box-shadow: 0 0 8px rgba(139, 92, 246, 0.6);
          flex-shrink: 0;
        }

        .target-label {
          font-size: 11px;
          color: #64748b;
          flex-shrink: 0;
        }

        .target-name {
          font-size: 11.5px;
          color: #f1f5f9;
          font-weight: 600;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          flex: 1;
          text-align: left;
        }

        .agent-count-pill,
        .agent-selector-trigger .count-pill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          height: 20px;
          padding: 0 8px;
          font-size: 10.5px;
          font-weight: 700;
          color: #c084fc;
          background: rgba(168, 85, 247, 0.15);
          border: 1px solid rgba(168, 85, 247, 0.32);
          border-radius: 4px;
          flex-shrink: 0;
          line-height: 1;
        }

        .dropdown-chevron {
          color: #64748b;
          transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), color 0.18s ease;
          flex-shrink: 0;
        }

        .dropdown-chevron.rotated {
          transform: rotate(180deg);
          color: #8b5cf6;
        }

        @keyframes agentDropdownOpen {
          0% {
            opacity: 0;
            transform: translateY(-8px) scale(0.96);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes agentDropdownClose {
          0% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
          100% {
            opacity: 0;
            transform: translateY(-8px) scale(0.96);
          }
        }

        .agent-selector-wrapper .agent-dropdown-menu {
          position: absolute;
          top: calc(100% + 6px);
          left: 0;
          width: 100%;
          min-width: 100%;
          max-width: 100%;
          box-sizing: border-box;
          background: rgba(13, 18, 31, 0.96);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          border: 1px solid #1e283d;
          border-radius: 10px;
          box-shadow: 0 16px 36px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.05);
          padding: 8px;
          z-index: 1000;
          display: flex;
          flex-direction: column;
          gap: 6px;
          transform-origin: top center;
          animation: agentDropdownOpen 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          will-change: transform, opacity;
          overflow: hidden;
        }

        .agent-selector-wrapper .agent-dropdown-menu.closing {
          animation: agentDropdownClose 0.18s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          pointer-events: none;
        }

        .dropdown-header {
          padding: 4px 6px 8px 6px;
          border-bottom: 1px solid #1c2638;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .dropdown-title {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.05em;
          color: #64748b;
          font-family: var(--font-mono);
        }

        .dropdown-sub {
          font-size: 10.5px;
          color: #94a3b8;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .agent-items-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
          max-height: 280px;
          overflow-y: auto;
          overflow-x: hidden !important;
          overscroll-behavior: contain;
          padding-right: 2px;
        }

        .agent-items-list::-webkit-scrollbar:horizontal {
          display: none !important;
          height: 0 !important;
          width: 0 !important;
        }

        @keyframes agentRowFadeIn {
          0% {
            opacity: 0;
            transform: translateY(3px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .agent-dropdown-row {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 7px 8px;
          border-radius: 6px;
          cursor: pointer;
          transition: background 0.15s ease, border-color 0.15s ease;
          white-space: nowrap;
          animation: agentRowFadeIn 0.18s cubic-bezier(0.16, 1, 0.3, 1) backwards;
          box-sizing: border-box;
          width: 100%;
          max-width: 100%;
          min-width: 0;
          border: 1px solid transparent;
        }

        .agent-dropdown-row:hover {
          background: #141c2c;
          border-color: rgba(99, 102, 241, 0.2);
        }

        .agent-dropdown-row:active {
          transform: scale(0.99);
        }

        .agent-dropdown-row.selected {
          background: rgba(99, 102, 241, 0.08);
          border-color: rgba(99, 102, 241, 0.25);
        }

        .custom-checkbox {
          width: 16px;
          height: 16px;
          border-radius: 4px;
          border: 1px solid #334155;
          background: #090d16;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          flex-shrink: 0;
          transition: all 0.15s ease;
        }

        .custom-checkbox.checked {
          background: #6366f1;
          border-color: #6366f1;
        }

        .agent-icon-pill {
          width: 24px;
          height: 24px;
          border-radius: 5px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .agent-row-info {
          display: flex;
          flex-direction: column;
          min-width: 0;
          flex: 1;
          overflow: hidden;
        }

        .agent-row-name-line {
          display: flex;
          align-items: center;
          gap: 6px;
          white-space: nowrap;
          flex-wrap: nowrap;
          min-width: 0;
          overflow: hidden;
        }

        .agent-row-name {
          font-size: 12px;
          font-weight: 600;
          color: #f1f5f9;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          min-width: 0;
          flex-shrink: 1;
        }

        .detected-badge {
          font-size: 8.5px;
          font-weight: 700;
          color: #10b981;
          background: rgba(16, 185, 129, 0.12);
          padding: 1px 4px;
          border-radius: 3px;
          flex-shrink: 0;
          white-space: nowrap;
        }

        .agent-row-path {
          font-size: 10px;
          color: #64748b;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .only-btn {
          background: transparent;
          border: 1px solid #1c2638;
          color: #64748b;
          font-size: 9.5px;
          padding: 0 6px;
          height: 20px;
          border-radius: 3px;
          cursor: pointer;
          opacity: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          box-sizing: border-box;
          transition: all 0.15s ease;
          flex-shrink: 0;
        }

        .agent-dropdown-row:hover .only-btn {
          opacity: 1;
        }

        .only-btn:hover {
          color: #f1f5f9;
          border-color: #6366f1;
          background: rgba(99, 102, 241, 0.2);
        }
      `}</style>
    </div>
  );
};
