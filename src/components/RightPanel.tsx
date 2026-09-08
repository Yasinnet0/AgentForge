import React, { useState } from 'react';
import { 
  Activity, 
  ArrowUpCircle, 
  Check, 
  RefreshCw, 
  ArrowRight
} from 'lucide-react';

interface ActivityItem {
  id: string;
  time: string;
  title: string;
  description: string;
  type: 'MCP' | 'AGENT' | 'SKILL' | 'RULE' | 'ENV' | 'DAEMON';
}

interface UpdateItem {
  id: string;
  name: string;
  currentVersion: string;
  newVersion: string;
  size: string;
  status: 'pending' | 'updating' | 'updated';
}

export const RightPanel: React.FC = () => {
  const activities: ActivityItem[] = [
    {
      id: '1',
      time: '14:12:02',
      title: 'postgres-mcp',
      description: 'Connected to local pool',
      type: 'MCP',
    },
    {
      id: '2',
      time: '13:58:15',
      title: 'Code Reviewer',
      description: 'Agent spawned successfully',
      type: 'AGENT',
    },
    {
      id: '3',
      time: '13:45:00',
      title: 'git-master',
      description: 'Skill invoked on branch main',
      type: 'SKILL',
    },
    {
      id: '4',
      time: '12:10:44',
      title: 'Rule: no-eval',
      description: 'Verified across 4 modified files',
      type: 'RULE',
    },
    {
      id: '5',
      time: '11:00:30',
      title: 'Web App Dev',
      description: 'Environment profile activated',
      type: 'ENV',
    },
    {
      id: '6',
      time: '09:15:22',
      title: 'Claude Daemon',
      description: 'Started daemon on port 4819',
      type: 'DAEMON',
    },
  ];

  const [updates, setUpdates] = useState<UpdateItem[]>([
    {
      id: 'postgres',
      name: 'postgres-mcp',
      currentVersion: 'v2.0.1',
      newVersion: 'v2.1.0',
      size: '1.4 MB',
      status: 'pending',
    },
    {
      id: 'filesystem',
      name: 'filesystem-mcp',
      currentVersion: 'v0.8.2',
      newVersion: 'v0.9.0',
      size: '890 KB',
      status: 'pending',
    },
  ]);

  const handleUpdate = (id: string) => {
    setUpdates((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: 'updating' } : item))
    );

    setTimeout(() => {
      setUpdates((prev) =>
        prev.map((item) => (item.id === id ? { ...item, status: 'updated' } : item))
      );
    }, 1500);
  };

  const handleUpdateAll = () => {
    setUpdates((prev) =>
      prev.map((item) => (item.status === 'pending' ? { ...item, status: 'updating' } : item))
    );

    setTimeout(() => {
      setUpdates((prev) =>
        prev.map((item) => ({ ...item, status: 'updated' }))
      );
    }, 1500);
  };

  const pendingCount = updates.filter((u) => u.status === 'pending').length;
  const isUpdatingAny = updates.some((u) => u.status === 'updating');

  return (
    <aside className="right-panel-wrapper">
      {/* Floating Card 1: Activity Stream */}
      <div className="floating-card activity-floating-card">
        <div className="floating-card-header">
          <div className="card-title-group">
            <Activity size={15} className="activity-header-icon" />
            <div>
              <span className="card-title">Activity Stream</span>
              <div className="card-subtitle">Real-time daemon events</div>
            </div>
          </div>
          <span className="event-count-badge font-mono">{activities.length} EVENTS</span>
        </div>

        <div className="activity-stream">
          {activities.map((item) => (
            <div key={item.id} className="stream-row">
              <div className="stream-header-line">
                <div className="stream-source-title">
                  <span className={`stream-tag tag-${item.type.toLowerCase()} font-mono`}>
                    {item.type}
                  </span>
                  <span className="stream-title font-mono">{item.title}</span>
                </div>
                <span className="stream-time font-mono">{item.time}</span>
              </div>
              <div className="stream-desc">{item.description}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Floating Card 2: Available Updates */}
      <div className="floating-card updates-floating-card">
        <div className="floating-card-header">
          <div className="card-title-group">
            <ArrowUpCircle size={15} className="updates-header-icon" />
            <div>
              <span className="card-title">Available Updates</span>
              <div className="card-subtitle">MCP Servers & Plugins</div>
            </div>
          </div>
          <div className="updates-header-actions">
            {pendingCount > 0 ? (
              <button 
                className="update-all-btn"
                onClick={handleUpdateAll}
                disabled={isUpdatingAny}
                title="Update all pending packages"
              >
                <RefreshCw size={10} className={isUpdatingAny ? "spin-icon" : ""} />
                <span>Update All</span>
              </button>
            ) : (
              <span className="badge badge-green font-mono">ALL CURRENT</span>
            )}
          </div>
        </div>

        <div className="updates-list">
          {updates.map((item) => (
            <div key={item.id} className="update-card">
              <div className="update-info">
                <div className="update-name font-mono">{item.name}</div>
                <div className="update-version-row">
                  <span className="version-from font-mono">{item.currentVersion}</span>
                  <ArrowRight size={10} className="arrow-icon" />
                  <span className="version-to font-mono">{item.newVersion}</span>
                  <span className="update-size font-mono">• {item.size}</span>
                </div>
              </div>

              <button
                className={`update-btn ${item.status}`}
                disabled={item.status !== 'pending'}
                onClick={() => handleUpdate(item.id)}
              >
                {item.status === 'pending' && <span>Update</span>}
                {item.status === 'updating' && (
                  <>
                    <RefreshCw size={11} className="spin-icon" />
                    <span>Updating</span>
                  </>
                )}
                {item.status === 'updated' && (
                  <>
                    <Check size={12} />
                    <span>Done</span>
                  </>
                )}
              </button>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        .right-panel-wrapper {
          width: 330px;
          min-width: 330px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding: 16px;
          height: calc(100vh - 48px);
          overflow-y: auto;
          background: transparent;
          border-left: 1px solid rgba(28, 37, 56, 0.5);
        }

        /* Floating Card Glass Container */
        .floating-card {
          background: rgba(17, 23, 37, 0.82);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 14px;
          box-shadow: 
            0 14px 30px -6px rgba(0, 0, 0, 0.5),
            0 0 0 1px rgba(255, 255, 255, 0.03),
            inset 0 1px 0 rgba(255, 255, 255, 0.08);
          padding: 16px;
          transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease, border-color 0.2s ease;
        }

        .floating-card:hover {
          transform: translateY(-2px);
          border-color: #2e3c5a;
          box-shadow: 
            0 18px 34px -6px rgba(0, 0, 0, 0.6),
            inset 0 1px 0 rgba(255, 255, 255, 0.1);
        }

        /* Specific sizing behavior */
        .activity-floating-card {
          flex: 1;
          min-height: 280px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .updates-floating-card {
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .floating-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 12px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }

        .card-title-group {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .updates-header-icon {
          color: #f43f5e;
        }

        .card-title {
          font-size: 13px;
          font-weight: 700;
          color: #f1f5f9;
          display: block;
          line-height: 1.2;
        }

        .card-subtitle {
          font-size: 10px;
          color: #64748b;
          margin-top: 1px;
        }

        .activity-header-icon {
          color: #818cf8;
        }

        .event-count-badge {
          font-size: 10px;
          color: #718298;
          background: #141b2b;
          border: 1px solid #1f2b40;
          padding: 2px 7px;
          border-radius: 4px;
          letter-spacing: 0.04em;
        }

        /* Scrollable activity stream */
        .activity-stream {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          padding-right: 2px;
        }

        .stream-row {
          padding: 8px 6px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
          transition: background-color 0.12s ease;
          border-radius: 5px;
        }

        .stream-row:last-child {
          border-bottom: none;
        }

        .stream-row:hover {
          background: rgba(255, 255, 255, 0.035);
        }

        .stream-header-line {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 3px;
        }

        .stream-source-title {
          display: flex;
          align-items: center;
          gap: 7px;
          min-width: 0;
        }

        .stream-tag {
          font-size: 8.5px;
          font-weight: 700;
          padding: 1px 5px;
          border-radius: 3px;
          letter-spacing: 0.04em;
          flex-shrink: 0;
          line-height: 1.3;
        }

        .tag-mcp {
          background: rgba(56, 189, 248, 0.12);
          color: #38bdf8;
          border: 1px solid rgba(56, 189, 248, 0.25);
        }

        .tag-agent {
          background: rgba(192, 132, 252, 0.12);
          color: #c084fc;
          border: 1px solid rgba(192, 132, 252, 0.25);
        }

        .tag-skill {
          background: rgba(52, 211, 153, 0.12);
          color: #34d399;
          border: 1px solid rgba(52, 211, 153, 0.25);
        }

        .tag-rule {
          background: rgba(251, 191, 36, 0.12);
          color: #fbbf24;
          border: 1px solid rgba(251, 191, 36, 0.25);
        }

        .tag-env {
          background: rgba(129, 140, 248, 0.12);
          color: #818cf8;
          border: 1px solid rgba(129, 140, 248, 0.25);
        }

        .tag-daemon {
          background: rgba(45, 212, 191, 0.12);
          color: #2dd4bf;
          border: 1px solid rgba(45, 212, 191, 0.25);
        }

        .stream-title {
          font-size: 12px;
          font-weight: 600;
          color: #f1f5f9;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .stream-time {
          font-size: 10px;
          color: #55677d;
          flex-shrink: 0;
        }

        .stream-desc {
          font-size: 11px;
          color: #8899ac;
          line-height: 1.35;
          padding-left: 1px;
        }

        /* Updates cards inside floating pod */
        .updates-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .update-card {
          background: rgba(12, 17, 28, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 8px;
          padding: 10px 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          transition: border-color 0.15s ease, background 0.15s ease;
        }

        .update-card:hover {
          border-color: rgba(99, 102, 241, 0.25);
          background: rgba(15, 22, 38, 0.9);
        }

        .update-info {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .update-name {
          font-size: 12px;
          font-weight: 700;
          color: #f8fafc;
        }

        .update-version-row {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 10.5px;
          color: #8899ac;
        }

        .version-from {
          color: #64748b;
        }

        .arrow-icon {
          color: #475569;
        }

        .version-to {
          color: #f59e0b;
          font-weight: 600;
        }

        .update-size {
          color: #64748b;
        }

        .updates-header-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .update-all-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          background: #172033;
          border: 1px solid #283650;
          color: #93c5fd;
          font-size: 11px;
          font-weight: 600;
          padding: 3px 9px;
          border-radius: 5px;
          cursor: pointer;
          transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
        }

        .update-all-btn:hover:not(:disabled) {
          background: #1e2c47;
          border-color: #3b5077;
          color: #f8fafc;
        }

        .update-all-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .update-btn {
          background: transparent;
          border: 1px solid #ef4444;
          color: #f87171;
          font-size: 11px;
          font-weight: 600;
          padding: 4px 10px;
          border-radius: 6px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 4px;
          transition: all 0.15s ease;
        }

        .update-btn:hover:not(:disabled) {
          background: rgba(239, 68, 68, 0.15);
          color: #ffffff;
        }

        .update-btn.updating {
          border-color: #f59e0b;
          color: #fbbf24;
          cursor: wait;
        }

        .update-btn.updated {
          border-color: #10b981;
          color: #34d399;
          background: rgba(16, 185, 129, 0.1);
        }

        .spin-icon {
          animation: spin 1s linear infinite;
        }
      `}</style>
    </aside>
  );
};

