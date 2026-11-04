import React from 'react';
import { createPortal } from 'react-dom';
import {
  LayoutDashboard,
  Bot,
  Server,
  Sparkles,
  Shield,
  Webhook,
  Layers,
  Lock,
  Settings,
  Boxes,
  ArrowUpCircle,
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
  const [appVersion, setAppVersion] = React.useState<string>('0.1.0');

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
    { id: 'overview' as NavTab, label: 'Overview', icon: LayoutDashboard },
    { id: 'agents' as NavTab, label: 'Agents', icon: Bot, badge: badgeCounts?.agents !== undefined ? String(badgeCounts.agents) : undefined },
    { id: 'mcp' as NavTab, label: 'MCP Servers', icon: Server, badge: badgeCounts?.mcp !== undefined ? String(badgeCounts.mcp) : undefined },
    { id: 'skills' as NavTab, label: 'Skills', icon: Sparkles, badge: badgeCounts?.skills !== undefined ? String(badgeCounts.skills) : undefined },
    { id: 'plugins' as NavTab, label: 'Plugins', icon: Boxes, badge: badgeCounts?.plugins !== undefined ? String(badgeCounts.plugins) : undefined },
    { id: 'rules' as NavTab, label: 'Rules', icon: Shield },
    { id: 'updates' as NavTab, label: 'Updates', icon: ArrowUpCircle },
    { id: 'hooks' as NavTab, label: 'Hooks', icon: Webhook },
    { id: 'environments' as NavTab, label: 'Environments', icon: Layers },
  ];

  const bottomNavItems: NavItem[] = [
    { id: 'security' as NavTab, label: 'Security', icon: Lock },
    { id: 'settings' as NavTab, label: 'Settings', icon: Settings },
  ];

  const renderNavButton = (item: NavItem) => {
    const Icon = item.icon;
    const isActive = activeTab === item.id;
    return (
      <button
        key={item.id}
        type="button"
        className={`nav-button ${isActive ? 'active' : ''}`}
        onClick={() => {
          hideTooltip();
          onTabChange(item.id);
        }}
        onMouseEnter={(e) => showTooltip(e, item.label, { badge: item.badge, isActive })}
        onMouseLeave={hideTooltip}
        aria-label={item.label}
      >
        <div className="nav-icon-label">
          <Icon size={16} className={`nav-icon ${isActive ? 'active-icon' : ''}`} />
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
              <PanelLeftClose size={15} className="toggle-action-icon" />
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
            <PanelLeftOpen size={16} className="toggle-action-icon" />
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
          background: #0d121f;
          border-right: 1px solid #1c2538;
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
          color: #64748b;
          cursor: pointer;
          transition: background-color 0.14s ease, border-color 0.14s ease, color 0.14s ease;
          box-sizing: border-box;
          margin-bottom: 5px;
          user-select: none;
        }

        .sidebar-toggle-action-btn:hover {
          background: #141b2b;
          color: #e2e8f0;
          border-color: rgba(255, 255, 255, 0.05);
        }

        .sidebar-toggle-action-btn:hover .toggle-action-icon {
          color: #94a3b8;
        }

        .sidebar-container.collapsed .sidebar-toggle-action-btn {
          width: 36px;
          height: 34px;
          padding: 0;
          margin: 0 auto 5px auto;
          justify-content: center;
          border-radius: 7px;
          background: rgba(255, 255, 255, 0.02);
          border-color: rgba(255, 255, 255, 0.05);
          color: #94a3b8;
        }

        .sidebar-container.collapsed .sidebar-toggle-action-btn:hover {
          background: rgba(255, 255, 255, 0.09);
          border-color: rgba(255, 255, 255, 0.18);
          color: #ffffff;
        }

        .toggle-action-left {
          display: flex;
          align-items: center;
          gap: 9px;
        }

        .toggle-action-icon {
          color: #64748b;
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
          font-size: 9.5px;
          color: #475569;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 4px;
          padding: 1.5px 5px;
          line-height: 1;
          letter-spacing: 0.02em;
          transition: all 0.14s ease;
        }

        .sidebar-toggle-action-btn:hover .toggle-shortcut-badge {
          color: #94a3b8;
          border-color: rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.06);
        }

        .sidebar-top-divider {
          height: 1px;
          background: rgba(255, 255, 255, 0.05);
          margin: 0 4px 6px 4px;
        }

        .sidebar-container.collapsed .sidebar-top-divider {
          width: 22px;
          margin: 0 auto 6px auto;
          background: rgba(255, 255, 255, 0.06);
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
          background: rgba(255, 255, 255, 0.05);
          margin: 4px 6px;
        }

        .sidebar-container.collapsed .sidebar-group-divider {
          width: 22px;
          margin: 4px auto;
          background: rgba(255, 255, 255, 0.06);
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
          color: #8899ac;
          font-size: 12.5px;
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
          background: #141b2b;
          color: #e2e8f0;
          border-color: rgba(255, 255, 255, 0.04);
        }

        .nav-button:active {
          background: #192338;
        }

        .nav-button.active {
          background: rgba(124, 58, 237, 0.14);
          color: #f8fafc;
          font-weight: 600;
          border: 1px solid rgba(147, 51, 234, 0.35);
        }

        .nav-button.active:hover {
          background: rgba(124, 58, 237, 0.22);
          color: #f8fafc;
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
          color: #64748b;
          transition: color 0.15s ease;
          flex-shrink: 0;
        }

        .nav-button:hover .nav-icon {
          color: #94a3b8;
        }

        .nav-button.active .nav-icon,
        .nav-button.active:hover .nav-icon,
        .nav-icon.active-icon {
          color: #c084fc;
        }

        .nav-label {
          letter-spacing: -0.01em;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          font-size: 12.5px;
        }

        .nav-count {
          font-size: 10px;
          font-family: var(--font-mono, monospace);
          font-weight: 600;
          letter-spacing: -0.01em;
          background: rgba(255, 255, 255, 0.04);
          color: #7e8f9f;
          min-width: 18px;
          height: 17px;
          padding: 0 5px;
          border-radius: 9999px;
          border: 1px solid rgba(255, 255, 255, 0.07);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
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
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
        }

        .nav-button:hover .nav-count {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.14);
          color: #f1f5f9;
        }

        .nav-count.active-count {
          background: rgba(168, 85, 247, 0.18);
          color: #f3e8ff;
          border-color: rgba(168, 85, 247, 0.4);
          box-shadow: 0 0 8px rgba(168, 85, 247, 0.2);
        }

        .nav-button.active:hover .nav-count.active-count {
          background: rgba(168, 85, 247, 0.25);
          border-color: rgba(168, 85, 247, 0.55);
          color: #ffffff;
        }

        .sidebar-footer {
          padding: 7px 6px 2px 6px;
          border-top: 1px solid #1c2538;
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
          color: #4b5d73;
          font-weight: 500;
          letter-spacing: 0.02em;
          white-space: nowrap;
          user-select: none;
        }

        .version-tag.collapsed {
          font-size: 9px;
          color: #43546a;
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
          background: #0d1424;
          background: rgba(13, 20, 36, 0.96);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 6px;
          box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.7),
                      0 2px 6px rgba(0, 0, 0, 0.45),
                      inset 0 1px 0 rgba(255, 255, 255, 0.08);
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
          background: #0d1424;
          border-left: 1px solid rgba(255, 255, 255, 0.12);
          border-bottom: 1px solid rgba(255, 255, 255, 0.12);
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
          background: rgba(147, 51, 234, 0.22);
          color: #e9d5ff;
          border: 1px solid rgba(168, 85, 247, 0.35);
          line-height: 1;
        }

        .sidebar-floating-tooltip .tooltip-active-tag {
          font-size: 9.5px;
          font-weight: 600;
          padding: 1.5px 5px;
          border-radius: 4px;
          background: rgba(168, 85, 247, 0.16);
          color: #c084fc;
          border: 1px solid rgba(168, 85, 247, 0.3);
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .sidebar-floating-tooltip .tooltip-shortcut {
          font-size: 10px;
          padding: 1.5px 5px;
          border-radius: 4px;
          background: rgba(255, 255, 255, 0.06);
          color: #94a3b8;
          border: 1px solid rgba(255, 255, 255, 0.1);
          font-family: var(--font-mono, monospace);
          letter-spacing: 0.02em;
        }
      `}</style>
    </aside>
  );
};

export const Sidebar = React.memo(SidebarComponent);
