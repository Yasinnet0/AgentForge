import React, { useState, useEffect, useMemo } from 'react';
import { ScannedMcpServer, SupportedAgent } from '../types/agent';
import { CatalogMcpServer } from '../types/catalog';
import { MCP_CATALOG } from '../data/mcpCatalog';
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
  Layers,
  Trash2,
  Loader2,
  Filter,
  FolderOpen
} from 'lucide-react';
import { logActivity } from '../services/activityLogger';

interface McpServersViewProps {
  mcpServers: ScannedMcpServer[];
  selectedAgents: SupportedAgent[];
  mcpCatalog?: CatalogMcpServer[];
  catalogSyncedAt?: string | null;
  onAddServer?: () => void;
  onRefreshCapabilities?: () => Promise<void>;
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

type SegmentTab = 'all' | 'installed' | 'available';

interface UnifiedMcpCard {
  id: string;
  name: string;
  description?: string;
  category?: string;
  transport: 'stdio' | 'sse';
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  envKeys?: string[];
  author?: string;
  tags?: string[];
  docsUrl?: string;
  isCatalog: boolean;
  installedAgents: SupportedAgent[];
  pluginName?: string;
  sourcePath?: string;
}

export const McpServersView: React.FC<McpServersViewProps> = ({
  mcpServers,
  selectedAgents,
  mcpCatalog,
  catalogSyncedAt,
  onAddServer,
  onRefreshCapabilities,
  searchQuery = '',
  highlightedId,
}) => {
  const [activeSegment, setActiveSegment] = useState<SegmentTab>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [loadingServerKey, setLoadingServerKey] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const activeMcpCatalog = mcpCatalog || MCP_CATALOG;

  useEffect(() => {
    if (actionMessage) {
      const timer = setTimeout(() => setActionMessage(null), 3200);
      return () => clearTimeout(timer);
    }
  }, [actionMessage]);

  // Data Processing
  const unifiedServers = useMemo<UnifiedMcpCard[]>(() => {
    const list: UnifiedMcpCard[] = [];
    const processedKeys = new Set<string>();

    for (const cat of activeMcpCatalog) {
      processedKeys.add(cat.id.toLowerCase());
      const installedOn = selectedAgents.filter((agent) =>
        mcpServers.some(
          (s) =>
            s.sourceAgentId === agent.id &&
            s.name.toLowerCase() === cat.id.toLowerCase()
        )
      );

      const localMatch = mcpServers.find(
        (s) =>
          s.name.toLowerCase() === cat.id.toLowerCase() &&
          selectedAgents.some((a) => a.id === s.sourceAgentId)
      );

      list.push({
        id: cat.id,
        name: cat.name,
        description: cat.description,
        category: cat.category,
        transport: localMatch?.transport || cat.transport,
        command: localMatch?.command || cat.command,
        args: localMatch?.args || cat.args,
        url: localMatch?.url || cat.url,
        env: cat.env,
        envKeys: localMatch?.envKeys || cat.envKeys || Object.keys(cat.env || {}),
        author: cat.author,
        tags: cat.tags,
        docsUrl: cat.docsUrl,
        isCatalog: true,
        installedAgents: installedOn,
        pluginName: localMatch?.pluginName,
        sourcePath: localMatch?.sourcePath,
      });
    }

    for (const s of mcpServers) {
      const key = s.name.toLowerCase();
      if (!processedKeys.has(key)) {
        processedKeys.add(key);
        const installedOn = selectedAgents.filter((agent) =>
          mcpServers.some(
            (other) =>
              other.sourceAgentId === agent.id &&
              other.name.toLowerCase() === key
          )
        );

        list.push({
          id: s.name,
          name: s.name,
          description: `Custom configured MCP server in ${installedOn.map((a) => a.name).join(', ')}`,
          category: 'Custom Local',
          transport: s.transport,
          command: s.command,
          args: s.args,
          url: s.url,
          envKeys: s.envKeys,
          isCatalog: false,
          installedAgents: installedOn,
          pluginName: s.pluginName,
          sourcePath: s.sourcePath,
        });
      }
    }

    return list;
  }, [mcpServers, selectedAgents]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    unifiedServers.forEach((s) => {
      if (s.category) set.add(s.category);
    });
    return ['All', ...Array.from(set)];
  }, [unifiedServers]);

