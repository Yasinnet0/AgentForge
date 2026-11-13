import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  SlidersHorizontal,
  Palette,
  CloudDownload,
  Database,
  BadgeInfo,
  FolderOpen,
  RefreshCw,
  Trash2,
  ExternalLink,
  X,
  Search,
  ShieldAlert,
  Clock,
  Github,
  FileText,
  LayoutGrid,
  List as ListIcon,
  ChevronDown,
  Check,
  Bot,
  Cable,
  Zap,
  Package,
  FileCode
} from 'lucide-react';
import { NavTab } from './Sidebar';
import { useToast } from '../context/ToastContext';
import { clearActivities, getActivities } from '../services/activityLogger';
import { SupportedAgent } from '../types/agent';
import { INITIAL_SUPPORTED_AGENTS } from '../config/supportedAgents';
import { useModalTransition } from '../hooks/useModalTransition';
import { getCurrentPlatform } from '../utils/dependencyResolver';
import appLogo from '../assets/icon.png';

export type SettingsCategory = 'general' | 'appearance' | 'sync' | 'storage' | 'about';

interface LaunchTabOption {
  id: NavTab;
  label: string;
  icon: React.ElementType;
}

const LAUNCH_TAB_OPTIONS: LaunchTabOption[] = [
  { id: 'overview', label: 'Overview Dashboard', icon: LayoutGrid },
  { id: 'agents', label: 'Agents Manager', icon: Bot },
  { id: 'mcp', label: 'MCP Servers', icon: Cable },
  { id: 'skills', label: 'Skills Catalog', icon: Zap },
  { id: 'plugins', label: 'Plugins', icon: Package },
  { id: 'rules', label: 'Rules Directives', icon: FileCode },
  { id: 'security', label: 'Security Shield', icon: ShieldAlert },
];

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateTab?: (tab: NavTab) => void;
  onRefreshCapabilities?: () => Promise<void> | void;
  onSyncCatalog?: () => Promise<void>;
  isSyncingCatalog?: boolean;
  catalogSyncedAt?: string | null;
  agents?: SupportedAgent[];
  initialCategory?: SettingsCategory;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onNavigateTab: _onNavigateTab,
  onRefreshCapabilities: _onRefreshCapabilities,
  onSyncCatalog,
  isSyncingCatalog = false,
  catalogSyncedAt,
  agents: _agents = INITIAL_SUPPORTED_AGENTS,
  initialCategory = 'general',
}) => {
  const toast = useToast();
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>(initialCategory);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const {
    isRendered,
    isClosing,
    handleClose,
  } = useModalTransition(isOpen, onClose, 180);

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
    return val ? parseInt(val, 10) : 80;
  });

  const [confirmClearCache, setConfirmClearCache] = useState(false);
  const [confirmClearActivities, setConfirmClearActivities] = useState(false);
  const [appVersion, setAppVersion] = useState('0.2.0');

  // Custom Launch Tab Dropdown state
  const [isLaunchTabDropdownOpen, setIsLaunchTabDropdownOpen] = useState(false);
  const launchDropdownRef = useRef<HTMLDivElement>(null);

  // Close launch tab dropdown on outside click
  useEffect(() => {
    if (!isLaunchTabDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (launchDropdownRef.current && !launchDropdownRef.current.contains(e.target as Node)) {
        setIsLaunchTabDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isLaunchTabDropdownOpen]);

  useEffect(() => {
    if (window.electronAPI?.getAppVersion) {
      window.electronAPI.getAppVersion().then((v) => {
        if (v) setAppVersion(v);
      }).catch(() => {});
    }
  }, []);

  // Sync initialCategory when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveCategory(initialCategory);
      setSearchQuery('');
    }
  }, [isOpen, initialCategory]);

  // Escape key listener - closes open dropdown first, or closes modal without focus box
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        if (isLaunchTabDropdownOpen) {
          setIsLaunchTabDropdownOpen(false);
          return;
        }
        handleClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [isOpen, handleClose, isLaunchTabDropdownOpen]);

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
    toast.success(`AgentForge will open to ${newTab} on startup.`, { duration: 2000 });
  };

  const handleDefaultViewModeChange = (mode: 'grid' | 'list') => {
    setDefaultViewMode(mode);
    localStorage.setItem('agentforge_view_mode_skills', mode);
    localStorage.setItem('agentforge_view_mode_mcp', mode);
    localStorage.setItem('agentforge_view_mode_plugins', mode);
    localStorage.setItem('agentforge_view_mode_agents', mode);
    toast.success(`Default layout set to ${mode.toUpperCase()} view.`, { duration: 2000 });
  };

  const handleAutoSyncToggle = () => {
    const next = !autoSyncOnStartup;
    setAutoSyncOnStartup(next);
    localStorage.setItem('agentforge_auto_sync_startup', String(next));
    toast.info(next ? 'Startup catalog sync enabled.' : 'Startup catalog sync disabled.', { duration: 2000 });
  };

  const handleAutoRescanToggle = () => {
    const next = !autoRescanOnFocus;
    setAutoRescanOnFocus(next);
    localStorage.setItem('agentforge_auto_rescan_focus', String(next));
    toast.info(next ? 'Rescan on window focus enabled.' : 'Rescan on window focus disabled.', { duration: 2000 });
  };

  const handleRememberLastTabToggle = () => {
    const next = !rememberLastTab;
    setRememberLastTab(next);
    localStorage.setItem('agentforge_remember_last_tab', String(next));
    toast.info(next ? 'Will reopen to last active tab on launch.' : 'Will open to default tab on launch.', { duration: 2000 });
  };

  const handleConfirmSkillUninstallToggle = () => {
    const next = !confirmSkillUninstall;
    setConfirmSkillUninstall(next);
    if (!next) {
      localStorage.setItem('agentforge_skip_skill_uninstall_confirm', 'true');
      toast.info('Direct deletion enabled (confirmation prompts disabled).', { duration: 2000 });
    } else {
      localStorage.removeItem('agentforge_skip_skill_uninstall_confirm');
      toast.success('Uninstall confirmation prompts enabled.', { duration: 2000 });
    }
  };

  const handleTooltipDelayChange = (delayMs: number) => {
    setTooltipDelay(delayMs);
    localStorage.setItem('agentforge_tooltip_delay', String(delayMs));
    toast.success(`Tooltip delay set to ${delayMs}ms.`, { duration: 1500 });
  };

  const handleManualSync = async () => {
    if (onSyncCatalog) {
      try {
        await onSyncCatalog();
        toast.success('Upstream catalogs refreshed successfully.', { duration: 2000 });
      } catch {
        toast.error('Unable to reach remote registry. Local cache retained.', { duration: 2500 });
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
      toast.success('Catalog cache cleared.', { duration: 2000 });
      if (onSyncCatalog) onSyncCatalog();
    } catch {
      toast.error('Failed to clear cache storage.', { duration: 2000 });
    }
  };

  const handleClearActivityLog = () => {
    try {
      clearActivities();
      setConfirmClearActivities(false);
      toast.success('Activity and notification history cleared.', { duration: 2000 });
    } catch {
      toast.error('Failed to clear activity stream.', { duration: 2000 });
    }
  };

  const handleOpenAppData = () => {
    if (window.electronAPI?.openPath) {
      window.electronAPI.openPath('userData');
    }
  };

  // Search filtering across settings items
  const normalizedQuery = searchQuery.toLowerCase().trim();
  const isSearching = normalizedQuery.length > 0;

  const matchesSearch = (text: string, tags?: string[]) => {
    if (!isSearching) return true;
    if (text.toLowerCase().includes(normalizedQuery)) return true;
    if (tags && tags.some((t) => t.toLowerCase().includes(normalizedQuery))) return true;
    return false;
  };

  if (!isRendered) return null;

  return createPortal(
    <div
      className={`settings-modal-backdrop ${isClosing ? 'is-closing' : ''}`}
      onClick={handleClose}
    >
      <div
        className={`settings-modal-card ${isClosing ? 'is-closing' : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="AgentForge Preferences"
      >
        {/* Left Sidebar Pane */}
        <aside className="settings-sidebar">
          <div className="settings-sidebar-header">
            <div className="settings-brand-row">
              <div className="settings-modal-icon-wrap">
                <SlidersHorizontal size={15} strokeWidth={1.75} />
              </div>
              <div className="settings-brand-info">
                <h2 className="settings-modal-title">Settings</h2>
                <span className="settings-brand-pill font-mono">PREFERENCES</span>
              </div>
            </div>

            {/* Quick Filter */}
            <div className="settings-search-box">
              <Search size={13} className="settings-search-icon" />
              <input
                ref={searchInputRef}
                type="text"
                className="settings-search-input font-mono"
                placeholder="Search settings..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoComplete="off"
                spellCheck="false"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="settings-search-clear"
                  onClick={() => setSearchQuery('')}
                  title="Clear filter"
                >
                  <X size={11} />
                </button>
              )}
            </div>
          </div>

          {/* Navigation Category Items */}
          <nav className="settings-category-nav" role="tablist">
            <button
              type="button"
              className={`category-item-btn ${activeCategory === 'general' && !isSearching ? 'active' : ''}`}
              onClick={() => {
                setActiveCategory('general');
                setSearchQuery('');
              }}
              role="tab"
              aria-selected={activeCategory === 'general' && !isSearching}
            >
              <SlidersHorizontal size={15} strokeWidth={1.7} className="cat-icon" />
              <span className="cat-title">General</span>
            </button>

            <button
              type="button"
              className={`category-item-btn ${activeCategory === 'appearance' && !isSearching ? 'active' : ''}`}
              onClick={() => {
                setActiveCategory('appearance');
                setSearchQuery('');
              }}
              role="tab"
              aria-selected={activeCategory === 'appearance' && !isSearching}
            >
              <Palette size={15} strokeWidth={1.7} className="cat-icon" />
              <span className="cat-title">Appearance</span>
            </button>

            <button
              type="button"
              className={`category-item-btn ${activeCategory === 'sync' && !isSearching ? 'active' : ''}`}
              onClick={() => {
                setActiveCategory('sync');
                setSearchQuery('');
              }}
              role="tab"
              aria-selected={activeCategory === 'sync' && !isSearching}
            >
              <CloudDownload size={15} strokeWidth={1.7} className="cat-icon" />
              <span className="cat-title">Sync & Catalogs</span>
            </button>

            <button
              type="button"
              className={`category-item-btn ${activeCategory === 'storage' && !isSearching ? 'active' : ''}`}
              onClick={() => {
                setActiveCategory('storage');
                setSearchQuery('');
              }}
              role="tab"
              aria-selected={activeCategory === 'storage' && !isSearching}
            >
              <Database size={15} strokeWidth={1.7} className="cat-icon" />
              <span className="cat-title">Storage & Data</span>
            </button>

            <button
              type="button"
              className={`category-item-btn ${activeCategory === 'about' && !isSearching ? 'active' : ''}`}
              onClick={() => {
                setActiveCategory('about');
                setSearchQuery('');
              }}
              role="tab"
              aria-selected={activeCategory === 'about' && !isSearching}
            >
              <BadgeInfo size={15} strokeWidth={1.7} className="cat-icon" />
              <span className="cat-title">About</span>
            </button>
          </nav>

          {/* Sidebar Footer Info */}
          <div className="settings-sidebar-footer">
            <div className="app-system-pill font-mono">
              <span className="system-dot" />
              <span>
                v{appVersion} • {getCurrentPlatform() === 'windows' ? 'Windows x64' : getCurrentPlatform() === 'mac' ? 'macOS' : 'Linux'}
              </span>
            </div>
          </div>
        </aside>

        {/* Right Content Canvas */}
        <main className="settings-content-pane">
          {/* Header Controls */}
          <div className="settings-content-header">
            <div className="content-header-info">
              <h3 className="section-main-title">
                {isSearching
                  ? `Search Results for "${searchQuery}"`
                  : activeCategory === 'general'
                  ? 'General Preferences'
                  : activeCategory === 'appearance'
                  ? 'Appearance & Layout'
                  : activeCategory === 'sync'
                  ? 'Catalog & Synchronization'
                  : activeCategory === 'storage'
                  ? 'Storage & Data Management'
                  : 'About AgentForge'}
              </h3>
              <span className="section-subtitle">
                {isSearching
                  ? 'Showing filtered settings across all categories.'
                  : activeCategory === 'general'
                  ? 'Manage application launch behavior, session memory, and uninstallation safety prompts.'
                  : activeCategory === 'appearance'
                  ? 'Customize default card display densities and view presentation.'
                  : activeCategory === 'sync'
                  ? 'Configure remote registry updates and local directory change detection.'
                  : activeCategory === 'storage'
                  ? 'Inspect cache footprints, purge obsolete manifests, and manage logs.'
                  : 'System information, license, and community links.'}
              </span>
            </div>

            <button
              type="button"
              className="settings-modal-close-btn"
              onClick={handleClose}
              title="Close Settings (Esc)"
              aria-label="Close Settings"
            >
              <X size={15} strokeWidth={2} />
            </button>
          </div>

          {/* Scrollable Content Body */}
          <div className="settings-content-scroll">
            <div key={isSearching ? 'search' : activeCategory} className={isSearching ? 'settings-search-container' : 'settings-tab-panel'}>
              {/* 1. GENERAL CATEGORY */}
              {(isSearching || activeCategory === 'general') && (
                <div className="settings-section-card">
                  {isSearching && (
                    <div className="section-search-divider font-mono">
                      <span>GENERAL</span>
                    </div>
                  )}

                {matchesSearch('Default Launch Tab startup open default view overview agents mcp skills', ['tab', 'startup']) && (
                  <div className="setting-row">
                    <div className="setting-info">
                      <span className="setting-label">Default Launch Tab</span>
                      <span className="setting-subtext">The view displayed immediately when AgentForge launches.</span>
                    </div>
                    <div className="custom-dropdown-wrap" ref={launchDropdownRef}>
                      <button
                        type="button"
                        className={`custom-dropdown-trigger font-mono ${isLaunchTabDropdownOpen ? 'active' : ''}`}
                        onClick={() => setIsLaunchTabDropdownOpen((prev) => !prev)}
                        aria-expanded={isLaunchTabDropdownOpen}
                        aria-haspopup="listbox"
                      >
                        <div className="dropdown-trigger-left">
                          {(() => {
                            const currentOpt = LAUNCH_TAB_OPTIONS.find((o) => o.id === defaultTab) || LAUNCH_TAB_OPTIONS[0];
                            const Icon = currentOpt.icon;
                            return (
                              <>
                                <Icon size={13} strokeWidth={1.7} className="trigger-icon" />
                                <span>{currentOpt.label}</span>
                              </>
                            );
                          })()}
                        </div>
                        <ChevronDown
                          size={12}
                          strokeWidth={2}
                          className={`dropdown-trigger-chevron ${isLaunchTabDropdownOpen ? 'open' : ''}`}
                        />
                      </button>

                      {isLaunchTabDropdownOpen && (
                        <div className="custom-dropdown-menu" role="listbox">
                          {LAUNCH_TAB_OPTIONS.map((opt) => {
                            const Icon = opt.icon;
                            const isSelected = defaultTab === opt.id;
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                className={`custom-dropdown-item font-mono ${isSelected ? 'selected' : ''}`}
                                onClick={() => {
                                  handleDefaultTabChange(opt.id);
                                  setIsLaunchTabDropdownOpen(false);
                                }}
                                role="option"
                                aria-selected={isSelected}
                              >
                                <div className="item-left">
                                  <Icon size={13} strokeWidth={1.7} className="item-icon" />
                                  <span>{opt.label}</span>
                                </div>
                                {isSelected && <Check size={12} strokeWidth={2.2} className="item-check" />}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {matchesSearch('Remember Last Session reopen active tab restart resume', ['session', 'restore']) && (
                  <div className="setting-row">
                    <div className="setting-info">
                      <span className="setting-label">Remember Last Session</span>
                      <span className="setting-subtext">Automatically reopen the last active tab you visited instead of default.</span>
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
                )}

                {matchesSearch('Confirm Package Uninstallation delete prompt warning skill mcp remove', ['uninstall', 'safety']) && (
                  <div className="setting-row">
                    <div className="setting-info">
                      <span className="setting-label">Confirm Package Uninstallation</span>
                      <span className="setting-subtext">Ask for double-confirmation before deleting skills or unregistering MCP servers.</span>
                    </div>
                    <button
                      type="button"
                      className={`setting-toggle-btn ${confirmSkillUninstall ? 'active' : ''}`}
                      onClick={handleConfirmSkillUninstallToggle}
                      aria-label="Toggle confirm package uninstall"
                    >
                      <span className="toggle-switch-handle" />
                    </button>
                  </div>
                )}

                {matchesSearch('Tooltip Responsiveness speed delay keyboard hints shortcuts hover', ['tooltip', 'shortcuts']) && (
                  <div className="setting-row">
                    <div className="setting-info">
                      <span className="setting-label">Tooltip Responsiveness</span>
                      <span className="setting-subtext">Hover delay before displaying navigation shortcuts and badge descriptions.</span>
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
                )}
              </div>
            )}

            {/* 2. APPEARANCE CATEGORY */}
            {(isSearching || activeCategory === 'appearance') && (
              <div className="settings-section-card">
                {isSearching && (
                  <div className="section-search-divider font-mono">
                    <span>APPEARANCE</span>
                  </div>
                )}

                {matchesSearch('Catalog View Presentation grid list layout skills mcp plugins default', ['layout', 'presentation', 'view']) && (
                  <div className="setting-row">
                    <div className="setting-info">
                      <span className="setting-label">Default Catalog Presentation</span>
                      <span className="setting-subtext">Initial presentation mode applied across Skills, MCP Servers, and Plugins catalogs.</span>
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
                )}

                {matchesSearch('Color Theme Appearance Dark Mode Palette', ['theme', 'dark']) && (
                  <div className="setting-row">
                    <div className="setting-info">
                      <span className="setting-label">Application Theme</span>
                      <span className="setting-subtext">Optimized for high-contrast OLED dark workspaces and modern desktop environments.</span>
                    </div>
                    <div className="theme-badge-preview font-mono">
                      <span className="theme-chip dark" />
                      <span>DEEP SPACE (DEFAULT)</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 3. SYNC & CATALOGS CATEGORY */}
            {(isSearching || activeCategory === 'sync') && (
              <div className="settings-section-card">
                {isSearching && (
                  <div className="section-search-divider font-mono">
                    <span>SYNC & REGISTRY</span>
                  </div>
                )}

                {matchesSearch('Auto-Sync on Startup remote registry refresh check update', ['sync', 'startup', 'registry']) && (
                  <div className="setting-row">
                    <div className="setting-info">
                      <span className="setting-label">Auto-Sync on Startup</span>
                      <span className="setting-subtext">Silently check upstream registries for newly published skills and MCP servers on boot.</span>
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
                )}

                {matchesSearch('Directory Watcher on Focus rescan agent configs live detection reload', ['watcher', 'focus', 'rescan']) && (
                  <div className="setting-row">
                    <div className="setting-info">
                      <span className="setting-label">Rescan Directories on Window Focus</span>
                      <span className="setting-subtext">Automatically detect external edits when returning from an IDE or code terminal.</span>
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
                )}

                {matchesSearch('Manual Registry Sync Remote Manifest refresh pull', ['sync', 'manual']) && (
                  <div className="setting-row">
                    <div className="setting-info">
                      <span className="setting-label">Remote Registry Status</span>
                      <span className="setting-subtext">
                        {catalogSyncedAt ? `Last synchronized: ${catalogSyncedAt}` : 'Using bundled offline fallback registry.'}
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
                )}
              </div>
            )}

            {/* 4. STORAGE & CACHE CATEGORY */}
            {(isSearching || activeCategory === 'storage') && (
              <div className="settings-section-card">
                {isSearching && (
                  <div className="section-search-divider font-mono">
                    <span>STORAGE & CACHE</span>
                  </div>
                )}

                {/* Storage Metrics Tiles */}
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

                {matchesSearch('Open AppData Folder configuration directory user data', ['appdata', 'folder']) && (
                  <div className="setting-row">
                    <div className="setting-info">
                      <span className="setting-label">Application Data Directory</span>
                      <span className="setting-subtext">Open internal configuration storage and logs in your system file manager.</span>
                    </div>
                    <button
                      type="button"
                      className="setting-action-btn secondary font-mono"
                      onClick={handleOpenAppData}
                      title="Reveal in File Explorer"
                    >
                      <FolderOpen size={12} className="text-sky" />
                      <span>Open AppData</span>
                    </button>
                  </div>
                )}

                {matchesSearch('Flush Catalog Cache purge delete reset manifests', ['cache', 'flush']) && (
                  <div className="setting-row">
                    <div className="setting-info">
                      <span className="setting-label">Flush Catalog Cache</span>
                      <span className="setting-subtext">Purge cached package manifests from disk to force a pristine re-download.</span>
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
                )}

                {matchesSearch('Reset Activity History logs events stream clear notifications', ['activity', 'logs']) && (
                  <div className="setting-row">
                    <div className="setting-info">
                      <span className="setting-label">Reset Activity History</span>
                      <span className="setting-subtext">Clear local notification activity records and session history logs.</span>
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
                )}
              </div>
            )}

            {/* 5. ABOUT CATEGORY */}
            {(isSearching || activeCategory === 'about') && (
              <div className="settings-section-card">
                {isSearching && (
                  <div className="section-search-divider font-mono">
                    <span>ABOUT</span>
                  </div>
                )}

                <div className="about-brand-card">
                  <div className="about-brand-row">
                    <div className="about-logo-box">
                      <img src={appLogo} alt="AgentForge Logo" className="about-logo-img" />
                    </div>
                    <div className="about-text-area">
                      <div className="about-title-row">
                        <h4 className="about-app-name font-mono">AgentForge</h4>
                        <span className="about-version-badge font-mono">v{appVersion}</span>
                      </div>
                      <p className="about-app-desc">
                        Local-First Desktop Hub for AI Agents, MCP Servers, Skills & Plugins.
                      </p>
                      <div className="about-tags-row font-mono">
                        <span className="platform-tag">Cross-Platform</span>
                        <span className="platform-tag">Offline First</span>
                        <span className="platform-tag">Open Source</span>
                        <span className="platform-tag">MIT License</span>
                      </div>
                    </div>
                  </div>

                  <div className="about-links-grid">
                    <button
                      type="button"
                      className="about-link-btn font-mono"
                      onClick={() => window.electronAPI?.openExternal('https://github.com/Yasinnet0/AgentForge')}
                    >
                      <Github size={13} />
                      <span>GitHub Repository</span>
                      <ExternalLink size={10} className="link-arrow" />
                    </button>

                    <button
                      type="button"
                      className="about-link-btn font-mono"
                      onClick={() => window.electronAPI?.openExternal('https://github.com/Yasinnet0/AgentForge/issues')}
                    >
                      <ShieldAlert size={13} />
                      <span>Report an Issue</span>
                      <ExternalLink size={10} className="link-arrow" />
                    </button>

                    <button
                      type="button"
                      className="about-link-btn font-mono"
                      onClick={() => window.electronAPI?.openExternal('https://github.com/Yasinnet0/AgentForge/blob/main/README.md')}
                    >
                      <FileText size={13} />
                      <span>Documentation</span>
                      <ExternalLink size={10} className="link-arrow" />
                    </button>

                    <button
                      type="button"
                      className="about-link-btn font-mono"
                      onClick={() => window.electronAPI?.openExternal('https://github.com/Yasinnet0/AgentForge/releases')}
                    >
                      <Clock size={13} />
                      <span>Release Notes</span>
                      <ExternalLink size={10} className="link-arrow" />
                    </button>
                  </div>
                </div>
              </div>
            )}
            </div>
          </div>
        </main>
      </div>

      <style>{`
        /* Settings Modal Backdrop */
        .settings-modal-backdrop {
          position: fixed;
          inset: 0;
          background: radial-gradient(ellipse at 50% 40%, rgba(13, 19, 36, 0.62) 0%, rgba(4, 7, 15, 0.74) 100%);
          backdrop-filter: blur(16px) saturate(180%) contrast(105%);
          -webkit-backdrop-filter: blur(16px) saturate(180%) contrast(105%);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          padding: 20px;
          animation: settingsBackdropFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          will-change: opacity;
        }

        .settings-modal-backdrop.is-closing {
          animation: settingsBackdropFadeOut 0.16s cubic-bezier(0.4, 0, 1, 1) forwards !important;
          pointer-events: none !important;
        }

        @keyframes settingsBackdropFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes settingsBackdropFadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }

        /* Modal Dialog Window */
        .settings-modal-card {
          background: #0b101d;
          border: 1px solid rgba(255, 255, 255, 0.09);
          border-radius: 14px;
          width: 900px;
          max-width: 95vw;
          height: 620px;
          max-height: 90vh;
          box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6), 0 30px 80px -15px rgba(0, 0, 0, 0.9), inset 0 1px 0 0 rgba(255, 255, 255, 0.1);
          overflow: hidden;
          display: flex;
          animation: settingsModalScaleIn 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          position: relative;
        }

        .settings-modal-card.is-closing {
          animation: settingsModalScaleOut 0.16s cubic-bezier(0.4, 0, 1, 1) forwards !important;
          pointer-events: none !important;
        }

        @keyframes settingsModalScaleIn {
          from {
            opacity: 0;
            transform: scale(0.97) translateY(8px);
          }
          to {
            opacity: 1;
            transform: none;
          }
        }

        @keyframes settingsModalScaleOut {
          from {
            opacity: 1;
            transform: none;
          }
          to {
            opacity: 0;
            transform: scale(0.97) translateY(8px);
          }
        }

        /* 2-Column Layout */
        .settings-sidebar {
          width: 220px;
          background: #080c16;
          border-right: 1px solid rgba(255, 255, 255, 0.07);
          display: flex;
          flex-direction: column;
          flex-shrink: 0;
          box-sizing: border-box;
        }

        .settings-sidebar-header {
          padding: 16px 14px 12px 14px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .settings-brand-row {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .settings-modal-icon-wrap {
          width: 32px;
          height: 32px;
          border-radius: 9px;
          background: rgba(168, 85, 247, 0.14);
          border: 1px solid rgba(168, 85, 247, 0.35);
          color: #c084fc;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .settings-brand-info {
          display: flex;
          flex-direction: column;
          gap: 1px;
        }

        .settings-modal-title {
          font-size: 15px;
          font-weight: 700;
          color: #f8fafc;
          margin: 0;
          line-height: 1.2;
        }

        .settings-brand-pill {
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.07em;
          color: #94a3b8;
        }

        .settings-search-box {
          position: relative;
          display: flex;
          align-items: center;
        }

        .settings-search-icon {
          position: absolute;
          left: 9px;
          color: #64748b;
          pointer-events: none;
        }

        .settings-search-input {
          width: 100%;
          height: 30px;
          padding: 0 26px 0 28px;
          background: rgba(255, 255, 255, 0.035);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 6px;
          font-size: 11px;
          color: #f1f5f9;
          outline: none;
          transition: all 0.15s ease;
        }

        .settings-search-input:focus {
          background: rgba(255, 255, 255, 0.06);
          border-color: rgba(168, 85, 247, 0.5);
          box-shadow: 0 0 0 2px rgba(168, 85, 247, 0.12);
        }

        .settings-search-clear {
          position: absolute;
          right: 7px;
          background: transparent;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2px;
          border-radius: 4px;
        }

        .settings-search-clear:hover {
          color: #f1f5f9;
          background: rgba(255, 255, 255, 0.08);
        }

        /* Category Nav */
        .settings-category-nav {
          padding: 8px 10px;
          display: flex;
          flex-direction: column;
          gap: 2px;
          flex: 1;
          overflow-y: auto;
        }

        .category-item-btn {
          width: 100%;
          height: 32px;
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 0 10px;
          border-radius: 6px;
          border: 1px solid transparent;
          background: transparent;
          color: #94a3b8;
          cursor: pointer;
          text-align: left;
          transition: background-color 0.14s ease, color 0.14s ease, border-color 0.14s ease;
          box-sizing: border-box;
        }

        .category-item-btn:hover {
          color: #f1f5f9;
          background: rgba(255, 255, 255, 0.04);
        }

        .category-item-btn.active {
          color: #ffffff;
          background: rgba(168, 85, 247, 0.14);
          border-color: rgba(168, 85, 247, 0.32);
        }

        .cat-icon {
          flex-shrink: 0;
          color: #64748b;
          transition: color 0.14s ease;
        }

        .category-item-btn:hover .cat-icon {
          color: #cbd5e1;
        }

        .category-item-btn.active .cat-icon {
          color: #c084fc;
        }

        .cat-title {
          font-size: 13px;
          font-weight: 500;
          line-height: 1;
          letter-spacing: -0.01em;
          color: inherit;
        }

        .category-item-btn.active .cat-title {
          font-weight: 600;
          color: #ffffff;
        }

        .settings-sidebar-footer {
          padding: 12px 14px;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
        }

        .app-system-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 10px;
          color: #64748b;
        }

        .system-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #10b981;
        }

        /* Right Content Pane */
        .settings-content-pane {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
          background: #0d1322;
        }

        .settings-content-header {
          padding: 16px 20px 14px 22px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.07);
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.02) 0%, transparent 100%), #0d1322;
          flex-shrink: 0;
          gap: 16px;
        }

        .content-header-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }

        .section-main-title {
          font-size: 16px;
          font-weight: 700;
          letter-spacing: -0.015em;
          color: #f8fafc;
          margin: 0;
          line-height: 1.25;
        }

        .section-subtitle {
          font-size: 12px;
          color: #94a3b8;
          line-height: 1.45;
        }

        .settings-modal-close-btn {
          align-self: flex-start;
          width: 28px;
          height: 28px;
          padding: 0;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #94a3b8;
          cursor: pointer;
          border-radius: 7px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
          flex-shrink: 0;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
          user-select: none;
        }

        .settings-modal-close-btn:hover {
          color: #f8fafc;
          background: rgba(255, 255, 255, 0.09);
          border-color: rgba(255, 255, 255, 0.18);
          transform: translateY(-0.5px);
        }

        .settings-modal-close-btn:active {
          transform: translateY(0.5px);
          background: rgba(255, 255, 255, 0.14);
        }

        /* Scroll Area */
        .settings-content-scroll {
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 18px 22px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .settings-content-scroll::-webkit-scrollbar {
          width: 5px;
        }

        .settings-content-scroll::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.15);
          border-radius: 4px;
        }

        .settings-content-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.25);
        }

        .settings-tab-panel {
          display: flex;
          flex-direction: column;
          gap: 16px;
          animation: settingsTabTransition 0.12s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          will-change: opacity, transform;
        }

        .settings-search-container {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        @keyframes settingsTabTransition {
          from {
            opacity: 0.55;
            transform: translateX(5px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        /* Cards and Setting Rows */
        .settings-section-card {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 10px;
          padding: 4px 14px;
          display: flex;
          flex-direction: column;
        }

        .section-search-divider {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 10px 0 6px 0;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.07em;
          color: #94a3b8;
          border-bottom: 1px dashed rgba(255, 255, 255, 0.08);
          margin-bottom: 4px;
        }

        .setting-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 13px 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
          gap: 20px;
        }

        .setting-row:last-child {
          border-bottom: none;
        }

        .setting-info {
          display: flex;
          flex-direction: column;
          gap: 3px;
          min-width: 0;
          flex: 1;
        }

        .setting-label {
          font-size: 13px;
          font-weight: 600;
          color: #f1f5f9;
        }

        .setting-subtext {
          font-size: 11px;
          color: #94a3b8;
          line-height: 1.4;
        }

        /* Controls */
        .custom-dropdown-wrap {
          position: relative;
          min-width: 195px;
        }

        .custom-dropdown-trigger {
          width: 100%;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 0 10px;
          background: #080c14;
          border: 1px solid rgba(255, 255, 255, 0.09);
          border-radius: 6px;
          color: #cbd5e1;
          font-size: 11.5px;
          cursor: pointer;
          transition: border-color 0.15s ease, background-color 0.15s ease;
          outline: none !important;
          user-select: none;
        }

        .custom-dropdown-trigger:hover,
        .custom-dropdown-trigger.active {
          background: #0f1524;
          border-color: rgba(168, 85, 247, 0.45);
          color: #f8fafc;
        }

        .dropdown-trigger-left {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
        }

        .trigger-icon {
          color: #a855f7;
          flex-shrink: 0;
        }

        .dropdown-trigger-chevron {
          color: #64748b;
          transition: transform 0.18s cubic-bezier(0.16, 1, 0.3, 1), color 0.15s ease;
          flex-shrink: 0;
        }

        .dropdown-trigger-chevron.open {
          transform: rotate(180deg);
          color: #c084fc;
        }

        .custom-dropdown-menu {
          position: absolute;
          top: calc(100% + 5px);
          right: 0;
          width: 100%;
          min-width: 205px;
          background: #0b101c;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          padding: 4px;
          display: flex;
          flex-direction: column;
          gap: 2px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(168, 85, 247, 0.15);
          z-index: 1000;
          animation: customDropdownFade 0.12s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          backdrop-filter: blur(12px);
          will-change: opacity, transform;
        }

        @keyframes customDropdownFade {
          from {
            opacity: 0;
            transform: translateY(-4px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .custom-dropdown-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          height: 30px;
          padding: 0 8px;
          border-radius: 5px;
          border: none;
          background: transparent;
          color: #94a3b8;
          font-size: 11px;
          cursor: pointer;
          transition: background-color 0.12s ease, color 0.12s ease;
          outline: none !important;
          text-align: left;
        }

        .custom-dropdown-item:hover {
          background: rgba(255, 255, 255, 0.05);
          color: #f1f5f9;
        }

        .custom-dropdown-item.selected {
          background: rgba(168, 85, 247, 0.14);
          color: #ffffff;
          font-weight: 600;
        }

        .custom-dropdown-item .item-left {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
        }

        .custom-dropdown-item .item-icon {
          color: #64748b;
          flex-shrink: 0;
        }

        .custom-dropdown-item.selected .item-icon {
          color: #c084fc;
        }

        .custom-dropdown-item .item-check {
          color: #a855f7;
          flex-shrink: 0;
        }

        .setting-select {
          background: #080c14;
          border: 1px solid rgba(255, 255, 255, 0.09);
          border-radius: 6px;
          color: #cbd5e1;
          font-size: 12px;
          padding: 5px 10px;
          outline: none;
          cursor: pointer;
          transition: border-color 0.15s;
          min-width: 170px;
        }

        .setting-select:focus {
          border-color: rgba(168, 85, 247, 0.5);
        }

        .setting-toggle-btn {
          width: 38px;
          height: 20px;
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.12);
          position: relative;
          cursor: pointer;
          transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
          padding: 0;
          flex-shrink: 0;
        }

        .setting-toggle-btn.active {
          background: #7c3aed;
          border-color: #8b5cf6;
          box-shadow: 0 0 10px rgba(124, 58, 237, 0.35);
        }

        .toggle-switch-handle {
          position: absolute;
          top: 2px;
          left: 2px;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #ffffff;
          transition: transform 0.18s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
        }

        .setting-toggle-btn.active .toggle-switch-handle {
          transform: translateX(18px);
        }

        .setting-segmented {
          display: inline-flex;
          background: #080c14;
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 6px;
          padding: 2px;
          gap: 2px;
          flex-shrink: 0;
        }

        .setting-segment-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 3px 9px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 500;
          color: #94a3b8;
          background: transparent;
          border: none;
          cursor: pointer;
          transition: all 0.14s ease;
        }

        .setting-segment-btn:hover {
          color: #ffffff;
        }

        .setting-segment-btn.active {
          background: rgba(168, 85, 247, 0.18);
          color: #c084fc;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
        }

        .setting-action-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.14s ease;
          border: 1px solid transparent;
          flex-shrink: 0;
        }

        .setting-action-btn.primary {
          background: rgba(56, 189, 248, 0.1);
          color: #38bdf8;
          border-color: rgba(56, 189, 248, 0.25);
        }

        .setting-action-btn.primary:hover:not(:disabled) {
          background: rgba(56, 189, 248, 0.18);
          border-color: rgba(56, 189, 248, 0.45);
        }

        .setting-action-btn.secondary {
          background: rgba(255, 255, 255, 0.04);
          color: #cbd5e1;
          border-color: rgba(255, 255, 255, 0.08);
        }

        .setting-action-btn.secondary:hover {
          background: rgba(255, 255, 255, 0.08);
          color: #ffffff;
        }

        .setting-action-btn.danger {
          background: rgba(239, 68, 68, 0.1);
          color: #f87171;
          border-color: rgba(239, 68, 68, 0.25);
        }

        .setting-action-btn.danger:hover {
          background: rgba(239, 68, 68, 0.2);
          border-color: rgba(239, 68, 68, 0.45);
        }

        .confirm-btn-group {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        /* Storage Metrics Bar */
        .storage-metrics-bar {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          margin-bottom: 6px;
          margin-top: 8px;
        }

        .storage-metric-tile {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 7px;
          padding: 8px 10px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .metric-k {
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.06em;
          color: #64748b;
        }

        .metric-v {
          font-size: 13px;
          font-weight: 700;
          color: #f1f5f9;
        }

        .theme-badge-preview {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 3px 8px;
          border-radius: 5px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          font-size: 10px;
          color: #94a3b8;
        }

        .theme-chip.dark {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #7c3aed;
          box-shadow: 0 0 6px rgba(124, 58, 237, 0.8);
        }

        /* About Card */
        .about-brand-card {
          padding: 10px 4px 6px 4px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .about-brand-row {
          display: flex;
          align-items: flex-start;
          gap: 14px;
        }

        .about-logo-box {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          padding: 6px;
        }

        .about-logo-img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }

        .about-text-area {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .about-title-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .about-app-name {
          font-size: 15px;
          font-weight: 700;
          color: #ffffff;
          margin: 0;
        }

        .about-version-badge {
          font-size: 10px;
          color: #c084fc;
          background: rgba(168, 85, 247, 0.1);
          border: 1px solid rgba(168, 85, 247, 0.25);
          padding: 1px 6px;
          border-radius: 4px;
          font-weight: 600;
        }

        .about-app-desc {
          font-size: 12px;
          color: #94a3b8;
          margin: 0;
          line-height: 1.4;
        }

        .about-tags-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 4px;
        }

        .platform-tag {
          font-size: 10px;
          color: #64748b;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          padding: 2px 7px;
          border-radius: 4px;
        }

        .about-links-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
        }

        .about-link-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border-radius: 7px;
          background: rgba(255, 255, 255, 0.025);
          border: 1px solid rgba(255, 255, 255, 0.06);
          color: #cbd5e1;
          font-size: 11px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.14s ease;
          text-align: left;
        }

        .about-link-btn:hover {
          background: rgba(255, 255, 255, 0.06);
          border-color: rgba(255, 255, 255, 0.14);
          color: #ffffff;
        }

        .about-link-btn .link-arrow {
          margin-left: auto;
          color: #64748b;
        }

        .about-link-btn:hover .link-arrow {
          color: #93c5fd;
        }

        .spin {
          animation: spinAnimation 1s linear infinite;
        }

        @keyframes spinAnimation {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>,
    document.body
  );
};
