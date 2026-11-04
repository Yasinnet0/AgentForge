import React from 'react';
import { 
  ArrowUpCircle, 
  Webhook, 
  Layers, 
  Settings, 
  Sparkles, 
  ArrowLeft, 
  Clock, 
  CheckCircle2,
  RotateCcw
} from 'lucide-react';
import { NavTab } from './Sidebar';

interface ComingSoonViewProps {
  tab: NavTab;
  onNavigate: (tab: NavTab) => void;
}

interface TabDetails {
  title: string;
  badge: string;
  subtitle: string;
  description: string;
  icon: React.ElementType;
  highlights: string[];
  helperAction?: {
    label: string;
    targetTab: NavTab;
    icon: React.ElementType;
  };
}

const TAB_DETAILS_MAP: Partial<Record<NavTab, TabDetails>> = {
  updates: {
    title: 'Automated Package Updates',
    badge: 'COMING SOON',
    subtitle: 'Automated multi-agent semantic versioning & diff checker',
    description: 'Automated background update checking, changelog diff previews, and one-click upgrades across all your agents are currently in development. In the meantime, you can use the Reinstall action on any installed package to download the latest release fresh from the web while keeping your API keys and tokens completely safe.',
    icon: ArrowUpCircle,
    highlights: [
      'One-Click Upgrades',
      'Changelog & Diff Viewer',
      'Zero-Downtime Migration',
      'Credential Preservation Guaranteed'
    ],
    helperAction: {
      label: 'View Installed Packages to Reinstall',
      targetTab: 'overview',
      icon: RotateCcw,
    },
  },
  hooks: {
    title: 'Daemon Hooks & Lifecycle Automations',
    badge: 'COMING SOON',
    subtitle: 'Event-driven daemon automations and triggers',
    description: 'Configure event-driven lifecycle triggers before and after MCP server startup, agent handoffs, skill executions, and workspace directory changes.',
    icon: Webhook,
    highlights: [
      'Pre & Post Execution Triggers',
      'Agent Session Lifecycle Hooks',
      'Custom Local Scripts',
      'Execution Audit Logs'
    ],
    helperAction: {
      label: 'Configure Rules in Rules Builder',
      targetTab: 'rules',
      icon: Sparkles,
    },
  },
  environments: {
    title: 'Isolated Environments & Profiles',
    badge: 'COMING SOON',
    subtitle: 'Workspace-level capability profiles and sandboxes',
    description: 'Seamlessly switch between distinct sets of MCP servers, skills, and configuration rules across work, personal, and air-gapped development workspaces.',
    icon: Layers,
    highlights: [
      'Workspace-Specific Presets',
      'Configuration Sandboxing',
      'Instant Profile Switching',
      'Shared Team Configs'
    ],
    helperAction: {
      label: 'Manage Connected Agents',
      targetTab: 'agents',
      icon: Sparkles,
    },
  },
  settings: {
    title: 'Application Preferences & Settings',
    badge: 'COMING SOON',
    subtitle: 'Daemon configurations, paths, and integration options',
    description: 'Customize daemon polling intervals, cloud catalog sync schedules, default editor preferences, system telemetry, and custom local path overrides.',
    icon: Settings,
    highlights: [
      'Daemon Polling Schedules',
      'Custom File Paths & Agent Roots',
      'IDE & Shell Integrations',
      'Diagnostic Export & Backup'
    ],
    helperAction: {
      label: 'Return to Dashboard Overview',
      targetTab: 'overview',
      icon: ArrowLeft,
    },
  },
};

