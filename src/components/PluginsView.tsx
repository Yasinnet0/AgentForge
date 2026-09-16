import React, { useEffect, useMemo } from 'react';
import { ScannedPlugin, SupportedAgent } from '../types/agent';
import { 
  Boxes, 
  Bot, 
  Sparkles, 
  Terminal, 
  Cpu, 
  Server, 
  Compass, 
  Plus, 
  Layers, 
  User 
} from 'lucide-react';

interface PluginsViewProps {
  plugins: ScannedPlugin[];
  selectedAgents: SupportedAgent[];
  onCreatePlugin?: () => void;
  searchQuery?: string;
  highlightedId?: string | null;
}

const AGENT_ICON_MAP: Record<string, React.ElementType> = {
  Sparkles,
  Bot,
  Terminal,
  Cpu,
  Boxes,
  Compass,
  Server,
  Layers,
};

export const PluginsView: React.FC<PluginsViewProps> = ({
  plugins,
  selectedAgents,
  onCreatePlugin,
  searchQuery = '',
  highlightedId,
}) => {
  // Pre-index plugin search strings to eliminate FPS drops during live search
  const indexedPlugins = useMemo(() => {
    return plugins.map((p) => ({
      item: p,
      searchStr: `${p.name} ${p.description} ${p.sourceAgentName} ${p.author || ''}`.toLowerCase(),
    }));
  }, [plugins]);

  const filteredPlugins = useMemo(() => {
    if (!searchQuery.trim()) return plugins;
    const q = searchQuery.toLowerCase().trim();
    return indexedPlugins
      .filter((p) => p.searchStr.includes(q))
      .map((p) => p.item);
  }, [plugins, indexedPlugins, searchQuery]);

  // Scroll into view when an item is selected from search
  useEffect(() => {
    if (highlightedId) {
      const timer = setTimeout(() => {
        const el = document.getElementById(`plugin-${highlightedId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [highlightedId]);

  return (
    <div className="plugins-view-container">
      {/* Header */}
      <div className="plugins-view-header">
        <div className="header-info">
          <div className="title-line">
            <h2 className="view-title">Installed Plugins & Bundles</h2>
            <span className="count-pill font-mono">{plugins.length} PACKAGES</span>
          </div>
          <p className="view-desc">
            Namespaced bundles providing skills, rules, and MCP definitions to your selected agent(s).
          </p>
        </div>

        {onCreatePlugin && (
          <div className="header-controls">
            <button className="primary-action-btn" onClick={onCreatePlugin}>
              <Plus size={14} />
              <span>Create Plugin</span>
            </button>
          </div>
        )}
      </div>

      {/* Content Area */}
      {selectedAgents.length === 0 ? (
        <div className="empty-state-card">
          <div className="empty-icon-wrap">
            <Bot size={28} />
          </div>
          <div className="empty-title">No Target Agents Selected</div>
          <div className="empty-desc">
            Use the agent selector dropdown in the top bar to choose which AI agents to manage.
          </div>
        </div>
      ) : filteredPlugins.length === 0 ? (
        <div className="empty-state-card">
          <div className="empty-icon-wrap">
            <Boxes size={28} />
          </div>
          <div className="empty-title">
            {searchQuery ? 'No matching plugins found' : 'No plugins installed'}
          </div>
          <div className="empty-desc">
            {searchQuery
              ? `No plugins match "${searchQuery}". Try another search query.`
              : `No plugins were discovered in ${selectedAgents.map((a) => a.name).join(', ')} plugin directories.`}
          </div>
        </div>
      ) : (
        <div className="plugins-grid">
          {filteredPlugins.map((plugin) => {
            const AgentIcon = AGENT_ICON_MAP[plugin.sourceAgentIcon] || Bot;

            return (
              <div
                key={plugin.id}
                id={`plugin-${plugin.id}`}
                className={`plugin-card ${highlightedId === plugin.id ? 'item-card-highlighted' : ''}`}
              >
                {/* Card Top: Title, Version, & Agent Attribution Badge */}
                <div className="plugin-card-top">
                  <div className="plugin-title-group">
                    <div className="plugin-icon-pill">
                      <Boxes size={17} />
                    </div>
                    <div>
                      <div className="plugin-name-row">
                        <span className="plugin-name">{plugin.name}</span>
                        <span className="version-badge font-mono">v{plugin.version}</span>
                      </div>
                      {plugin.author && (
                        <span className="author-line font-mono">
                          <User size={10} /> {plugin.author}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Agent Attribution Badge */}
                  <div
                    className="agent-attribution-badge"
                    style={{
                      color: plugin.sourceAgentColor,
                      backgroundColor: `${plugin.sourceAgentColor}15`,
                      borderColor: `${plugin.sourceAgentColor}35`,
                    }}
                    title={`Plugin installed in ${plugin.sourceAgentName}`}
                  >
                    <AgentIcon size={11} />
                    <span>{plugin.sourceAgentName}</span>
                  </div>
                </div>

                {/* Description */}
                <p className="plugin-description">{plugin.description}</p>

                {/* Footer: Bundle counts */}
                <div className="plugin-card-footer">
                  <div className="bundled-stats font-mono">
                    <span className="stat-pill skills">
                      <Sparkles size={10} />
                      {plugin.skillsCount} Skills
                    </span>
                    <span className="stat-pill mcps">
                      <Server size={10} />
                      {plugin.mcpsCount} MCPs
                    </span>
                    {plugin.rulesCount > 0 && (
                      <span className="stat-pill rules">
                        {plugin.rulesCount} Rules
                      </span>
                    )}
                  </div>

                  <span className="source-path font-mono" title={plugin.sourcePath}>
                    {plugin.sourcePath.split(/[/\\]/).slice(-1)[0]}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        .plugins-view-container {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .plugins-view-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          background: #121826;
          border: 1px solid #1e283d;
          border-radius: 9px;
          padding: 14px 18px;
        }

        .header-info {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .title-line {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .view-title {
          font-size: 16px;
          font-weight: 700;
          color: #f8fafc;
        }

        .count-pill {
          font-size: 10px;
          font-weight: 700;
          color: #38bdf8;
          background: rgba(56, 189, 248, 0.12);
          padding: 2px 7px;
          border-radius: 4px;
          border: 1px solid rgba(56, 189, 248, 0.25);
        }

        .view-desc {
          font-size: 11.5px;
          color: #8899ac;
        }

        .header-controls {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .primary-action-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          background: linear-gradient(135deg, #7c3aed, #6366f1);
          border: none;
          color: #ffffff;
          font-size: 11.5px;
          font-weight: 600;
          padding: 6px 12px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s ease;
          white-space: nowrap;
        }

        .primary-action-btn:hover {
          opacity: 0.92;
        }

        .plugins-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(330px, 1fr));
          gap: 12px;
        }

        .plugin-card {
          background: #121826;
          border: 1px solid #1e283d;
          border-radius: 9px;
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          transition: all 0.15s ease;
        }

        .plugin-card:hover {
          border-color: #2e3e5c;
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
          transform: translateY(-1px);
        }

        .plugin-card-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
        }

        .plugin-title-group {
          display: flex;
          align-items: center;
          gap: 9px;
          min-width: 0;
        }

        .plugin-icon-pill {
          width: 32px;
          height: 32px;
          border-radius: 7px;
          background: rgba(56, 189, 248, 0.12);
          color: #38bdf8;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .plugin-name-row {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .plugin-name {
          font-size: 13.5px;
          font-weight: 700;
          color: #f1f5f9;
        }

        .version-badge {
          font-size: 9.5px;
          color: #64748b;
          background: #1c263c;
          padding: 1px 4px;
          border-radius: 3px;
        }

        .author-line {
          font-size: 10px;
          color: #718298;
          display: flex;
          align-items: center;
          gap: 3px;
          margin-top: 1px;
        }

        .agent-attribution-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 2px 7px;
          border-radius: 5px;
          font-size: 10px;
          font-weight: 600;
          border: 1px solid;
          flex-shrink: 0;
          letter-spacing: -0.01em;
        }

        .plugin-description {
          font-size: 11.5px;
          color: #94a3b8;
          line-height: 1.45;
          margin: 0;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .plugin-card-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding-top: 6px;
          border-top: 1px solid #192236;
          margin-top: auto;
        }

        .bundled-stats {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .stat-pill {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          font-size: 9.5px;
          padding: 1px 6px;
          border-radius: 4px;
        }

        .stat-pill.skills {
          color: #c084fc;
          background: rgba(192, 132, 252, 0.1);
          border: 1px solid rgba(192, 132, 252, 0.2);
        }

        .stat-pill.mcps {
          color: #818cf8;
          background: rgba(129, 140, 248, 0.1);
          border: 1px solid rgba(129, 140, 248, 0.2);
        }

        .stat-pill.rules {
          color: #34d399;
          background: rgba(52, 211, 153, 0.1);
          border: 1px solid rgba(52, 211, 153, 0.2);
        }

        .source-path {
          font-size: 9.5px;
          color: #55677d;
        }

        .item-card-highlighted {
          border-color: rgba(251, 191, 36, 0.65) !important;
          background: rgba(251, 191, 36, 0.05) !important;
          box-shadow: 0 0 0 1px rgba(251, 191, 36, 0.4), 0 4px 16px rgba(251, 191, 36, 0.12) !important;
          animation: highlightPluginSoft 1.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          z-index: 5;
        }

        @keyframes highlightPluginSoft {
          0% {
            border-color: rgba(251, 191, 36, 0.8);
            box-shadow: 0 0 0 1.5px rgba(251, 191, 36, 0.45), 0 4px 16px rgba(251, 191, 36, 0.15);
          }
          60% {
            border-color: rgba(251, 191, 36, 0.5);
            box-shadow: 0 0 0 1px rgba(251, 191, 36, 0.25), 0 2px 8px rgba(251, 191, 36, 0.08);
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
