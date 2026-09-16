import React, { useState, useRef, useEffect } from 'react';
import { SupportedAgent } from '../types/agent';
import { ChevronDown, Check, Bot, Sparkles, Terminal, Cpu, Boxes, Compass, Server } from 'lucide-react';

interface AgentSelectorDropdownProps {
  agents: SupportedAgent[];
  onToggleAgent: (id: string) => void;
  onSelectOnly: (id: string) => void;
}

const ICON_MAP: Record<string, React.ElementType> = {
  Sparkles,
  Bot,
  Terminal,
  Cpu,
  Boxes,
  Compass,
  Server,
};

export const AgentSelectorDropdown: React.FC<AgentSelectorDropdownProps> = ({
  agents,
  onToggleAgent,
  onSelectOnly,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedAgents = agents.filter((a) => a.selected);
  const selectedCount = selectedAgents.length;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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
        className={`agent-selector-trigger ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        title="Select target AI agents"
      >
        <div className="trigger-left">
          <span className="target-dot"></span>
          <span className="target-label font-mono">Agent:</span>
          <span className="target-name font-mono">{getLabel()}</span>
        </div>
        <div className="trigger-right">
          <span className="count-pill font-mono">{selectedCount}</span>
          <ChevronDown size={11} className={`dropdown-chevron ${isOpen ? 'rotated' : ''}`} />
        </div>
      </button>

      {isOpen && (
        <div className="agent-dropdown-menu">
          <div className="dropdown-header">
            <span className="dropdown-title">TARGET AGENTS</span>
            <span className="dropdown-sub">Select where skills & MCPs are installed</span>
          </div>

          <div className="agent-items-list">
            {agents.map((agent) => {
              const Icon = ICON_MAP[agent.iconName] || Bot;
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
                      <span className="agent-row-name">{agent.name}</span>
                      {agent.detected && <span className="detected-badge font-mono">DETECTED</span>}
                    </div>
                    <span className="agent-row-path font-mono">{agent.paths.baseDir}</span>
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
          width: 270px;
        }

        .agent-selector-trigger {
          width: 100%;
          box-sizing: border-box;
          background: #131b2e;
          border: 1px solid #22304a;
          border-radius: 6px;
          padding: 4px 10px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .agent-selector-trigger:hover,
        .agent-selector-trigger.open {
          background: #18233c;
          border-color: #3b82f6;
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
          background: #3b82f6;
          box-shadow: 0 0 8px rgba(59, 130, 246, 0.6);
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

        .count-pill {
          font-size: 10px;
          color: #3b82f6;
          background: rgba(59, 130, 246, 0.15);
          padding: 1px 5px;
          border-radius: 4px;
          flex-shrink: 0;
        }

        .dropdown-chevron {
          color: #64748b;
          transition: transform 0.15s ease;
          flex-shrink: 0;
        }

        .dropdown-chevron.rotated {
          transform: rotate(180deg);
        }

        .agent-dropdown-menu {
          position: absolute;
          top: calc(100% + 5px);
          left: 0;
          width: 100%;
          box-sizing: border-box;
          background: #0d121f;
          border: 1px solid #1e283d;
          border-radius: 10px;
          box-shadow: 0 16px 36px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05);
          padding: 8px;
          z-index: 1000;
          display: flex;
          flex-direction: column;
          gap: 6px;
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
        }

        .agent-items-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
          max-height: 280px;
          overflow-y: auto;
        }

        .agent-dropdown-row {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 7px 8px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.12s ease;
        }

        .agent-dropdown-row:hover {
          background: #141c2c;
        }

        .agent-dropdown-row.selected {
          background: rgba(59, 130, 246, 0.08);
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
          background: #3b82f6;
          border-color: #3b82f6;
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
        }

        .agent-row-name-line {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .agent-row-name {
          font-size: 12px;
          font-weight: 600;
          color: #f1f5f9;
        }

        .detected-badge {
          font-size: 8.5px;
          font-weight: 700;
          color: #10b981;
          background: rgba(16, 185, 129, 0.12);
          padding: 1px 4px;
          border-radius: 3px;
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
          padding: 1px 5px;
          border-radius: 3px;
          cursor: pointer;
          opacity: 0;
          transition: all 0.15s ease;
        }

        .agent-dropdown-row:hover .only-btn {
          opacity: 1;
        }

        .only-btn:hover {
          color: #f1f5f9;
          border-color: #3b82f6;
          background: rgba(59, 130, 246, 0.2);
        }
      `}</style>
    </div>
  );
};
