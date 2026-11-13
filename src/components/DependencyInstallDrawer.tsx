import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  Terminal, 
  Check, 
  Copy, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  ExternalLink,
  Cpu,
  Monitor,
  Apple
} from 'lucide-react';
import { DependencyReport } from '../types/dependencies';
import { KNOWN_DEPENDENCIES_META, getCurrentPlatform, getInstallSnippetForPlatform } from '../utils/dependencyResolver';
import { useModalTransition } from '../hooks/useModalTransition';

interface DependencyInstallDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  targetName: string;
  requiredBinaries: string[];
  report: DependencyReport | null;
  onRefreshReport: () => Promise<void>;
}

type PlatformTab = 'windows' | 'mac' | 'linux';

export const DependencyInstallDrawer: React.FC<DependencyInstallDrawerProps> = ({
  isOpen,
  onClose,
  targetName,
  requiredBinaries,
  report,
  onRefreshReport,
}) => {
  const { isRendered, isClosing, handleClose } = useModalTransition(isOpen, onClose, 200);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [selectedPlatforms, setSelectedPlatforms] = useState<Record<string, PlatformTab>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const userPlatform = getCurrentPlatform();

  // Cache last known values to prevent layout flicker during exit transition
  const lastTargetNameRef = useRef(targetName);
  const lastRequiredBinariesRef = useRef(requiredBinaries);

  if (targetName) {
    lastTargetNameRef.current = targetName;
  }
  if (requiredBinaries && requiredBinaries.length > 0) {
    lastRequiredBinariesRef.current = requiredBinaries;
  }

  const effectiveTargetName = targetName || lastTargetNameRef.current;
  const effectiveRequiredBinaries =
    requiredBinaries && requiredBinaries.length > 0
      ? requiredBinaries
      : lastRequiredBinariesRef.current;

  // Escape key handler for smooth closing
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  if (!isRendered) return null;

  const handleCopy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch (err) {
      console.warn('Clipboard write failed:', err);
    }
  };

  const missingList = effectiveRequiredBinaries.filter(
    (bin) => !report?.[bin]?.installed
  );
  const isAllReady = effectiveRequiredBinaries.length > 0 && missingList.length === 0;

  const handleCopyAllMissing = async () => {
    const commands = missingList.map((bin) => {
      const activePlatform: PlatformTab = selectedPlatforms[bin] || userPlatform;
      return getInstallSnippetForPlatform(bin, activePlatform);
    });
    const combined = commands.join(' && ');
    await handleCopy('all-missing', combined);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefreshReport();
    } finally {
      setTimeout(() => setIsRefreshing(false), 400);
    }
  };

  return createPortal(
    <div className={`dep-drawer-backdrop ${isClosing ? 'is-closing' : ''}`} onClick={handleClose}>
      <div className={`dep-drawer-panel ${isClosing ? 'is-closing' : ''}`} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="dep-drawer-header">
          <div className="header-left">
            <div className="drawer-icon-wrap">
              <Terminal size={18} className="drawer-icon" />
            </div>
            <div>
              <h3 className="drawer-title">Prerequisite System Binaries</h3>
              <p className="drawer-subtitle font-mono">
                Required for: <span className="target-name">{effectiveTargetName}</span>
              </p>
            </div>
          </div>
          <button className="drawer-close-btn" onClick={handleClose} aria-label="Close Drawer">
            <X size={15} strokeWidth={2} />
          </button>
        </div>

        {/* Status Banner */}
        <div className={`dep-summary-banner ${isAllReady ? 'ready' : 'missing'}`}>
          {isAllReady ? (
            <>
              <CheckCircle2 size={16} className="banner-icon ready" />
              <div>
                <strong>All Prerequisites Satisfied</strong>
                <p>All required command binaries resolve properly on your system PATH.</p>
              </div>
            </>
          ) : (
            <>
              <AlertCircle size={16} className="banner-icon missing" />
              <div className="banner-text-wrap">
                <strong>Missing Dependencies Detected ({missingList.length} remaining)</strong>
                <p>Copy and run the installation commands below in your system terminal.</p>
              </div>
              <button
                type="button"
                className={`banner-copy-all-btn ${copiedKey === 'all-missing' ? 'copied' : ''}`}
                onClick={handleCopyAllMissing}
                title="Copy all missing install commands to clipboard"
              >
                {copiedKey === 'all-missing' ? <Check size={11} /> : <Copy size={11} />}
                <span className="font-mono">{copiedKey === 'all-missing' ? 'COPIED' : 'COPY ALL'}</span>
              </button>
            </>
          )}
        </div>

        {/* Dependency Cards List */}
        <div className="dep-cards-list">
          {effectiveRequiredBinaries.map((bin) => {
            const check = report?.[bin];
            const meta = KNOWN_DEPENDENCIES_META[bin] || {
              binary: bin,
              name: bin.toUpperCase(),
              description: `System executable prerequisite: ${bin}`,
              docsUrl: 'https://github.com',
              installSnippets: {
                windows: `winget install ${bin}`,
                mac: `brew install ${bin}`,
                linux: `sudo apt install ${bin}`,
              },
            };

            const isInstalled = Boolean(check?.installed);
            const activePlatform: PlatformTab = selectedPlatforms[bin] || userPlatform;
            const snippet = meta.installSnippets[activePlatform] || meta.installSnippets.windows;
            const copyKey = `${bin}-${activePlatform}`;

            return (
              <div key={bin} className={`dep-card ${isInstalled ? 'installed' : 'missing'}`}>
                <div className="dep-card-header">
                  <div className="dep-card-info">
                    <span className="dep-bin-name font-mono">{meta.name}</span>
                    <span className="dep-bin-code font-mono">({bin})</span>
                  </div>
                  {isInstalled ? (
                    <span className="dep-pill ready font-mono">
                      <CheckCircle2 size={11} /> READY
                    </span>
                  ) : (
                    <span className="dep-pill missing font-mono">
                      <AlertCircle size={11} /> NOT FOUND ON PATH
                    </span>
                  )}
                </div>

                <p className="dep-desc">{meta.description}</p>

                {isInstalled && check?.path && (
                  <div className="dep-installed-path font-mono" title={check.path}>
                    <span className="path-label">Resolved:</span>
                    <span className="path-value">{check.path}</span>
                    {check.version && (
                      <span className="ver-value">[{check.version}]</span>
                    )}
                  </div>
                )}

                {/* Installation Snippet Box */}
                <div className="dep-snippet-container">
                  <div className="snippet-toolbar">
                    <div className="platform-pills">
                      <button
                        className={`platform-btn ${activePlatform === 'windows' ? 'active' : ''}`}
                        onClick={() => setSelectedPlatforms((prev) => ({ ...prev, [bin]: 'windows' }))}
                      >
                        <Monitor size={11} /> Windows
                      </button>
                      <button
                        className={`platform-btn ${activePlatform === 'mac' ? 'active' : ''}`}
                        onClick={() => setSelectedPlatforms((prev) => ({ ...prev, [bin]: 'mac' }))}
                      >
                        <Apple size={11} /> macOS
                      </button>
                      <button
                        className={`platform-btn ${activePlatform === 'linux' ? 'active' : ''}`}
                        onClick={() => setSelectedPlatforms((prev) => ({ ...prev, [bin]: 'linux' }))}
                      >
                        <Cpu size={11} /> Linux
                      </button>
                    </div>

                    {meta.docsUrl && (
                      <a
                        href={meta.docsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="docs-link font-mono"
                        title="Open official documentation"
                      >
                        <span>Docs</span>
                        <ExternalLink size={10} />
                      </a>
                    )}
                  </div>

                  <div className="snippet-code-row">
                    <code className="snippet-code font-mono">{snippet}</code>
                    <button
                      className={`copy-btn ${copiedKey === copyKey ? 'copied' : ''}`}
                      onClick={() => handleCopy(copyKey, snippet)}
                      title="Copy install command"
                    >
                      {copiedKey === copyKey ? (
                        <>
                          <Check size={12} />
                          <span className="font-mono">COPIED</span>
                        </>
                      ) : (
                        <>
                          <Copy size={12} />
                          <span className="font-mono">COPY</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="dep-drawer-footer">
          <button
            className={`recheck-btn ${isRefreshing ? 'refreshing' : ''}`}
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw size={13} className={isRefreshing ? 'spin' : ''} />
            <span>Re-check System PATH</span>
          </button>
          <button className="done-btn" onClick={handleClose}>
            Done
          </button>
        </div>
      </div>

      <style>{`
        .dep-drawer-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: radial-gradient(ellipse at 50% 40%, rgba(13, 19, 36, 0.62) 0%, rgba(4, 7, 15, 0.74) 100%);
          backdrop-filter: blur(16px) saturate(180%) contrast(105%);
          -webkit-backdrop-filter: blur(16px) saturate(180%) contrast(105%);
          z-index: 10000;
          display: flex;
          justify-content: flex-end;
          animation: depFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          will-change: opacity;
        }

        .dep-drawer-backdrop.is-closing {
          animation: depFadeOut 0.2s cubic-bezier(0.4, 0, 0.2, 1) forwards !important;
          pointer-events: none !important;
        }

        @keyframes depFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes depFadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }

        .dep-drawer-panel {
          width: 520px;
          max-width: 95vw;
          height: 100vh;
          background: #0d121d;
          border-left: 1px solid #1f2b42;
          box-shadow: -10px 0 35px rgba(0, 0, 0, 0.75);
          display: flex;
          flex-direction: column;
          animation: depSlideIn 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          will-change: transform, opacity;
        }

        .dep-drawer-panel.is-closing {
          animation: depSlideOut 0.2s cubic-bezier(0.4, 0, 0.2, 1) forwards !important;
          pointer-events: none !important;
        }

        @keyframes depSlideIn {
          from {
            transform: translate3d(100%, 0, 0);
            opacity: 0.6;
          }
          to {
            transform: translate3d(0, 0, 0);
            opacity: 1;
          }
        }

        @keyframes depSlideOut {
          from {
            transform: translate3d(0, 0, 0);
            opacity: 1;
          }
          to {
            transform: translate3d(100%, 0, 0);
            opacity: 0.2;
          }
        }

        .dep-drawer-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid #182235;
          background: #090e18;
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .drawer-icon-wrap {
          width: 34px;
          height: 34px;
          border-radius: 8px;
          background: rgba(56, 189, 248, 0.1);
          border: 1px solid rgba(56, 189, 248, 0.25);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #38bdf8;
        }

        .drawer-title {
          margin: 0;
          font-size: 14px;
          font-weight: 700;
          color: #f1f5f9;
        }

        .drawer-subtitle {
          margin: 2px 0 0;
          font-size: 11px;
          color: #94a3b8;
        }

        .target-name {
          color: #38bdf8;
          font-weight: 600;
        }

        .drawer-close-btn {
          width: 28px;
          height: 28px;
          padding: 0;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #94a3b8;
          cursor: pointer;
          border-radius: 7px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
          flex-shrink: 0;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
          user-select: none;
        }

        .drawer-close-btn:hover {
          color: #f8fafc;
          background: rgba(255, 255, 255, 0.09);
          border-color: rgba(255, 255, 255, 0.18);
          transform: translateY(-0.5px);
        }

        .drawer-close-btn:active {
          transform: translateY(0.5px);
          background: rgba(255, 255, 255, 0.14);
        }

        .dep-summary-banner {
          margin: 14px 20px 6px;
          padding: 10px 14px;
          border-radius: 7px;
          display: flex;
          align-items: flex-start;
          gap: 10px;
        }

        .dep-summary-banner.ready {
          background: rgba(52, 211, 153, 0.08);
          border: 1px solid rgba(52, 211, 153, 0.25);
          color: #34d399;
        }

        .dep-summary-banner.missing {
          background: rgba(245, 158, 11, 0.08);
          border: 1px solid rgba(245, 158, 11, 0.25);
          color: #fbbf24;
        }

        .dep-summary-banner strong {
          display: block;
          font-size: 12px;
          font-weight: 600;
          margin-bottom: 2px;
        }

        .dep-summary-banner p {
          margin: 0;
          font-size: 11px;
          opacity: 0.85;
          line-height: 1.4;
        }

        .banner-text-wrap {
          flex: 1;
        }

        .banner-copy-all-btn {
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 10px;
          border-radius: 5px;
          font-size: 10px;
          font-weight: 700;
          cursor: pointer;
          background: rgba(245, 158, 11, 0.16);
          border: 1px solid rgba(245, 158, 11, 0.4);
          color: #fbbf24;
          transition: all 0.15s ease;
        }

        .banner-copy-all-btn:hover {
          background: rgba(245, 158, 11, 0.28);
          border-color: rgba(245, 158, 11, 0.65);
        }

        .banner-copy-all-btn.copied {
          background: rgba(52, 211, 153, 0.18);
          border-color: rgba(52, 211, 153, 0.5);
          color: #34d399;
        }

        .banner-icon {
          flex-shrink: 0;
          margin-top: 2px;
        }

        .dep-cards-list {
          flex: 1;
          overflow-y: auto;
          padding: 14px 20px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .dep-card {
          background: #0f1523;
          border: 1px solid #1c273c;
          border-radius: 8px;
          padding: 14px;
          transition: border-color 0.15s ease;
        }

        .dep-card.missing {
          border-color: rgba(245, 158, 11, 0.35);
        }

        .dep-card.installed {
          border-color: rgba(52, 211, 153, 0.25);
        }

        .dep-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 6px;
        }

        .dep-card-info {
          display: flex;
          align-items: baseline;
          gap: 6px;
        }

        .dep-bin-name {
          font-size: 13px;
          font-weight: 700;
          color: #ffffff;
        }

        .dep-bin-code {
          font-size: 11px;
          color: #64748b;
        }

        .dep-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 7px;
          border-radius: 4px;
          font-size: 9.5px;
          font-weight: 700;
          letter-spacing: 0.03em;
        }

        .dep-pill.ready {
          background: rgba(52, 211, 153, 0.12);
          color: #34d399;
          border: 1px solid rgba(52, 211, 153, 0.28);
        }

        .dep-pill.missing {
          background: rgba(245, 158, 11, 0.12);
          color: #fbbf24;
          border: 1px solid rgba(245, 158, 11, 0.3);
        }

        .dep-desc {
          margin: 0 0 10px;
          font-size: 11.5px;
          color: #94a3b8;
          line-height: 1.45;
        }

        .dep-installed-path {
          display: flex;
          align-items: center;
          gap: 6px;
          background: #090e18;
          border: 1px solid #162032;
          padding: 5px 8px;
          border-radius: 5px;
          font-size: 10px;
          margin-bottom: 10px;
          overflow: hidden;
        }

        .path-label {
          color: #64748b;
          flex-shrink: 0;
        }

        .path-value {
          color: #38bdf8;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          flex: 1;
        }

        .ver-value {
          color: #34d399;
          flex-shrink: 0;
        }

        .dep-snippet-container {
          background: #070b13;
          border: 1px solid #192439;
          border-radius: 6px;
          overflow: hidden;
        }

        .snippet-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 6px 8px;
          border-bottom: 1px solid #141c2c;
          background: #090e18;
        }

        .platform-pills {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .platform-btn {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          background: transparent;
          border: 1px solid transparent;
          color: #8899ac;
          font-size: 10px;
          font-weight: 600;
          padding: 2px 6px;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.12s ease;
        }

        .platform-btn:hover {
          color: #f1f5f9;
        }

        .platform-btn.active {
          background: #182438;
          border-color: #263857;
          color: #38bdf8;
        }

        .docs-link {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          color: #64748b;
          font-size: 10px;
          text-decoration: none;
          transition: color 0.12s ease;
        }

        .docs-link:hover {
          color: #38bdf8;
        }

        .snippet-code-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 7px 10px;
          gap: 8px;
        }

        .snippet-code {
          color: #f8fafc;
          font-size: 11px;
          overflow-x: auto;
          white-space: nowrap;
          flex: 1;
        }

        .copy-btn {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          background: #141e30;
          border: 1px solid #22324e;
          color: #cbd5e1;
          font-size: 9.5px;
          font-weight: 700;
          padding: 3px 7px;
          border-radius: 4px;
          cursor: pointer;
          flex-shrink: 0;
          transition: all 0.12s ease;
        }

        .copy-btn:hover {
          background: #1b2942;
          color: #ffffff;
          border-color: #30476e;
        }

        .copy-btn.copied {
          background: rgba(52, 211, 153, 0.15);
          color: #34d399;
          border-color: rgba(52, 211, 153, 0.35);
        }

        .dep-drawer-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 20px;
          border-top: 1px solid #182235;
          background: #090e18;
        }

        .recheck-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #121a28;
          border: 1px solid #1f2c42;
          color: #94a3b8;
          font-size: 11px;
          font-weight: 600;
          padding: 6px 12px;
          border-radius: 5px;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .recheck-btn:hover:not(:disabled) {
          background: #182438;
          color: #f1f5f9;
          border-color: #2d3e5c;
        }

        .recheck-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .done-btn {
          background: #38bdf8;
          border: 1px solid #38bdf8;
          color: #090e18;
          font-size: 11px;
          font-weight: 700;
          padding: 6px 16px;
          border-radius: 5px;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .done-btn:hover {
          background: #7dd3fc;
          border-color: #7dd3fc;
        }
      `}</style>
    </div>,
    document.body
  );
};
