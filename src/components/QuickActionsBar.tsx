import React from 'react';
import { Sparkles, Boxes, Server, Shield, Compass, ChevronRight } from 'lucide-react';
import { NavTab } from './Sidebar';

interface QuickActionsBarProps {
  onNavigate: (tab: NavTab) => void;
}

export const QuickActionsBar: React.FC<QuickActionsBarProps> = ({ onNavigate }) => {
  const actions = [
    {
      id: 'create-skill',
      title: 'Create Skill',
      description: 'Author custom capability',
      icon: Sparkles,
      iconColor: '#c084fc',
      bgColor: 'rgba(192, 132, 252, 0.08)',
      borderColor: 'rgba(192, 132, 252, 0.2)',
      tab: 'skills' as NavTab,
    },
    {
      id: 'bundle-kit',
      title: 'Bundle Kit',
      description: 'Package multi-tool kits',
      icon: Boxes,
      iconColor: '#60a5fa',
      bgColor: 'rgba(96, 165, 250, 0.08)',
      borderColor: 'rgba(96, 165, 250, 0.2)',
      tab: 'skills' as NavTab,
    },
    {
      id: 'add-mcp',
      title: 'Add MCP Server',
      description: 'Connect stdio / SSE server',
      icon: Server,
      iconColor: '#818cf8',
      bgColor: 'rgba(129, 140, 248, 0.08)',
      borderColor: 'rgba(129, 140, 248, 0.2)',
      tab: 'mcp' as NavTab,
    },
    {
      id: 'add-rule',
      title: 'Context Rule',
      description: 'Define prompt boundaries',
      icon: Shield,
      iconColor: '#34d399',
      bgColor: 'rgba(52, 211, 153, 0.08)',
      borderColor: 'rgba(52, 211, 153, 0.2)',
      tab: 'rules' as NavTab,
    },
    {
      id: 'marketplace',
      title: 'Marketplace',
      description: 'Search & download tools',
      icon: Compass,
      iconColor: '#f59e0b',
      bgColor: 'rgba(245, 158, 11, 0.08)',
      borderColor: 'rgba(245, 158, 11, 0.2)',
      tab: 'marketplace' as NavTab,
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
                  color: act.iconColor,
                  background: act.bgColor,
                  borderColor: act.borderColor,
                }}
              >
                <Icon size={16} />
              </div>

              <div className="action-text-group">
                <div className="action-title-row">
                  <span className="action-title">{act.title}</span>
                  <ChevronRight size={12} className="action-arrow" />
                </div>
                <span className="action-desc">{act.description}</span>
              </div>
            </button>
          );
        })}
      </div>

      <style>{`
        .quick-actions-container {
          background: #121826;
          border: 1px solid #1e283d;
          border-radius: 9px;
          padding: 14px 16px;
          margin-bottom: 20px;
        }

        .quick-actions-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
        }

        .quick-actions-title {
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.05em;
          color: #64748b;
          font-family: var(--font-mono);
        }

        .quick-actions-hint {
          font-size: 11px;
          color: #475569;
        }

        .quick-actions-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 10px;
        }

        .quick-action-card {
          background: #0d121f;
          border: 1px solid #1c2638;
          border-radius: 8px;
          padding: 10px 12px;
          display: flex;
          align-items: center;
          gap: 10px;
          text-align: left;
          cursor: pointer;
          transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .quick-action-card:hover {
          background: #151e30;
          border-color: #2b3a56;
          transform: translateY(-1px);
        }

        .quick-action-card:hover .action-arrow {
          transform: translateX(2px);
          color: #cbd5e1;
        }

        .action-icon-wrap {
          width: 32px;
          height: 32px;
          border-radius: 7px;
          border: 1px solid transparent;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .action-text-group {
          display: flex;
          flex-direction: column;
          min-width: 0;
          flex: 1;
        }

        .action-title-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 4px;
        }

        .action-title {
          font-size: 12px;
          font-weight: 600;
          color: #f1f5f9;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .action-arrow {
          color: #475569;
          flex-shrink: 0;
          transition: all 0.15s ease;
        }

        .action-desc {
          font-size: 10px;
          color: #64748b;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-top: 1px;
        }

        @media (max-width: 1200px) {
          .quick-actions-grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }
      `}</style>
    </div>
  );
};
