import React, { useState, useEffect, useMemo } from 'react';
import { ScannedPlugin, ScannedSkill, ScannedMcpServer, SupportedAgent } from '../types/agent';
import { CatalogPlugin, CatalogSkill } from '../types/catalog';
import { PLUGINS_CATALOG } from '../data/pluginsCatalog';
import { SKILLS_CATALOG } from '../data/skillsCatalog';
import { 
  Boxes, 
  Bot, 
  Sparkles, 
  Terminal, 
  Cpu, 
  Server, 
  Compass, 
  Layers, 
  Download,
  CheckCircle2,
  Loader2,
  Filter,
  FolderOpen,
  RefreshCw,
  Archive
} from 'lucide-react';
import { logActivity } from '../services/activityLogger';
import { ForgePluginModal } from './ForgePluginModal';

interface PluginsViewProps {
  plugins: ScannedPlugin[];
  selectedAgents: SupportedAgent[];
  allAgents?: SupportedAgent[];
  skills?: ScannedSkill[];
  mcpServers?: ScannedMcpServer[];
  pluginsCatalog?: CatalogPlugin[];
  skillsCatalog?: CatalogSkill[];
  isSyncingCatalog?: boolean;
  onSyncCatalog?: () => Promise<void>;
  catalogSyncedAt?: string | null;
  onCreatePlugin?: () => void;
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

interface UnifiedPluginCard {
  id: string;
  name: string;
  version: string;
  description: string;
  category?: string;
  author?: string;
  bundledSkills: string[];
  bundledMcps: string[];
  tags?: string[];
  isCatalog: boolean;
  installedAgents: SupportedAgent[];
  rulesCount?: number;
  sourcePath?: string;
}

export const PluginsView: React.FC<PluginsViewProps> = ({
  plugins,
  selectedAgents,
  allAgents,
  skills,
  mcpServers,
  pluginsCatalog,
  skillsCatalog,
  isSyncingCatalog = false,
  onSyncCatalog,
  catalogSyncedAt,
  onCreatePlugin,
  onRefreshCapabilities,
  searchQuery = '',
  highlightedId,
}) => {
  const [activeSegment, setActiveSegment] = useState<SegmentTab>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [loadingPluginId, setLoadingPluginId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [isForgeModalOpen, setIsForgeModalOpen] = useState(false);

  const activePluginsCatalog = pluginsCatalog || PLUGINS_CATALOG;
  const activeSkillsCatalog = skillsCatalog || SKILLS_CATALOG;

  useEffect(() => {
    if (actionMessage) {
      const timer = setTimeout(() => setActionMessage(null), 3200);
      return () => clearTimeout(timer);
    }
  }, [actionMessage]);

  // Data Processing
  const unifiedPlugins = useMemo<UnifiedPluginCard[]>(() => {
    const list: UnifiedPluginCard[] = [];
    const processedIds = new Set<string>();

    for (const cat of activePluginsCatalog) {
      processedIds.add(cat.id.toLowerCase());
      const installedOn = selectedAgents.filter((agent) =>
        plugins.some(
          (p) =>
            p.sourceAgentId === agent.id &&
            (p.folderName?.toLowerCase() === cat.id.toLowerCase() ||
              p.name.toLowerCase() === cat.name.toLowerCase())
        )
      );

      list.push({
        id: cat.id,
        name: cat.name,
        version: cat.version,
        description: cat.description,
        category: cat.category,
        author: cat.author,
        bundledSkills: cat.bundledSkills,
        bundledMcps: cat.bundledMcps,
        tags: cat.tags,
        isCatalog: true,
        installedAgents: installedOn,
      });
    }

    for (const p of plugins) {
      const folder = (p.folderName || p.name).toLowerCase();
      if (!processedIds.has(folder)) {
        processedIds.add(folder);
        const installedOn = selectedAgents.filter((agent) =>
          plugins.some(
            (other) =>
              other.sourceAgentId === agent.id &&
              (other.folderName?.toLowerCase() === folder || other.name.toLowerCase() === p.name.toLowerCase())
          )
        );

        list.push({
          id: p.folderName || p.id,
          name: p.name,
          version: p.version,
          description: p.description,
          category: 'Custom Bundle',
          author: p.author || 'Local',
          bundledSkills: Array(p.skillsCount).fill('Skill'),
          bundledMcps: Array(p.mcpsCount).fill('MCP'),
          rulesCount: p.rulesCount,
          isCatalog: false,
          installedAgents: installedOn,
          sourcePath: p.sourcePath,
        });
      }
    }

    return list;
  }, [plugins, selectedAgents]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    unifiedPlugins.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return ['All', ...Array.from(set)];
  }, [unifiedPlugins]);

  const counts = useMemo(() => {
    const installed = unifiedPlugins.filter((p) => p.installedAgents.length > 0).length;
    const available = unifiedPlugins.filter((p) => p.isCatalog && p.installedAgents.length < selectedAgents.length).length;
    return {
      all: unifiedPlugins.length,
      installed,
      available,
    };
  }, [unifiedPlugins, selectedAgents]);

  const indexedPlugins = useMemo(() => {
    return unifiedPlugins.map((p) => ({
      item: p,
      searchStr: `${p.name} ${p.description} ${p.category || ''} ${p.author || ''} ${(p.tags || []).join(' ')}`.toLowerCase(),
    }));
  }, [unifiedPlugins]);

  const filteredPlugins = useMemo(() => {
    let result = indexedPlugins;

    if (activeSegment === 'installed') {
      result = result.filter((p) => p.item.installedAgents.length > 0);
    } else if (activeSegment === 'available') {
      result = result.filter((p) => p.item.isCatalog && p.item.installedAgents.length < selectedAgents.length);
    }

    if (selectedCategory !== 'All') {
      result = result.filter((p) => p.item.category === selectedCategory);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((p) => p.searchStr.includes(q));
    }

    return result.map((p) => p.item);
  }, [indexedPlugins, activeSegment, selectedCategory, searchQuery, selectedAgents.length]);

  // Effects
  useEffect(() => {
    if (highlightedId) {
      const timer = setTimeout(() => {
        const el = document.getElementById(`plugin-card-${highlightedId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [highlightedId]);

  // Handlers
  const handleInstallPluginKit = async (plugin: UnifiedPluginCard) => {
    if (!window.electronAPI?.installPlugin) return;

    const targetAgents = selectedAgents.filter(
      (agent) => !plugin.installedAgents.some((inst) => inst.id === agent.id)
    );

    if (targetAgents.length === 0) return;

    // Skills payload
    const skillsToDownload = plugin.bundledSkills.map((sId) => {
      const cat = activeSkillsCatalog.find((c) => c.id === sId);
      const rawUrl = cat?.rawUrl || `https://raw.githubusercontent.com/sickn33/agentic-awesome-skills/main/skills/${sId}/SKILL.md`;
      return { skillId: sId, rawUrl };
    });

    setLoadingPluginId(plugin.id);
    try {
      const res = await window.electronAPI.installPlugin({
        pluginId: plugin.id,
        skills: skillsToDownload,
        targets: targetAgents.map((a) => ({
          agentId: a.id,
          skillsDir: a.paths.skillsDir,
          pluginsDir: a.paths.pluginsDir,
        })),
      });

      if (res.success) {
        setActionMessage(`Equipped kit "${plugin.name}" on ${targetAgents.map((a) => a.name).join(', ')}`);
        logActivity({
          type: 'PLUGIN',
          title: 'Plugin Kit Equipped',
          description: `Equipped kit "${plugin.name}" (${plugin.bundledSkills.length} skills) on ${targetAgents.map((a) => a.name).join(', ')}`,
          status: 'success',
        });
        if (onRefreshCapabilities) {
          await onRefreshCapabilities();
        }
      } else {
        setActionMessage(`Error: ${res.error || 'Failed to install plugin kit'}`);
        logActivity({
          type: 'PLUGIN',
          title: 'Kit Equip Failed',
          description: `Failed to equip "${plugin.name}": ${res.error || 'Unknown error'}`,
          status: 'error',
        });
      }
    } catch (err: any) {
      setActionMessage(`Error: ${err.message || 'Installation failed'}`);
      logActivity({
        type: 'PLUGIN',
        title: 'Kit Equip Error',
        description: `Error installing kit "${plugin.name}": ${err.message || 'Unknown error'}`,
        status: 'error',
      });
    } finally {
      setLoadingPluginId(null);
    }
  };

  // Open folder
  const handleOpenPluginFolder = (plugin: UnifiedPluginCard) => {
    if (!window.electronAPI?.openPath) return;
    if (plugin.sourcePath) {
      window.electronAPI.openPath(plugin.sourcePath);
      return;
    }
    const agent = plugin.installedAgents[0];
    if (agent?.paths?.pluginsDir) {
      window.electronAPI.openPath(agent.paths.pluginsDir);
    } else if (agent?.paths?.skillsDir) {
      window.electronAPI.openPath(agent.paths.skillsDir);
    }
  };

  // Export ZIP
  const handleExportPluginZip = async (plugin: UnifiedPluginCard) => {
    if (!plugin.sourcePath || !window.electronAPI?.exportInstalledPluginZip) return;
    try {
      const cleanSlug = plugin.name.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      const res = await window.electronAPI.exportInstalledPluginZip({
        pluginPath: plugin.sourcePath,
        defaultZipName: `${cleanSlug}-v${plugin.version || '1.0.0'}.zip`,
      });
      if (res.success && res.exportPath) {
        setActionMessage(`Exported "${plugin.name}" to .ZIP archive!`);
        logActivity({
          type: 'PLUGIN',
          title: `Exported "${plugin.name}" as .ZIP`,
          description: `Generated archive at ${res.exportPath}`,
          status: 'success',
        });
      }
    } catch (err: any) {
      setActionMessage(`Failed to export ZIP: ${err.message}`);
    }
  };

  return (
    <div className="plugins-view-container">
      {/* Toast Notification */}
      {actionMessage && (
        <div className="action-toast-banner">
          <CheckCircle2 size={15} />
          <span>{actionMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="plugins-view-header">
        <div className="header-info">
          <div className="title-line">
            <h2 className="view-title">Plugins & Curated Kits</h2>
            <span className="count-pill font-mono">{plugins.length} INSTALLED</span>
            <span className="catalog-pill font-mono">{activePluginsCatalog.length.toLocaleString()} IN CLOUD CATALOG</span>
            {catalogSyncedAt && (
              <span className="sync-pill font-mono" title={`Synced with AAS: ${new Date(catalogSyncedAt).toLocaleString()}`}>
                <CheckCircle2 size={10} /> AAS SYNCED
              </span>
            )}
          </div>
          <p className="view-desc">
            Complete multi-skill bundles equipping your selected agent(s) with high-utility capability kits.
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
              Installed <span className="segment-count">{counts.installed}</span>
            </button>
            <button
              className={`segment-btn ${activeSegment === 'available' ? 'active' : ''}`}
              onClick={() => setActiveSegment('available')}
            >
              Available Kits <span className="segment-count">{counts.available}</span>
            </button>

            {onSyncCatalog && (
              <>
                <div className="segment-divider" />
                <button
                  className={`segment-sync-btn ${isSyncingCatalog ? 'syncing' : ''}`}
                  onClick={onSyncCatalog}
                  disabled={isSyncingCatalog}
                  title={isSyncingCatalog ? 'Syncing cloud kits from GitHub...' : 'Sync latest plugin bundles from sickn33/agentic-awesome-skills'}
                  aria-label="Sync Cloud Kits"
                >
                  <RefreshCw size={12} className={isSyncingCatalog ? 'spin' : ''} />
                </button>
              </>
            )}
          </div>

          <div className="header-buttons-row">
            <button
              className="import-action-btn"
              onClick={() => {
                if (onCreatePlugin) {
                  onCreatePlugin();
                } else {
                  setIsForgeModalOpen(true);
                }
              }}
              title="Forge and bundle custom capabilities into a shareable plugin kit"
            >
              <Sparkles size={12} />
              <span>Forge Plugin</span>
            </button>
          </div>
        </div>
      </div>

      {/* Category Filter Bar */}
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
            Use the agent selector dropdown in the top bar to choose which AI agents to equip.
          </div>
        </div>
      ) : filteredPlugins.length === 0 ? (
        <div className="empty-state-card">
          <div className="empty-icon-wrap">
            <Boxes size={28} />
          </div>
          <div className="empty-title">
            {searchQuery ? 'No matching plugins found' : 'No plugins in this view'}
          </div>
          <div className="empty-desc">
            {searchQuery
              ? `No plugins match "${searchQuery}". Try another search query.`
              : activeSegment === 'installed'
              ? 'No plugins are currently installed in your selected agents. Switch to "Available Kits" to install with 1-click.'
              : 'All catalog plugin kits are already equipped on your selected agents.'}
          </div>
        </div>
      ) : (
        <div className="plugins-grid">
          {filteredPlugins.map((plugin) => {
            const isInstalledOnAll =
              selectedAgents.length > 0 && plugin.installedAgents.length === selectedAgents.length;
            const isPartiallyInstalled =
              plugin.installedAgents.length > 0 && plugin.installedAgents.length < selectedAgents.length;
            const isHighlighted =
              highlightedId === plugin.id ||
              plugins.some((p) => p.id === highlightedId && (p.folderName === plugin.id || p.name === plugin.name));
            const isLoading = loadingPluginId === plugin.id;

            return (
              <div
                key={plugin.id}
                id={`plugin-card-${plugin.id}`}
                className={`plugin-card ${isHighlighted ? 'item-card-highlighted' : ''}`}
              >
                {/* 1. Header: Icon Avatar + Name/Version + Status */}
                <div className="card-header-cluster">
                  <div className="card-header-left">
                    <div className="card-icon-avatar plugin">
                      <Boxes size={16} />
                    </div>
                    <div className="card-identity-text">
                      <div className="card-title-row">
                        <span className="card-item-name" title={plugin.name}>{plugin.name}</span>
                        <span className="version-badge font-mono">v{plugin.version}</span>
                      </div>
                      <div className="card-sub-meta">
                        {plugin.category && (
                          <span className="card-cat-text font-mono">{plugin.category}</span>
                        )}
                        {plugin.category && plugin.author && (
                          <span className="card-meta-dot">·</span>
                        )}
                        {plugin.author && (
                          <span className="author-text font-mono">by {plugin.author}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="card-header-right">
                    {isInstalledOnAll ? (
                      <span className="status-pill-clean installed font-mono">
                        <span className="status-dot installed" />
                        <span>INSTALLED</span>
                      </span>
                    ) : isPartiallyInstalled ? (
                      <span className="status-pill-clean partial font-mono">
                        <span className="status-dot partial" />
                        <span>PARTIAL ({plugin.installedAgents.length}/{selectedAgents.length})</span>
                      </span>
                    ) : (
                      <span className="status-pill-clean available font-mono">
                        <span className="status-dot available" />
                        <span>AVAILABLE</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* 2. Body: Description + Bundled capabilities + Equipped Agents */}
                <div className="card-content-body">
                  <p className="card-description-text">{plugin.description}</p>

                  <div className="bundled-stats-row">
                    <span className="meta-subtle-badge skills font-mono">
                      <Sparkles size={11} />
                      <span>{plugin.bundledSkills.length} Skills</span>
                    </span>
                    <span className="meta-subtle-badge mcps font-mono">
                      <Server size={11} />
                      <span>{plugin.bundledMcps.length} MCPs</span>
                    </span>
                  </div>

                  {plugin.installedAgents.length > 0 && (
                    <div className="equipped-agents-bar">
                      <span className="equipped-label font-mono">Active on:</span>
                      <div className="equipped-pills-list">
                        {plugin.installedAgents.map((ag) => {
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

                {/* 3. Bottom Toolbar */}
                <div className="card-bottom-toolbar">
                  <div className="toolbar-left-chips">
                    <span className="source-path-clean font-mono" title={plugin.id}>
                      {plugin.id}
                    </span>
                  </div>

                  <div className="toolbar-right-actions">
                    {/* Open Folder Button for Installed Plugins */}
                    {plugin.installedAgents.length > 0 && (
                      <button
                        type="button"
                        className="card-action-icon-btn"
                        onClick={() => handleOpenPluginFolder(plugin)}
                        title="Open plugin directory in File Explorer"
                      >
                        <FolderOpen size={13} />
                      </button>
                    )}

                    {/* Export as ZIP for Installed Plugins */}
                    {plugin.installedAgents.length > 0 && plugin.sourcePath && (
                      <button
                        type="button"
                        className="card-action-icon-btn"
                        onClick={() => handleExportPluginZip(plugin)}
                        title="Export this installed plugin as a shareable .ZIP archive"
                      >
                        <Archive size={13} />
                      </button>
                    )}

                    {/* Install Button */}
                    {(!isInstalledOnAll && plugin.isCatalog) && (
                      <button
                        type="button"
                        className="card-primary-action-btn plugin"
                        onClick={() => handleInstallPluginKit(plugin)}
                        disabled={isLoading}
                      >
                        {isLoading ? (
                          <>
                            <Loader2 size={11} className="spin" />
                            <span>Installing...</span>
                          </>
                        ) : (
                          <>
                            <Download size={11} />
                            <span>
                              {isPartiallyInstalled
                                ? `Equip (${selectedAgents.length - plugin.installedAgents.length})`
                                : selectedAgents.length > 1
                                ? `Equip to ${selectedAgents.length}`
                                : 'Install Kit'}
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

      {/* Forge Skill Kit & Plugin Bundler Modal */}
      <ForgePluginModal
        isOpen={isForgeModalOpen}
        onClose={() => setIsForgeModalOpen(false)}
        agents={allAgents && allAgents.length > 0 ? allAgents : selectedAgents}
        skills={skills || []}
        mcpServers={mcpServers || []}
        onPluginForged={async (pluginName, action, countOrPath) => {
          if (action === 'install') {
            setActionMessage(`Successfully forged and equipped "${pluginName}" to ${countOrPath} agent(s)!`);
            if (onRefreshCapabilities) {
              await onRefreshCapabilities();
            }
          } else {
            setActionMessage(`Successfully forged "${pluginName}" bundle!`);
          }
        }}
      />

      <style>{`
        .plugins-view-container {
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

        .plugins-view-header {
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
          color: #38bdf8;
          background: rgba(56, 189, 248, 0.12);
          padding: 2px 7px;
          border-radius: 4px;
          border: 1px solid rgba(56, 189, 248, 0.25);
        }

        .catalog-pill {
          font-size: 10px;
          font-weight: 700;
          color: #c084fc;
          background: rgba(192, 132, 252, 0.12);
          padding: 2px 7px;
          border-radius: 4px;
          border: 1px solid rgba(192, 132, 252, 0.25);
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

        .segment-divider {
          width: 1px;
          height: 14px;
          background: #1c273c;
          margin: 0 2px;
          flex-shrink: 0;
        }

        .segment-sync-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 22px;
          height: 22px;
          padding: 0;
          background: transparent;
          border: none;
          border-radius: 4px;
          color: #8899ac;
          cursor: pointer;
          transition: all 0.15s ease;
          flex-shrink: 0;
          box-sizing: border-box;
        }

        .segment-sync-btn:hover:not(:disabled) {
          background: #141c2c;
          color: #93c5fd;
        }

        .segment-sync-btn.syncing {
          color: #60a5fa;
        }

        .segment-sync-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
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
          box-shadow: 0 2px 8px rgba(124, 58, 237, 0.25);
        }

        .import-action-btn:hover {
          filter: brightness(1.1);
          box-shadow: 0 3px 12px rgba(124, 58, 237, 0.4);
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

        .plugins-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
          gap: 14px;
        }

        .plugin-card {
          background: #111726;
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 11px;
          padding: 16px 18px;
          display: flex;
          flex-direction: column;
          min-height: 202px;
          transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
          position: relative;
        }

        .plugin-card:hover {
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

        .card-icon-avatar.plugin {
          width: 34px;
          height: 34px;
          border-radius: 8px;
          background: rgba(56, 189, 248, 0.12);
          border: 1px solid rgba(56, 189, 248, 0.25);
          color: #38bdf8;
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

        .version-badge {
          font-size: 9px;
          font-weight: 700;
          color: #38bdf8;
          background: rgba(56, 189, 248, 0.12);
          border: 1px solid rgba(56, 189, 248, 0.25);
          padding: 1px 5px;
          border-radius: 3px;
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
          color: #38bdf8;
          background: rgba(56, 189, 248, 0.08);
          border: 1px solid rgba(56, 189, 248, 0.2);
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
          background: #38bdf8;
          box-shadow: 0 0 6px rgba(56, 189, 248, 0.5);
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

        .bundled-stats-row {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .meta-subtle-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 10px;
          padding: 2px 6px;
          border-radius: 4px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
        }

        .meta-subtle-badge.skills {
          color: #c084fc;
          background: rgba(192, 132, 252, 0.06);
          border-color: rgba(192, 132, 252, 0.2);
        }

        .meta-subtle-badge.mcps {
          color: #818cf8;
          background: rgba(129, 140, 248, 0.06);
          border-color: rgba(129, 140, 248, 0.2);
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
          min-width: 0;
        }

        .source-path-clean {
          font-size: 10px;
          color: #64748b;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 140px;
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

        .card-action-icon-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .plugins-view-container .card-primary-action-btn,
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

        .plugins-view-container .card-primary-action-btn:hover:not(:disabled) {
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
