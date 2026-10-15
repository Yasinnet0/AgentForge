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
  Terminal,
  Layers,
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { SupportedAgent } from '../types/agent';

export interface InstalledPackage {
  id: string;
  name: string;
  version: string;
  type: 'MCP SERVER' | 'SKILL BUNDLE' | 'SKILL' | 'AGENT';
  source: 'COMMUNITY' | 'OFFICIAL' | 'LOCAL';
  installedDate: string;
  status: 'Active' | 'Idle' | 'Updating';
  rawType?: 'mcp' | 'plugin' | 'skill';
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

export const RecentlyInstalledPackages: React.FC<RecentlyInstalledPackagesProps> = ({
  packages = [],
  searchQuery = '',
  onNavigate,
  agents = [],
  onRefreshCapabilities,
}) => {
  const toast = useToast();

  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null);
  const [selectedPackageForDetails, setSelectedPackageForDetails] = useState<InstalledPackage | null>(null);
  const [copiedPathId, setCopiedPathId] = useState<string | null>(null);
  const [isUninstalling, setIsUninstalling] = useState<string | null>(null);
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

  // Click outside and escape handling for floating menu and modal
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
        setSelectedPackageForDetails(null);
        setConfirmUninstallId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      if (confirmTimerRef.current) {
        clearTimeout(confirmTimerRef.current);
      }
    };
  }, []);

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
      setMenuPosition({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
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
        if (selectedPackageForDetails?.id === pkg.id) {
          setSelectedPackageForDetails(null);
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

  return (
    <div className="packages-container">
      <div className="packages-header">
        <div className="packages-title-row">
          <PackageCheck size={16} className="title-icon" />
          <span className="packages-title">
            {searchQuery ? `Matching Packages (${filteredPackages.length})` : 'Recently Installed Packages'}
          </span>
        </div>
      </div>

      {filteredPackages.length > 0 ? (
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
              {filteredPackages.map((pkg) => (
                <tr
                  key={pkg.id}
                  className="package-row-interactive"
                  onClick={() => setSelectedPackageForDetails(pkg)}
                  title="Click to view package details"
                >
                  <td>
                    <div className="package-name-cell">
                      <div className="pkg-type-mini-icon">
                        {pkg.rawType === 'mcp' ? (
                          <Terminal size={13} />
                        ) : pkg.rawType === 'plugin' ? (
                          <Layers size={13} />
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
                      className={`badge ${
                        pkg.type === 'MCP SERVER'
                          ? 'badge-blue'
                          : pkg.type === 'SKILL BUNDLE'
                          ? 'badge-purple'
                          : 'badge-green'
                      }`}
                    >
                      {pkg.type}
                    </span>
                  </td>
                  <td>
                    {pkg.sourceAgentName ? (
                      <span className="pkg-agent-chip">
                        <span
                          className="pkg-agent-dot"
                          style={{ background: pkg.sourceAgentColor || '#818cf8' }}
                        />
                        <span className="font-mono">{pkg.sourceAgentName}</span>
                      </span>
                    ) : (
                      <span className="pkg-source font-mono">{pkg.source}</span>
                    )}
                  </td>
                  <td>
                    <div className="status-cell">
                      <span className="status-dot" />
                      <span className="status-label">{pkg.status}</span>
                    </div>
                  </td>
                  <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                    <button
                      className={`row-action-btn ${activeMenuId === pkg.id ? 'active' : ''}`}
                      title="Package Options"
                      onClick={(e) => handleMenuToggle(e, pkg)}
                    >
                      <MoreVertical size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
              top: `${menuPosition.top}px`,
              right: `${menuPosition.right}px`,
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
      {selectedPackageForDetails && createPortal(
        <div
          className="pkg-modal-backdrop"
          onClick={() => setSelectedPackageForDetails(null)}
        >
          <div className="pkg-modal-card" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="pkg-modal-header">
              <div className="pkg-modal-title-area">
                <div className="pkg-modal-icon-wrap">
                  {selectedPackageForDetails.rawType === 'mcp' ? (
                    <Terminal size={18} />
                  ) : selectedPackageForDetails.rawType === 'plugin' ? (
                    <Layers size={18} />
                  ) : (
                    <Sparkles size={18} />
                  )}
                </div>
                <div>
                  <div className="pkg-modal-title-row">
                    <h3 className="pkg-modal-title font-mono">{selectedPackageForDetails.name}</h3>
                    <span className="pkg-version-tag font-mono">{selectedPackageForDetails.version}</span>
                  </div>
                  <div className="pkg-modal-subtitle">
                    <span
                      className={`badge ${
                        selectedPackageForDetails.type === 'MCP SERVER'
                          ? 'badge-blue'
                          : selectedPackageForDetails.type === 'SKILL BUNDLE'
                          ? 'badge-purple'
                          : 'badge-green'
                      }`}
                    >
                      {selectedPackageForDetails.type}
                    </span>
                    {selectedPackageForDetails.sourceAgentName && (
                      <span className="agent-badge-pill">
                        <span
                          className="agent-color-dot"
                          style={{
                            background: selectedPackageForDetails.sourceAgentColor || '#818cf8',
                          }}
                        />
                        <span>{selectedPackageForDetails.sourceAgentName}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                className="pkg-modal-close-btn"
                onClick={() => setSelectedPackageForDetails(null)}
                title="Close (Esc)"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="pkg-modal-body">
              {selectedPackageForDetails.description && (
                <div className="detail-section">
                  <div className="detail-label">DESCRIPTION</div>
                  <div className="detail-description">{selectedPackageForDetails.description}</div>
                </div>
              )}

              {/* Location on Disk */}
              {resolvePackagePath(selectedPackageForDetails) && (
                <div className="detail-section">
                  <div className="detail-label-row">
                    <span className="detail-label">LOCATION ON DISK</span>
                    <button
                      className="copy-path-btn"
                      onClick={() => handleCopyPath(selectedPackageForDetails)}
                    >
                      {copiedPathId === selectedPackageForDetails.id ? (
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
                  <div className="detail-path-box font-mono">
                    {resolvePackagePath(selectedPackageForDetails)}
                  </div>
                </div>
              )}

              {/* Metadata Grid */}
              <div className="detail-meta-grid">
                <div className="meta-box">
                  <div className="meta-k">HOST AGENT</div>
                  <div className="meta-v">{selectedPackageForDetails.sourceAgentName || 'Global'}</div>
                </div>
                <div className="meta-box">
                  <div className="meta-k">ORIGIN</div>
                  <div className="meta-v font-mono">{selectedPackageForDetails.source}</div>
                </div>
                {selectedPackageForDetails.transport && (
                  <div className="meta-box">
                    <div className="meta-k">TRANSPORT</div>
                    <div className="meta-v font-mono">{selectedPackageForDetails.transport.toUpperCase()}</div>
                  </div>
                )}
                {selectedPackageForDetails.skillsCount !== undefined && (
                  <div className="meta-box">
                    <div className="meta-k">BUNDLED SKILLS</div>
                    <div className="meta-v">{selectedPackageForDetails.skillsCount} skills</div>
                  </div>
                )}
                {selectedPackageForDetails.author && (
                  <div className="meta-box">
                    <div className="meta-k">AUTHOR</div>
                    <div className="meta-v">{selectedPackageForDetails.author}</div>
                  </div>
                )}
                {selectedPackageForDetails.hasScripts !== undefined && (
                  <div className="meta-box">
                    <div className="meta-k">HELPER SCRIPTS</div>
                    <div className="meta-v">{selectedPackageForDetails.hasScripts ? 'Available' : 'None'}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="pkg-modal-footer">
              <button
                className={`modal-action-btn btn-danger ${confirmUninstallId === selectedPackageForDetails.id ? 'confirming' : ''}`}
                onClick={() => handleUninstallPackage(selectedPackageForDetails)}
                disabled={isUninstalling === selectedPackageForDetails.id}
              >
                <Trash2 size={13} />
                <span>
                  {isUninstalling === selectedPackageForDetails.id
                    ? 'Removing...'
                    : confirmUninstallId === selectedPackageForDetails.id
                    ? 'Confirm Remove?'
                    : 'Remove Package'}
                </span>
              </button>

              <div className="footer-right-actions">
                <button
                  className="modal-action-btn btn-secondary"
                  onClick={() => handleOpenFolder(selectedPackageForDetails)}
                >
                  <FolderOpen size={13} />
                  <span>Open Folder</span>
                </button>

                <button
                  className="modal-action-btn btn-secondary"
                  onClick={() => {
                    handleNavigateToView(selectedPackageForDetails);
                    setSelectedPackageForDetails(null);
                  }}
                >
                  <ExternalLink size={13} />
                  <span>
                    View in {selectedPackageForDetails.rawType === 'mcp' ? 'MCP' : selectedPackageForDetails.rawType === 'plugin' ? 'Plugins' : 'Skills'}
                  </span>
                </button>

                <button
                  className="modal-action-btn btn-primary"
                  onClick={() => setSelectedPackageForDetails(null)}
                >
                  Done
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
          color: #64748b;
          letter-spacing: 0.05em;
          padding: 8px 12px;
          border-bottom: 1px solid #1c2638;
          font-family: var(--font-mono);
        }

        .packages-table td {
          padding: 11px 12px;
          border-bottom: 1px solid #172033;
          font-size: 12.5px;
        }

        .packages-table tr:last-child td {
          border-bottom: none;
        }

        .package-row-interactive {
          cursor: pointer;
          transition: background 0.12s ease;
        }

        .package-row-interactive:hover td {
          background: #151e30;
        }

        .package-name-cell {
          display: flex;
          align-items: center;
          gap: 9px;
        }

        .pkg-type-mini-icon {
          width: 24px;
          height: 24px;
          border-radius: 5px;
          background: rgba(129, 140, 248, 0.08);
          border: 1px solid rgba(129, 140, 248, 0.18);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #818cf8;
          flex-shrink: 0;
        }

        .pkg-title-cluster {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .pkg-name {
          font-weight: 600;
          color: #f8fafc;
        }

        .pkg-version {
          font-size: 11px;
          color: #718298;
          background: #0d121f;
          padding: 1px 6px;
          border-radius: 4px;
          border: 1px solid #1c2638;
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
          gap: 6px;
        }

        .status-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #10b981;
        }

        .status-label {
          color: #34d399;
          font-size: 12px;
          font-weight: 500;
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
        .pkg-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.65);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          padding: 20px;
          animation: modalBackdropFadeIn 0.15s ease;
        }

        @keyframes modalBackdropFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .pkg-modal-card {
          background: #111827;
          border: 1px solid #1f293d;
          border-radius: 12px;
          width: 100%;
          max-width: 520px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
          overflow: hidden;
          animation: modalScaleIn 0.18s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes modalScaleIn {
          from {
            opacity: 0;
            transform: scale(0.96);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        .pkg-modal-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid #1f293d;
          background: #0e1524;
        }

        .pkg-modal-title-area {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .pkg-modal-icon-wrap {
          width: 38px;
          height: 38px;
          border-radius: 9px;
          background: rgba(129, 140, 248, 0.1);
          border: 1px solid rgba(129, 140, 248, 0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #818cf8;
          flex-shrink: 0;
        }

        .pkg-modal-title-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 4px;
        }

        .pkg-modal-title {
          font-size: 15px;
          font-weight: 700;
          color: #f8fafc;
          margin: 0;
        }

        .pkg-version-tag {
          font-size: 11px;
          color: #718298;
          background: #090d16;
          padding: 1px 6px;
          border-radius: 4px;
          border: 1px solid #1c2638;
        }

        .pkg-modal-subtitle {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .agent-badge-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 11px;
          color: #cbd5e1;
          background: rgba(255, 255, 255, 0.05);
          padding: 1px 7px;
          border-radius: 4px;
          border: 1px solid rgba(255, 255, 255, 0.08);
        }

        .agent-color-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
        }

        .pkg-modal-close-btn {
          background: transparent;
          border: none;
          color: #64748b;
          width: 28px;
          height: 28px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.12s ease;
        }

        .pkg-modal-close-btn:hover {
          color: #f1f5f9;
          background: #1c263c;
        }

        .pkg-modal-body {
          padding: 18px 20px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .detail-section {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .detail-label-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .detail-label {
          font-size: 10px;
          font-weight: 700;
          color: #64748b;
          letter-spacing: 0.05em;
          font-family: var(--font-mono);
        }

        .detail-description {
          font-size: 12.5px;
          line-height: 1.5;
          color: #cbd5e1;
          background: #0d121f;
          padding: 10px 12px;
          border-radius: 6px;
          border: 1px solid #1c2638;
        }

        .copy-path-btn {
          background: transparent;
          border: none;
          color: #818cf8;
          font-size: 11px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 4px;
          cursor: pointer;
          padding: 0;
          transition: color 0.12s ease;
        }

        .copy-path-btn:hover {
          color: #a5b4fc;
        }

        .detail-path-box {
          padding: 8px 10px;
          background: #090d16;
          border: 1px solid #1e283d;
          border-radius: 6px;
          font-size: 11px;
          color: #94a3b8;
          word-break: break-all;
          line-height: 1.45;
          user-select: text;
        }

        .detail-meta-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
        }

        .meta-box {
          background: #0d121f;
          border: 1px solid #1c2638;
          border-radius: 6px;
          padding: 8px 10px;
        }

        .meta-k {
          font-size: 9px;
          font-weight: 700;
          color: #64748b;
          font-family: var(--font-mono);
          letter-spacing: 0.04em;
          margin-bottom: 2px;
        }

        .meta-v {
          font-size: 12px;
          font-weight: 600;
          color: #f1f5f9;
        }

        .pkg-modal-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 20px;
          border-top: 1px solid #1f293d;
          background: #0e1524;
          gap: 8px;
        }

        .footer-right-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .modal-action-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          font-size: 12px;
          font-weight: 600;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.12s ease;
          border: 1px solid transparent;
        }

        .btn-primary {
          background: #4f46e5;
          color: #ffffff;
        }

        .btn-primary:hover {
          background: #4338ca;
        }

        .btn-secondary {
          background: #1e293b;
          color: #cbd5e1;
          border-color: #334155;
        }

        .btn-secondary:hover {
          background: #283548;
          color: #f8fafc;
        }

        .btn-danger {
          background: rgba(239, 68, 68, 0.1);
          color: #f87171;
          border-color: rgba(239, 68, 68, 0.25);
        }

        .btn-danger:hover {
          background: rgba(239, 68, 68, 0.2);
          color: #fca5a5;
        }

        .btn-danger.confirming {
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
