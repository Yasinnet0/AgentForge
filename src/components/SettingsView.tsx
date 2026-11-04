import React, { useState, useMemo } from 'react';
import { 
  Settings as SettingsIcon,
  Sliders, 
  HardDrive, 
  Globe, 
  FolderOpen, 
  RefreshCw, 
  Trash2, 
  LayoutGrid, 
  List as ListIcon,
  ExternalLink
} from 'lucide-react';
import { NavTab } from './Sidebar';
import { useToast } from '../context/ToastContext';
import { clearActivities, getActivities } from '../services/activityLogger';
import { SupportedAgent } from '../types/agent';
import { INITIAL_SUPPORTED_AGENTS } from '../config/supportedAgents';
import appLogo from '../assets/icon.png';

export interface SettingsViewProps {
  onNavigate?: (tab: NavTab) => void;
  onRefreshCapabilities?: () => Promise<void> | void;
  onSyncCatalog?: () => Promise<void>;
  isSyncingCatalog?: boolean;
  catalogSyncedAt?: string | null;
  agents?: SupportedAgent[];
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  onNavigate: _onNavigate,
  onRefreshCapabilities: _onRefreshCapabilities,
  onSyncCatalog,
  isSyncingCatalog = false,
  catalogSyncedAt,
  agents: _agents = INITIAL_SUPPORTED_AGENTS,
}) => {
  const toast = useToast();

  // Settings State persisted in localStorage
  const [defaultTab, setDefaultTab] = useState<NavTab>(() => {
    return (localStorage.getItem('agentforge_default_tab') as NavTab) || 'overview';
  });

  const [defaultViewMode, setDefaultViewMode] = useState<'grid' | 'list'>(() => {
    return (localStorage.getItem('agentforge_view_mode_skills') as 'grid' | 'list') || 'grid';
  });

  const [autoSyncOnStartup, setAutoSyncOnStartup] = useState<boolean>(() => {
    const saved = localStorage.getItem('agentforge_auto_sync_startup');
    return saved !== null ? saved === 'true' : true;
  });

  const [autoRescanOnFocus, setAutoRescanOnFocus] = useState<boolean>(() => {
    const saved = localStorage.getItem('agentforge_auto_rescan_focus');
    return saved !== null ? saved === 'true' : true;
  });

  const [rememberLastTab, setRememberLastTab] = useState<boolean>(() => {
    return localStorage.getItem('agentforge_remember_last_tab') === 'true';
  });

  const [confirmSkillUninstall, setConfirmSkillUninstall] = useState<boolean>(() => {
    return localStorage.getItem('agentforge_skip_skill_uninstall_confirm') !== 'true';
  });

  const [tooltipDelay, setTooltipDelay] = useState<number>(() => {
    const val = localStorage.getItem('agentforge_tooltip_delay');
    return val ? parseInt(val, 10) : 50;
  });

  const [confirmClearCache, setConfirmClearCache] = useState(false);
  const [confirmClearActivities, setConfirmClearActivities] = useState(false);

  // Storage and Cache Estimations
  const cacheMetrics = useMemo(() => {
    try {
      let totalBytes = 0;
      let catalogBytes = 0;

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        const val = localStorage.getItem(key) || '';
        const size = (key.length + val.length) * 2;
        totalBytes += size;
        if (key.startsWith('agentforge_multi_') || key.includes('catalog')) {
          catalogBytes += size;
        }
      }

      const formatBytes = (bytes: number): string => {
        if (bytes <= 0) return '0 KB';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        const clamped = Math.min(Math.max(1, i), units.length - 1);
        const val = bytes / Math.pow(1024, clamped);
        return `${val >= 100 ? val.toFixed(0) : val.toFixed(1)} ${units[clamped]}`;
      };

      return {
        total: formatBytes(totalBytes),
        catalog: formatBytes(catalogBytes),
        activityCount: getActivities().length,
      };
    } catch {
      return { total: '0 KB', catalog: '0 KB', activityCount: 0 };
    }
  }, [confirmClearCache, confirmClearActivities]);

  const handleDefaultTabChange = (newTab: NavTab) => {
    setDefaultTab(newTab);
    localStorage.setItem('agentforge_default_tab', newTab);
    toast.success(`AgentForge will open to ${newTab} on startup.`, {
      duration: 2000,
    });
  };

  const handleDefaultViewModeChange = (mode: 'grid' | 'list') => {
    setDefaultViewMode(mode);
    localStorage.setItem('agentforge_view_mode_skills', mode);
    localStorage.setItem('agentforge_view_mode_mcp', mode);
    localStorage.setItem('agentforge_view_mode_plugins', mode);
    localStorage.setItem('agentforge_view_mode_agents', mode);
    toast.success(`Default layout set to ${mode.toUpperCase()} view.`, {
      duration: 2000,
    });
  };

  const handleAutoSyncToggle = () => {
    const next = !autoSyncOnStartup;
    setAutoSyncOnStartup(next);
    localStorage.setItem('agentforge_auto_sync_startup', String(next));
    toast.info(next ? 'Startup catalog sync enabled.' : 'Startup catalog sync disabled.', {
      duration: 2000,
    });
  };

  const handleAutoRescanToggle = () => {
    const next = !autoRescanOnFocus;
    setAutoRescanOnFocus(next);
    localStorage.setItem('agentforge_auto_rescan_focus', String(next));
    toast.info(next ? 'Rescan on window focus enabled.' : 'Rescan on window focus disabled.', {
      duration: 2000,
    });
  };

  const handleRememberLastTabToggle = () => {
    const next = !rememberLastTab;
    setRememberLastTab(next);
    localStorage.setItem('agentforge_remember_last_tab', String(next));
    toast.info(next ? 'Will reopen to last active tab.' : 'Will open to default tab on launch.', {
      duration: 2000,
    });
  };

  const handleConfirmSkillUninstallToggle = () => {
    const next = !confirmSkillUninstall;
    setConfirmSkillUninstall(next);
    if (!next) {
      localStorage.setItem('agentforge_skip_skill_uninstall_confirm', 'true');
      toast.info('Direct deletion enabled (no confirmation prompt).', {
        duration: 2000,
      });
    } else {
      localStorage.removeItem('agentforge_skip_skill_uninstall_confirm');
      toast.success('Uninstall confirmation enabled.', {
        duration: 2000,
      });
    }
  };

  const handleTooltipDelayChange = (delayMs: number) => {
    setTooltipDelay(delayMs);
    localStorage.setItem('agentforge_tooltip_delay', String(delayMs));
    toast.success(`Tooltip delay set to ${delayMs}ms.`, {
      duration: 1500,
    });
  };

  const handleManualSync = async () => {
    if (onSyncCatalog) {
      try {
        await onSyncCatalog();
        toast.success('Upstream catalogs refreshed.', {
          duration: 2000,
        });
      } catch {
        toast.error('Unable to reach remote registry. Offline cache kept.', {
          duration: 2500,
        });
      }
    }
  };

  const handleClearCache = () => {
    try {
      localStorage.removeItem('agentforge_multi_skills_v6');
      localStorage.removeItem('agentforge_multi_plugins_v6');
      localStorage.removeItem('agentforge_multi_mcps_v6');
      localStorage.removeItem('agentforge_multi_sync_meta_v6');
      localStorage.removeItem('agentforge_skills_catalog_cache');
      localStorage.removeItem('agentforge_mcp_catalog_cache');
      localStorage.removeItem('agentforge_plugins_catalog_cache');
      setConfirmClearCache(false);
      toast.success('Catalog cache cleared.', {
        duration: 2000,
      });
      if (onSyncCatalog) {
        onSyncCatalog();
      }
    } catch {
      toast.error('Failed to clear cache storage.', {
        duration: 2000,
      });
    }
  };

  const handleClearActivityLog = () => {
    try {
      clearActivities();
      setConfirmClearActivities(false);
      toast.success('Activity and notification history cleared.', {
        duration: 2000,
      });
    } catch {
      toast.error('Failed to clear activity stream.', {
        duration: 2000,
      });
    }
  };

  const handleOpenAppData = () => {
    if (window.electronAPI?.openPath) {
      window.electronAPI.openPath('userData');
    }
  };

  return (
    <div className="settings-view-container">
      {/* 1. Header Banner */}
      <div className="settings-view-header">
        <div className="header-left">
          <div className="header-title-row">
            <div className="settings-header-icon-wrap">
              <SettingsIcon size={16} />
            </div>
            <h1 className="view-title">Settings</h1>
            <span className="settings-status-pill font-mono">WORKSPACE</span>
          </div>
          <p className="view-desc">
            Configure application launch behavior, view preferences, and local data storage.
          </p>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className="header-btn font-mono"
            onClick={handleOpenAppData}
            title="Open configuration folder in file manager"
          >
            <FolderOpen size={13} className="text-sky" />
            <span>Open AppData</span>
          </button>
        </div>
      </div>

      {/* 2. Preferences Card */}
      <div className="settings-card">
        <div className="settings-card-header">
          <div className="card-header-title-wrap">
            <Sliders size={14} className="card-icon text-purple" />
            <h2 className="card-title font-mono">GENERAL PREFERENCES</h2>
          </div>
          <span className="card-header-badge font-mono">GENERAL</span>
        </div>

        <div className="settings-card-body">
          <div className="setting-row">
            <div className="setting-info">
              <span className="setting-label">Default Launch Tab</span>
              <span className="setting-subtext">The tab displayed when AgentForge starts.</span>
            </div>
            <select
              className="setting-select font-mono"
              value={defaultTab}
              onChange={(e) => handleDefaultTabChange(e.target.value as NavTab)}
            >
              <option value="overview">Overview Dashboard</option>
              <option value="agents">Agents Manager</option>
              <option value="mcp">MCP Servers</option>
              <option value="skills">Skills Catalog</option>
              <option value="plugins">Plugins</option>
              <option value="rules">Rules Directives</option>
              <option value="security">Security Shield</option>
            </select>
          </div>

          <div className="setting-row">
            <div className="setting-info">
              <span className="setting-label">Remember Last Session</span>
              <span className="setting-subtext">Reopen your last active tab on startup.</span>
            </div>
            <button
              type="button"
              className={`setting-toggle-btn ${rememberLastTab ? 'active' : ''}`}
              onClick={handleRememberLastTabToggle}
              aria-label="Toggle remember last tab"
            >
              <span className="toggle-switch-handle" />
            </button>
          </div>

          <div className="setting-row">
            <div className="setting-info">
              <span className="setting-label">Confirm Package Uninstallation</span>
              <span className="setting-subtext">Ask for confirmation before deleting skills or MCP servers.</span>
            </div>
            <button
              type="button"
              className={`setting-toggle-btn ${confirmSkillUninstall ? 'active' : ''}`}
              onClick={handleConfirmSkillUninstallToggle}
              aria-label="Toggle confirm skill uninstall"
            >
              <span className="toggle-switch-handle" />
            </button>
          </div>

          <div className="setting-row">
            <div className="setting-info">
              <span className="setting-label">Tooltip Responsiveness</span>
              <span className="setting-subtext">Delay before showing button hints and keyboard shortcuts.</span>
            </div>
            <div className="setting-segmented font-mono">
              <button
                type="button"
                className={`setting-segment-btn ${tooltipDelay === 30 ? 'active' : ''}`}
                onClick={() => handleTooltipDelayChange(30)}
              >
                Fast (30ms)
              </button>
              <button
                type="button"
                className={`setting-segment-btn ${tooltipDelay === 80 ? 'active' : ''}`}
                onClick={() => handleTooltipDelayChange(80)}
              >
                Normal (80ms)
              </button>
              <button
                type="button"
                className={`setting-segment-btn ${tooltipDelay === 200 ? 'active' : ''}`}
                onClick={() => handleTooltipDelayChange(200)}
              >
                Relaxed
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Catalog & Synchronization Card */}
      <div className="settings-card">
        <div className="settings-card-header">
          <div className="card-header-title-wrap">
            <Globe size={14} className="card-icon text-sky" />
            <h2 className="card-title font-mono">CATALOG & SYNCHRONIZATION</h2>
          </div>
          <span className="card-header-badge font-mono">SYNC</span>
        </div>

        <div className="settings-card-body">
          <div className="setting-row">
            <div className="setting-info">
              <span className="setting-label">Catalog View Presentation</span>
              <span className="setting-subtext">Default layout applied across Skills, MCP servers, and Plugins.</span>
            </div>
            <div className="setting-segmented font-mono">
              <button
                type="button"
                className={`setting-segment-btn ${defaultViewMode === 'grid' ? 'active' : ''}`}
                onClick={() => handleDefaultViewModeChange('grid')}
              >
                <LayoutGrid size={12} />
                <span>Grid</span>
              </button>
              <button
                type="button"
                className={`setting-segment-btn ${defaultViewMode === 'list' ? 'active' : ''}`}
                onClick={() => handleDefaultViewModeChange('list')}
              >
                <ListIcon size={12} />
                <span>List</span>
              </button>
            </div>
          </div>

          <div className="setting-row">
            <div className="setting-info">
              <span className="setting-label">Auto-Sync on Startup</span>
              <span className="setting-subtext">Check for newly registered packages when opening the app.</span>
            </div>
            <button
              type="button"
              className={`setting-toggle-btn ${autoSyncOnStartup ? 'active' : ''}`}
              onClick={handleAutoSyncToggle}
              aria-label="Toggle auto sync on startup"
            >
              <span className="toggle-switch-handle" />
            </button>
          </div>

          <div className="setting-row">
            <div className="setting-info">
              <span className="setting-label">Directory Watcher on Focus</span>
              <span className="setting-subtext">Rescan agent configuration folders when returning to the window.</span>
            </div>
            <button
              type="button"
              className={`setting-toggle-btn ${autoRescanOnFocus ? 'active' : ''}`}
              onClick={handleAutoRescanToggle}
              aria-label="Toggle auto rescan on window focus"
            >
              <span className="toggle-switch-handle" />
            </button>
          </div>

          <div className="setting-row">
            <div className="setting-info">
              <span className="setting-label">Catalog Status</span>
              <span className="setting-subtext">
                {catalogSyncedAt ? `Last synced: ${catalogSyncedAt}` : 'Using local catalog bundle.'}
              </span>
            </div>
            <button
              type="button"
              className="setting-action-btn primary font-mono"
              onClick={handleManualSync}
              disabled={isSyncingCatalog}
            >
              <RefreshCw size={12} className={isSyncingCatalog ? 'spin' : ''} />
              <span>{isSyncingCatalog ? 'Syncing...' : 'Sync Registry'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4. Local Storage & Data Card */}
      <div className="settings-card">
        <div className="settings-card-header">
          <div className="card-header-title-wrap">
            <HardDrive size={14} className="card-icon text-amber" />
            <h2 className="card-title font-mono">LOCAL STORAGE & DATA</h2>
          </div>
          <span className="card-header-badge font-mono">STORAGE</span>
        </div>

        <div className="settings-card-body">
          {/* Storage Summary Tiles */}
          <div className="storage-metrics-bar">
            <div className="storage-metric-tile">
              <span className="metric-k font-mono">TOTAL CACHE</span>
              <span className="metric-v font-mono">{cacheMetrics.total}</span>
            </div>
            <div className="storage-metric-tile">
              <span className="metric-k font-mono">CATALOG DATA</span>
              <span className="metric-v font-mono text-purple">{cacheMetrics.catalog}</span>
            </div>
            <div className="storage-metric-tile">
              <span className="metric-k font-mono">LOGGED EVENTS</span>
              <span className="metric-v font-mono text-amber">{cacheMetrics.activityCount} Events</span>
            </div>
          </div>

          <div className="setting-row">
            <div className="setting-info">
              <span className="setting-label">Flush Catalog Cache</span>
              <span className="setting-subtext">Clear locally cached package manifests to force a fresh re-download.</span>
            </div>
            {!confirmClearCache ? (
              <button
                type="button"
                className="setting-action-btn danger font-mono"
                onClick={() => setConfirmClearCache(true)}
              >
                <Trash2 size={12} />
                <span>Clear Cache</span>
              </button>
            ) : (
              <div className="confirm-btn-group font-mono">
                <button
                  type="button"
                  className="setting-action-btn danger font-mono"
                  onClick={handleClearCache}
                >
                  Confirm
                </button>
                <button
                  type="button"
                  className="setting-action-btn secondary font-mono"
                  onClick={() => setConfirmClearCache(false)}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          <div className="setting-row">
            <div className="setting-info">
              <span className="setting-label">Reset Activity History</span>
              <span className="setting-subtext">Clear past event notifications and action logs from the top bar.</span>
            </div>
            {!confirmClearActivities ? (
              <button
                type="button"
                className="setting-action-btn secondary font-mono"
                onClick={() => setConfirmClearActivities(true)}
              >
                <Trash2 size={12} />
                <span>Clear History</span>
              </button>
            ) : (
              <div className="confirm-btn-group font-mono">
                <button
                  type="button"
                  className="setting-action-btn danger font-mono"
                  onClick={handleClearActivityLog}
                >
                  Confirm
                </button>
                <button
                  type="button"
                  className="setting-action-btn secondary font-mono"
                  onClick={() => setConfirmClearActivities(false)}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 5. About AgentForge Footer Card */}
      <div className="about-card">
        <div className="about-top-row">
          <div className="about-brand-wrap">
            <div className="about-logo-box">
              <img src={appLogo} alt="AgentForge Logo" className="about-logo-img" />
            </div>
            <div>
              <div className="about-title-row">
                <h3 className="about-title font-mono">AgentForge</h3>
                <span className="about-version-badge font-mono">v0.1.0 Beta</span>
              </div>
              <p className="about-desc">
                Desktop tool to manage local AI agents, tools, skills, rules, and MCP servers.
              </p>
            </div>
          </div>

          <button
            type="button"
            className="header-btn font-mono"
            onClick={() => {
              if (window.electronAPI?.openExternal) {
                window.electronAPI.openExternal('https://github.com/Yasinnet0/AgentForge');
              }
            }}
          >
            <span>GitHub Repository</span>
            <ExternalLink size={12} className="text-slate" />
          </button>
        </div>

        <div className="about-footer-row font-mono">
          <div className="about-pill-items">
            <span>Electron 34</span>
            <span>•</span>
            <span>React 19</span>
            <span>•</span>
            <span>Node 20</span>
          </div>
          <span>MIT License &copy; AgentForge Contributors</span>
        </div>
      </div>

      <style>{`
        .settings-view-container {
          display: flex;
          flex-direction: column;
          gap: 16px;
          max-width: 820px;
          margin: 0 auto;
          width: 100%;
          min-width: 0;
          box-sizing: border-box;
          padding-bottom: 24px;
        }

        .settings-view-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 18px;
          background: #0d121f;
          border: 1px solid #1c2538;
          border-radius: 8px;
          box-sizing: border-box;
          gap: 16px;
        }

        .header-title-row {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 4px;
        }

        .settings-header-icon-wrap {
          width: 26px;
          height: 26px;
          border-radius: 6px;
          background: rgba(168, 85, 247, 0.12);
          border: 1px solid rgba(168, 85, 247, 0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #c084fc;
          flex-shrink: 0;
        }

        .view-title {
          font-size: 15px;
          font-weight: 700;
          color: #f8fafc;
          margin: 0;
          letter-spacing: -0.01em;
        }

        .settings-status-pill {
          font-size: 9.5px;
          font-weight: 700;
          color: #94a3b8;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.09);
          padding: 2px 7px;
          border-radius: 4px;
          letter-spacing: 0.05em;
        }

        .view-desc {
          font-size: 11.5px;
          color: #8899ac;
          margin: 0;
          line-height: 1.4;
        }

        .header-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }

        .header-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          height: 28px;
          padding: 0 11px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          background: #131b2c;
          border: 1px solid #233148;
          color: #cbd5e1;
          transition: all 0.15s ease;
        }

        .header-btn:hover:not(:disabled) {
          background: #1b263d;
          border-color: #384e72;
          color: #ffffff;
        }

        .header-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .settings-card {
          background: #0b101c;
          border: 1px solid #1c263c;
          border-radius: 8px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          box-shadow: 0 4px 18px rgba(0, 0, 0, 0.35);
        }

        .settings-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 16px;
          background: rgba(255, 255, 255, 0.02);
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .card-header-title-wrap {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .card-title {
          font-size: 11px;
          font-weight: 700;
          color: #cbd5e1;
          letter-spacing: 0.06em;
          margin: 0;
        }

        .card-header-badge {
          font-size: 9px;
          font-weight: 700;
          color: #64748b;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          padding: 1px 6px;
          border-radius: 4px;
          letter-spacing: 0.05em;
        }

        .settings-card-body {
          padding: 6px 16px;
          display: flex;
          flex-direction: column;
        }

        .setting-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          padding: 12px 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
          min-height: 48px;
          box-sizing: border-box;
        }

        .setting-row:last-child {
          border-bottom: none;
        }

        .setting-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
          flex: 1;
          min-width: 0;
        }

        .setting-label {
          font-size: 12px;
          font-weight: 600;
          color: #f1f5f9;
        }

        .setting-subtext {
          font-size: 11px;
          color: #8899ac;
          line-height: 1.35;
        }

        .setting-select {
          background: #111728;
          border: 1px solid #233148;
          color: #f1f5f9;
          font-size: 11px;
          padding: 5px 10px;
          border-radius: 6px;
          outline: none;
          cursor: pointer;
          min-width: 180px;
          flex-shrink: 0;
          transition: border-color 0.15s ease;
        }

        .setting-select:hover {
          border-color: #3b5075;
        }

        .setting-select:focus {
          border-color: #7c3aed;
        }

        .setting-segmented {
          display: inline-flex;
          background: #111728;
          border: 1px solid #1f2c42;
          padding: 2px;
          border-radius: 6px;
          gap: 2px;
          flex-shrink: 0;
        }

        .setting-segment-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 10px;
          background: transparent;
          border: none;
          border-radius: 4px;
          color: #8899ac;
          font-size: 10.5px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.12s ease;
        }

        .setting-segment-btn:hover {
          color: #ffffff;
        }

        .setting-segment-btn.active {
          background: #233148;
          color: #38bdf8;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
        }

        .setting-toggle-btn {
          width: 38px;
          height: 20px;
          border-radius: 10px;
          background: #182236;
          border: 1px solid #263654;
          cursor: pointer;
          position: relative;
          transition: background 0.2s ease, border-color 0.2s ease;
          padding: 0;
          flex-shrink: 0;
        }

        .setting-toggle-btn.active {
          background: #7c3aed;
          border-color: #a855f7;
        }

        .toggle-switch-handle {
          position: absolute;
          top: 2px;
          left: 2px;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #ffffff;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
          transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .setting-toggle-btn.active .toggle-switch-handle {
          transform: translateX(18px);
        }

        .setting-action-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          height: 27px;
          padding: 0 10px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
          flex-shrink: 0;
          white-space: nowrap;
        }

        .setting-action-btn.primary {
          background: #1d2a44;
          border: 1px solid #38bdf8;
          color: #38bdf8;
        }

        .setting-action-btn.primary:hover:not(:disabled) {
          background: #253759;
          color: #7dd3fc;
          box-shadow: 0 0 10px rgba(56, 189, 248, 0.25);
        }

        .setting-action-btn.danger {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.35);
          color: #f87171;
        }

        .setting-action-btn.danger:hover {
          background: rgba(239, 68, 68, 0.2);
          border-color: #ef4444;
          color: #ffffff;
        }

        .setting-action-btn.secondary {
          background: #131b2c;
          border: 1px solid #233148;
          color: #cbd5e1;
        }

        .setting-action-btn.secondary:hover {
          background: #1b263d;
          border-color: #384e72;
          color: #ffffff;
        }

        .confirm-btn-group {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        /* Storage Summary Meters */
        .storage-metrics-bar {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          background: #080c16;
          border: 1px solid #182236;
          border-radius: 6px;
          padding: 10px 12px;
          margin: 8px 0 12px;
        }

        .storage-metric-tile {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .metric-k {
          font-size: 8.5px;
          font-weight: 700;
          color: #64748b;
          letter-spacing: 0.05em;
        }

        .metric-v {
          font-size: 13px;
          font-weight: 700;
          color: #f1f5f9;
        }

        /* About Card */
        .about-card {
          background: #0b101c;
          border: 1px solid #1c263c;
          border-radius: 8px;
          padding: 16px 18px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          box-shadow: 0 4px 18px rgba(0, 0, 0, 0.35);
        }

        .about-top-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }

        .about-brand-wrap {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .about-logo-box {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          background: rgba(124, 58, 237, 0.12);
          border: 1px solid rgba(124, 58, 237, 0.25);
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          flex-shrink: 0;
        }

        .about-logo-img {
          width: 24px;
          height: 24px;
          object-fit: contain;
        }

        .about-title-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .about-title {
          font-size: 13.5px;
          font-weight: 700;
          color: #f8fafc;
          margin: 0;
        }

        .about-version-badge {
          font-size: 9px;
          font-weight: 700;
          color: #c084fc;
          background: rgba(168, 85, 247, 0.12);
          border: 1px solid rgba(168, 85, 247, 0.3);
          padding: 1px 6px;
          border-radius: 4px;
          letter-spacing: 0.04em;
        }

        .about-desc {
          font-size: 11px;
          color: #8899ac;
          margin: 2px 0 0;
        }

        .about-footer-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-top: 10px;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
          font-size: 10px;
          color: #64748b;
        }

        .about-pill-items {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .text-purple { color: #a855f7; }
        .text-sky { color: #38bdf8; }
        .text-amber { color: #f59e0b; }
      `}</style>
    </div>
  );
};