  const counts = useMemo(() => {
    const installed = unifiedServers.filter((s) => s.installedAgents.length > 0).length;
    const available = unifiedServers.filter((s) => s.isCatalog && s.installedAgents.length < selectedAgents.length).length;
    return {
      all: unifiedServers.length,
      installed,
      available,
    };
  }, [unifiedServers, selectedAgents]);

  const indexedServers = useMemo(() => {
    return unifiedServers.map((s) => ({
      item: s,
      searchStr: `${s.name} ${s.description || ''} ${s.command || ''} ${s.url || ''} ${s.transport} ${s.category || ''} ${(s.tags || []).join(' ')}`.toLowerCase(),
    }));
  }, [unifiedServers]);

  const filteredServers = useMemo(() => {
    let result = indexedServers;

    if (activeSegment === 'installed') {
      result = result.filter((s) => s.item.installedAgents.length > 0);
    } else if (activeSegment === 'available') {
      result = result.filter((s) => s.item.isCatalog && s.item.installedAgents.length < selectedAgents.length);
    }

    if (selectedCategory !== 'All') {
      result = result.filter((s) => s.item.category === selectedCategory);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((s) => s.searchStr.includes(q));
    }

    return result.map((s) => s.item);
  }, [indexedServers, activeSegment, selectedCategory, searchQuery, selectedAgents.length]);

