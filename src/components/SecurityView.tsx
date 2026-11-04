import React from 'react';
import {
  ShieldCheck,
  Lock,
  Eye,
  Key,
  ArrowRight,
  Info,
  Server,
  Sparkles,
  Boxes,
  CheckCircle2,
  HardDrive
} from 'lucide-react';
import { NavTab } from './Sidebar';

interface SecurityViewProps {
  onNavigate: (tab: NavTab) => void;
}

export const SecurityView: React.FC<SecurityViewProps> = ({ onNavigate }) => {
  return (
    <div className="security-view-container">
      {/* Header Banner */}
      <div className="security-hero-banner">
        <div className="security-hero-left">
          <div className="security-icon-badge">
            <ShieldCheck size={28} />
          </div>
          <div className="security-hero-text">
            <div className="hero-tag-row">
              <span className="community-hub-tag font-mono">COMMUNITY HUB & SAFETY</span>
              <span className="local-badge font-mono">LOCAL EXECUTION</span>
            </div>
            <h1 className="security-hero-title">Security & Community Hub Guidelines</h1>
            <p className="security-hero-desc">
              AgentForge acts as an open discovery hub connecting your local AI agents with community skills,
              MCP servers, and plugins. Learn how local execution works and standard best practices for your workspace.
            </p>
          </div>
        </div>
      </div>

      {/* Main Philosophy Card */}
      <div className="security-advisory-card">
        <div className="advisory-icon-wrap">
          <Info size={18} />
        </div>
        <div className="advisory-body">
          <h3 className="advisory-title">How Community Capabilities Work in AgentForge</h3>
          <p className="advisory-text">
            Just like <strong>npm</strong>, <strong>pip</strong>, or <strong>GitHub</strong>, AgentForge indexes open-source
            packages created by the AI developer community. All code and command executions run directly on your local
            machine inside your agent's configured environment. Because these packages are published by community creators and
            evolve rapidly, AgentForge does not perform exhaustive manual security audits on every repository.
          </p>
          <p className="advisory-text">
            We recommend applying the same standard, sensible hygiene you would with any open-source tool: inspect repository
            links, use scoped or fine-grained API tokens, and test new tools in safe development directories.
          </p>
        </div>
      </div>

      {/* 4 Pillars Grid */}
      <div className="security-pillars-grid">
        {/* Pillar 1 */}
        <div className="pillar-card">
          <div className="pillar-header">
            <div className="pillar-icon-box cyan">
              <HardDrive size={18} />
            </div>
            <h4 className="pillar-title">100% Local & Private</h4>
          </div>
          <p className="pillar-desc">
            AgentForge never routes your agent prompts, tool calls, or MCP requests through third-party proxy servers.
            Configurations and files live strictly in your computer's local directories.
          </p>
          <div className="pillar-badge font-mono">
            <CheckCircle2 size={11} className="text-emerald" />
            <span>NO REMOTE TELEMETRY OF CODE</span>
          </div>
        </div>

        {/* Pillar 2 */}
        <div className="pillar-card">
          <div className="pillar-header">
            <div className="pillar-icon-box emerald">
              <Key size={18} />
            </div>
            <h4 className="pillar-title">Protected API Credentials</h4>
          </div>
          <p className="pillar-desc">
            Your secrets (like GitHub tokens or OpenAI keys) are stored locally in your agents' configuration files.
            Reinstalling or updating packages preserves your keys so you never have to re-enter them unintentionally.
          </p>
          <div className="pillar-badge font-mono">
            <CheckCircle2 size={11} className="text-emerald" />
            <span>LOCAL ENV STORAGE ONLY</span>
          </div>
        </div>

        {/* Pillar 3 */}
        <div className="pillar-card">
          <div className="pillar-header">
            <div className="pillar-icon-box indigo">
              <Eye size={18} />
            </div>
            <h4 className="pillar-title">Source Code Transparency</h4>
          </div>
          <p className="pillar-desc">
            Every package card provides direct links to its source repository on GitHub. You can read the instructions,
            inspect tool schemas, and verify author repositories before or after installing.
          </p>
          <div className="pillar-badge font-mono">
            <CheckCircle2 size={11} className="text-emerald" />
            <span>FULL REPO TRANSPARENCY</span>
          </div>
        </div>

        {/* Pillar 4 */}
        <div className="pillar-card">
          <div className="pillar-header">
            <div className="pillar-icon-box purple">
              <Lock size={18} />
            </div>
            <h4 className="pillar-title">Least-Privilege Best Practice</h4>
          </div>
          <p className="pillar-desc">
            For MCP servers that require credentials, generate fine-grained, read-only personal access tokens whenever
            possible. Never use root or unrestricted tokens when scoped permissions suffice.
          </p>
          <div className="pillar-badge font-mono">
            <CheckCircle2 size={11} className="text-emerald" />
            <span>SCOPED ACCESS RECOMMENDED</span>
          </div>
        </div>
      </div>

      {/* Trademark & Nominative Fair Use Acknowledgement */}
      <div className="security-trademark-section">
        <div className="trademark-header">
          <ShieldCheck size={16} className="text-purple" />
          <h4 className="trademark-title">Trademarks & Nominative Fair Use Acknowledgement</h4>
        </div>
        <p className="trademark-desc">
          AgentForge is an independent desktop manager and local development tool. AgentForge is not affiliated with, sponsored by, or endorsed by Anthropic, Anysphere (Cursor), Codeium (Windsurf), Google, OpenAI, Microsoft/GitHub, Inflection AI (Pi), or Zed Industries.
        </p>
        <p className="trademark-desc">
          All product names, logos, and brands (including Claude, Cursor, Windsurf, Google Antigravity / Gemini, GitHub Copilot, Codex, Cline, Aider, Continue, OpenCode, Pi, and Zed AI) are trademarks™ or registered® trademarks of their respective holders. Their appearance within AgentForge is used strictly under <strong>nominative fair use</strong> to identify compatibility and configuration targets for your local developer workspace.
        </p>
      </div>

      {/* Quick Navigation Cards */}
      <div className="security-actions-section">
        <h3 className="section-title">Review & Manage Your Workspace</h3>
        <div className="action-cards-grid">
          <div className="mgmt-action-card" onClick={() => onNavigate('mcp')}>
            <div className="mgmt-card-left">
              <Server size={18} className="text-cyan" />
              <div>
                <div className="mgmt-card-title">Inspect MCP Servers</div>
                <div className="mgmt-card-sub">Check active servers, runtime arguments, and configured environment keys</div>
              </div>
            </div>
            <ArrowRight size={15} className="arrow-nav" />
          </div>

          <div className="mgmt-action-card" onClick={() => onNavigate('skills')}>
            <div className="mgmt-card-left">
              <Sparkles size={18} className="text-purple" />
              <div>
                <div className="mgmt-card-title">Inspect Agent Skills</div>
                <div className="mgmt-card-sub">Review installed skill directories, system prompts, and helper scripts</div>
              </div>
            </div>
            <ArrowRight size={15} className="arrow-nav" />
          </div>

          <div className="mgmt-action-card" onClick={() => onNavigate('plugins')}>
            <div className="mgmt-card-left">
              <Boxes size={18} className="text-indigo" />
              <div>
                <div className="mgmt-card-title">Inspect Plugins</div>
                <div className="mgmt-card-sub">Review bundled capabilities, manifests, and author provenance</div>
              </div>
            </div>
            <ArrowRight size={15} className="arrow-nav" />
          </div>
        </div>
      </div>

      <style>{`
        .security-view-container {
          padding: 24px 28px;
          max-width: 1200px;
          margin: 0 auto;
          box-sizing: border-box;
        }

        .security-hero-banner {
          background: #111726;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          padding: 24px 28px;
          margin-bottom: 20px;
          box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.4);
        }

        .security-hero-left {
          display: flex;
          align-items: flex-start;
          gap: 18px;
        }

        .security-icon-badge {
          width: 52px;
          height: 52px;
          border-radius: 12px;
          background: rgba(16, 185, 129, 0.12);
          border: 1px solid rgba(16, 185, 129, 0.28);
          color: #34d399;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          box-shadow: 0 4px 16px rgba(16, 185, 129, 0.2);
        }

        .security-hero-text {
          flex: 1;
        }

        .hero-tag-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
        }

        .community-hub-tag {
          font-size: 10px;
          font-weight: 700;
          color: #38bdf8;
          background: rgba(56, 189, 248, 0.1);
          border: 1px solid rgba(56, 189, 248, 0.25);
          padding: 2px 8px;
          border-radius: 4px;
          letter-spacing: 0.04em;
        }

        .local-badge {
          font-size: 10px;
          font-weight: 700;
          color: #34d399;
          background: rgba(16, 185, 129, 0.1);
          border: 1px solid rgba(16, 185, 129, 0.25);
          padding: 2px 8px;
          border-radius: 4px;
          letter-spacing: 0.04em;
        }

        .security-hero-title {
          font-size: 20px;
          font-weight: 700;
          color: #f8fafc;
          margin: 0 0 6px 0;
          letter-spacing: -0.015em;
        }

        .security-hero-desc {
          font-size: 13.5px;
          color: #94a3b8;
          line-height: 1.5;
          margin: 0;
        }

        .security-advisory-card {
          display: flex;
          align-items: flex-start;
          gap: 16px;
          background: rgba(56, 189, 248, 0.05);
          border: 1px solid rgba(56, 189, 248, 0.2);
          border-radius: 10px;
          padding: 18px 22px;
          margin-bottom: 24px;
        }

        .advisory-icon-wrap {
          color: #38bdf8;
          margin-top: 2px;
          flex-shrink: 0;
        }

        .advisory-title {
          font-size: 14px;
          font-weight: 600;
          color: #f0f9ff;
          margin: 0 0 8px 0;
        }

        .advisory-text {
          font-size: 13px;
          line-height: 1.6;
          color: #bae6fd;
          margin: 0 0 8px 0;
        }

        .advisory-text:last-child {
          margin-bottom: 0;
        }

        .security-pillars-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 14px;
          margin-bottom: 28px;
        }

        .pillar-card {
          background: #111726;
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 10px;
          padding: 18px 20px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .pillar-header {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .pillar-icon-box {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .pillar-icon-box.cyan {
          background: rgba(56, 189, 248, 0.12);
          border: 1px solid rgba(56, 189, 248, 0.25);
          color: #38bdf8;
        }

        .pillar-icon-box.emerald {
          background: rgba(16, 185, 129, 0.12);
          border: 1px solid rgba(16, 185, 129, 0.25);
          color: #34d399;
        }

        .pillar-icon-box.indigo {
          background: rgba(129, 140, 248, 0.12);
          border: 1px solid rgba(129, 140, 248, 0.25);
          color: #818cf8;
        }

        .pillar-icon-box.purple {
          background: rgba(168, 85, 247, 0.12);
          border: 1px solid rgba(168, 85, 247, 0.25);
          color: #c084fc;
        }

        .pillar-title {
          font-size: 13.5px;
          font-weight: 600;
          color: #f1f5f9;
          margin: 0;
        }

        .pillar-desc {
          font-size: 12.5px;
          line-height: 1.55;
          color: #94a3b8;
          margin: 0;
          flex: 1;
        }

        .pillar-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 10px;
          font-weight: 600;
          color: #cbd5e1;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          padding: 3px 8px;
          border-radius: 4px;
          width: fit-content;
        }

        .security-trademark-section {
          background: rgba(15, 21, 35, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          padding: 18px 22px;
          margin-bottom: 24px;
        }

        .trademark-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
        }

        .trademark-title {
          font-size: 13px;
          font-weight: 700;
          color: #e2e8f0;
          margin: 0;
          letter-spacing: 0.01em;
        }

        .trademark-desc {
          font-size: 12px;
          color: #94a3b8;
          line-height: 1.55;
          margin: 0 0 6px 0;
        }

        .trademark-desc:last-child {
          margin-bottom: 0;
        }

        .security-actions-section {
          background: #111726;
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 12px;
          padding: 22px 24px;
        }

        .section-title {
          font-size: 14px;
          font-weight: 700;
          color: #f8fafc;
          margin: 0 0 14px 0;
        }

        .action-cards-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 12px;
        }

        .mgmt-action-card {
          background: #0d121f;
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 8px;
          padding: 14px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .mgmt-action-card:hover {
          background: #141b2c;
          border-color: rgba(99, 102, 241, 0.35);
          transform: translateY(-1px);
        }

        .mgmt-card-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .mgmt-card-title {
          font-size: 13px;
          font-weight: 600;
          color: #f1f5f9;
          margin-bottom: 2px;
        }

        .mgmt-card-sub {
          font-size: 11.5px;
          color: #94a3b8;
          line-height: 1.35;
        }

        .arrow-nav {
          color: #64748b;
          transition: transform 0.15s ease, color 0.15s ease;
          flex-shrink: 0;
          margin-left: 10px;
        }

        .mgmt-action-card:hover .arrow-nav {
          color: #a5b4fc;
          transform: translateX(2px);
        }

        .text-cyan { color: #38bdf8; }
        .text-emerald { color: #34d399; }
        .text-indigo { color: #818cf8; }
        .text-purple { color: #c084fc; }
      `}</style>
    </div>
  );
};