export const ComingSoonView: React.FC<ComingSoonViewProps> = ({ tab, onNavigate }) => {
  const details: TabDetails = TAB_DETAILS_MAP[tab] || {
    title: `${tab.charAt(0).toUpperCase() + tab.slice(1)} Module`,
    badge: 'COMING SOON',
    subtitle: 'Feature module currently in active development',
    description: 'This capability is being crafted for an upcoming release of AgentForge. Stay tuned for future updates.',
    icon: Clock,
    highlights: ['In Active Development', 'Modular Architecture', 'Seamless Upgrades'],
    helperAction: undefined,
  };

  const IconComponent = details.icon;
  const HelperIcon = details.helperAction?.icon || ArrowLeft;

  return (
    <div className="coming-soon-container">
      <div className="coming-soon-card">
        {/* Glowing badge */}
        <div className="coming-soon-badge-row">
          <span className="coming-soon-pill font-mono">
            <span className="pulsing-dot" />
            <span>{details.badge}</span>
          </span>
        </div>

        {/* Big Icon Cluster */}
        <div className="coming-soon-icon-wrap">
          <IconComponent size={38} className="coming-soon-icon" />
        </div>

        {/* Headers */}
        <h2 className="coming-soon-title">{details.title}</h2>
        <p className="coming-soon-subtitle">{details.subtitle}</p>

        {/* Narrative Description */}
        <p className="coming-soon-description">{details.description}</p>

        {/* Feature Highlights Grid */}
        <div className="coming-soon-highlights">
          {details.highlights.map((item, idx) => (
            <div key={idx} className="highlight-item">
              <CheckCircle2 size={13} className="highlight-icon" />
              <span>{item}</span>
            </div>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="coming-soon-actions">
          {details.helperAction && (
            <button
              type="button"
              className="action-btn-primary"
              onClick={() => onNavigate(details.helperAction!.targetTab)}
            >
              <HelperIcon size={14} />
              <span>{details.helperAction.label}</span>
            </button>
          )}

          <button
            type="button"
            className="action-btn-secondary"
            onClick={() => onNavigate('overview')}
          >
            <ArrowLeft size={14} />
            <span>Return to Overview</span>
          </button>
        </div>
      </div>

      <style>{`
        .coming-soon-container {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: calc(100vh - 120px);
          padding: 32px 20px;
          box-sizing: border-box;
        }

        .coming-soon-card {
          width: 100%;
          max-width: 620px;
          background: #111726;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 14px;
          padding: 36px 32px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          box-shadow: 0 16px 48px -8px rgba(0, 0, 0, 0.55);
          position: relative;
          overflow: hidden;
        }

        .coming-soon-card::before {
          content: '';
          position: absolute;
          top: -120px;
          left: 50%;
          transform: translateX(-50%);
          width: 320px;
          height: 240px;
          background: radial-gradient(circle, rgba(99, 102, 241, 0.14) 0%, transparent 70%);
          pointer-events: none;
        }

        .coming-soon-badge-row {
          margin-bottom: 20px;
        }

        .coming-soon-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 12px;
          background: rgba(99, 102, 241, 0.12);
          border: 1px solid rgba(99, 102, 241, 0.3);
          color: #a5b4fc;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.06em;
        }

        .pulsing-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #818cf8;
          box-shadow: 0 0 8px #818cf8;
          animation: pulseDot 2s infinite ease-in-out;
        }

        @keyframes pulseDot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }

        .coming-soon-icon-wrap {
          width: 64px;
          height: 64px;
          border-radius: 16px;
          background: rgba(99, 102, 241, 0.1);
          border: 1px solid rgba(99, 102, 241, 0.25);
          color: #818cf8;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 20px;
          box-shadow: 0 8px 24px -4px rgba(99, 102, 241, 0.2);
        }

        .coming-soon-title {
          font-size: 20px;
          font-weight: 700;
          color: #f8fafc;
          margin: 0 0 6px 0;
          letter-spacing: -0.015em;
        }

        .coming-soon-subtitle {
          font-size: 13px;
          color: #94a3b8;
          margin: 0 0 16px 0;
          font-weight: 500;
        }

        .coming-soon-description {
          font-size: 13.5px;
          line-height: 1.6;
          color: #cbd5e1;
          margin: 0 0 24px 0;
          max-width: 520px;
        }

        .coming-soon-highlights {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
          width: 100%;
          margin-bottom: 28px;
          padding: 16px;
          background: rgba(15, 23, 42, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 10px;
          box-sizing: border-box;
        }

        .highlight-item {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          color: #cbd5e1;
          font-weight: 500;
          text-align: left;
        }

        .highlight-icon {
          color: #34d399;
          flex-shrink: 0;
        }

        .coming-soon-actions {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
          justify-content: center;
        }

        .action-btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 9px 18px;
          background: #4f46e5;
          color: #ffffff;
          border: 1px solid #6366f1;
          border-radius: 7px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
          box-shadow: 0 4px 14px rgba(79, 70, 229, 0.35);
        }

        .action-btn-primary:hover {
          background: #4338ca;
          transform: translateY(-1px);
        }

        .action-btn-secondary {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 9px 16px;
          background: rgba(255, 255, 255, 0.04);
          color: #cbd5e1;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 7px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .action-btn-secondary:hover {
          background: rgba(255, 255, 255, 0.08);
          color: #ffffff;
          border-color: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </div>
  );
};