  // Effects
  useEffect(() => {
    if (highlightedId) {
      const timer = setTimeout(() => {
        const el = document.getElementById(`mcp-card-${highlightedId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [highlightedId]);

  // Handlers
  const handleInstallMcp = async (server: UnifiedMcpCard) => {
    if (!window.electronAPI?.installMcp) return;

    const targetAgents = selectedAgents.filter(
      (agent) => !server.installedAgents.some((inst) => inst.id === agent.id)
    );

    if (targetAgents.length === 0) return;

    setLoadingServerKey(server.id);
    try {
      const serverConfig: any = {
        command: server.command,
        args: server.args || [],
      };
      if (server.url) {
        serverConfig.url = server.url;
      }
      if (server.env && Object.keys(server.env).length > 0) {
        serverConfig.env = server.env;
      }

      const res = await window.electronAPI.installMcp({
        serverKey: server.id,
        serverConfig,
        targets: targetAgents.map((a) => ({
          agentId: a.id,
          mcpConfigPath: a.paths.mcpConfigPath,
        })),
      });

      if (res.success) {
        setActionMessage(`Configured "${server.name}" in ${targetAgents.map((a) => a.name).join(', ')}`);
        logActivity({
          type: 'MCP',
          title: 'MCP Server Configured',
          description: `Configured "${server.name}" (${server.transport.toUpperCase()}) in ${targetAgents.map((a) => a.name).join(', ')}`,
          status: 'success',
        });
        if (onRefreshCapabilities) {
          await onRefreshCapabilities();
        }
      } else {
        setActionMessage(`Error: ${res.error || 'Failed to configure MCP server'}`);
        logActivity({
          type: 'MCP',
          title: 'MCP Configure Failed',
          description: `Failed to configure "${server.name}": ${res.error || 'Unknown error'}`,
          status: 'error',
        });
      }
    } catch (err: any) {
      setActionMessage(`Error: ${err.message || 'Configuration failed'}`);
      logActivity({
        type: 'MCP',
        title: 'MCP Configure Error',
        description: `Error configuring "${server.name}": ${err.message || 'Unknown error'}`,
        status: 'error',
      });
    } finally {
      setLoadingServerKey(null);
    }
  };

  // Uninstall
  const handleUninstallMcp = async (server: UnifiedMcpCard) => {
    if (!window.electronAPI?.uninstallMcp) return;

    const targetAgents = server.installedAgents.filter((agent) =>
      selectedAgents.some((sel) => sel.id === agent.id)
    );

    if (targetAgents.length === 0) return;

    setLoadingServerKey(server.id);
    try {
      const res = await window.electronAPI.uninstallMcp({
        serverKey: server.id,
        targets: targetAgents.map((a) => ({
          agentId: a.id,
          mcpConfigPath: a.paths.mcpConfigPath,
        })),
      });

      if (res.success) {
        setActionMessage(`Removed "${server.name}" from ${targetAgents.map((a) => a.name).join(', ')}`);
        logActivity({
          type: 'MCP',
          title: 'MCP Server Removed',
          description: `Removed "${server.name}" from ${targetAgents.map((a) => a.name).join(', ')}`,
          status: 'warning',
        });
        if (onRefreshCapabilities) {
          await onRefreshCapabilities();
        }
      } else {
        setActionMessage(`Error: ${res.error || 'Failed to remove MCP server'}`);
        logActivity({
          type: 'MCP',
          title: 'MCP Removal Failed',
          description: `Failed to remove "${server.name}": ${res.error || 'Unknown error'}`,
          status: 'error',
        });
      }
    } catch (err: any) {
      setActionMessage(`Error: ${err.message || 'Removal failed'}`);
      logActivity({
        type: 'MCP',
        title: 'MCP Removal Error',
        description: `Error removing "${server.name}": ${err.message || 'Unknown error'}`,
        status: 'error',
      });
    } finally {
      setLoadingServerKey(null);
    }
  };

  // Open folder
  const handleOpenMcpFolder = (server: UnifiedMcpCard) => {
    if (!window.electronAPI?.openPath) return;
    if (server.sourcePath) {
      window.electronAPI.openPath(server.sourcePath);
      return;
    }
    const agent = server.installedAgents[0];
    if (agent?.paths?.mcpConfigPath) {
      window.electronAPI.openPath(agent.paths.mcpConfigPath);
    }
  };

  return (
    <div className="mcp-view-container">
      {/* Toast Notification */}
      {actionMessage && (
        <div className="action-toast-banner">
          <CheckCircle2 size={15} />
          <span>{actionMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="mcp-view-header">
        <div className="header-info">
          <div className="title-line">
            <h2 className="view-title">Model Context Protocol (MCP) Servers</h2>
            <span className="count-pill font-mono">{mcpServers.length} CONFIGURED</span>
            <span className="catalog-pill font-mono">{activeMcpCatalog.length} IN CLOUD CATALOG</span>
            {catalogSyncedAt && (
              <span className="sync-pill font-mono" title={`Synced with AAS: ${new Date(catalogSyncedAt).toLocaleString()}`}>
                <CheckCircle2 size={10} /> AAS SYNCED
              </span>
            )}
          </div>
          <p className="view-desc">
            Model Context Protocol servers declared across your agent configs or ready to equip from the catalog.
          </p>
        </div>

        <div className="header-actions-wrap">
          {/* Segmented Controls on the right */}
          <div className="segmented-controls">
            <button
              className={`segment-btn ${activeSegment === 'all' ? 'active' : ''}`}
              onClick={() => setActiveSegment('all')}
            >
              All <span className="segment-count">{counts.all}</span>
            </button>
            <button
              className={`segment-btn ${activeSegment === 'installed' ? 'active' : ''}`}
              onClick={() => setActiveSegment('installed')}
            >
              Configured <span className="segment-count">{counts.installed}</span>
            </button>
            <button
              className={`segment-btn ${activeSegment === 'available' ? 'active' : ''}`}
              onClick={() => setActiveSegment('available')}
            >
              Available in Catalog <span className="segment-count">{counts.available}</span>
            </button>
          </div>

          {onAddServer && (
            <div className="header-buttons-row">
              <button className="import-action-btn" onClick={onAddServer}>
                <Plus size={12} />
                <span>Add Server</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Category Pills Bar */}
      <div className="category-filter-bar">
        <div className="category-label">
          <Filter size={12} />
          <span>Category:</span>
        </div>
        <div className="category-pills">
          {categories.map((cat) => (
            <button
              key={cat}
              className={`cat-pill ${selectedCategory === cat ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Content Area */}
      {selectedAgents.length === 0 ? (
        <div className="empty-state-card">
          <div className="empty-icon-wrap">
            <Bot size={28} />
          </div>
          <div className="empty-title">No Target Agents Selected</div>
          <div className="empty-desc">
            Select one or more target agents in the top bar to inspect or equip their MCP servers.
          </div>
        </div>
      ) : filteredServers.length === 0 ? (
        <div className="empty-state-card">
          <div className="empty-icon-wrap">
            <Server size={28} />
          </div>
          <div className="empty-title">
            {searchQuery ? 'No matching MCP servers found' : 'No servers in this view'}
          </div>
          <div className="empty-desc">
            {searchQuery
              ? `No servers match "${searchQuery}". Try a different search query.`
              : activeSegment === 'installed'
              ? 'No MCP servers are configured in your selected agents. Switch to "Available in Catalog" to add servers with 1-click.'
              : 'All catalog MCP servers are already configured in your selected agents.'}
          </div>
        </div>
      ) : (
        <div className="mcp-grid">
          {filteredServers.map((server) => {
            const isInstalledOnAll =
              selectedAgents.length > 0 && server.installedAgents.length === selectedAgents.length;
            const isPartiallyInstalled =
              server.installedAgents.length > 0 && server.installedAgents.length < selectedAgents.length;
            const isHighlighted =
              highlightedId === server.id ||
              mcpServers.some((s) => s.id === highlightedId && s.name.toLowerCase() === server.id.toLowerCase());
            const isLoading = loadingServerKey === server.id;

            const fullCommand = server.command
              ? `${server.command} ${(server.args || []).join(' ')}`.trim()
              : server.url || 'Configured Server';

            return (
              <div
                key={server.id}
                id={`mcp-card-${server.id}`}
                className={`mcp-card ${isHighlighted ? 'item-card-highlighted' : ''}`}
              >
                {/* 1. Header: Icon Avatar + Title/Transport/Category + Status Pill */}
                <div className="card-header-cluster">
                  <div className="card-header-left">
                    <div className="card-icon-avatar mcp">
                      <Server size={16} />
                    </div>
                    <div className="card-identity-text">
                      <div className="card-title-row">
                        <span className="card-item-name" title={server.name}>{server.name}</span>
                        <span className={`transport-badge font-mono ${server.transport}`}>
                          {server.transport.toUpperCase()}
                        </span>
                      </div>
                      <div className="card-sub-meta">
                        {server.category && (
                          <span className="card-cat-text font-mono">{server.category}</span>
                        )}
                        {server.category && server.author && (
                          <span className="card-meta-dot">·</span>
                        )}
                        {server.author && (
                          <span className="author-text font-mono">by {server.author}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="card-header-right">
                    {isInstalledOnAll ? (
                      <span className="status-pill-clean installed font-mono">
                        <span className="status-dot installed" />
                        <span>CONFIGURED</span>
                      </span>
                    ) : isPartiallyInstalled ? (
                      <span className="status-pill-clean partial font-mono">
                        <span className="status-dot partial" />
                        <span>PARTIAL ({server.installedAgents.length}/{selectedAgents.length})</span>
                      </span>
                    ) : (
                      <span className="status-pill-clean available font-mono">
                        <span className="status-dot available" />
                        <span>AVAILABLE</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* 2. Body: Description + Command Preview Snippet + Equipped Agents */}
                <div className="card-content-body">
                  {server.description && (
                    <p className="card-description-text">{server.description}</p>
                  )}

                  <div className="command-snippet">
                    {server.transport === 'sse' ? (
                      <Globe size={12} className="cmd-icon sse" />
                    ) : (
                      <Terminal size={12} className="cmd-icon" />
                    )}
                    <span className="cmd-text font-mono" title={fullCommand}>
                      {fullCommand}
                    </span>
                  </div>

                  {server.installedAgents.length > 0 && (
                    <div className="equipped-agents-bar">
                      <span className="equipped-label font-mono">Active in:</span>
                      <div className="equipped-pills-list">
                        {server.installedAgents.map((ag) => {
                          const AgentIcon = AGENT_ICON_MAP[ag.iconName] || Bot;
                          return (
                            <span
                              key={ag.id}
                              className="agent-pill"
                              style={{
                                color: ag.color,
                                borderColor: `${ag.color}40`,
                                background: `${ag.color}15`,
                              }}
                            >
                              <AgentIcon size={10} />
                              {ag.name}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. Bottom Toolbar: Metadata chips (left) + Action Group (right) */}
                <div className="card-bottom-toolbar">
                  <div className="toolbar-left-chips">
                    {server.pluginName && (
                      <span className="meta-subtle-badge font-mono" title={`Part of ${server.pluginName}`}>
                        <Package size={11} />
                        <span>{server.pluginName}</span>
                      </span>
                    )}
                    {server.envKeys && server.envKeys.length > 0 && (
                      <span className="meta-subtle-badge env-chip font-mono" title={`Environment variables: ${server.envKeys.join(', ')}`}>
                        <KeyRound size={11} />
                        <span>{server.envKeys.length} ENV</span>
                      </span>
                    )}
                  </div>

                  <div className="toolbar-right-actions">
                    {/* Open Folder / Config Button for Configured Servers */}
                    {server.installedAgents.length > 0 && (
                      <button
                        type="button"
                        className="card-action-icon-btn"
                        onClick={() => handleOpenMcpFolder(server)}
                        title="Open MCP configuration directory in File Explorer"
                      >
                        <FolderOpen size={13} />
                      </button>
                    )}

                    {/* Docs Link */}
                    {server.docsUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          if (window.electronAPI?.openExternal) {
                            window.electronAPI.openExternal(server.docsUrl!);
                          } else {
                            window.open(server.docsUrl, '_blank');
                          }
                        }}
                        className="card-action-icon-btn"
                        title="Open documentation in default browser"
                      >
                        <Globe size={13} />
                      </button>
                    )}

                    {/* Remove Button */}
                    {server.installedAgents.length > 0 && (
                      <button
                        type="button"
                        className="card-action-icon-btn danger"
                        onClick={() => handleUninstallMcp(server)}
                        disabled={isLoading}
                        title={`Remove from ${server.installedAgents.map((a) => a.name).join(', ')}`}
                      >
                        {isLoading ? (
                          <Loader2 size={12} className="spin" />
                        ) : (
                          <Trash2 size={13} />
                        )}
                      </button>
                    )}

                    {/* Add to Agent Button */}
                    {(!isInstalledOnAll && server.isCatalog) && (
                      <button
                        type="button"
                        className="card-primary-action-btn mcp"
                        onClick={() => handleInstallMcp(server)}
                        disabled={isLoading}
                      >
                        {isLoading ? (
                          <>
                            <Loader2 size={11} className="spin" />
                            <span>Configuring...</span>
                          </>
                        ) : (
                          <>
                            <Plus size={12} />
                            <span>
                              {isPartiallyInstalled
                                ? `Add (${selectedAgents.length - server.installedAgents.length})`
                                : selectedAgents.length > 1
                                ? `Add to ${selectedAgents.length}`
                                : 'Add to Agent'}
                            </span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
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

        .action-toast-banner {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(16, 185, 129, 0.15);
          border: 1px solid rgba(16, 185, 129, 0.35);
          color: #34d399;
          padding: 10px 16px;
          border-radius: 8px;
          font-size: 12.5px;
          font-weight: 600;
          animation: toastSlideDown 0.2s ease-out;
        }

        .mcp-view-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          background: #121826;
          border: 1px solid #1e283d;
          border-radius: 10px;
          padding: 14px 20px;
        }

        .header-info {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
          flex: 1;
        }

        .title-line {
          display: flex;
          align-items: center;
          gap: 9px;
          flex-wrap: wrap;
        }

        .view-title {
          font-size: 16px;
          font-weight: 700;
          color: #f8fafc;
          margin: 0;
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

        .catalog-pill {
          font-size: 10px;
          font-weight: 700;
          color: #38bdf8;
          background: rgba(56, 189, 248, 0.12);
          padding: 2px 7px;
          border-radius: 4px;
          border: 1px solid rgba(56, 189, 248, 0.25);
        }

        .sync-pill {
          font-size: 10px;
          font-weight: 700;
          color: #38bdf8;
          background: rgba(56, 189, 248, 0.12);
          padding: 2px 7px;
          border-radius: 4px;
          border: 1px solid rgba(56, 189, 248, 0.25);
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }

        .view-desc {
          font-size: 12px;
          color: #8899ac;
          margin: 0;
        }

        .header-actions-wrap {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-shrink: 0;
        }

        .header-buttons-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .import-action-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          background: linear-gradient(135deg, #7c3aed, #6366f1);
          border: 1px solid rgba(124, 58, 237, 0.35);
          color: #ffffff;
          font-size: 11px;
          font-weight: 600;
          padding: 0 12px;
          height: 28px;
          border-radius: 5px;
          cursor: pointer;
          transition: all 0.15s ease;
          white-space: nowrap;
          box-sizing: border-box;
        }

        .import-action-btn:hover {
          filter: brightness(1.08);
          box-shadow: 0 2px 8px rgba(124, 58, 237, 0.28);
        }

        .segmented-controls {
          display: flex;
          align-items: center;
          height: 28px;
          background: #0b0f19;
          border: 1px solid #223048;
          border-radius: 6px;
          padding: 2px;
          gap: 2px;
          box-sizing: border-box;
        }

        .segment-btn {
          background: transparent;
          border: 1px solid transparent;
          color: #8899ac;
          font-size: 11px;
          font-weight: 600;
          padding: 0 9px;
          height: 22px;
          border-radius: 4px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          transition: all 0.15s ease;
          white-space: nowrap;
          box-sizing: border-box;
        }

        .segment-btn:hover {
          color: #f1f5f9;
        }

        .segment-btn.active {
          background: #1e2a42;
          color: #ffffff;
          border-color: rgba(255, 255, 255, 0.09);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
        }

        .segment-count {
          font-size: 9.5px;
          background: rgba(255, 255, 255, 0.08);
          padding: 1px 5px;
          border-radius: 10px;
          font-family: monospace;
        }

        .category-filter-bar {
          display: flex;
          align-items: center;
          gap: 12px;
          background: #0f1523;
          border: 1px solid #182235;
          padding: 8px 14px;
          border-radius: 8px;
          overflow-x: auto;
        }

        .category-label {
          display: flex;
          align-items: center;
          gap: 5px;
          color: #64748b;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          flex-shrink: 0;
        }

        .category-pills {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: nowrap;
        }

        .cat-pill {
          background: #141c2c;
          border: 1px solid #1f2b42;
          color: #94a3b8;
          font-size: 11px;
          font-weight: 500;
          padding: 3px 10px;
          border-radius: 6px;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.12s ease;
        }

        .cat-pill:hover {
          background: #1c263c;
          color: #e2e8f0;
        }

        .cat-pill.active {
          background: #1e2a42;
          border-color: #334155;
          color: #ffffff;
          font-weight: 600;
        }

        .mcp-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
          gap: 14px;
        }

        .mcp-card {
          background: #111726;
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 11px;
          padding: 16px 18px;
          display: flex;
          flex-direction: column;
          min-height: 210px;
          transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
          position: relative;
        }

        .mcp-card:hover {
          border-color: rgba(99, 102, 241, 0.35);
          background: #131b2c;
          box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.45);
          transform: translateY(-1px);
        }

        /* Header */
        .card-header-cluster {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 11px;
        }

        .card-header-left {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }

        .card-icon-avatar.mcp {
          width: 34px;
          height: 34px;
          border-radius: 8px;
          background: rgba(99, 102, 241, 0.12);
          border: 1px solid rgba(99, 102, 241, 0.25);
          color: #818cf8;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .card-identity-text {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }

        .card-title-row {
          display: flex;
          align-items: center;
          gap: 7px;
        }

        .card-item-name {
          font-size: 14px;
          font-weight: 600;
          color: #f8fafc;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          letter-spacing: -0.01em;
        }

        .card-sub-meta {
          display: flex;
          align-items: center;
          gap: 5px;
          min-width: 0;
        }

        .card-cat-text {
          font-size: 10px;
          color: #8fa0b5;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          font-weight: 600;
        }

        .card-meta-dot {
          color: #3b4d66;
          font-size: 10px;
        }

        .author-text {
          font-size: 10.5px;
          color: #64748b;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
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

        .card-header-right {
          flex-shrink: 0;
        }

        .status-pill-clean {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 3px 8px;
          border-radius: 9999px;
          font-size: 9.5px;
          font-weight: 600;
          letter-spacing: 0.02em;
        }

        .status-pill-clean.installed {
          color: #34d399;
          background: rgba(16, 185, 129, 0.08);
          border: 1px solid rgba(16, 185, 129, 0.22);
        }

        .status-pill-clean.partial {
          color: #fbbf24;
          background: rgba(245, 158, 11, 0.08);
          border: 1px solid rgba(245, 158, 11, 0.22);
        }

        .status-pill-clean.available {
          color: #818cf8;
          background: rgba(129, 140, 248, 0.08);
          border: 1px solid rgba(129, 140, 248, 0.2);
        }

        .status-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .status-dot.installed {
          background: #10b981;
          box-shadow: 0 0 6px rgba(16, 185, 129, 0.6);
        }

        .status-dot.partial {
          background: #f59e0b;
          box-shadow: 0 0 6px rgba(245, 158, 11, 0.6);
        }

        .status-dot.available {
          background: #818cf8;
          box-shadow: 0 0 6px rgba(129, 140, 248, 0.5);
        }

        /* Body */
        .card-content-body {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 12px;
        }

        .card-description-text {
          font-size: 12px;
          color: #94a3b8;
          line-height: 1.5;
          margin: 0;
          min-height: 36px;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .equipped-agents-bar {
          display: flex;
          align-items: center;
          gap: 6px;
          background: rgba(0, 0, 0, 0.25);
          border: 1px solid rgba(255, 255, 255, 0.05);
          padding: 4px 8px;
          border-radius: 6px;
        }

        .equipped-label {
          font-size: 9.5px;
          color: #64748b;
          font-weight: 600;
          flex-shrink: 0;
        }

        .equipped-pills-list {
          display: flex;
          align-items: center;
          gap: 4px;
          flex-wrap: wrap;
        }

        .agent-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 1.5px 6px;
          border-radius: 4px;
          font-size: 9.5px;
          font-weight: 600;
          border: 1px solid;
        }

        .command-snippet {
          background: rgba(0, 0, 0, 0.35);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 6px;
          padding: 5px 9px;
          display: flex;
          align-items: center;
          gap: 7px;
          min-width: 0;
        }

        .cmd-icon {
          color: #38bdf8;
          flex-shrink: 0;
        }

        .cmd-icon.sse {
          color: #34d399;
        }

        .cmd-text {
          color: #cbd5e1;
          font-size: 10.5px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          flex: 1;
        }

        /* Bottom Toolbar */
        .card-bottom-toolbar {
          margin-top: auto;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
          padding-top: 11px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }

        .toolbar-left-chips {
          display: flex;
          align-items: center;
          gap: 5px;
          flex-wrap: wrap;
          min-width: 0;
        }

        .meta-subtle-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 10px;
          color: #72849a;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          padding: 2px 6px;
          border-radius: 4px;
        }

        .meta-subtle-badge.env-chip {
          color: #fbbf24;
          background: rgba(251, 191, 36, 0.06);
          border-color: rgba(251, 191, 36, 0.2);
        }

        .toolbar-right-actions {
          display: flex;
          align-items: center;
          gap: 5px;
          flex-shrink: 0;
        }

        .card-action-icon-btn {
          width: 28px;
          height: 28px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: #141c2c;
          border: 1px solid #223049;
          color: #8fa0b5;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s ease;
          padding: 0;
          box-sizing: border-box;
        }

        .card-action-icon-btn:hover:not(:disabled) {
          background: #1d283e;
          color: #ffffff;
          border-color: #384b6c;
        }

        .card-action-icon-btn.danger {
          color: #f87171;
          border-color: rgba(239, 68, 68, 0.2);
          background: rgba(239, 68, 68, 0.05);
        }

        .card-action-icon-btn.danger:hover:not(:disabled) {
          background: rgba(239, 68, 68, 0.18);
          color: #ffffff;
          border-color: rgba(239, 68, 68, 0.45);
        }

        .card-action-icon-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .mcp-view-container .card-primary-action-btn,
        .card-primary-action-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          height: 28px;
          padding: 0 11px;
          background: #141c2c;
          border: 1px solid #223048;
          color: #e2e8f0;
          font-size: 11px;
          font-weight: 600;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s ease;
          white-space: nowrap;
          box-sizing: border-box;
          box-shadow: none;
        }

        .mcp-view-container .card-primary-action-btn:hover:not(:disabled) {
          background: linear-gradient(135deg, #5b21b6, #4c1d95);
          border-color: rgba(124, 58, 237, 0.35);
          color: #ffffff;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3), 0 0 6px rgba(109, 40, 217, 0.2);
          transform: translateY(-0.5px);
        }

        .card-primary-action-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .spin {
          animation: spin 1s linear infinite;
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
