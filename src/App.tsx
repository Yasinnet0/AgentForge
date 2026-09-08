import React, { useState } from 'react';
import { TopBar } from './components/TopBar';
import { Sidebar, NavTab } from './components/Sidebar';
import { StatCards } from './components/StatCards';
import { EnvironmentSecurityCards } from './components/EnvironmentSecurityCards';
import { RecentlyInstalledPackages } from './components/RecentlyInstalledPackages';
import { RightPanel } from './components/RightPanel';
import { 
  Bot, 
  Server, 
  Sparkles,
  Shield,
  Layers, 
  Plus 
} from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<NavTab>('overview');
  const [currentEnv, setCurrentEnv] = useState('Default');

  return (
    <div className="app-container">
      {/* Top Bar with window controls & search */}
      <TopBar currentEnv={currentEnv} onEnvChange={setCurrentEnv} />

      <div className="app-body">
        {/* Left Navigation Sidebar */}
        <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />

        {/* Center Main Content Area */}
        <main className="main-content">
          <div key={activeTab} className="tab-pane-animated">
            {activeTab === 'overview' && (
              <div className="overview-view">
                {/* 4 Metric Cards */}
                <StatCards />

                {/* Environment & Security Cards */}
                <EnvironmentSecurityCards />

                {/* Installed Packages Table */}
                <RecentlyInstalledPackages />
              </div>
            )}

            {activeTab === 'agents' && (
              <div className="secondary-view">
                <div className="view-header">
                  <div>
                    <h2 className="view-title">Configured Agents</h2>
                    <p className="view-desc">0 agents configured in local workspace</p>
                  </div>
                  <button className="primary-action-btn">
                    <Plus size={14} />
                    <span>Create Agent</span>
                  </button>
                </div>

                <div className="empty-state-card">
                  <div className="empty-icon-wrap">
                    <Bot size={26} />
                  </div>
                  <div className="empty-title">No agents configured</div>
                  <div className="empty-desc">Create your first agent persona or connect an existing orchestrator trigger</div>
                  <button className="empty-action-btn">
                    <Plus size={13} />
                    <span>Create Agent</span>
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'mcp' && (
              <div className="secondary-view">
                <div className="view-header">
                  <div>
                    <h2 className="view-title">Model Context Protocol (MCP) Servers</h2>
                    <p className="view-desc">0 MCP servers installed across local and remote transports</p>
                  </div>
                  <button className="primary-action-btn">
                    <Plus size={14} />
                    <span>Add MCP Server</span>
                  </button>
                </div>

                <div className="empty-state-card">
                  <div className="empty-icon-wrap">
                    <Server size={26} />
                  </div>
                  <div className="empty-title">No MCP servers installed</div>
                  <div className="empty-desc">Connect a Model Context Protocol server via stdio or SSE transport</div>
                  <button className="empty-action-btn">
                    <Plus size={13} />
                    <span>Add MCP Server</span>
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'skills' && (
              <div className="secondary-view">
                <div className="view-header">
                  <div>
                    <h2 className="view-title">Active Agent Skills</h2>
                    <p className="view-desc">0 workflow skills discovered in local skills directories</p>
                  </div>
                  <button className="primary-action-btn">
                    <Plus size={14} />
                    <span>Import Skill</span>
                  </button>
                </div>

                <div className="empty-state-card">
                  <div className="empty-icon-wrap">
                    <Sparkles size={26} />
                  </div>
                  <div className="empty-title">No skills installed</div>
                  <div className="empty-desc">Import reusable workflow skills from your repository or plugins folder</div>
                  <button className="empty-action-btn">
                    <Plus size={13} />
                    <span>Import Skill</span>
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'rules' && (
              <div className="secondary-view">
                <div className="view-header">
                  <div>
                    <h2 className="view-title">Active Rules</h2>
                    <p className="view-desc">0 active workspace directives and guidelines</p>
                  </div>
                  <button className="primary-action-btn">
                    <Plus size={14} />
                    <span>Add Rule</span>
                  </button>
                </div>

                <div className="empty-state-card">
                  <div className="empty-icon-wrap">
                    <Shield size={26} />
                  </div>
                  <div className="empty-title">No rules configured</div>
                  <div className="empty-desc">Define guidelines, style constraints, and behavioral boundaries for agents</div>
                  <button className="empty-action-btn">
                    <Plus size={13} />
                    <span>Add Rule</span>
                  </button>
                </div>
              </div>
            )}

            {['hooks', 'environments', 'snapshots', 'marketplace', 'security', 'settings'].includes(activeTab) && (
              <div className="secondary-view placeholder-tab">
                <div className="placeholder-box">
                  <div className="placeholder-icon-wrap">
                    <Layers size={28} />
                  </div>
                  <h3>{activeTab.toUpperCase()}</h3>
                  <p>Configured for current environment: <strong className="font-mono">{currentEnv}</strong></p>
                  <button className="primary-action-btn" onClick={() => setActiveTab('overview')}>
                    Return to Dashboard Overview
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>

        {/* Right Activity & Updates Panel */}
        <RightPanel />
      </div>

      <style>{`
        .app-container {
          display: flex;
          flex-direction: column;
          height: 100vh;
          width: 100vw;
          background: var(--bg-app);
          overflow: hidden;
        }

        .app-body {
          display: flex;
          flex: 1;
          height: calc(100vh - 48px);
          overflow: hidden;
        }

        .main-content {
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 20px 24px 30px;
          background: #090d16;
        }

        .tab-pane-animated {
          animation: tabShiftIn 0.26s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          will-change: opacity, transform;
        }

        @keyframes tabShiftIn {
          0% {
            opacity: 0;
            transform: translateX(12px);
          }
          100% {
            opacity: 1;
            transform: translateX(0);
          }
        }

        .overview-view {
          display: flex;
          flex-direction: column;
        }

        .secondary-view {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .view-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid #1c2638;
          padding-bottom: 14px;
        }

        .view-title {
          font-size: 18px;
          font-weight: 700;
          color: #f8fafc;
        }

        .view-desc {
          font-size: 12.5px;
          color: #8899ac;
          margin-top: 2px;
        }

        .empty-state-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 64px 24px;
          background: #111726;
          border: 1px dashed #1f2c42;
          border-radius: 12px;
          gap: 12px;
          margin-top: 10px;
        }

        .empty-icon-wrap {
          width: 52px;
          height: 52px;
          border-radius: 12px;
          background: #162035;
          border: 1px solid #223250;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #7d90a6;
          margin-bottom: 4px;
        }

        .empty-title {
          font-size: 15px;
          font-weight: 700;
          color: #f1f5f9;
        }

        .empty-desc {
          font-size: 12.5px;
          color: #7d90a6;
          max-width: 360px;
          line-height: 1.45;
        }

        .empty-action-btn {
          margin-top: 6px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #172033;
          border: 1px solid #283650;
          color: #93c5fd;
          font-size: 12px;
          font-weight: 600;
          padding: 6px 14px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .empty-action-btn:hover {
          background: #1e2c47;
          border-color: #3b5077;
          color: #ffffff;
        }

        .placeholder-tab {
          min-height: 400px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .placeholder-box {
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          max-width: 360px;
        }

        .placeholder-icon-wrap {
          width: 56px;
          height: 56px;
          border-radius: 14px;
          background: #141b2b;
          border: 1px solid #23304a;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #818cf8;
        }

        .placeholder-box h3 {
          font-size: 16px;
          font-weight: 700;
          color: #f8fafc;
          letter-spacing: 0.02em;
        }

        .placeholder-box p {
          font-size: 13px;
          color: #8899ac;
        }
      `}</style>
    </div>
  );
};
