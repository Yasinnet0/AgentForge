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
  CheckCircle2
} from 'lucide-react';

interface AgentsManagerViewProps {
  agents: SupportedAgent[];
  onToggleAgent: (id: string) => void;
  onSelectOnly: (id: string) => void;
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
  searchQuery = '',
  highlightedId,
}) => {
  const activeCount = agents.filter((a) => a.selected).length;

  // Scroll into view when an item is selected from search
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
      {/* Header Banner */}
      <div className="agents-manager-header">
        <div>
          <div className="header-title-line">
            <h2 className="view-title">Connected AI Agents</h2>
            <span className="active-pill font-mono">{activeCount} ACTIVE TARGETS</span>
          </div>
          <p className="view-desc">
            Select one or multiple target agents. Skills, MCP servers, and context bundles will install directly into their respective configuration folders.
          </p>
        </div>

        <div className="header-actions">
          <button 
            className="secondary-btn"
            onClick={() => agents.forEach(a => !a.selected && onToggleAgent(a.id))}
          >
            Select All
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

              {/* Known Configuration Paths */}
              <div className="agent-paths-section">
                <div className="path-row">
                  <span className="path-label font-mono">BASE DIR:</span>
                  <span className="path-value font-mono" title={agent.paths.baseDir}>
                    {agent.paths.baseDir}
                  </span>
                </div>
                <div className="path-row">
                  <span className="path-label font-mono">SKILLS DIR:</span>
                  <span className="path-value font-mono" title={agent.paths.skillsDir}>
                    {agent.paths.skillsDir}
                  </span>
                </div>
                <div className="path-row">
                  <span className="path-label font-mono">MCP CONFIG:</span>
                  <span className="path-value font-mono" title={agent.paths.mcpConfigPath}>
                    {agent.paths.mcpConfigPath}
                  </span>
                </div>
                <div className="path-row">
                  <span className="path-label font-mono">RULES PATH:</span>
                  <span className="path-value font-mono" title={agent.paths.rulesPath}>
                    {agent.paths.rulesPath}
                  </span>
                </div>
                <div className="path-row">
                  <span className="path-label font-mono">PLUGINS:</span>
                  <span className="path-value font-mono" title={agent.paths.pluginsDir}>
                    {agent.paths.pluginsDir}
                  </span>
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
        }

        .view-desc {
          font-size: 12px;
          color: #94a3b8;
          max-width: 650px;
          line-height: 1.4;
        }

        .secondary-btn {
          background: #182032;
          border: 1px solid #22304a;
          color: #cbd5e1;
          font-size: 11.5px;
          font-weight: 600;
          padding: 6px 12px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .secondary-btn:hover {
          background: #202b42;
          color: #ffffff;
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
          background-color: #3b82f6;
          border-color: #3b82f6;
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
        }

        /* Footer */
        .agent-card-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-top: 4px;
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

        .select-only-btn {
          background: transparent;
          border: 1px solid #22304a;
          color: #818cf8;
          font-size: 10.5px;
          padding: 3px 8px;
          border-radius: 4px;
          cursor: pointer;
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
