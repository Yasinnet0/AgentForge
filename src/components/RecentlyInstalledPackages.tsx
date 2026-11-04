import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  MoreVertical,
  ExternalLink,
  PackageCheck,
  FolderOpen,
  Copy,
  Check,
  Trash2,
  Info,
  X,
  Sparkles,
  LayoutGrid,
  List as ListIcon,
  Loader2,
  Bot,
  Boxes,
  Server,
  Globe,
  RotateCcw,
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { SupportedAgent } from '../types/agent';
import { useModalTransition } from '../hooks/useModalTransition';
import { AGENT_ICON_MAP } from './AgentIcon';

export interface InstalledPackage {
  id: string;
  name: string;
  version: string;
  type: 'MCP SERVER' | 'PLUGIN' | 'SKILL BUNDLE' | 'SKILL' | 'AGENT';
  source: 'COMMUNITY' | 'OFFICIAL' | 'LOCAL';
  installedDate: string;
  status: 'Active' | 'Idle' | 'Updating';
  rawType?: 'mcp' | 'plugin' | 'skill';
  mtimeMs?: number;
  sourcePath?: string;
  sourceAgentId?: string;
  sourceAgentName?: string;
  sourceAgentColor?: string;
  sourceAgentIcon?: string;
  folderName?: string;
  description?: string;
  command?: string;
  args?: string[];
  transport?: 'stdio' | 'sse';
  url?: string;
  author?: string;
  skillsCount?: number;
  mcpsCount?: number;
  hasScripts?: boolean;
  hasReferences?: boolean;
}

interface RecentlyInstalledPackagesProps {
  packages?: InstalledPackage[];
  searchQuery?: string;
  onNavigate?: (tab: any, itemId?: string) => void;
  agents?: SupportedAgent[];
  onRefreshCapabilities?: () => Promise<void>;
}

