import React, { useEffect, useMemo } from 'react';
import { ScannedMcpServer, SupportedAgent } from '../types/agent';
import { 
  Server, 
  Bot, 
  Sparkles, 
  Terminal, 
  Cpu, 
  Boxes, 
  Compass, 
  Plus, 
  Globe, 
  KeyRound, 
  CheckCircle2, 
  Package,
  Layers
} from 'lucide-react';

interface McpServersViewProps {
  mcpServers: ScannedMcpServer[];
  selectedAgents: SupportedAgent[];
  onAddServer?: () => void;
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

export const McpServersView: React.FC<McpServersViewProps> = ({
  mcpServers,
  selectedAgents,
  onAddServer,
  searchQuery = '',
  highlightedId,
}) => {
  // Pre-index server search strings to eliminate FPS drops during live search
  const indexedServers = useMemo(() => {
    return mcpServers.map((s) => ({
      item: s,
      searchStr: `${s.name} ${s.sourceAgentName} ${s.command || ''} ${s.url || ''} ${s.transport} ${s.pluginName || ''}`.toLowerCase(),
    }));
  }, [mcpServers]);

  const filteredServers = useMemo(() => {
    if (!searchQuery.trim()) return mcpServers;
    const q = searchQuery.toLowerCase().trim();
    return indexedServers
      .filter((s) => s.searchStr.includes(q))
      .map((s) => s.item);
  }, [mcpServers, indexedServers, searchQuery]);

  // Scroll into view when an item is selected from search
  useEffect(() => {
    if (highlightedId) {
      const timer = setTimeout(() => {
        const el = document.getElementById(`mcp-${highlightedId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [highlightedId]);

  return (
    <div className="mcp-view-container">
      {/* Header */}
      <div className="mcp-view-header">
        <div className="header-info">
          <div className="title-line">
            <h2 className="view-title">Model Context Protocol (MCP) Servers</h2>
            <span className="count-pill font-mono">{mcpServers.length} CONFIGURED</span>
          </div>
          <p className="view-desc">
            Model Context Protocol servers declared across your selected agent configurations.
          </p>
        </div>

        {onAddServer && (
          <div className="header-controls">
            <button className="primary-action-btn" onClick={onAddServer}>
              <Plus size={14} />
              <span>Add MCP Server</span>
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
            Select one or more target agents in the top bar to inspect their configured MCP servers.
          </div>
        </div>
      ) : filteredServers.length === 0 ? (
        <div className="empty-state-card">
          <div className="empty-icon-wrap">
            <Server size={28} />
          </div>
          <div className="empty-title">
            {searchQuery ? 'No matching MCP servers found' : 'No MCP servers installed'}
          </div>
          <div className="empty-desc">
            {searchQuery
              ? `No servers match "${searchQuery}". Try a different search query.`
              : `No MCP servers are configured in ${selectedAgents.map((a) => a.name).join(', ')}.`}
          </div>
        </div>
      ) : (
        <div className="mcp-grid">
          {filteredServers.map((server) => {
            const AgentIcon = AGENT_ICON_MAP[server.sourceAgentIcon] || Bot;
            const fullCommand = server.command
              ? `${server.command} ${(server.args || []).join(' ')}`.trim()
              : server.url || 'Configured Server';

            return (
              <div
                key={server.id}
                id={`mcp-${server.id}`}
                className={`mcp-card ${highlightedId === server.id ? 'item-card-highlighted' : ''}`}
              >
                {/* Top Row: Name & Agent Attribution Badge */}
                <div className="mcp-card-top">
                  <div className="mcp-title-group">
                    <div className="mcp-icon-pill">
                      <Server size={16} />
                    </div>
                    <div>
                      <div className="mcp-name-row">
                        <span className="mcp-name">{server.name}</span>
                        <span className={`transport-badge font-mono ${server.transport}`}>
                          {server.transport.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Agent Attribution Badge */}
                  <div
                    className="agent-attribution-badge"
                    style={{
                      color: server.sourceAgentColor,
                      backgroundColor: `${server.sourceAgentColor}15`,
                      borderColor: `${server.sourceAgentColor}35`,
                    }}
                    title={`Configured in ${server.sourceAgentName}`}
                  >
                    <AgentIcon size={11} />
                    <span>{server.sourceAgentName}</span>
                  </div>
                </div>

                {/* Command / URL box */}
                <div className="command-box">
                  <span className="command-label font-mono">
                    {server.transport === 'sse' ? (
                      <>
                        <Globe size={11} /> URL:
                      </>
                    ) : (
                      <>
                        <Terminal size={11} /> EXEC:
                      </>
                    )}
                  </span>
                  <span className="command-text font-mono" title={fullCommand}>
                    {fullCommand}
                  </span>
                </div>

                {/* Card Footer */}
                <div className="mcp-card-footer">
                  <div className="footer-meta">
                    {server.pluginName && (
                      <span className="meta-badge plugin-badge font-mono">
                        <Package size={10} />
                        {server.pluginName}
                      </span>
                    )}
                    {server.envKeys && server.envKeys.length > 0 && (
                      <span className="meta-badge env-badge font-mono" title={server.envKeys.join(', ')}>
                        <KeyRound size={10} />
                        {server.envKeys.length} ENV
                      </span>
                    )}
                    <span className="status-pill font-mono">
                      <CheckCircle2 size={10} />
                      ACTIVE
                    </span>
                  </div>

                  <span className="source-path font-mono" title={server.sourcePath}>
                    {server.sourcePath.split(/[/\\]/).slice(-1)[0]}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        .mcp-view-container {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .mcp-view-header {
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
          color: #818cf8;
          background: rgba(129, 140, 248, 0.12);
          padding: 2px 7px;
          border-radius: 4px;
          border: 1px solid rgba(129, 140, 248, 0.25);
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

        .mcp-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(330px, 1fr));
          gap: 12px;
        }

        .mcp-card {
          background: #121826;
          border: 1px solid #1e283d;
          border-radius: 9px;
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          transition: all 0.15s ease;
        }

        .mcp-card:hover {
          border-color: #2e3e5c;
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
          transform: translateY(-1px);
        }

        .mcp-card-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
        }

        .mcp-title-group {
          display: flex;
          align-items: center;
          gap: 9px;
          min-width: 0;
        }

        .mcp-icon-pill {
          width: 30px;
          height: 30px;
          border-radius: 7px;
          background: rgba(129, 140, 248, 0.12);
          color: #818cf8;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .mcp-name-row {
          display: flex;
          align-items: center;
          gap: 7px;
        }

        .mcp-name {
          font-size: 13.5px;
          font-weight: 700;
          color: #f1f5f9;
        }

        .transport-badge {
          font-size: 9px;
          font-weight: 700;
          padding: 1px 5px;
          border-radius: 3px;
        }

        .transport-badge.stdio {
          color: #38bdf8;
          background: rgba(56, 189, 248, 0.12);
          border: 1px solid rgba(56, 189, 248, 0.25);
        }

        .transport-badge.sse {
          color: #34d399;
          background: rgba(52, 211, 153, 0.12);
          border: 1px solid rgba(52, 211, 153, 0.25);
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

        .command-box {
          background: #090d16;
          border: 1px solid #1a2336;
          border-radius: 6px;
          padding: 7px 9px;
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
        }

        .command-label {
          color: #475569;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          gap: 3px;
          flex-shrink: 0;
          font-size: 10px;
        }

        .command-text {
          color: #94a3b8;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          flex: 1;
        }

        .mcp-card-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding-top: 6px;
          border-top: 1px solid #192236;
          margin-top: auto;
        }

        .footer-meta {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .meta-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 9.5px;
          padding: 1px 5px;
          border-radius: 4px;
        }

        .plugin-badge {
          color: #38bdf8;
          background: rgba(56, 189, 248, 0.1);
          border: 1px solid rgba(56, 189, 248, 0.25);
        }

        .env-badge {
          color: #fbbf24;
          background: rgba(251, 191, 36, 0.1);
          border: 1px solid rgba(251, 191, 36, 0.25);
        }

        .status-pill {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          font-size: 9.5px;
          font-weight: 700;
          color: #10b981;
          background: rgba(16, 185, 129, 0.1);
          border: 1px solid rgba(16, 185, 129, 0.25);
          padding: 1px 5px;
          border-radius: 4px;
        }

        .source-path {
          font-size: 9.5px;
          color: #55677d;
        }

        .item-card-highlighted {
          border-color: rgba(56, 189, 248, 0.65) !important;
          background: rgba(56, 189, 248, 0.05) !important;
          box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.4), 0 4px 16px rgba(56, 189, 248, 0.12) !important;
          animation: highlightMcpSoft 1.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          z-index: 5;
        }

        @keyframes highlightMcpSoft {
          0% {
            border-color: rgba(56, 189, 248, 0.8);
            box-shadow: 0 0 0 1.5px rgba(56, 189, 248, 0.45), 0 4px 16px rgba(56, 189, 248, 0.15);
          }
          60% {
            border-color: rgba(56, 189, 248, 0.5);
            box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.25), 0 2px 8px rgba(56, 189, 248, 0.08);
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
