import React, { useEffect, useMemo } from 'react';
import { SupportedAgent } from '../types/agent';
import { 
  Bot, 
  Sparkles, 
  Terminal, 
  Cpu, 
  Boxes, 
  Compass, 
  Server, 
  CheckCircle2,
  FolderOpen,
  CheckSquare,
  Square
} from 'lucide-react';

interface AgentsManagerViewProps {
  agents: SupportedAgent[];
  onToggleAgent: (id: string) => void;
  onSelectOnly: (id: string) => void;
  onSelectAll?: (select: boolean) => void;
  searchQuery?: string;
  highlightedId?: string | null;
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

  const handleToggleSelectAll = () => {
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

  // Scroll into view
  useEffect(() => {
    if (highlightedId) {
      const timer = setTimeout(() => {
        const el = document.getElementById(`agent-${highlightedId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [highlightedId]);

  const filteredAgents = useMemo(() => {
    if (!searchQuery.trim()) return agents;
    const q = searchQuery.toLowerCase().trim();
    return agents.filter(
      (a) => a.name.toLowerCase().includes(q) || a.tagline.toLowerCase().includes(q)
    );
  }, [agents, searchQuery]);

  return (
    <div className="agents-manager-container">
      {/* Header */}
      <div className="agents-manager-header">
        <div>
          <div className="header-title-line">
            <h2 className="view-title">Connected AI Agents</h2>
            <span className="active-pill font-mono" key={activeCount}>
              {activeCount} ACTIVE TARGETS
            </span>
          </div>
          <p className="view-desc">
            Select one or multiple target agents. Skills, MCP servers, and context bundles will install directly into their respective configuration folders.
          </p>
        </div>

        <div className="header-actions">
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
        </div>
      </div>

      {/* Agents Grid */}
      {filteredAgents.length === 0 ? (
        <div className="empty-agents-card">
          <div className="empty-icon-wrap">
            <Bot size={28} />
          </div>
          <div className="empty-title">No matching agents found</div>
          <div className="empty-desc">No agents match "{searchQuery}". Try a different search term.</div>
        </div>
      ) : (
        <div className="agents-cards-grid">
          {filteredAgents.map((agent) => {
          const Icon = ICON_MAP[agent.iconName] || Bot;
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
                    onChange={() => onToggleAgent(agent.id)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              {/* Configuration Paths */}
              <div className="agent-paths-section">
                <div className="path-row">
                  <span className="path-label font-mono">BASE DIR:</span>
                  <span className="path-value font-mono" title={agent.paths.baseDir}>
                    {agent.paths.baseDir}
                  </span>
                  <button
                    type="button"
                    className="path-open-btn"
                    onClick={() => window.electronAPI?.openPath(agent.paths.baseDir)}
                    title={`Open ${agent.paths.baseDir} in File Explorer`}
                  >
                    <FolderOpen size={11} />
                  </button>
                </div>
                <div className="path-row">
                  <span className="path-label font-mono">SKILLS DIR:</span>
                  <span className="path-value font-mono" title={agent.paths.skillsDir}>
                    {agent.paths.skillsDir}
                  </span>
                  <button
                    type="button"
                    className="path-open-btn"
                    onClick={() => window.electronAPI?.openPath(agent.paths.skillsDir)}
                    title={`Open ${agent.paths.skillsDir} in File Explorer`}
                  >
                    <FolderOpen size={11} />
                  </button>
                </div>
                <div className="path-row">
                  <span className="path-label font-mono">MCP CONFIG:</span>
                  <span className="path-value font-mono" title={agent.paths.mcpConfigPath}>
                    {agent.paths.mcpConfigPath}
                  </span>
                  <button
                    type="button"
                    className="path-open-btn"
                    onClick={() => window.electronAPI?.openPath(agent.paths.mcpConfigPath)}
                    title={`Open ${agent.paths.mcpConfigPath} in File Explorer`}
                  >
                    <FolderOpen size={11} />
                  </button>
                </div>
                <div className="path-row">
                  <span className="path-label font-mono">RULES PATH:</span>
                  <span className="path-value font-mono" title={agent.paths.rulesPath}>
                    {agent.paths.rulesPath}
                  </span>
                  <button
                    type="button"
                    className="path-open-btn"
                    onClick={() => window.electronAPI?.openPath(agent.paths.rulesPath)}
                    title={`Open ${agent.paths.rulesPath} in File Explorer`}
                  >
                    <FolderOpen size={11} />
                  </button>
                </div>
                <div className="path-row">
                  <span className="path-label font-mono">PLUGINS:</span>
                  <span className="path-value font-mono" title={agent.paths.pluginsDir}>
                    {agent.paths.pluginsDir}
                  </span>
                  <button
                    type="button"
                    className="path-open-btn"
                    onClick={() => window.electronAPI?.openPath(agent.paths.pluginsDir)}
                    title={`Open ${agent.paths.pluginsDir} in File Explorer`}
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
                    onClick={() => window.electronAPI?.openPath(agent.paths.baseDir)}
                    title={`Open ${agent.name} folder in File Explorer`}
                  >
                    <FolderOpen size={12} />
                    <span>Open Folder</span>
                  </button>
                  <button
                    className="select-only-btn font-mono"
                    onClick={() => onSelectOnly(agent.id)}
                  >
                    Target Only
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      )}

      <style>{`
        .agents-manager-container {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .agents-manager-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #121826;
          border: 1px solid #1e283d;
          border-radius: 9px;
          padding: 16px 20px;
        }

        .header-title-line {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 4px;
        }

        .view-title {
          font-size: 16px;
          font-weight: 700;
          color: #f8fafc;
        }

        .active-pill {
          font-size: 10px;
          font-weight: 700;
          color: #38bdf8;
          background: rgba(56, 189, 248, 0.12);
          padding: 2px 8px;
          border-radius: 4px;
          border: 1px solid rgba(56, 189, 248, 0.25);
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          display: inline-block;
          animation: pillScale 0.22s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes pillScale {
          0% {
            transform: scale(0.92);
            opacity: 0.8;
          }
          50% {
            transform: scale(1.06);
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }

        .view-desc {
          font-size: 12px;
          color: #94a3b8;
          max-width: 650px;
          line-height: 1.4;
        }

        .select-all-btn {
          background: #182032;
          border: 1px solid #22304a;
          color: #cbd5e1;
          font-size: 11px;
          font-weight: 600;
          height: 28px;
          padding: 0 12px;
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
          position: relative;
          overflow: hidden;
          transition: border-color 0.25s cubic-bezier(0.16, 1, 0.3, 1),
                      background-color 0.25s cubic-bezier(0.16, 1, 0.3, 1),
                      box-shadow 0.25s cubic-bezier(0.16, 1, 0.3, 1),
                      transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .agent-card:hover {
          border-color: rgba(99, 102, 241, 0.35);
          background: #131b2c;
          box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.45);
          transform: translateY(-1px);
        }

        .agent-card-selected {
          border-color: rgba(99, 102, 241, 0.48);
          background: #131a2b;
          box-shadow: 0 4px 20px -2px rgba(99, 102, 241, 0.14);
        }

        .agent-card-selected::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent, #818cf8, transparent);
          animation: cardTopGlow 0.3s ease-out;
        }

        @keyframes cardTopGlow {
          from {
            opacity: 0;
            transform: scaleX(0.3);
          }
          to {
            opacity: 1;
            transform: scaleX(1);
          }
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
          background-color: #6366f1;
          border-color: #6366f1;
          box-shadow: 0 0 10px rgba(99, 102, 241, 0.35);
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

        .item-card-highlighted {
          border-color: rgba(96, 165, 250, 0.65) !important;
          background: rgba(96, 165, 250, 0.05) !important;
          box-shadow: 0 0 0 1px rgba(96, 165, 250, 0.4), 0 4px 16px rgba(96, 165, 250, 0.12) !important;
          animation: highlightAgentSoft 1.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          z-index: 5;
        }

        @keyframes highlightAgentSoft {
          0% {
            border-color: rgba(96, 165, 250, 0.8);
            box-shadow: 0 0 0 1.5px rgba(96, 165, 250, 0.45), 0 4px 16px rgba(96, 165, 250, 0.15);
          }
          60% {
            border-color: rgba(96, 165, 250, 0.5);
            box-shadow: 0 0 0 1px rgba(96, 165, 250, 0.25), 0 2px 8px rgba(96, 165, 250, 0.08);
          }
          100% {
            border-color: #1e283d;
            background: #121826;
            box-shadow: none;
          }
        }
      `}</style>
    </div>
  );
};