export const RecentlyInstalledPackagesComponent: React.FC<RecentlyInstalledPackagesProps> = ({
  packages = [],
  searchQuery = '',
  onNavigate,
  agents = [],
  onRefreshCapabilities,
}) => {
  const toast = useToast();

  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    return (localStorage.getItem('agentforge_view_mode_overview') as 'grid' | 'list') || 'list';
  });

  const handleViewModeChange = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    localStorage.setItem('agentforge_view_mode_overview', mode);
  };

  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{
    top?: number;
    bottom?: number;
    right: number;
    maxHeight?: number;
  } | null>(null);
  const [selectedPackageForDetails, setSelectedPackageForDetails] = useState<InstalledPackage | null>(null);

  const {
    isRendered: isDetailsModalRendered,
    isClosing: isDetailsModalClosing,
    handleClose: handleCloseDetailsModal,
  } = useModalTransition(
    Boolean(selectedPackageForDetails),
    () => setSelectedPackageForDetails(null),
    180
  );

  const lastSelectedPkgRef = useRef<InstalledPackage | null>(null);
  if (selectedPackageForDetails) {
    lastSelectedPkgRef.current = selectedPackageForDetails;
  }
  const activePackageForDetails = selectedPackageForDetails || lastSelectedPkgRef.current;

  const [copiedPathId, setCopiedPathId] = useState<string | null>(null);
  const [isUninstalling, setIsUninstalling] = useState<string | null>(null);
  const [isReinstalling, setIsReinstalling] = useState<string | null>(null);
  const [confirmUninstallId, setConfirmUninstallId] = useState<string | null>(null);

  const confirmTimerRef = useRef<NodeJS.Timeout | null>(null);

  const filteredPackages = useMemo(() => {
    if (!searchQuery.trim()) return packages;
    const q = searchQuery.toLowerCase().trim();
    return packages.filter(
      (pkg) =>
        pkg.name.toLowerCase().includes(q) ||
        pkg.type.toLowerCase().includes(q) ||
        pkg.source.toLowerCase().includes(q) ||
        (pkg.sourceAgentName && pkg.sourceAgentName.toLowerCase().includes(q))
    );
  }, [packages, searchQuery]);

  const renderStatusBadge = (status: 'Active' | 'Idle' | 'Updating') => {
    if (status === 'Active') {
      return (
        <span className="status-pill-clean installed font-mono" title="Package status: Active">
          <span className="status-dot installed" />
          <span>ACTIVE</span>
        </span>
      );
    }
    if (status === 'Updating') {
      return (
        <span className="status-pill-clean partial font-mono" title="Package status: Updating">
          <Loader2 size={10} className="spin-icon" />
          <span>UPDATING</span>
        </span>
      );
    }
    return (
      <span className="status-pill-clean available font-mono" title="Package status: Idle">
        <span className="status-dot available" />
        <span>IDLE</span>
      </span>
    );
  };

  // Click outside, escape, and scroll handling for floating menu and modal
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.pkg-options-dropdown') && !target.closest('.row-action-btn')) {
        setActiveMenuId(null);
        setMenuPosition(null);
        setConfirmUninstallId(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveMenuId(null);
        setMenuPosition(null);
        handleCloseDetailsModal();
        setConfirmUninstallId(null);
      }
    };

    const handleScroll = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (target && target.closest && target.closest('.pkg-options-dropdown')) {
        return;
      }
      setActiveMenuId(null);
      setMenuPosition(null);
      setConfirmUninstallId(null);
    };

    const handleResize = () => {
      setActiveMenuId(null);
      setMenuPosition(null);
      setConfirmUninstallId(null);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
      if (confirmTimerRef.current) {
        clearTimeout(confirmTimerRef.current);
      }
    };
  }, [handleCloseDetailsModal]);

  const resolvePackagePath = (pkg: InstalledPackage): string | undefined => {
    if (pkg.sourcePath) return pkg.sourcePath;
    const agent = agents.find((a) => a.id === pkg.sourceAgentId);
    if (!agent) return undefined;
    if (pkg.rawType === 'mcp') return agent.paths.mcpConfigPath;
    if (pkg.rawType === 'plugin') return agent.paths.pluginsDir;
    if (pkg.rawType === 'skill') return agent.paths.skillsDir;
    return undefined;
  };

  const handleMenuToggle = (e: React.MouseEvent, pkg: InstalledPackage) => {
    e.stopPropagation();
    if (activeMenuId === pkg.id) {
      setActiveMenuId(null);
      setMenuPosition(null);
      setConfirmUninstallId(null);
    } else {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const openUpward = spaceBelow < 280 && spaceAbove > spaceBelow;
      setMenuPosition({
        top: openUpward ? undefined : rect.bottom + 4,
        bottom: openUpward ? window.innerHeight - rect.top + 4 : undefined,
        right: Math.max(8, window.innerWidth - rect.right),
        maxHeight: Math.max(160, (openUpward ? spaceAbove : spaceBelow) - 16),
      });
      setActiveMenuId(pkg.id);
      setConfirmUninstallId(null);
    }
  };

  const handleOpenFolder = async (pkg: InstalledPackage) => {
    setActiveMenuId(null);
    const targetPath = resolvePackagePath(pkg);
    if (!targetPath) {
      toast.warning(`No filesystem path found for "${pkg.name}"`);
      return;
    }

    if (!window.electronAPI?.openPath) {
      toast.warning('Open folder is only available in the desktop app');
      return;
    }

    try {
      const ok = await window.electronAPI.openPath(targetPath);
      if (ok) {
        toast.info(`Opened in File Explorer`);
      } else {
        toast.warning(`Could not open path: ${targetPath}`);
      }
    } catch (err: any) {
      toast.error(`Failed to open folder: ${err.message || 'Unknown error'}`);
    }
  };

  const handleCopyPath = async (pkg: InstalledPackage) => {
    setActiveMenuId(null);
    const targetPath = resolvePackagePath(pkg);
    if (!targetPath) {
      toast.warning('No path available to copy');
      return;
    }

    try {
      await navigator.clipboard.writeText(targetPath);
      setCopiedPathId(pkg.id);
      toast.success('Path copied to clipboard');
      setTimeout(() => setCopiedPathId(null), 2500);
    } catch (err: any) {
      toast.error('Failed to copy to clipboard');
    }
  };

  const handleNavigateToView = (pkg: InstalledPackage) => {
    setActiveMenuId(null);
    if (!onNavigate) return;
    const targetId = pkg.folderName || pkg.name || pkg.id;
    if (pkg.rawType === 'mcp') {
      onNavigate('mcp', targetId);
    } else if (pkg.rawType === 'plugin') {
      onNavigate('plugins', targetId);
    } else if (pkg.rawType === 'skill') {
      onNavigate('skills', targetId);
    } else {
      onNavigate('agents', pkg.sourceAgentId || targetId);
    }
  };

  const handleUninstallPackage = async (pkg: InstalledPackage) => {
    if (confirmUninstallId !== pkg.id) {
      setConfirmUninstallId(pkg.id);
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = setTimeout(() => {
        setConfirmUninstallId((prev) => (prev === pkg.id ? null : prev));
      }, 4000);
      return;
    }

    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    setConfirmUninstallId(null);
    setActiveMenuId(null);
    setIsUninstalling(pkg.id);

    try {
      const targetAgent = agents.find((a) => a.id === pkg.sourceAgentId);
      let success = false;
      let errorMsg = '';

      if (pkg.rawType === 'mcp') {
        if (!window.electronAPI?.uninstallMcp) throw new Error('Uninstall MCP not available');
        if (!targetAgent?.paths?.mcpConfigPath) throw new Error(`MCP config path not found for ${pkg.sourceAgentName || 'agent'}`);
        const res = await window.electronAPI.uninstallMcp({
          serverKey: pkg.name,
          targets: [{
            agentId: targetAgent.id,
            mcpConfigPath: targetAgent.paths.mcpConfigPath,
          }],
        });
        success = res.success;
        errorMsg = res.error || '';
      } else if (pkg.rawType === 'plugin') {
        if (!window.electronAPI?.uninstallPlugin) throw new Error('Uninstall Plugin not available');
        if (!targetAgent?.paths?.pluginsDir) throw new Error(`Plugins dir not found for ${pkg.sourceAgentName || 'agent'}`);
        const folderName = pkg.folderName || pkg.name;
        const res = await window.electronAPI.uninstallPlugin({
          pluginId: folderName,
          folderName: folderName,
          targets: [{
            agentId: targetAgent.id,
            pluginsDir: targetAgent.paths.pluginsDir,
          }],
        });
        success = res.success;
        errorMsg = res.error || '';
      } else if (pkg.rawType === 'skill') {
        if (!window.electronAPI?.uninstallSkill) throw new Error('Uninstall Skill not available');
        if (!targetAgent?.paths?.skillsDir) throw new Error(`Skills dir not found for ${pkg.sourceAgentName || 'agent'}`);
        const skillId = pkg.folderName || pkg.name;
        const res = await window.electronAPI.uninstallSkill({
          skillId: skillId,
          targets: [{
            agentId: targetAgent.id,
            skillsDir: targetAgent.paths.skillsDir,
          }],
        });
        success = res.success;
        errorMsg = res.error || '';
      }

      if (success) {
        toast.success(`Removed "${pkg.name}" from ${pkg.sourceAgentName || 'agent'}`);
        if (activePackageForDetails?.id === pkg.id) {
          handleCloseDetailsModal();
        }
        if (onRefreshCapabilities) {
          await onRefreshCapabilities();
        }
      } else {
        toast.error(`Error: ${errorMsg || 'Failed to remove package'}`);
      }
    } catch (err: any) {
      toast.error(`Error: ${err.message || 'Uninstall failed'}`);
    } finally {
      setIsUninstalling(null);
    }
  };

  const handleReinstallPackage = async (pkg: InstalledPackage) => {
    setActiveMenuId(null);
    setIsReinstalling(pkg.id);
    const targetAgent = agents.find((a) => a.id === pkg.sourceAgentId);

    try {
      if (pkg.rawType === 'mcp') {
        if (!window.electronAPI?.installMcp) throw new Error('MCP install API not available');
        const targetAgentId = targetAgent?.id || 'antigravity';
        const targetConfigPath = targetAgent?.paths?.mcpConfigPath || '';

        const res = await window.electronAPI.installMcp({
          serverKey: pkg.name,
          serverConfig: {
            command: pkg.command || 'npx',
            args: pkg.args || ['-y', pkg.name],
            env: {},
          },
          targets: targetConfigPath ? [{ agentId: targetAgentId, mcpConfigPath: targetConfigPath }] : [],
        });

        if (res.success) {
          toast.success(`Reinstalled MCP "${pkg.name}" (credentials preserved)`);
          if (onRefreshCapabilities) await onRefreshCapabilities();
        } else {
          toast.error(res.error || 'Failed to reinstall MCP server');
        }
      } else if (pkg.rawType === 'skill') {
        if (!window.electronAPI?.uninstallSkill || !window.electronAPI?.installSkill) {
          throw new Error('Skill APIs not available');
        }
        const skillId = pkg.folderName || pkg.name;
        const targetSkillsDir = targetAgent?.paths?.skillsDir || '';

        if (targetSkillsDir && targetAgent) {
          await window.electronAPI.uninstallSkill({
            skillId,
            targets: [{ agentId: targetAgent.id, skillsDir: targetSkillsDir }],
          });
          const res = await window.electronAPI.installSkill({
            skillId,
            rawUrl: pkg.url || `https://raw.githubusercontent.com/anthropics/skills/main/${skillId}/SKILL.md`,
            targets: [{ agentId: targetAgent.id, skillsDir: targetSkillsDir }],
          });
          if (res.success) {
            toast.success(`Reinstalled skill "${pkg.name}" from source`);
            if (onRefreshCapabilities) await onRefreshCapabilities();
          } else {
            toast.error(res.error || 'Failed to reinstall skill');
          }
        } else {
          toast.warning('No host agent directory found for reinstalling this skill');
        }
      } else if (pkg.rawType === 'plugin') {
        if (!window.electronAPI?.uninstallPlugin || !window.electronAPI?.installPlugin) {
          throw new Error('Plugin APIs not available');
        }
        const pluginId = pkg.folderName || pkg.name;
        const targetPluginsDir = targetAgent?.paths?.pluginsDir || '';

        if (targetPluginsDir && targetAgent) {
          await window.electronAPI.uninstallPlugin({
            pluginId,
            folderName: pluginId,
            targets: [{ agentId: targetAgent.id, pluginsDir: targetPluginsDir }],
          });
          const res = await window.electronAPI.installPlugin({
            pluginId,
            name: pkg.name,
            version: pkg.version || '1.0.0',
            description: pkg.description || '',
            author: pkg.author || 'AgentForge Community',
            skills: [],
            targets: [{
              agentId: targetAgent.id,
              pluginsDir: targetPluginsDir,
              skillsDir: targetAgent.paths.skillsDir,
              mcpConfigPath: targetAgent.paths.mcpConfigPath,
            }],
          });
          if (res.success) {
            toast.success(`Reinstalled plugin "${pkg.name}" from source`);
            if (onRefreshCapabilities) await onRefreshCapabilities();
          } else {
            toast.error(res.error || 'Failed to reinstall plugin');
          }
        } else {
          toast.warning('No host agent directory found for reinstalling this plugin');
        }
      }
    } catch (err: any) {
      toast.error(`Reinstall failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsReinstalling(null);
    }
  };

  return (
    <div className="packages-container">
      <div className="packages-header">
        <div className="packages-title-row">
          <PackageCheck size={16} className="title-icon" />
          <span className="packages-title">
            {searchQuery ? `Matching Packages (${filteredPackages.length})` : 'Recently Installed Packages'}
          </span>
        </div>

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

      {filteredPackages.length > 0 ? (
        viewMode === 'grid' ? (
          <div className="packages-cards-grid">
            {filteredPackages.map((pkg) => {
              const agent = agents.find((a) => a.id === pkg.sourceAgentId);
              const agentColor = agent?.color || pkg.sourceAgentColor || '#818cf8';
              const agentName = agent?.name || pkg.sourceAgentName;
              const iconKey = agent?.iconName || pkg.sourceAgentIcon || 'Bot';
              const AgentIcon = AGENT_ICON_MAP[agent?.id || ''] || AGENT_ICON_MAP[iconKey] || Bot;

              const isMcp = pkg.rawType === 'mcp' || pkg.type === 'MCP SERVER';
              const isPlugin = pkg.rawType === 'plugin' || pkg.type === 'PLUGIN' || (pkg.type as string) === 'SKILL BUNDLE';
              const typeClass = isMcp ? 'mcp' : isPlugin ? 'plugin' : 'skill';
              const typeLabel = isMcp ? 'MCP SERVER' : isPlugin ? 'PLUGIN' : 'SKILL';

              return (
                <div
                  key={pkg.id}
                  className={`package-grid-card type-${typeClass}`}
                  onClick={() => setSelectedPackageForDetails(pkg)}
                >
                  {/* Card Header: Icon Avatar + Name/Version/Meta + Status Badge */}
                  <div className="card-header-cluster">
                    <div className="card-header-left">
                      <div className={`card-icon-avatar ${typeClass}`}>
                        {isMcp ? (
                          <Server size={17} />
                        ) : isPlugin ? (
                          <Boxes size={17} />
                        ) : (
                          <Sparkles size={17} />
                        )}
                      </div>
                      <div className="card-identity-text">
                        <div className="card-title-row">
                          <span className="card-item-name" title={pkg.name}>{pkg.name}</span>
                          <span className="version-badge font-mono">v{pkg.version}</span>
                        </div>
                        <div className="card-sub-meta">
                          <span className={`card-type-pill font-mono ${typeClass}`}>{typeLabel}</span>
                          <span className="card-meta-dot">·</span>
                          {pkg.source ? (
                            <span className="source-registry-pill font-mono" title={`Source: ${pkg.source}`}>
                              {pkg.source}
                            </span>
                          ) : (
                            <span className="author-text font-mono">
                              {pkg.author ? `by ${pkg.author}` : 'OFFICIAL'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="card-header-right">
                      {renderStatusBadge(pkg.status)}
                    </div>
                  </div>

                  {/* Card Body: Description + Equipped Agents Bar */}
                  <div className="card-content-body">
                    <p className={`card-description-text ${!pkg.description ? 'empty-desc' : ''}`} title={pkg.description || 'Installed package component.'}>
                      {pkg.description || 'Installed package component.'}
                    </p>

                    <div className={`agent-deck-container ${!agentName ? 'pending-only' : ''}`}>
                      <div className="agent-deck-header">
                        <div className="agent-deck-label-group">
                          <Bot size={11} className="agent-deck-icon" />
                          <span className="agent-deck-title font-mono">{agentName ? 'Active in' : 'Scope'}</span>
                          <span className="agent-deck-count-badge font-mono">{agentName ? '1' : 'Global'}</span>
                        </div>
                      </div>
                      <div className="agent-deck-pills">
                        {agentName ? (
                          <div
                            className="agent-deck-pill installed font-mono"
                            style={{
                              color: agentColor,
                              borderColor: `${agentColor}45`,
                              background: `${agentColor}14`,
                            }}
                          >
                            <AgentIcon size={11} className="pill-brand-icon" />
                            <span className="pill-name">{agentName}</span>
                          </div>
                        ) : (
                          <div className="agent-deck-pill pending font-mono">
                            <span>Global Workspace</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Card Bottom Toolbar */}
                  <div className="card-bottom-toolbar" onClick={(e) => e.stopPropagation()}>
                    <div className="toolbar-left-chips">
                      <span
                        className={`meta-subtle-badge font-mono badge-${typeClass}`}
                        title={`Package Type: ${typeLabel}`}
                      >
                        {isMcp ? (
                          <Server size={11} />
                        ) : isPlugin ? (
                          <Boxes size={11} />
                        ) : (
                          <Sparkles size={11} />
                        )}
                        <span>{isMcp ? 'MCP SERVER' : isPlugin ? 'PLUGIN' : 'SKILL'}</span>
                      </span>

                      {pkg.source && (
                        <span className="meta-subtle-badge source-badge font-mono" title={`Source: ${pkg.source}`}>
                          <Globe size={11} />
                          <span>{pkg.source}</span>
                        </span>
                      )}
                    </div>

                    <div className="toolbar-right-actions">
                      <button
                        type="button"
                        className="card-action-icon-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleNavigateToView(pkg);
                        }}
                        title={`Jump to ${isMcp ? 'MCP Servers' : isPlugin ? 'Plugins' : 'Skills'} tab`}
                        aria-label="Open in management tab"
                      >
                        <ExternalLink size={13} />
                      </button>

                      <button
                        type="button"
                        className="card-action-icon-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenFolder(pkg);
                        }}
                        title="Open installation directory in File Explorer"
                        aria-label="Open folder"
                      >
                        <FolderOpen size={13} />
                      </button>

                      <button
                        type="button"
                        className="card-action-icon-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedPackageForDetails(pkg);
                        }}
                        title="View package specifications and files"
                        aria-label="Package Details"
                      >
                        <Info size={13} />
                      </button>

                      <button
                        type="button"
                        className="card-action-icon-btn reinstall"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleReinstallPackage(pkg);
                        }}
                        disabled={isReinstalling === pkg.id}
                        title="Reinstall package from source (preserves user keys)"
                        aria-label="Reinstall Package"
                      >
                        {isReinstalling === pkg.id ? (
                          <Loader2 size={13} className="spin-icon text-indigo" />
                        ) : (
                          <RotateCcw size={13} />
                        )}
                      </button>

                      <button
                        type="button"
                        className="card-action-icon-btn"
                        onClick={(e) => handleMenuToggle(e, pkg)}
                        title="More options"
                        aria-label="Package options"
                      >
                        <MoreVertical size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="packages-table-wrapper">
            <table className="packages-table">
              <thead>
                <tr>
                  <th>PACKAGE NAME</th>
                  <th>TYPE</th>
                  <th>HOST AGENT</th>
                  <th>STATUS</th>
                  <th style={{ textAlign: 'right' }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filteredPackages.map((pkg) => {
                  const agent = agents.find((a) => a.id === pkg.sourceAgentId);
                  const agentColor = agent?.color || pkg.sourceAgentColor || '#818cf8';
                  const agentName = agent?.name || pkg.sourceAgentName;
                  const iconKey = agent?.iconName || pkg.sourceAgentIcon || 'Bot';
                  const AgentIcon = AGENT_ICON_MAP[agent?.id || ''] || AGENT_ICON_MAP[iconKey] || Bot;
                  const isRowMcp = pkg.rawType === 'mcp' || pkg.type === 'MCP SERVER';
                  const isRowPlugin = pkg.rawType === 'plugin' || pkg.type === 'PLUGIN' || (pkg.type as string) === 'SKILL BUNDLE';
                  const rowTypeClass = isRowMcp ? 'mcp' : isRowPlugin ? 'plugin' : 'skill';
                  const rowTypeLabel = isRowMcp ? 'MCP SERVER' : isRowPlugin ? 'PLUGIN' : 'SKILL';

                  return (
                    <tr
                      key={pkg.id}
                      className="package-row-interactive"
                      onClick={() => setSelectedPackageForDetails(pkg)}
                      title="Click to view package details"
                    >
                      <td>
                        <div className="package-name-cell">
                          <div className={`pkg-type-mini-icon ${rowTypeClass}`}>
                            {isRowMcp ? (
                              <Server size={13} />
                            ) : isRowPlugin ? (
                              <Boxes size={13} />
                            ) : (
                              <Sparkles size={13} />
                            )}
                          </div>
                          <div className="pkg-title-cluster">
                            <span className="pkg-name font-mono">{pkg.name}</span>
                            <span className="pkg-version font-mono">{pkg.version}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span
                          className={`badge ${isRowMcp
                              ? 'badge-cyan'
                              : isRowPlugin
                                ? 'badge-amber'
                                : 'badge-purple'
                            }`}
                        >
                          {rowTypeLabel}
                        </span>
                      </td>
                      <td>
                        {agentName ? (
                          <span
                            className="agent-pill font-mono"
                            style={{
                              color: agentColor,
                              borderColor: `${agentColor}35`,
                              background: `${agentColor}0d`,
                            }}
                          >
                            <AgentIcon size={10} />
                            <span>{agentName}</span>
                          </span>
                        ) : (
                          <span className="agent-pill unequipped font-mono">
                            <span>GLOBAL</span>
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="status-cell">
                          {renderStatusBadge(pkg.status)}
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                        <div className="table-actions-cluster">
                          <button
                            type="button"
                            className="card-action-icon-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleNavigateToView(pkg);
                            }}
                            title={`Jump to ${pkg.rawType === 'mcp' ? 'MCP Servers' : pkg.rawType === 'plugin' ? 'Plugins' : 'Skills'} tab`}
                            aria-label="Open in management tab"
                          >
                            <ExternalLink size={12} />
                          </button>
                          <button
                            type="button"
                            className="card-action-icon-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenFolder(pkg);
                            }}
                            title="Open installation directory in File Explorer"
                            aria-label="Open folder"
                          >
                            <FolderOpen size={12} />
                          </button>
                          <button
                            type="button"
                            className="card-action-icon-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedPackageForDetails(pkg);
                            }}
                            title="View package specifications and files"
                            aria-label="Package Details"
                          >
                            <Info size={12} />
                          </button>
                          <button
                            type="button"
                            className="card-action-icon-btn reinstall"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleReinstallPackage(pkg);
                            }}
                            disabled={isReinstalling === pkg.id}
                            title="Reinstall package from source (preserves user keys)"
                            aria-label="Reinstall Package"
                          >
                            {isReinstalling === pkg.id ? (
                              <Loader2 size={12} className="spin-icon text-indigo" />
                            ) : (
                              <RotateCcw size={12} />
                            )}
                          </button>
                          <button
                            type="button"
                            className={`card-action-icon-btn ${activeMenuId === pkg.id ? 'active' : ''}`}
                            title="Package options"
                            onClick={(e) => handleMenuToggle(e, pkg)}
                            aria-label="Package options"
                          >
                            <MoreVertical size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <div className="packages-empty-state">
          <div className="empty-pkg-icon-wrap">
            <PackageCheck size={22} />
          </div>
          <div className="empty-pkg-title">
            {searchQuery ? 'No matching packages found' : 'No packages installed'}
          </div>
          <div className="empty-pkg-desc">
            {searchQuery
              ? `No packages match "${searchQuery}". Try a different search term.`
              : 'Installed skills, MCP servers, and context packages will appear here'}
          </div>
        </div>
      )}

      {/* Floating 3-dots Context Menu */}
      {activeMenuId && menuPosition && (() => {
        const activePkg = filteredPackages.find((p) => p.id === activeMenuId);
        if (!activePkg) return null;
        const isConfirming = confirmUninstallId === activePkg.id;

        return createPortal(
          <div
            className="pkg-options-dropdown"
            style={{
              position: 'fixed',
              top: menuPosition.top !== undefined ? `${menuPosition.top}px` : undefined,
              bottom: menuPosition.bottom !== undefined ? `${menuPosition.bottom}px` : undefined,
              right: `${menuPosition.right}px`,
              maxHeight: menuPosition.maxHeight ? `${menuPosition.maxHeight}px` : undefined,
              zIndex: 9999,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="dropdown-item"
              onClick={() => {
                setSelectedPackageForDetails(activePkg);
                setActiveMenuId(null);
              }}
            >
              <Info size={13} className="item-icon text-indigo" />
              <span>Package Details</span>
            </button>

            <button
              className="dropdown-item"
              onClick={() => handleOpenFolder(activePkg)}
            >
              <FolderOpen size={13} className="item-icon" />
              <span>Open in Explorer</span>
            </button>

            <button
              className="dropdown-item"
              onClick={() => handleCopyPath(activePkg)}
            >
              {copiedPathId === activePkg.id ? (
                <Check size={13} className="item-icon text-emerald" />
              ) : (
                <Copy size={13} className="item-icon" />
              )}
              <span>{copiedPathId === activePkg.id ? 'Copied Path!' : 'Copy Path'}</span>
            </button>

            <button
              className="dropdown-item"
              onClick={() => handleNavigateToView(activePkg)}
            >
              <ExternalLink size={13} className="item-icon" />
              <span>
                View in {activePkg.rawType === 'mcp' ? 'MCP' : activePkg.rawType === 'plugin' ? 'Plugins' : 'Skills'}
              </span>
            </button>

            <button
              className="dropdown-item"
              onClick={() => handleReinstallPackage(activePkg)}
              disabled={isReinstalling === activePkg.id}
            >
              {isReinstalling === activePkg.id ? (
                <Loader2 size={13} className="item-icon spin-icon text-indigo" />
              ) : (
                <RotateCcw size={13} className="item-icon text-indigo" />
              )}
              <span>{isReinstalling === activePkg.id ? 'Reinstalling...' : 'Reinstall Package'}</span>
            </button>

            <div className="dropdown-divider" />

            <button
              className={`dropdown-item item-danger ${isConfirming ? 'confirming' : ''}`}
              onClick={() => handleUninstallPackage(activePkg)}
              disabled={isUninstalling === activePkg.id}
            >
              <Trash2 size={13} className="item-icon" />
              <span>
                {isUninstalling === activePkg.id
                  ? 'Removing...'
                  : isConfirming
                    ? 'Confirm Remove?'
                    : 'Remove Package'}
              </span>
            </button>
          </div>,
          document.body
        );
      })()}

      {/* Package Details Modal */}
      {isDetailsModalRendered && activePackageForDetails && createPortal(
        <div
          className={`pkg-modal-backdrop ${isDetailsModalClosing ? 'is-closing' : ''}`}
          onClick={handleCloseDetailsModal}
        >
          <div
            className={`pkg-modal-card ${isDetailsModalClosing ? 'is-closing' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="pkg-modal-header">
              <div className="pkg-modal-title-area">
                <div className={`pkg-modal-icon-wrap ${activePackageForDetails.rawType === 'mcp' || activePackageForDetails.type === 'MCP SERVER' ? 'mcp' : activePackageForDetails.rawType === 'plugin' || activePackageForDetails.type === 'PLUGIN' || (activePackageForDetails.type as string) === 'SKILL BUNDLE' ? 'plugin' : 'skill'}`}>
                  {activePackageForDetails.rawType === 'mcp' || activePackageForDetails.type === 'MCP SERVER' ? (
                    <Server size={20} />
                  ) : activePackageForDetails.rawType === 'plugin' || activePackageForDetails.type === 'PLUGIN' || (activePackageForDetails.type as string) === 'SKILL BUNDLE' ? (
                    <Boxes size={20} />
                  ) : (
                    <Sparkles size={20} />
                  )}
                </div>
                <div className="pkg-modal-title-content">
                  <div className="pkg-modal-title-row">
                    <h3 className="pkg-modal-title">{activePackageForDetails.name}</h3>
                    <span className="pkg-version-tag font-mono">{activePackageForDetails.version}</span>
                  </div>
                  <div className="pkg-modal-subtitle">
                    {(() => {
                      const isModalMcp = activePackageForDetails.rawType === 'mcp' || activePackageForDetails.type === 'MCP SERVER';
                      const isModalPlugin = activePackageForDetails.rawType === 'plugin' || activePackageForDetails.type === 'PLUGIN' || (activePackageForDetails.type as string) === 'SKILL BUNDLE';
                      return (
                        <span
                          className={`badge ${isModalMcp
                              ? 'badge-cyan'
                              : isModalPlugin
                                ? 'badge-amber'
                                : 'badge-purple'
                            } font-mono`}
                        >
                          {isModalMcp ? 'MCP SERVER' : isModalPlugin ? 'PLUGIN' : 'SKILL'}
                        </span>
                      );
                    })()}
                    <span className="status-pill-clean installed font-mono">
                      <span className="status-dot installed" />
                      <span>INSTALLED</span>
                    </span>
                    {activePackageForDetails.sourceAgentName ? (
                      <span className="agent-modal-pill font-mono" style={{ borderColor: `${activePackageForDetails.sourceAgentColor || '#818cf8'}40`, background: `${activePackageForDetails.sourceAgentColor || '#818cf8'}10`, color: '#f1f5f9' }}>
                        <span
                          className="agent-color-dot"
                          style={{
                            background: activePackageForDetails.sourceAgentColor || '#818cf8',
                            boxShadow: `0 0 6px ${activePackageForDetails.sourceAgentColor || '#818cf8'}88`
                          }}
                        />
                        <span>{activePackageForDetails.sourceAgentName}</span>
                      </span>
                    ) : (
                      <span className="agent-modal-pill font-mono" style={{ borderColor: 'rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#94a3b8' }}>
                        <span>Global Workspace</span>
                      </span>
                    )}
                    {activePackageForDetails.source && (
                      <span className="source-registry-pill font-mono">
                        {activePackageForDetails.source}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                className="pkg-modal-close-btn"
                onClick={handleCloseDetailsModal}
                title="Close (Esc)"
                aria-label="Close modal"
              >
                <X size={12} strokeWidth={2.2} />
                <kbd className="modal-esc-hint font-mono">ESC</kbd>
              </button>
            </div>

            {/* Modal Body */}
            <div className="pkg-modal-body">
              {activePackageForDetails.description && (
                <div className="detail-section">
                  <div className="detail-label-row">
                    <span className="detail-label">DESCRIPTION</span>
                  </div>
                  <div className="detail-desc-card">
                    <p className="detail-description">{activePackageForDetails.description}</p>
                  </div>
                </div>
              )}

              {/* Location on Disk */}
              {resolvePackagePath(activePackageForDetails) && (
                <div className="detail-section">
                  <div className="detail-label-row">
                    <span className="detail-label">LOCATION ON DISK</span>
                    <button
                      className="copy-path-btn font-mono"
                      onClick={() => handleCopyPath(activePackageForDetails)}
                      title="Copy package path"
                    >
                      {copiedPathId === activePackageForDetails.id ? (
                        <>
                          <Check size={11} className="text-emerald" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy size={11} />
                          <span>Copy Path</span>
                        </>
                      )}
                    </button>
                  </div>
                  <div className="detail-path-card">
                    <FolderOpen size={13} className="detail-path-icon" />
                    <span className="detail-path-text font-mono">
                      {resolvePackagePath(activePackageForDetails)}
                    </span>
                  </div>
                </div>
              )}

              {/* Metadata Grid */}
              <div className="detail-meta-grid">
                <div className="meta-card">
                  <div className="meta-k">HOST AGENT</div>
                  <div className="meta-v">{activePackageForDetails.sourceAgentName || 'Global'}</div>
                </div>
                <div className="meta-card">
                  <div className="meta-k">ORIGIN</div>
                  <div className="meta-v font-mono">{activePackageForDetails.source}</div>
                </div>
                {activePackageForDetails.transport && (
                  <div className="meta-card">
                    <div className="meta-k">TRANSPORT</div>
                    <div className="meta-v font-mono">{activePackageForDetails.transport.toUpperCase()}</div>
                  </div>
                )}
                {activePackageForDetails.skillsCount !== undefined && (
                  <div className="meta-card">
                    <div className="meta-k">BUNDLED SKILLS</div>
                    <div className="meta-v">{activePackageForDetails.skillsCount} skills</div>
                  </div>
                )}
                {activePackageForDetails.author && (
                  <div className="meta-card">
                    <div className="meta-k">AUTHOR</div>
                    <div className="meta-v">{activePackageForDetails.author}</div>
                  </div>
                )}
                {activePackageForDetails.hasScripts !== undefined && (
                  <div className="meta-card">
                    <div className="meta-k">HELPER SCRIPTS</div>
                    <div className="meta-v">{activePackageForDetails.hasScripts ? 'Available' : 'None'}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="pkg-modal-footer">
              <button
                className={`modal-action-btn btn-danger ${confirmUninstallId === activePackageForDetails.id ? 'confirming' : ''}`}
                onClick={() => handleUninstallPackage(activePackageForDetails)}
                disabled={isUninstalling === activePackageForDetails.id}
                title="Remove this package from host agent"
              >
                <Trash2 size={13} />
                <span>
                  {isUninstalling === activePackageForDetails.id
                    ? 'Removing...'
                    : confirmUninstallId === activePackageForDetails.id
                      ? 'Confirm Remove?'
                      : 'Remove'}
                </span>
              </button>

              <div className="footer-right-actions">
                <button
                  className="modal-action-btn btn-secondary"
                  onClick={() => handleReinstallPackage(activePackageForDetails)}
                  disabled={isReinstalling === activePackageForDetails.id}
                  title="Remove local copy and re-download fresh from source (preserves user keys)"
                >
                  {isReinstalling === activePackageForDetails.id ? (
                    <Loader2 size={13} className="spin-icon text-indigo" />
                  ) : (
                    <RotateCcw size={13} />
                  )}
                  <span>{isReinstalling === activePackageForDetails.id ? 'Reinstalling...' : 'Reinstall'}</span>
                </button>

                <button
                  className="modal-action-btn btn-secondary"
                  onClick={() => handleOpenFolder(activePackageForDetails)}
                  title="Open installation directory in File Explorer"
                >
                  <FolderOpen size={13} />
                  <span>Open Folder</span>
                </button>

                <button
                  className="modal-action-btn btn-secondary"
                  onClick={() => {
                    handleNavigateToView(activePackageForDetails);
                    handleCloseDetailsModal();
                  }}
                  title={`Open in ${activePackageForDetails.rawType === 'mcp' ? 'MCP Servers' : activePackageForDetails.rawType === 'plugin' ? 'Plugins' : 'Skills'} tab`}
                >
                  <ExternalLink size={13} />
                  <span>
                    View in {activePackageForDetails.rawType === 'mcp' ? 'MCP' : activePackageForDetails.rawType === 'plugin' ? 'Plugins' : 'Skills'}
                  </span>
                </button>

                <button
                  className="modal-action-btn btn-done"
                  onClick={handleCloseDetailsModal}
                  title="Close details dialog"
                >
                  <span>Done</span>
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      <style>{`
        .packages-container {
          background: #121826;
          border: 1px solid #1e283d;
          border-radius: 9px;
          padding: 16px;
        }

        .packages-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
        }

        .packages-title-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .title-icon {
          color: #818cf8;
        }

        .packages-title {
          font-size: 13.5px;
          font-weight: 700;
          color: #f1f5f9;
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

        /* Packages Grid */
        .packages-cards-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 14px;
          margin-top: 4px;
        }

        .package-grid-card {
          background: #0f1626;
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 12px;
          padding: 16px 18px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          cursor: pointer;
          min-width: 0;
          min-height: 226px;
          box-sizing: border-box;
          transition: border-color 0.14s ease, background 0.14s ease, box-shadow 0.14s ease;
          position: relative;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
        }

        .package-grid-card:hover {
          background: #131c30;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
        }

        .package-grid-card.type-mcp:hover {
          border-color: rgba(56, 189, 248, 0.35);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35), 0 0 12px rgba(56, 189, 248, 0.08);
        }

        .package-grid-card.type-plugin:hover {
          border-color: rgba(245, 158, 11, 0.35);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35), 0 0 12px rgba(245, 158, 11, 0.08);
        }

        .package-grid-card.type-skill:hover {
          border-color: rgba(168, 85, 247, 0.35);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35), 0 0 12px rgba(168, 85, 247, 0.08);
        }

        /* Card Header: Clean decoupled flex header */
        .card-header-cluster {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 8px;
          min-height: 38px;
          flex-shrink: 0;
        }

        .card-header-left {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          min-width: 0;
          flex: 1;
        }

        .card-icon-avatar {
          width: 36px;
          height: 36px;
          border-radius: 9px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          box-shadow: none;
          transition: border-color 0.15s ease;
        }

        .card-icon-avatar.mcp {
          background: linear-gradient(135deg, rgba(56, 189, 248, 0.18), rgba(14, 165, 233, 0.08));
          border: 1px solid rgba(56, 189, 248, 0.32);
          color: #38bdf8;
          box-shadow: none;
        }

        .package-grid-card.type-mcp:hover .card-icon-avatar {
          border-color: rgba(56, 189, 248, 0.55);
          box-shadow: none;
          transform: none;
        }

        .card-icon-avatar.plugin {
          background: linear-gradient(135deg, rgba(245, 158, 11, 0.18), rgba(217, 119, 6, 0.08));
          border: 1px solid rgba(245, 158, 11, 0.32);
          color: #fbbf24;
          box-shadow: none;
        }

        .package-grid-card.type-plugin:hover .card-icon-avatar {
          border-color: rgba(245, 158, 11, 0.55);
          box-shadow: none;
          transform: none;
        }

        .card-icon-avatar.skill {
          background: linear-gradient(135deg, rgba(168, 85, 247, 0.18), rgba(99, 102, 241, 0.08));
          border: 1px solid rgba(168, 85, 247, 0.32);
          color: #c084fc;
          box-shadow: none;
        }

        .package-grid-card.type-skill:hover .card-icon-avatar {
          border-color: rgba(168, 85, 247, 0.55);
          box-shadow: none;
          transform: none;
        }

        .card-identity-text {
          display: flex;
          flex-direction: column;
          gap: 3px;
          min-width: 0;
          flex: 1;
          overflow: hidden;
        }

        .card-title-row {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
          line-height: 1.2;
        }

        .card-item-name {
          font-size: 14px;
          font-weight: 600;
          color: #f8fafc;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          letter-spacing: -0.01em;
          min-width: 0;
          flex-shrink: 1;
          transition: color 0.14s ease;
        }

        .package-grid-card:hover .card-item-name {
          color: #ffffff;
        }

        .version-badge {
          font-size: 8.5px;
          color: #94a3b8;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          padding: 0.5px 5px;
          border-radius: 3px;
          font-weight: 600;
          letter-spacing: 0.02em;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .card-sub-meta {
          display: flex;
          align-items: center;
          gap: 5px;
          min-width: 0;
          height: 16px;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }

        .card-type-pill {
          font-size: 8.5px;
          line-height: 1;
          padding: 1px 5px;
          border-radius: 3px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          white-space: nowrap;
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
        }

        .card-type-pill.mcp {
          color: #38bdf8;
          background: rgba(56, 189, 248, 0.08);
          border: 1px solid rgba(56, 189, 248, 0.22);
        }

        .card-type-pill.plugin {
          color: #fbbf24;
          background: rgba(245, 158, 11, 0.08);
          border: 1px solid rgba(245, 158, 11, 0.25);
        }

        .card-type-pill.skill {
          color: #c084fc;
          background: rgba(168, 85, 247, 0.08);
          border: 1px solid rgba(168, 85, 247, 0.22);
        }

        .source-registry-pill {
          font-size: 8.5px;
          color: #38bdf8;
          background: rgba(56, 189, 248, 0.08);
          border: 1px solid rgba(56, 189, 248, 0.22);
          padding: 0.5px 5px;
          border-radius: 3px;
          font-weight: 600;
          letter-spacing: 0.03em;
          text-transform: uppercase;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 130px;
          flex-shrink: 0;
        }

        .card-meta-dot {
          color: #3b4d66;
          font-size: 10px;
          flex-shrink: 0;
        }

        .author-text {
          font-size: 10px;
          color: #64748b;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 130px;
          flex-shrink: 1;
        }

        .card-header-right {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 1px;
        }

        .status-pill-clean {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 2.5px 8px;
          border-radius: 4px;
          font-size: 9.5px;
          font-weight: 600;
          letter-spacing: 0.02em;
          white-space: nowrap;
          flex-shrink: 0;
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
          color: #c084fc;
          background: rgba(147, 51, 234, 0.1);
          border: 1px solid rgba(147, 51, 234, 0.25);
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
          background: #a855f7;
          box-shadow: 0 0 6px rgba(168, 85, 247, 0.6);
        }

        /* Body */
        .card-content-body {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 10px;
          min-width: 0;
        }

        .card-description-text {
          font-size: 12px;
          color: #94a3b8;
          line-height: 1.45;
          margin: 0;
          height: 35px;
          min-height: 35px;
          max-height: 35px;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .card-description-text.empty-desc {
          color: #64748b;
          font-style: italic;
        }

        /* Modern Agent Targets Deck */
        .agent-deck-container {
          display: flex;
          flex-direction: column;
          gap: 6px;
          background: rgba(15, 23, 42, 0.45);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 8px;
          padding: 7px 9px;
          box-sizing: border-box;
          width: 100%;
          min-width: 0;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .agent-deck-container:hover {
          background: rgba(15, 23, 42, 0.65);
          border-color: rgba(255, 255, 255, 0.09);
        }

        .agent-deck-container.pending-only {
          background: rgba(15, 23, 42, 0.25);
          border-color: rgba(255, 255, 255, 0.035);
          border-style: dashed;
        }

        .agent-deck-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          width: 100%;
          min-width: 0;
        }

        .agent-deck-label-group {
          display: flex;
          align-items: center;
          gap: 5.5px;
          min-width: 0;
        }

        .agent-deck-icon {
          color: #64748b;
          flex-shrink: 0;
        }

        .agent-deck-title {
          font-size: 9.5px;
          font-weight: 700;
          letter-spacing: 0.05em;
          color: #718096;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .agent-deck-count-badge {
          display: inline-flex;
          align-items: center;
          font-size: 9px;
          font-weight: 600;
          color: #94a3b8;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.07);
          padding: 0 5px;
          border-radius: 9999px;
          line-height: 14px;
        }

        .agent-deck-pills {
          display: flex;
          align-items: center;
          gap: 5px;
          flex-wrap: wrap;
          width: 100%;
          min-width: 0;
        }

        .agent-deck-pill {
          display: inline-flex;
          align-items: center;
          gap: 4.5px;
          padding: 2.5px 7.5px;
          border-radius: 5px;
          font-size: 10px;
          font-weight: 600;
          border: 1px solid;
          white-space: nowrap;
          flex-shrink: 0;
          line-height: 14px;
        }

        .agent-deck-pill.pending {
          border-style: dashed !important;
          opacity: 0.85;
          color: #94a3b8;
          background: rgba(255, 255, 255, 0.04);
          border-color: rgba(255, 255, 255, 0.1);
        }

        .agent-deck-pill .pill-brand-icon {
          flex-shrink: 0;
        }

        .agent-deck-pill .pill-name {
          font-family: inherit;
        }

        .equipped-agents-bar {
          display: flex;
          align-items: flex-start;
          gap: 6px;
          background: rgba(0, 0, 0, 0.28);
          border: 1px solid rgba(255, 255, 255, 0.06);
          padding: 5px 8px;
          border-radius: 6px;
          min-height: 28px;
          box-sizing: border-box;
          width: 100%;
          min-width: 0;
        }

        .equipped-agents-bar.inactive {
          background: rgba(0, 0, 0, 0.15);
          border-color: rgba(255, 255, 255, 0.03);
        }

        .equipped-label {
          font-size: 9.5px;
          color: #64748b;
          font-weight: 600;
          flex-shrink: 0;
          white-space: nowrap;
          line-height: 20px;
        }

        .equipped-pills-list {
          display: flex;
          align-items: center;
          gap: 4px;
          flex-wrap: wrap;
          flex: 1;
          min-width: 0;
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
          transition: all 0.15s ease;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .agent-pill.unequipped {
          border-style: dashed !important;
          opacity: 0.85;
          color: #64748b !important;
          border-color: rgba(100, 116, 139, 0.3) !important;
          background: rgba(255, 255, 255, 0.03) !important;
        }

        /* Bottom Toolbar: Clean 36px height, consistent across tabs */
        .card-bottom-toolbar {
          margin-top: auto;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
          padding-top: 10px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          min-height: 36px;
          height: 36px;
          box-sizing: border-box;
        }

        .toolbar-left-chips {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: nowrap;
          min-width: 0;
          flex: 1;
          overflow: hidden;
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
          white-space: nowrap;
          flex-shrink: 0;
          min-width: 0;
          overflow: hidden;
          box-sizing: border-box;
        }

        .meta-subtle-badge svg {
          flex-shrink: 0;
        }

        .meta-subtle-badge span {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          min-width: 0;
          display: block;
        }

        .meta-subtle-badge.source-badge {
          color: #38bdf8;
          background: rgba(56, 189, 248, 0.06);
          border-color: rgba(56, 189, 248, 0.2);
          max-width: 150px;
          min-width: 0;
          flex-shrink: 1;
          overflow: hidden;
        }

        .meta-subtle-badge.badge-mcp {
          color: #38bdf8;
          background: rgba(56, 189, 248, 0.08);
          border-color: rgba(56, 189, 248, 0.22);
        }

        .meta-subtle-badge.badge-plugin {
          color: #fbbf24;
          background: rgba(245, 158, 11, 0.08);
          border-color: rgba(245, 158, 11, 0.25);
        }

        .meta-subtle-badge.badge-skill {
          color: #c084fc;
          background: rgba(192, 132, 252, 0.08);
          border-color: rgba(192, 132, 252, 0.22);
        }

        .toolbar-right-actions {
          display: flex;
          align-items: center;
          gap: 4px;
          flex-shrink: 0;
          margin-left: auto;
        }

        .table-actions-cluster {
          display: inline-flex;
          align-items: center;
          justify-content: flex-end;
          gap: 4px;
        }

        .card-action-icon-btn {
          width: 28px;
          height: 28px;
          min-width: 28px;
          max-width: 28px;
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #8fa0b5;
          border-radius: 6px;
          cursor: pointer;
          transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease, transform 0.12s ease;
          padding: 0;
          box-sizing: border-box;
        }

        .card-action-icon-btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.09);
          color: #ffffff;
          border-color: rgba(255, 255, 255, 0.2);
          transform: translateY(-0.5px);
        }

        .card-action-icon-btn:active:not(:disabled) {
          transform: scale(0.95);
        }

        .card-action-icon-btn.reinstall {
          color: #a78bfa;
          border-color: rgba(167, 139, 250, 0.2);
          background: rgba(167, 139, 250, 0.05);
        }

        .card-action-icon-btn.reinstall:hover:not(:disabled) {
          background: rgba(167, 139, 250, 0.14);
          color: #ffffff;
          border-color: rgba(167, 139, 250, 0.35);
        }

        .card-action-icon-btn.active {
          background: #1e293b;
          border-color: #38bdf8;
          color: #38bdf8;
        }

        .card-action-icon-btn.reinstall:hover:not(:disabled) {
          color: #a5b4fc;
          border-color: rgba(99, 102, 241, 0.45);
          background: rgba(99, 102, 241, 0.12);
        }

        .packages-table-wrapper {
          overflow-x: auto;
        }

        .packages-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }

        .packages-table th {
          font-size: 10px;
          font-weight: 700;
          color: #94a3b8;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          padding: 10px 14px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(13, 18, 30, 0.6);
          font-family: var(--font-mono);
        }

        .packages-table td {
          padding: 12px 14px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          font-size: 12.5px;
          transition: background 0.15s ease;
        }

        .packages-table tr:last-child td {
          border-bottom: none;
        }

        .package-row-interactive {
          cursor: pointer;
          transition: background 0.15s ease;
        }

        .package-row-interactive:hover td {
          background: rgba(24, 34, 54, 0.6);
        }

        .package-name-cell {
          display: flex;
          align-items: center;
          gap: 9px;
          min-width: 0;
        }

        .pkg-type-mini-icon {
          width: 26px;
          height: 26px;
          border-radius: 6px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #8fa0b5;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
          flex-shrink: 0;
        }

        .pkg-type-mini-icon.mcp {
          background: rgba(56, 189, 248, 0.12);
          border-color: rgba(56, 189, 248, 0.25);
          color: #38bdf8;
        }

        .pkg-type-mini-icon.plugin {
          background: rgba(245, 158, 11, 0.12);
          border-color: rgba(245, 158, 11, 0.25);
          color: #fbbf24;
        }

        .pkg-type-mini-icon.skill {
          background: rgba(168, 85, 247, 0.12);
          border-color: rgba(168, 85, 247, 0.25);
          color: #c084fc;
        }

        .badge.badge-amber {
          background: rgba(245, 158, 11, 0.12);
          color: #fbbf24;
          border: 1px solid rgba(245, 158, 11, 0.3);
        }

        .badge.badge-cyan {
          background: rgba(56, 189, 248, 0.12);
          color: #38bdf8;
          border: 1px solid rgba(56, 189, 248, 0.3);
        }

        .badge.badge-purple {
          background: rgba(168, 85, 247, 0.12);
          color: #c084fc;
          border: 1px solid rgba(168, 85, 247, 0.3);
        }

        .pkg-title-cluster {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
          overflow: hidden;
        }

        .pkg-name {
          font-weight: 600;
          color: #f8fafc;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .pkg-version {
          font-size: 11px;
          color: #718298;
          background: #0d121f;
          padding: 1px 6px;
          border-radius: 4px;
          border: 1px solid #1c2638;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .pkg-agent-chip {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 11.5px;
          color: #cbd5e1;
          background: #0d121f;
          padding: 2px 7px;
          border-radius: 4px;
          border: 1px solid #1e283d;
        }

        .pkg-agent-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
        }

        .pkg-source {
          font-size: 10.5px;
          color: #94a3b8;
        }

        .status-cell {
          display: flex;
          align-items: center;
        }

        .pkg-status-pill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 4.5px;
          padding: 2px 7px;
          border-radius: 4px;
          font-size: 9.5px;
          font-weight: 700;
          letter-spacing: 0.04em;
          border: 1px solid;
          white-space: nowrap;
          flex-shrink: 0;
          line-height: 1.2;
          user-select: none;
        }

        .pkg-status-pill.status-active {
          color: #34d399;
          background: rgba(16, 185, 129, 0.1);
          border-color: rgba(16, 185, 129, 0.3);
        }

        .pkg-status-pill.status-updating {
          color: #38bdf8;
          background: rgba(56, 189, 248, 0.1);
          border-color: rgba(56, 189, 248, 0.32);
        }

        .pkg-status-pill.status-idle {
          color: #94a3b8;
          background: rgba(148, 163, 184, 0.08);
          border-color: rgba(148, 163, 184, 0.2);
        }

        .pkg-status-icon {
          flex-shrink: 0;
        }

        .pkg-agent-chip-fallback {
          font-size: 9.5px;
          font-weight: 600;
          color: #64748b;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          padding: 2px 6px;
          border-radius: 4px;
          letter-spacing: 0.04em;
          flex-shrink: 0;
        }

        .spin-icon {
          animation: spin-kf 1s linear infinite;
        }

        @keyframes spin-kf {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .row-action-btn {
          background: transparent;
          border: none;
          color: #64748b;
          width: 26px;
          height: 26px;
          border-radius: 4px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .row-action-btn:hover,
        .row-action-btn.active {
          background: #1c263c;
          color: #f1f5f9;
        }

        /* Floating 3-dots Context Menu */
        .pkg-options-dropdown {
          min-width: 175px;
          max-height: calc(100vh - 24px);
          overflow-y: auto;
          overflow-x: hidden;
          background: #0f172a;
          border: 1px solid #1e293b;
          border-radius: 8px;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.6), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
          padding: 5px;
          display: flex;
          flex-direction: column;
          gap: 2px;
          animation: dropdownFadeIn 0.12s ease-out;
        }

        .pkg-options-dropdown::-webkit-scrollbar {
          width: 4px;
        }

        .pkg-options-dropdown::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.2);
          border-radius: 4px;
        }

        @keyframes dropdownFadeIn {
          from {
            opacity: 0;
            transform: translateY(-4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .dropdown-item {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          padding: 7px 10px;
          font-size: 12px;
          color: #cbd5e1;
          background: transparent;
          border: none;
          border-radius: 5px;
          cursor: pointer;
          text-align: left;
          transition: all 0.12s ease;
        }

        .dropdown-item:hover {
          background: #1e293b;
          color: #f8fafc;
        }

        .dropdown-item .item-icon {
          color: #94a3b8;
          flex-shrink: 0;
        }

        .dropdown-item:hover .item-icon {
          color: #f1f5f9;
        }

        .dropdown-item .text-indigo {
          color: #818cf8 !important;
        }

        .dropdown-item .text-emerald {
          color: #10b981 !important;
        }

        .dropdown-divider {
          height: 1px;
          background: #1e293b;
          margin: 3px 0;
        }

        .dropdown-item.item-danger {
          color: #f87171;
        }

        .dropdown-item.item-danger:hover {
          background: rgba(239, 68, 68, 0.15);
          color: #fca5a5;
        }

        .dropdown-item.item-danger .item-icon {
          color: #f87171;
        }

        .dropdown-item.item-danger.confirming {
          background: #ef4444;
          color: #ffffff;
          font-weight: 600;
        }

        .dropdown-item.item-danger.confirming .item-icon {
          color: #ffffff;
        }

        /* Package Details Modal */
        @keyframes modalBackdropFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes modalBackdropFadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }

        .pkg-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(3, 7, 18, 0.78);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          padding: 18px 16px;
          animation: modalBackdropFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          will-change: opacity;
        }

        .pkg-modal-backdrop.is-closing {
          animation: modalBackdropFadeOut 0.16s cubic-bezier(0.4, 0, 1, 1) forwards !important;
          pointer-events: none !important;
        }

        .pkg-modal-card {
          background: #0d1322;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 14px;
          width: 100%;
          max-width: 720px;
          min-width: 0;
          box-sizing: border-box;
          box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5), 0 25px 65px -12px rgba(0, 0, 0, 0.85), inset 0 1px 0 0 rgba(255, 255, 255, 0.1);
          overflow: hidden;
          animation: modalScaleIn 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          will-change: transform, opacity;
          display: flex;
          flex-direction: column;
          max-height: min(94vh, calc(100vh - 36px));
          position: relative;
        }

        .pkg-modal-card.is-closing {
          animation: modalScaleOut 0.16s cubic-bezier(0.4, 0, 1, 1) forwards !important;
          pointer-events: none !important;
        }

        @keyframes modalScaleIn {
          from {
            opacity: 0;
            transform: scale(0.96) translateY(8px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        @keyframes modalScaleOut {
          from {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
          to {
            opacity: 0;
            transform: scale(0.96) translateY(8px);
          }
        }

        .pkg-modal-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.07);
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.02) 0%, transparent 100%), #0e1526;
          flex-shrink: 0;
          gap: 14px;
          min-width: 0;
          width: 100%;
          box-sizing: border-box;
        }

        .pkg-modal-title-area {
          display: flex;
          align-items: center;
          gap: 14px;
          min-width: 0;
          flex: 1;
        }

        .pkg-modal-title-content {
          min-width: 0;
          flex: 1;
        }

        .pkg-modal-icon-wrap {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .pkg-modal-icon-wrap.mcp {
          background: linear-gradient(135deg, rgba(56, 189, 248, 0.22), rgba(14, 165, 233, 0.08));
          border: 1px solid rgba(56, 189, 248, 0.35);
          color: #38bdf8;
          box-shadow: 0 0 18px rgba(56, 189, 248, 0.18);
        }

        .pkg-modal-icon-wrap.plugin {
          background: linear-gradient(135deg, rgba(245, 158, 11, 0.22), rgba(217, 119, 6, 0.08));
          border: 1px solid rgba(245, 158, 11, 0.35);
          color: #fbbf24;
          box-shadow: 0 0 18px rgba(245, 158, 11, 0.18);
        }

        .pkg-modal-icon-wrap.skill {
          background: linear-gradient(135deg, rgba(168, 85, 247, 0.22), rgba(99, 102, 241, 0.08));
          border: 1px solid rgba(168, 85, 247, 0.35);
          color: #c084fc;
          box-shadow: 0 0 18px rgba(168, 85, 247, 0.18);
        }

        .pkg-modal-title-row {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
          flex-wrap: wrap;
        }

        .pkg-modal-title {
          font-size: 16px;
          font-weight: 700;
          color: #f8fafc;
          margin: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          letter-spacing: -0.015em;
        }

        .pkg-version-tag {
          font-size: 10.5px;
          font-weight: 600;
          color: #94a3b8;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          padding: 1.5px 7px;
          border-radius: 4px;
        }

        .pkg-modal-subtitle {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 4px;
          flex-wrap: wrap;
        }

        .pkg-modal-close-btn {
          align-self: flex-start;
          margin-top: 2px;
          height: 26px;
          padding: 0 7px 0 6px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #94a3b8;
          cursor: pointer;
          border-radius: 6px;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          transition: all 0.14s cubic-bezier(0.16, 1, 0.3, 1);
          flex-shrink: 0;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
          user-select: none;
        }

        .pkg-modal-close-btn:hover {
          color: #f8fafc;
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.18);
        }

        .pkg-modal-close-btn:active {
          transform: translateY(0.5px);
          background: rgba(255, 255, 255, 0.12);
        }

        .pkg-modal-close-btn .modal-esc-hint {
          font-size: 9px;
          font-weight: 600;
          letter-spacing: 0.04em;
          color: #64748b;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 1px 0 rgba(0, 0, 0, 0.35);
          padding: 1px 4.5px;
          border-radius: 3.5px;
          line-height: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          height: 15px;
          box-sizing: border-box;
          transition: all 0.14s ease;
        }

        .pkg-modal-close-btn:hover .modal-esc-hint {
          color: #e2e8f0;
          background: rgba(255, 255, 255, 0.09);
          border-color: rgba(255, 255, 255, 0.2);
        }

        .pkg-modal-body {
          padding: 16px 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          overflow-y: auto;
          overflow-x: hidden;
          min-height: 0;
          min-width: 0;
          width: 100%;
          box-sizing: border-box;
          flex: 1 1 auto;
          overscroll-behavior-y: contain;
        }

        .pkg-modal-body::-webkit-scrollbar {
          width: 5px;
        }

        .pkg-modal-body::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.15);
          border-radius: 4px;
        }

        .pkg-modal-body::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.25);
        }

        .detail-desc-card {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 9px;
          padding: 9px 13px;
        }

        .detail-description {
          font-size: 13px;
          line-height: 1.6;
          color: #cbd5e1;
          word-break: break-word;
          margin: 0;
        }

        .detail-path-card {
          background: #080c14;
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 8px;
          padding: 9px 12px;
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
        }

        .detail-path-icon {
          color: #64748b;
          flex-shrink: 0;
        }

        .detail-path-text {
          font-size: 11.5px;
          color: #93c5fd;
          word-break: break-all;
          flex: 1;
          user-select: text;
        }

        .copy-path-btn {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #cbd5e1;
          font-size: 11px;
          font-weight: 500;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          cursor: pointer;
          padding: 2px 7px;
          border-radius: 5px;
          transition: all 0.12s;
        }

        .copy-path-btn:hover {
          background: rgba(255, 255, 255, 0.09);
          color: #ffffff;
          border-color: rgba(255, 255, 255, 0.15);
        }

        .detail-meta-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
        }

        .meta-card {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 8px;
          padding: 8px 11px;
          display: flex;
          flex-direction: column;
          gap: 3px;
          transition: border-color 0.15s, background 0.15s;
        }

        .meta-card:hover {
          border-color: rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.035);
        }

        .meta-k {
          font-size: 9.5px;
          font-weight: 700;
          letter-spacing: 0.06em;
          color: #64748b;
          font-family: var(--font-mono, monospace);
        }

        .meta-v {
          font-size: 12px;
          font-weight: 600;
          color: #e2e8f0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .pkg-modal-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 20px;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          background: #090e1a;
          gap: 12px;
          box-sizing: border-box;
          flex-shrink: 0;
        }

        .footer-right-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: nowrap;
          flex-shrink: 0;
        }

        .modal-action-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          height: 32px;
          padding: 0 13px;
          border-radius: 6px;
          font-size: 11.5px;
          font-weight: 600;
          letter-spacing: 0.01em;
          cursor: pointer;
          border: 1px solid rgba(255, 255, 255, 0.09);
          background: rgba(255, 255, 255, 0.05);
          color: #cbd5e1;
          transition: all 0.14s cubic-bezier(0.16, 1, 0.3, 1);
          white-space: nowrap;
          box-sizing: border-box;
          user-select: none;
        }

        .modal-action-btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.1);
          color: #ffffff;
          border-color: rgba(255, 255, 255, 0.2);
          transform: translateY(-1px);
        }

        .modal-action-btn:active:not(:disabled) {
          transform: translateY(0);
        }

        .modal-action-btn.btn-done {
          background: linear-gradient(135deg, #4f46e5, #6366f1);
          border-color: rgba(99, 102, 241, 0.45);
          color: #ffffff;
          box-shadow: 0 2px 8px rgba(79, 70, 229, 0.25);
        }

        .modal-action-btn.btn-done:hover:not(:disabled) {
          background: linear-gradient(135deg, #6366f1, #4f46e5);
          border-color: rgba(99, 102, 241, 0.65);
          box-shadow: 0 4px 14px rgba(79, 70, 229, 0.4);
          color: #ffffff;
        }

        .modal-action-btn.btn-secondary {
          background: rgba(255, 255, 255, 0.05);
          color: #cbd5e1;
          border-color: rgba(255, 255, 255, 0.09);
        }

        .modal-action-btn.btn-secondary:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.1);
          color: #ffffff;
          border-color: rgba(255, 255, 255, 0.18);
        }

        .modal-action-btn.btn-danger {
          background: rgba(239, 68, 68, 0.06);
          color: #f87171;
          border-color: rgba(239, 68, 68, 0.25);
        }

        .modal-action-btn.btn-danger:hover:not(:disabled) {
          background: rgba(239, 68, 68, 0.16);
          border-color: rgba(239, 68, 68, 0.45);
          color: #fca5a5;
        }

        @media (max-width: 620px) {
          .pkg-modal-footer {
            flex-direction: column-reverse;
            align-items: stretch;
            gap: 10px;
          }
          .footer-right-actions {
            flex-wrap: wrap;
            justify-content: flex-end;
          }
          .pkg-modal-footer .btn-danger {
            width: 100%;
            justify-content: center;
          }
        }
        .modal-action-btn.btn-danger.confirming {
          background: #ef4444;
          color: #ffffff;
          border-color: #ef4444;
        }

        .packages-empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 36px 20px;
          border: 1px dashed #1e283d;
          border-radius: 8px;
          background: rgba(13, 18, 31, 0.5);
          text-align: center;
          gap: 6px;
        }

        .empty-pkg-icon-wrap {
          width: 42px;
          height: 42px;
          border-radius: 10px;
          background: rgba(129, 140, 248, 0.08);
          border: 1px solid rgba(129, 140, 248, 0.15);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #818cf8;
          margin-bottom: 4px;
        }

        .empty-pkg-title {
          font-size: 13.5px;
          font-weight: 600;
          color: #f1f5f9;
        }

        .empty-pkg-desc {
          font-size: 12px;
          color: #64748b;
          max-width: 320px;
        }
      `}</style>
    </div>
  );
};

export const RecentlyInstalledPackages = React.memo(RecentlyInstalledPackagesComponent);
