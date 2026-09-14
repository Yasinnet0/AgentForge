import React from 'react';
import {
  LayoutDashboard,
  Bot,
  Server,
  Sparkles,
  Shield,
  Webhook,
  Layers,
  Camera,
  ShoppingBag,
  Lock,
  Settings,
  FolderGit2
} from 'lucide-react';

export type NavTab = 
  | 'overview' 
  | 'agents' 
  | 'mcp' 
  | 'skills' 
  | 'rules' 
  | 'hooks' 
  | 'environments' 
  | 'snapshots' 
  | 'marketplace' 
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
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange }) => {
  const navItems: NavItem[] = [
    { id: 'overview' as NavTab, label: 'Overview', icon: LayoutDashboard },
    { id: 'agents' as NavTab, label: 'Agents', icon: Bot },
    { id: 'mcp' as NavTab, label: 'MCP Servers', icon: Server },
    { id: 'skills' as NavTab, label: 'Skills', icon: Sparkles },
    { id: 'rules' as NavTab, label: 'Rules', icon: Shield },
    { id: 'hooks' as NavTab, label: 'Hooks', icon: Webhook },
    { id: 'environments' as NavTab, label: 'Environments', icon: Layers },
    { id: 'snapshots' as NavTab, label: 'Snapshots', icon: Camera },
    { id: 'marketplace' as NavTab, label: 'Marketplace', icon: ShoppingBag },
    { id: 'security' as NavTab, label: 'Security', icon: Lock },
    { id: 'settings' as NavTab, label: 'Settings', icon: Settings },
  ];

  return (
    <aside className="sidebar-container">
      {/* Navigation Links */}
      <div className="sidebar-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              className={`nav-button ${isActive ? 'active' : ''}`}
              onClick={() => onTabChange(item.id)}
            >
              <div className="nav-icon-label">
                <Icon size={17} className={`nav-icon ${isActive ? 'active-icon' : ''}`} />
                <span className="nav-label">{item.label}</span>
              </div>
              {item.badge && (
                <span className={`nav-count ${isActive ? 'active-count' : ''}`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom Status Card */}
      <div className="sidebar-footer">
        <div className="project-status-card">
          <div className="status-row">
            <div className="status-label">ACTIVE PROJECT</div>
            <div className="project-name">
              <FolderGit2 size={13} className="project-icon" />
              <span>AgentForge</span>
            </div>
          </div>

          <div className="status-row">
            <div className="status-label">ENVIRONMENT</div>
            <div className="env-status-name">Default</div>
          </div>

          <div className="project-card-footer">
            <span className="version-tag font-mono">v0.0.1</span>
            <span className="local-only-badge font-mono">READY</span>
          </div>
        </div>
      </div>

      <style>{`
        .sidebar-container {
          width: 230px;
          min-width: 230px;
          background: #0d121f;
          border-right: 1px solid #1c2538;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 14px 10px;
          height: calc(100vh - 48px);
          overflow: hidden;
        }

        .sidebar-nav {
          display: flex;
          flex-direction: column;
          gap: 3px;
          overflow-y: auto;
          overflow-x: hidden;
          padding-right: 2px;
        }

        .nav-button {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          padding: 8px 12px;
          border-radius: 8px;
          border: 1px solid transparent;
          background: transparent;
          color: #8899ac;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: background-color 0.16s ease, border-color 0.16s ease, color 0.16s ease;
          text-align: left;
          box-sizing: border-box;
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
          background: #172033;
          color: #f8fafc;
          font-weight: 600;
          border: 1px solid #28354f;
        }

        .nav-button.active:hover {
          background: #192338;
          color: #f8fafc;
          border-color: #334466;
        }

        .nav-icon-label {
          display: flex;
          align-items: center;
          gap: 11px;
        }

        .nav-icon {
          color: #64748b;
          transition: color 0.16s ease;
          flex-shrink: 0;
        }

        .nav-button:hover .nav-icon {
          color: #94a3b8;
        }

        .nav-button.active .nav-icon,
        .nav-button.active:hover .nav-icon,
        .nav-icon.active-icon {
          color: #818cf8;
        }

        .nav-label {
          letter-spacing: -0.01em;
        }

        .nav-count {
          font-size: 10.5px;
          font-family: var(--font-mono);
          font-weight: 600;
          background: #192233;
          color: #7d90a6;
          padding: 1px 7px;
          border-radius: 9999px;
          border: 1px solid #25334c;
          transition: all 0.15s ease;
        }

        .nav-count.active-count {
          background: #1e293b;
          color: #cbd5e1;
          border-color: #334155;
        }

        .sidebar-footer {
          margin-top: 12px;
        }

        .project-status-card {
          background: #121826;
          border: 1px solid #1f2b40;
          border-radius: 9px;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 9px;
        }

        .status-row {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .status-label {
          font-size: 9.5px;
          font-weight: 700;
          letter-spacing: 0.05em;
          color: #55677d;
          font-family: var(--font-mono);
        }

        .project-name {
          display: flex;
          align-items: center;
          gap: 6px;
          color: #f1f5f9;
          font-size: 13px;
          font-weight: 700;
        }

        .project-icon {
          color: #60a5fa;
        }

        .env-status-name {
          color: #38bdf8;
          font-size: 12.5px;
          font-weight: 600;
        }

        .project-card-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-top: 8px;
          border-top: 1px solid #1c2638;
          margin-top: 2px;
        }

        .version-tag {
          font-size: 10px;
          color: #718298;
        }

        .local-only-badge {
          background: #090c14;
          color: #627288;
          font-size: 8.5px;
          font-weight: 700;
          padding: 2px 5px;
          border-radius: 4px;
          border: 1px solid #1c2536;
        }
      `}</style>
    </aside>
  );
};
