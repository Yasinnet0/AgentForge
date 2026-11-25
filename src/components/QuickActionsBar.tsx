import React from 'react';
import { Zap, Package, Cable, FileCode, ShieldCheck, ChevronRight } from 'lucide-react';
import { NavTab } from './Sidebar';

interface QuickActionsBarProps {
  onNavigate: (tab: NavTab) => void;
}

const QuickActionsBarComponent: React.FC<QuickActionsBarProps> = ({ onNavigate }) => {
  const actions = [
    {
      id: 'create-skill',
      title: 'Create Skill',
      description: 'Author custom capability',
      icon: Zap,
      tab: 'skills' as NavTab,
      iconBg: 'var(--domain-purple-bg)',
      iconBorder: 'var(--domain-purple-border)',
      iconColor: 'var(--domain-purple-fg)',
    },
    {
      id: 'bundle-kit',
      title: 'Bundle Kit',
      description: 'Package multi-tool kits',
      icon: Package,
      tab: 'plugins' as NavTab,
      iconBg: 'var(--domain-orange-bg)',
      iconBorder: 'var(--domain-orange-border)',
      iconColor: 'var(--domain-orange-fg)',
    },
    {
      id: 'add-mcp',
      title: 'Add MCP Server',
      description: 'Connect stdio / SSE server',
      icon: Cable,
      tab: 'mcp' as NavTab,
      iconBg: 'var(--domain-sky-bg)',
      iconBorder: 'var(--domain-sky-border)',
      iconColor: 'var(--domain-sky-fg)',
    },
    {
      id: 'add-rule',
      title: 'Context Rule',
      description: 'Define prompt boundaries',
      icon: FileCode,
      tab: 'rules' as NavTab,
      iconBg: 'var(--domain-indigo-bg)',
      iconBorder: 'var(--domain-indigo-border)',
      iconColor: 'var(--domain-indigo-fg)',
    },
    {
      id: 'security-hub',
      title: 'Security Hub',
      description: 'Audit safety & isolation',
      icon: ShieldCheck,
      tab: 'security' as NavTab,
      iconBg: 'var(--domain-emerald-bg)',
      iconBorder: 'var(--domain-emerald-border)',
      iconColor: 'var(--domain-emerald-fg)',
    },
  ];

  return (
    <div className="quick-actions-container">
      <div className="quick-actions-header">
        <span className="quick-actions-title">QUICK ACTIONS</span>
        <span className="quick-actions-hint">Jump straight into authoring or discovery</span>
      </div>

      <div className="quick-actions-grid">
        {actions.map((act) => {
          const Icon = act.icon;
          return (
            <button
              key={act.id}
              className="quick-action-card"
              onClick={() => onNavigate(act.tab)}
              title={`Go to ${act.title}`}
            >
              <div
                className="action-icon-wrap"
                style={{
                  background: act.iconBg,
                  borderColor: act.iconBorder,
                  color: act.iconColor,
                }}
              >
                <Icon size={16} strokeWidth={1.75} />
              </div>

              <div className="action-text-group">
                <div className="action-title-row">
                  <span className="action-title">{act.title}</span>
                  <ChevronRight size={12} strokeWidth={1.75} className="action-arrow" />
                </div>
                <span className="action-desc">{act.description}</span>
              </div>
            </button>
          );
        })}
      </div>

      <style>{`
        .quick-actions-container {
          background: var(--bg-surface);
          border: 1px solid var(--bg-card-border);
          border-radius: 9px;
          padding: 14px 16px;
          margin-bottom: 20px;
          container-type: inline-size;
          container-name: quickactions;
          box-sizing: border-box;
          width: 100%;
          overflow: hidden;
          box-shadow: var(--shadow-card);
        }

        .quick-actions-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
          gap: 8px;
        }

        .quick-actions-title {
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.05em;
          color: var(--text-muted);
          font-family: var(--font-mono);
          white-space: nowrap;
        }

        .quick-actions-hint {
          font-size: 11px;
          color: var(--text-muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .quick-actions-grid {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 10px;
          width: 100%;
          box-sizing: border-box;
        }

        .quick-action-card {
          background: var(--bg-card-inner);
          border: 1px solid var(--border-subtle);
          border-radius: 8px;
          padding: 10px 12px;
          display: flex;
          align-items: center;
          gap: 10px;
          text-align: left;
          cursor: pointer;
          min-width: 0;
          width: 100%;
          box-sizing: border-box;
          overflow: hidden;
          transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .quick-action-card:hover {
          background: var(--bg-surface-hover);
          border-color: rgba(168, 85, 247, 0.35);
          transform: translateY(-1px);
        }

        .quick-action-card:hover .action-icon-wrap {
          color: var(--accent-purple-text);
          background: var(--accent-purple-dim);
          border-color: rgba(168, 85, 247, 0.4);
        }

        .quick-action-card:hover .action-arrow {
          transform: translateX(2px);
          color: var(--text-primary);
        }

        .action-icon-wrap {
          width: 32px;
          height: 32px;
          border-radius: 7px;
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: all 0.15s ease;
        }

        .action-text-group {
          display: flex;
          flex-direction: column;
          min-width: 0;
          flex: 1;
          overflow: hidden;
        }

        .action-title-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 4px;
          min-width: 0;
          width: 100%;
        }

        .action-title {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          min-width: 0;
          flex: 1;
        }

        .action-arrow {
          color: var(--text-secondary);
          flex-shrink: 0;
          transition: all 0.15s ease;
        }

        .action-desc {
          font-size: 10px;
          color: var(--text-secondary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-top: 1px;
          min-width: 0;
        }

        /* Viewport Fallback for Wide Desktop with Sidebars Open */
        @media (max-width: 1480px) {
          .quick-actions-grid {
            grid-template-columns: repeat(6, minmax(0, 1fr));
          }
          .quick-action-card:nth-child(1),
          .quick-action-card:nth-child(2),
          .quick-action-card:nth-child(3) {
            grid-column: span 2;
          }
          .quick-action-card:nth-child(4),
          .quick-action-card:nth-child(5) {
            grid-column: span 3;
          }
        }

        @media (max-width: 820px) {
          .quick-actions-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .quick-action-card:nth-child(1),
          .quick-action-card:nth-child(2),
          .quick-action-card:nth-child(3),
          .quick-action-card:nth-child(4) {
            grid-column: span 1;
          }
          .quick-action-card:nth-child(5) {
            grid-column: span 2;
          }
        }

        /* Exact Container Queries Driven by Component Width */
        @container quickactions (max-width: 920px) {
          .quick-actions-grid {
            grid-template-columns: repeat(6, minmax(0, 1fr)) !important;
          }
          .quick-action-card:nth-child(1),
          .quick-action-card:nth-child(2),
          .quick-action-card:nth-child(3) {
            grid-column: span 2 !important;
          }
          .quick-action-card:nth-child(4),
          .quick-action-card:nth-child(5) {
            grid-column: span 3 !important;
          }
        }

        @container quickactions (max-width: 580px) {
          .quick-actions-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
          .quick-action-card:nth-child(1),
          .quick-action-card:nth-child(2),
          .quick-action-card:nth-child(3),
          .quick-action-card:nth-child(4) {
            grid-column: span 1 !important;
          }
          .quick-action-card:nth-child(5) {
            grid-column: span 2 !important;
          }
        }

        @container quickactions (max-width: 360px) {
          .quick-actions-grid {
            grid-template-columns: 1fr !important;
          }
          .quick-action-card {
            grid-column: span 1 !important;
          }
        }
      `}</style>
    </div>
  );
};

export const QuickActionsBar = React.memo(QuickActionsBarComponent);
