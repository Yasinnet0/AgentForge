import React from 'react';
import { 
  FolderTree, 
  Cpu, 
  ShieldCheck, 
  Lock, 
  Globe, 
  CheckCircle2, 
  Clock 
} from 'lucide-react';

export const EnvironmentSecurityCards: React.FC = () => {
  return (
    <div className="env-security-grid">
      {/* Active Environment Card */}
      <div className="info-card">
        <div className="info-card-header">
          <div className="header-left">
            <span className="card-title">Active Environment</span>
          </div>
          <div className="active-tag">
            Active
          </div>
        </div>

        <div className="info-card-body">
          <div className="env-primary-name">Web App Development</div>

          <div className="env-meta-rows">
            <div className="meta-row">
              <FolderTree size={14} className="meta-icon" />
              <span className="meta-label">Path:</span>
              <span className="meta-value font-mono">~/projects/contra-labs/fintrex</span>
            </div>

            <div className="meta-row">
              <Cpu size={14} className="meta-icon" />
              <span className="meta-label">Platform:</span>
              <span className="meta-value font-mono">node-v20.11.0 / linux-x64</span>
            </div>
          </div>

          <div className="card-footer-tags">
            <span className="info-pill font-mono">Sandbox: Enforced</span>
            <span className="info-pill font-mono">Vite: v6.2.0</span>
            <span className="info-pill font-mono">IPC: Channel 4</span>
          </div>
        </div>
      </div>

      {/* Security & Permissions Card */}
      <div className="info-card">
        <div className="info-card-header">
          <div className="header-left">
            <span className="card-title">Security & Permissions</span>
          </div>
          <div className="badge badge-green">
            <ShieldCheck size={12} />
            <span>HEALTHY</span>
          </div>
        </div>

        <div className="info-card-body">
          <div className="security-summary-row">
            <CheckCircle2 size={16} className="check-icon" />
            <span className="security-summary-text">All permissions verified and scoped</span>
          </div>

          <div className="env-meta-rows">
            <div className="meta-row">
              <Lock size={14} className="meta-icon text-amber" />
              <span className="meta-label">System-level ops:</span>
              <span className="meta-value font-mono">Blocked (Restricted)</span>
            </div>

            <div className="meta-row">
              <Globe size={14} className="meta-icon text-blue" />
              <span className="meta-label">Network access:</span>
              <span className="meta-value font-mono">Localhost + Proxy only</span>
            </div>
          </div>

          <div className="card-footer-audit">
            <Clock size={12} className="audit-icon" />
            <span className="audit-text font-mono">Last audited: 14 mins ago</span>
          </div>
        </div>
      </div>

      <style>{`
        .env-security-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 14px;
          margin-bottom: 20px;
        }

        .info-card {
          background: #121826;
          border: 1px solid #1e283d;
          border-radius: 9px;
          padding: 16px 18px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          transition: border-color 0.15s ease;
        }

        .info-card:hover {
          border-color: #2b3a56;
        }

        .info-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid #1c2638;
          padding-bottom: 10px;
        }

        .card-title {
          font-size: 13.5px;
          font-weight: 700;
          color: #f1f5f9;
          letter-spacing: -0.01em;
        }

        .active-tag {
          color: #10b981;
          font-size: 11px;
          font-weight: 600;
          background: rgba(16, 185, 129, 0.12);
          border: 1px solid rgba(16, 185, 129, 0.25);
          padding: 2px 8px;
          border-radius: 4px;
        }

        .info-card-body {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .env-primary-name {
          font-size: 16px;
          font-weight: 700;
          color: #f8fafc;
        }

        .security-summary-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .check-icon {
          color: #10b981;
          flex-shrink: 0;
        }

        .security-summary-text {
          font-size: 13px;
          font-weight: 600;
          color: #e2e8f0;
        }

        .env-meta-rows {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .meta-row {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
        }

        .meta-icon {
          color: #64748b;
          flex-shrink: 0;
        }

        .meta-icon.text-amber {
          color: #f59e0b;
        }

        .meta-icon.text-blue {
          color: #38bdf8;
        }

        .meta-label {
          color: #64748b;
        }

        .meta-value {
          color: #cbd5e1;
        }

        .card-footer-tags {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 4px;
        }

        .info-pill {
          background: #0d121f;
          border: 1px solid #202b3e;
          color: #7b8ea6;
          font-size: 10px;
          padding: 3px 8px;
          border-radius: 4px;
        }

        .card-footer-audit {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 4px;
        }

        .audit-icon {
          color: #64748b;
        }

        .audit-text {
          font-size: 11px;
          color: #64748b;
        }
      `}</style>
    </div>
  );
};
