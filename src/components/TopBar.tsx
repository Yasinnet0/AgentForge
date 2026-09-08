import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Bell, 
  Minus, 
  Square, 
  X, 
  Command 
} from 'lucide-react';

interface TopBarProps {
  currentEnv: string;
  onEnvChange?: (env: string) => void;
}

export const TopBar: React.FC<TopBarProps> = ({ currentEnv = 'Default' }) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.isMaximized().then(setIsMaximized).catch(() => {});
      const unsubscribe = window.electronAPI.onMaximizeChange((maximized) => {
        setIsMaximized(maximized);
      });
      return () => unsubscribe();
    }
  }, []);

  const handleMinimize = () => {
    window.electronAPI?.minimizeWindow();
  };

  const handleMaximize = () => {
    window.electronAPI?.maximizeWindow();
  };

  const handleClose = () => {
    window.electronAPI?.closeWindow();
  };

  return (
    <header className="topbar-container drag-region">
      {/* Left: Brand / Logo */}
      <div className="topbar-left no-drag">
        <div className="brand-badge">
          <span className="brand-icon">A</span>
          <span className="brand-name">AgentForge</span>
        </div>

        {/* Environment Tag */}
        <div className="env-badge">
          <span className="env-label font-mono">env:</span>
          <span className="env-value font-mono">{currentEnv}</span>
        </div>
      </div>

      {/* Center: Search Bar */}
      <div className="topbar-center no-drag">
        <div className="search-bar-container">
          <Search size={15} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Search agents, skills, rules, MCP servers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <div className="search-shortcut font-mono">
            <Command size={11} />
            <span>K</span>
            <span className="shortcut-divider">/</span>
          </div>
        </div>
      </div>

      {/* Right: Status, Notifications & Window Controls */}
      <div className="topbar-right no-drag">
        {/* Notification Bell */}
        <button className="icon-button notification-btn" title="Notifications">
          <Bell size={16} />
        </button>

        <div className="controls-divider"></div>

        {/* Custom Window Controls */}
        <div className="window-controls">
          <button 
            className="window-control-btn minimize" 
            onClick={handleMinimize}
            title="Minimize"
          >
            <Minus size={13} />
          </button>
          <button 
            className="window-control-btn maximize" 
            onClick={handleMaximize}
            title={isMaximized ? "Restore" : "Maximize"}
          >
            <Square size={11} />
          </button>
          <button 
            className="window-control-btn close" 
            onClick={handleClose}
            title="Close"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <style>{`
        .topbar-container {
          height: 48px;
          min-height: 48px;
          background: #0d121f;
          border-bottom: 1px solid #1c2538;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 10px 0 16px;
          position: relative;
          z-index: 50;
        }

        .topbar-left {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .brand-badge {
          display: flex;
          align-items: center;
          gap: 9px;
        }

        .brand-icon {
          width: 26px;
          height: 26px;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          border-radius: 6px;
          color: #ffffff;
          font-weight: 800;
          font-size: 15px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 8px rgba(99, 102, 241, 0.4);
        }

        .brand-name {
          font-weight: 700;
          font-size: 15px;
          letter-spacing: -0.01em;
          color: #f8fafc;
        }

        .env-badge {
          display: flex;
          align-items: center;
          gap: 6px;
          background: #131927;
          border: 1px solid #1e283d;
          padding: 4px 9px;
          border-radius: 6px;
          font-size: 11.5px;
        }

        .env-label {
          color: #64748b;
          font-size: 10.5px;
          font-weight: 500;
        }

        .env-value {
          color: #93c5fd;
          font-weight: 600;
        }

        .topbar-center {
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
          width: 480px;
          max-width: calc(100% - 480px);
        }

        .search-bar-container {
          display: flex;
          align-items: center;
          background: #131926;
          border: 1px solid #202b3e;
          border-radius: 8px;
          padding: 5px 12px;
          transition: all 0.18s ease;
        }

        .search-bar-container:focus-within {
          border-color: #6366f1;
          box-shadow: 0 0 0 1px #6366f1;
          background: #161e30;
        }

        .search-icon {
          color: #64748b;
          margin-right: 8px;
        }

        .search-input {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          color: #f1f5f9;
          font-size: 12.5px;
          font-family: inherit;
        }

        .search-input::placeholder {
          color: #55657e;
        }

        .search-shortcut {
          display: flex;
          align-items: center;
          gap: 3px;
          background: #1c263c;
          color: #7b8ea6;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 10px;
          border: 1px solid #2b3954;
        }

        .shortcut-divider {
          color: #4b5d73;
          margin-left: 2px;
        }

        .topbar-right {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .icon-button {
          position: relative;
          background: #151c2d;
          border: 1px solid #23304a;
          color: #94a3b8;
          width: 32px;
          height: 32px;
          border-radius: 7px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .icon-button:hover {
          background: #1d273e;
          color: #f8fafc;
          border-color: #334466;
        }

        .notification-badge {
          position: absolute;
          top: -4px;
          right: -4px;
          background: #ef4444;
          color: #ffffff;
          font-size: 9.5px;
          font-weight: 700;
          width: 15px;
          height: 15px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2px solid #0d121f;
        }

        .primary-action-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          background: linear-gradient(135deg, #7c3aed, #6366f1);
          border: none;
          color: #ffffff;
          font-size: 12px;
          font-weight: 600;
          padding: 6px 14px;
          border-radius: 7px;
          cursor: pointer;
          box-shadow: 0 2px 10px rgba(124, 58, 237, 0.35);
          transition: all 0.15s ease;
        }

        .primary-action-btn:hover {
          opacity: 0.92;
          transform: translateY(-1px);
        }

        .controls-divider {
          width: 1px;
          height: 20px;
          background: #202b3e;
          margin: 0 4px;
        }

        .window-controls {
          display: flex;
          align-items: center;
          gap: 2px;
        }

        .window-control-btn {
          background: transparent;
          border: none;
          color: #8393a8;
          width: 30px;
          height: 30px;
          border-radius: 5px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.12s ease;
        }

        .window-control-btn:hover {
          background: #1c263c;
          color: #f1f5f9;
        }

        .window-control-btn.close:hover {
          background: #e11d48;
          color: #ffffff;
        }
      `}</style>
    </header>
  );
};
