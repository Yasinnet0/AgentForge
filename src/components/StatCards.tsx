import React from 'react';
import { Bot, Server, Sparkles, ShieldAlert } from 'lucide-react';

interface StatCardItem {
  id: string;
  title: string;
  count: number | string;
  subtitle: string;
  icon: React.ElementType;
  accentColor: string;
  borderColor: string;
}

interface StatCardsProps {
  stats?: {
    agentsCount: number;
    mcpCount: number;
    skillsCount: number;
    rulesCount: number;
  };
}

export const StatCards: React.FC<StatCardsProps> = ({ stats }) => {
  const agentsCount = stats?.agentsCount ?? 0;
  const mcpCount = stats?.mcpCount ?? 0;
  const skillsCount = stats?.skillsCount ?? 0;
  const rulesCount = stats?.rulesCount ?? 0;

  const cards: StatCardItem[] = [
    {
      id: 'agents',
      title: 'INSTALLED AGENTS',
      count: agentsCount,
      subtitle: agentsCount > 0 ? `${agentsCount} selected active` : 'None active',
      icon: Bot,
      accentColor: '#38bdf8',
      borderColor: 'rgba(56, 189, 248, 0.25)',
    },
    {
      id: 'mcp',
      title: 'MCP SERVERS',
      count: mcpCount,
      subtitle: mcpCount > 0 ? `${mcpCount} servers connected` : 'None connected',
      icon: Server,
      accentColor: '#818cf8',
      borderColor: 'rgba(129, 140, 248, 0.25)',
    },
    {
      id: 'skills',
      title: 'ACTIVE SKILLS',
      count: skillsCount,
      subtitle: skillsCount > 0 ? `${skillsCount} skills indexed` : 'None discovered',
      icon: Sparkles,
      accentColor: '#c084fc',
      borderColor: 'rgba(192, 132, 252, 0.25)',
    },
    {
      id: 'rules',
      title: 'ACTIVE RULES',
      count: rulesCount,
      subtitle: rulesCount > 0 ? `${rulesCount} rules loaded` : 'None configured',
      icon: ShieldAlert,
      accentColor: '#34d399',
      borderColor: 'rgba(52, 211, 153, 0.25)',
    },
  ];

  return (
    <div className="stat-cards-grid">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div key={card.id} className="stat-card">
            <div className="stat-card-header">
              <span className="stat-card-title">{card.title}</span>
              <div className="stat-icon-wrapper">
                <Icon size={14} className="stat-icon" />
              </div>
            </div>

            <div className="stat-card-body">
              <div className="stat-count font-mono">{card.count}</div>
              <div className="stat-subtitle">{card.subtitle}</div>
            </div>
          </div>
        );
      })}

      <style>{`
        .stat-cards-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px;
          margin-bottom: 20px;
        }

        .stat-card {
          background: #121826;
          border: 1px solid #1e283d;
          border-radius: 9px;
          padding: 14px 16px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          transition: border-color 0.15s ease;
        }

        .stat-card:hover {
          border-color: #2b3a56;
        }

        .stat-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 8px;
        }

        .stat-card-title {
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.05em;
          color: #64748b;
          font-family: var(--font-mono);
        }

        .stat-icon-wrapper {
          width: 26px;
          height: 26px;
          border-radius: 6px;
          background: #0d121f;
          border: 1px solid #1c2638;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .stat-icon {
          color: #7d90a6;
          transition: color 0.15s ease;
        }

        .stat-card:hover .stat-icon {
          color: #cbd5e1;
        }

        .stat-card-body {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .stat-count {
          font-size: 26px;
          font-weight: 800;
          color: #f8fafc;
          letter-spacing: -0.02em;
          line-height: 1.1;
        }

        .stat-subtitle {
          font-size: 11.5px;
          color: #8899ac;
        }
      `}</style>
    </div>
  );
};
