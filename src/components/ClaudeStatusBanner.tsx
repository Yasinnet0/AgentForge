import React, { useState, useEffect } from 'react';
import { Bot, RefreshCw, Terminal } from 'lucide-react';

export const ClaudeStatusBanner: React.FC = () => {
  // Start with 4 hours, 12 minutes, 45 seconds (as in the PDF design)
  const [secondsElapsed, setSecondsElapsed] = useState(4 * 3600 + 12 * 60 + 45);
  const [isRestarting, setIsRestarting] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatUptime = (totalSeconds: number) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return `${String(hrs).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
  };

  const handleRestart = () => {
    setIsRestarting(true);
    setTimeout(() => {
      setIsRestarting(false);
    }, 1200);
  };

  return (
    <div className="claude-banner">
      <div className="banner-left">
        <div className="robot-icon-container">
          <Bot size={22} className="robot-icon" />
        </div>

        <div className="banner-info">
          <div className="banner-title-row">
            <span className="banner-title">Claude Code</span>
            <div className="badge badge-green">
              <span className="pulse-dot green"></span>
              <span>RUNNING</span>
            </div>
          </div>
          <div className="banner-subtitle">
            Connected to primary workspace via Claude CLI daemon <span className="font-mono proxy-tag">(local-proxy)</span>
          </div>
        </div>
      </div>

      <div className="banner-right">
        <div className="uptime-box">
          <span className="uptime-label font-mono">Sandbox Uptime:</span>
          <span className="uptime-value font-mono">{formatUptime(secondsElapsed)}</span>
        </div>

        <div className="banner-actions">
          <button 
            className={`action-pill-btn ${isRestarting ? 'spinning' : ''}`}
            onClick={handleRestart}
            title="Restart Daemon"
          >
            <RefreshCw size={13} />
            <span>{isRestarting ? 'Restarting...' : 'Restart'}</span>
          </button>

          <button className="action-pill-btn" title="Open Daemon Terminal">
            <Terminal size={13} />
            <span>Shell</span>
          </button>
        </div>
      </div>

      <style>{`
        .claude-banner {
          background: linear-gradient(90deg, #101927 0%, #121f33 100%);
          border: 1px solid #1c2b42;
          border-left: 4px solid #10b981;
          border-radius: 10px;
          padding: 14px 18px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
          margin-bottom: 20px;
        }

        .banner-left {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .robot-icon-container {
          width: 42px;
          height: 42px;
          border-radius: 10px;
          background: rgba(16, 185, 129, 0.12);
          border: 1px solid rgba(16, 185, 129, 0.28);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .robot-icon {
          color: #10b981;
        }

        .banner-info {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .banner-title-row {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .banner-title {
          font-size: 15px;
          font-weight: 700;
          color: #f8fafc;
          letter-spacing: -0.01em;
        }

        .banner-subtitle {
          font-size: 12px;
          color: #8899ac;
        }

        .proxy-tag {
          color: #38bdf8;
          font-size: 11px;
        }

        .banner-right {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .uptime-box {
          display: flex;
          align-items: center;
          gap: 7px;
          background: #0b111c;
          border: 1px solid #1c283d;
          padding: 6px 12px;
          border-radius: 6px;
        }

        .uptime-label {
          font-size: 11px;
          color: #64748b;
        }

        .uptime-value {
          font-size: 12px;
          font-weight: 600;
          color: #34d399;
        }

        .banner-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .action-pill-btn {
          display: flex;
          align-items: center;
          gap: 5px;
          background: #182337;
          border: 1px solid #283750;
          color: #cbd5e1;
          font-size: 11.5px;
          font-weight: 500;
          padding: 5px 10px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .action-pill-btn:hover {
          background: #202e48;
          color: #ffffff;
          border-color: #3b4d6e;
        }

        .action-pill-btn.spinning svg {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
