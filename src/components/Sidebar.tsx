import React from 'react';
import { createPortal } from 'react-dom';
import {
  LayoutGrid,
  Bot,
  Cable,
  Zap,
  Package,
  FileCode,
  RefreshCw,
  GitFork,
  Layers,
  ShieldAlert,
  SlidersHorizontal,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';

export type NavTab =
  | 'overview'
  | 'agents'
  | 'mcp'
  | 'skills'
  | 'plugins'
  | 'rules'
  | 'updates'
  | 'hooks'
  | 'environments'
  | 'security'
  | 'settings';

interface NavItem {
  id: NavTab;
  label: string;
  icon: React.ElementType;
  badge?: string;
}

interface SidebarProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  badgeCounts?: {
    agents?: number;
    mcp?: number;
    skills?: number;
    plugins?: number;
  };
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  isSettingsOpen?: boolean;
  onOpenSettings?: () => void;
}

interface TooltipData {
  label: string;
  badge?: string;
  shortcut?: string;
  isActive?: boolean;
  top: number;
  left: number;
}

const SidebarComponent: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  badgeCounts,
  isCollapsed: isCollapsedProp,
  onToggleCollapse,
  isSettingsOpen = false,
  onOpenSettings,
}) => {
  const [internalCollapsed, setInternalCollapsed] = React.useState<boolean>(() => {
    try {
      return localStorage.getItem('agentforge_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const isCollapsed = isCollapsedProp !== undefined ? isCollapsedProp : internalCollapsed;

  const [tooltipState, setTooltipState] = React.useState<TooltipData | null>(null);
  const [appVersion, setAppVersion] = React.useState<string>('0.3.0');

  React.useEffect(() => {
    if (window.electronAPI?.getAppVersion) {
      window.electronAPI.getAppVersion().then((v) => {
        if (v) setAppVersion(v);
      }).catch(() => {});
    }
  }, []);

  const handleToggle = React.useCallback(() => {
    setTooltipState(null);
    if (onToggleCollapse) {
      onToggleCollapse();
    } else {
      setInternalCollapsed((prev) => {
        const next = !prev;
        try {
          localStorage.setItem('agentforge_sidebar_collapsed', String(next));
        } catch { }
        return next;
      });
    }
  }, [onToggleCollapse]);

  const showTooltip = React.useCallback((
    e: React.MouseEvent<HTMLElement>,
    label: string,
    extra?: { badge?: string; shortcut?: string; isActive?: boolean }
  ) => {
    if (!isCollapsed) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltipState({
      label,
      badge: extra?.badge,
      shortcut: extra?.shortcut,
      isActive: extra?.isActive,
      top: rect.top + rect.height / 2,
      left: rect.right + 8,
    });
  }, [isCollapsed]);

  const hideTooltip = React.useCallback(() => {
    setTooltipState(null);
  }, []);

  // Dismiss tooltip on scroll, resize, or when sidebar expands
  React.useEffect(() => {
    if (!isCollapsed) {
      setTooltipState(null);
      return;
    }
    const dismiss = () => setTooltipState(null);
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    return () => {
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [isCollapsed]);

  const mainNavItems: NavItem[] = [
    { id: 'overview' as NavTab, label: 'Overview', icon: LayoutGrid },
    { id: 'agents' as NavTab, label: 'Agents', icon: Bot, badge: badgeCounts?.agents !== undefined ? String(badgeCounts.agents) : undefined },
    { id: 'mcp' as NavTab, label: 'MCP Servers', icon: Cable, badge: badgeCounts?.mcp !== undefined ? String(badgeCounts.mcp) : undefined },
    { id: 'skills' as NavTab, label: 'Skills', icon: Zap, badge: badgeCounts?.skills !== undefined ? String(badgeCounts.skills) : undefined },
    { id: 'plugins' as NavTab, label: 'Plugins', icon: Package, badge: badgeCounts?.plugins !== undefined ? String(badgeCounts.plugins) : undefined },
    { id: 'rules' as NavTab, label: 'Rules', icon: FileCode },
    { id: 'updates' as NavTab, label: 'Updates', icon: RefreshCw },
    { id: 'hooks' as NavTab, label: 'Hooks', icon: GitFork },
    { id: 'environments' as NavTab, label: 'Environments', icon: Layers },
  ];

  const bottomNavItems: NavItem[] = [
    { id: 'security' as NavTab, label: 'Security', icon: ShieldAlert },
    { id: 'settings' as NavTab, label: 'Settings', icon: SlidersHorizontal },
  ];

  const renderNavButton = (item: NavItem) => {
    const Icon = item.icon;
    const isSettings = item.id === 'settings';
    const isActive = isSettings ? Boolean(isSettingsOpen) : activeTab === item.id;
    const shortcut = isSettings ? 'Ctrl+,' : undefined;
    return (
      <button
        key={item.id}
        type="button"
        className={`nav-button ${isActive ? 'active' : ''}`}
        onClick={() => {
          hideTooltip();
          if (isSettings && onOpenSettings) {
            onOpenSettings();
          } else {
            onTabChange(item.id);
          }
        }}
        onMouseEnter={(e) => showTooltip(e, item.label, { badge: item.badge, shortcut, isActive })}
        onMouseLeave={hideTooltip}
        aria-label={item.label}
      >
        <div className="nav-icon-label">
          <Icon size={16} strokeWidth={1.7} className={`nav-icon ${isActive ? 'active-icon' : ''}`} />
          {!isCollapsed && <span className="nav-label">{item.label}</span>}
        </div>
        {item.badge && (
          <span className={`nav-count ${isActive ? 'active-count' : ''}`}>
            {item.badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <aside className={`sidebar-container ${isCollapsed ? 'collapsed' : ''}`}>
      {/* Seamless Top Collapse Action */}
      <div className="sidebar-top-action-wrap">
        {!isCollapsed ? (
          <button
            type="button"
            className="sidebar-toggle-action-btn"
            onClick={handleToggle}
            aria-label="Collapse sidebar"
          >
            <div className="toggle-action-left">
              <PanelLeftClose size={15} strokeWidth={1.7} className="toggle-action-icon" />
              <span className="toggle-action-label">Collapse</span>
            </div>
            <kbd className="toggle-shortcut-badge font-mono">Ctrl+B</kbd>
          </button>
        ) : (
          <button
            type="button"
            className="sidebar-toggle-action-btn collapsed"
            onClick={handleToggle}
            onMouseEnter={(e) => showTooltip(e, 'Expand sidebar', { shortcut: 'Ctrl+B' })}
            onMouseLeave={hideTooltip}
            aria-label="Expand sidebar"
          >
            <PanelLeftOpen size={16} strokeWidth={1.7} className="toggle-action-icon" />
          </button>
        )}
        <div className="sidebar-top-divider" />
      </div>

      {/* Navigation */}
      <div className="sidebar-nav">
        <div className="sidebar-nav-group">
          {mainNavItems.map(renderNavButton)}
        </div>

        <div className="sidebar-nav-bottom-group">
          <div className="sidebar-group-divider" />
          {bottomNavItems.map(renderNavButton)}
        </div>
      </div>

      {/* Footer */}
      <div className="sidebar-footer">
        {!isCollapsed ? (
          <span className="version-tag font-mono">v{appVersion}</span>
        ) : (
          <span className="version-tag collapsed font-mono">v{appVersion.split('.').slice(0, 2).join('.')}</span>
        )}
      </div>

      {/* Floating Tooltip Portal for Collapsed Mode */}
      {tooltipState && isCollapsed && createPortal(
        <div
          className="sidebar-floating-tooltip"
          style={{
            position: 'fixed',
            top: `${tooltipState.top}px`,
            left: `${tooltipState.left}px`,
          }}
          role="tooltip"
        >
          <div className="tooltip-notch" />
          <span className="tooltip-label">{tooltipState.label}</span>
          {tooltipState.badge && (
            <span className="tooltip-badge font-mono">{tooltipState.badge}</span>
          )}
          {tooltipState.isActive && (
            <span className="tooltip-active-tag">Active</span>
          )}
          {tooltipState.shortcut && (
            <kbd className="tooltip-shortcut font-mono">{tooltipState.shortcut}</kbd>
          )}
        </div>,
        document.body
      )}

      <style>{`
        .sidebar-container {
          width: 196px;
          min-width: 196px;
          background: var(--bg-sidebar);
          border-right: 1px solid var(--border-subtle);
          display: flex;
          flex-direction: column;
          padding: 8px 6px;
          height: calc(100vh - 48px);
          overflow: hidden;
          transition: width 0.18s cubic-bezier(0.16, 1, 0.3, 1),
                      min-width 0.18s cubic-bezier(0.16, 1, 0.3, 1),
                      padding 0.18s ease;
          box-sizing: border-box;
          flex-shrink: 0;
        }

        .sidebar-container.collapsed {
          width: 50px;
          min-width: 50px;
          max-width: 50px;
          padding: 8px 4px;
        }

        .sidebar-top-action-wrap {
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
        }

        .sidebar-toggle-action-btn {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          height: 32px;
          padding: 5px 8px;
          border-radius: 6px;
          border: 1px solid transparent;
          background: transparent;
          color: var(--text-secondary);
          cursor: pointer;
          transition: background-color 0.14s ease, border-color 0.14s ease, color 0.14s ease;
          box-sizing: border-box;
          margin-bottom: 5px;
          user-select: none;
        }

        .sidebar-toggle-action-btn:hover {
          background: var(--bg-surface-hover);
          color: var(--text-primary);
          border-color: var(--border-subtle);
        }

        .sidebar-toggle-action-btn:hover .toggle-action-icon {
          color: var(--text-primary);
        }

        .sidebar-container.collapsed .sidebar-toggle-action-btn {
          width: 36px;
          height: 34px;
          padding: 0;
          margin: 0 auto 5px auto;
          justify-content: center;
          border-radius: 7px;
          background: var(--bg-pill);
          border-color: var(--border-subtle);
          color: var(--text-secondary);
        }

        .sidebar-container.collapsed .sidebar-toggle-action-btn:hover {
          background: var(--bg-elevated-hover);
          border-color: var(--border-hover);
          color: var(--text-primary);
        }

        .toggle-action-left {
          display: flex;
          align-items: center;
          gap: 9px;
        }

        .toggle-action-icon {
          color: var(--text-muted);
          transition: color 0.14s ease;
          flex-shrink: 0;
        }

        .toggle-action-label {
          font-size: 12px;
          font-weight: 500;
          letter-spacing: -0.01em;
          white-space: nowrap;
        }

        .toggle-shortcut-badge {
          font-size: 10px;
          color: var(--text-muted);
          background: var(--bg-pill);
          border: 1px solid var(--border-subtle);
          border-radius: 4px;
          padding: 1.5px 5px;
          line-height: 1;
          letter-spacing: 0.02em;
          transition: all 0.14s ease;
        }

        .sidebar-toggle-action-btn:hover .toggle-shortcut-badge {
          color: var(--text-primary);
          border-color: var(--border-hover);
          background: var(--bg-elevated-hover);
        }

        .sidebar-top-divider {
          height: 1px;
          background: var(--border-subtle);
          margin: 0 4px 6px 4px;
        }

        .sidebar-container.collapsed .sidebar-top-divider {
          width: 22px;
          margin: 0 auto 6px auto;
          background: var(--border-subtle);
        }

        .sidebar-nav {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow-y: auto;
          overflow-x: hidden;
          padding-right: 1px;
          scrollbar-width: none;
        }

        .sidebar-nav::-webkit-scrollbar {
          display: none;
        }

        .sidebar-nav-group {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .sidebar-container.collapsed .sidebar-nav-group {
          align-items: center;
          gap: 3px;
        }

        .sidebar-nav-bottom-group {
          margin-top: auto;
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding-top: 4px;
        }

        .sidebar-container.collapsed .sidebar-nav-bottom-group {
          align-items: center;
          gap: 3px;
          padding-top: 4px;
        }

        .sidebar-group-divider {
          height: 1px;
          background: var(--border-subtle);
          margin: 4px 6px;
        }

        .sidebar-container.collapsed .sidebar-group-divider {
          width: 22px;
          margin: 4px auto;
          background: var(--border-subtle);
        }

        .nav-button {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          height: 34px;
          padding: 6px 9px;
          border-radius: 7px;
          border: 1px solid transparent;
          background: transparent;
          color: var(--text-secondary);
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
          text-align: left;
          box-sizing: border-box;
        }

        .sidebar-container.collapsed .nav-button {
          width: 36px;
          height: 34px;
          padding: 0;
          margin: 0 auto;
          justify-content: center;
          position: relative;
          border-radius: 7px;
        }

        .nav-button:hover {
          background: var(--bg-surface-hover);
          color: var(--text-primary);
          border-color: var(--border-subtle);
        }

        .nav-button:active {
          background: var(--bg-elevated-hover);
        }

        .nav-button.active {
          background: var(--accent-purple-dim);
          color: var(--accent-purple-text);
          font-weight: 600;
          border: 1px solid rgba(147, 51, 234, 0.35);
        }

        .nav-button.active:hover {
          background: rgba(124, 58, 237, 0.20);
          color: var(--accent-purple-text);
          border-color: rgba(168, 85, 247, 0.5);
        }

        .nav-icon-label {
          display: flex;
          align-items: center;
          gap: 9px;
          min-width: 0;
        }

        .sidebar-container.collapsed .nav-icon-label {
          justify-content: center;
          gap: 0;
        }

        .nav-icon {
          color: var(--text-muted);
          transition: color 0.15s ease;
          flex-shrink: 0;
        }

        .nav-button:hover .nav-icon {
          color: var(--text-primary);
        }

        .nav-button.active .nav-icon,
        .nav-button.active:hover .nav-icon,
        .nav-icon.active-icon {
          color: var(--accent-purple-text);
        }

        .nav-label {
          letter-spacing: -0.01em;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          font-size: 13px;
        }

        .nav-count {
          font-size: 10px;
          font-family: var(--font-mono, monospace);
          font-weight: 600;
          letter-spacing: -0.01em;
          background: var(--bg-pill);
          color: var(--text-secondary);
          min-width: 18px;
          height: 17px;
          padding: 0 5px;
          border-radius: 9999px;
          border: 1px solid var(--border-subtle);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          line-height: 1;
          margin-left: 6px;
          flex-shrink: 0;
          user-select: none;
          transition: all 0.15s ease;
        }

        .sidebar-container.collapsed .nav-count {
          position: absolute;
          top: 2px;
          right: 2px;
          min-width: 14px;
          height: 14px;
          padding: 0 3px;
          font-size: 8px;
          margin-left: 0;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
        }

        .nav-button:hover .nav-count {
          background: var(--bg-elevated-hover);
          border-color: var(--border-hover);
          color: var(--text-primary);
        }

        .nav-count.active-count {
          background: var(--accent-purple-dim);
          color: var(--accent-purple-text);
          border-color: rgba(168, 85, 247, 0.4);
        }

        .nav-button.active:hover .nav-count.active-count {
          background: rgba(168, 85, 247, 0.24);
          border-color: rgba(168, 85, 247, 0.55);
        }

        .sidebar-footer {
          padding: 7px 6px 2px 6px;
          border-top: 1px solid var(--border-subtle);
          display: flex;
          align-items: center;
          justify-content: flex-start;
          box-sizing: border-box;
          flex-shrink: 0;
          min-height: 24px;
        }

        .sidebar-container.collapsed .sidebar-footer {
          justify-content: center;
          padding: 6px 0 2px 0;
        }

        .version-tag {
          font-size: 10px;
          color: var(--text-muted);
          font-weight: 500;
          letter-spacing: 0.02em;
          white-space: nowrap;
          user-select: none;
        }

        .version-tag.collapsed {
          font-size: 9px;
          color: var(--text-muted);
        }

        /* Floating Tooltip */
        .sidebar-floating-tooltip {
          position: fixed;
          transform: translateY(-50%);
          z-index: 999999;
          pointer-events: none;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 5px 9px 5px 10px;
          background: var(--bg-tooltip);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 6px;
          box-shadow: var(--shadow-tooltip);
          color: #f1f5f9;
          font-size: 12px;
          font-weight: 500;
          letter-spacing: -0.01em;
          white-space: nowrap;
          line-height: 1;
          animation: sidebarTooltipIn 0.12s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        @keyframes sidebarTooltipIn {
          from {
            opacity: 0;
            transform: translateY(-50%) translateX(-4px);
          }
          to {
            opacity: 1;
            transform: translateY(-50%) translateX(0);
          }
        }

        .sidebar-floating-tooltip .tooltip-notch {
          position: absolute;
          left: -4px;
          top: 50%;
          margin-top: -3.5px;
          width: 7px;
          height: 7px;
          background: var(--bg-tooltip);
          border-left: 1px solid rgba(255, 255, 255, 0.14);
          border-bottom: 1px solid rgba(255, 255, 255, 0.14);
          transform: rotate(45deg);
          box-sizing: border-box;
        }

        .sidebar-floating-tooltip .tooltip-label {
          color: #f1f5f9;
          font-size: 12px;
          font-weight: 500;
        }

        .sidebar-floating-tooltip .tooltip-badge {
          font-size: 10px;
          font-weight: 600;
          padding: 1.5px 5.5px;
          border-radius: 9999px;
          background: rgba(147, 51, 234, 0.25);
          color: #e9d5ff;
          border: 1px solid rgba(168, 85, 247, 0.35);
          line-height: 1;
        }

        .sidebar-floating-tooltip .tooltip-active-tag {
          font-size: 10px;
          font-weight: 600;
          padding: 1.5px 5px;
          border-radius: 4px;
          background: rgba(168, 85, 247, 0.18);
          color: #c084fc;
          border: 1px solid rgba(168, 85, 247, 0.3);
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .sidebar-floating-tooltip .tooltip-shortcut {
          font-size: 10px;
          padding: 1.5px 5px;
          border-radius: 4px;
          background: rgba(255, 255, 255, 0.08);
          color: #cbd5e1;
          border: 1px solid rgba(255, 255, 255, 0.12);
          font-family: var(--font-mono, monospace);
          letter-spacing: 0.02em;
        }
      `}</style>
    </aside>
  );
};

export const Sidebar = React.memo(SidebarComponent);
