import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;
}

export interface ToastOptions {
  title?: string;
  duration?: number;
}

interface ToastContextValue {
  showToast: (type: ToastType, message: string, options?: ToastOptions) => string;
  success: (message: string, options?: ToastOptions) => string;
  error: (message: string, options?: ToastOptions) => string;
  info: (message: string, options?: ToastOptions) => string;
  warning: (message: string, options?: ToastOptions) => string;
  dismiss: (id: string) => void;
  clearAll: () => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const DEFAULT_DURATIONS: Record<ToastType, number> = {
  success: 3600,
  info: 3600,
  warning: 4500,
  error: 5500,
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const dismiss = useCallback((id: string) => {
    const existing = timeoutsRef.current.get(id);
    if (existing) {
      clearTimeout(existing);
      timeoutsRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    timeoutsRef.current.forEach((t) => clearTimeout(t));
    timeoutsRef.current.clear();
    setToasts([]);
  }, []);

  const showToast = useCallback(
    (type: ToastType, message: string, options?: ToastOptions) => {
      const id = 'toast_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
      const duration = options?.duration ?? DEFAULT_DURATIONS[type];

      const newToast: ToastItem = {
        id,
        type,
        title: options?.title,
        message,
        duration,
      };

      setToasts((prev) => {
        // Keep at most 4 simultaneous toasts
        const next = [...prev, newToast];
        if (next.length > 4) {
          const removed = next.shift();
          if (removed) {
            const timeout = timeoutsRef.current.get(removed.id);
            if (timeout) clearTimeout(timeout);
            timeoutsRef.current.delete(removed.id);
          }
        }
        return next;
      });

      if (duration > 0) {
        const timeout = setTimeout(() => {
          dismiss(id);
        }, duration);
        timeoutsRef.current.set(id, timeout);
      }

      return id;
    },
    [dismiss]
  );

  const success = useCallback((message: string, options?: ToastOptions) => showToast('success', message, options), [showToast]);
  const error = useCallback((message: string, options?: ToastOptions) => showToast('error', message, options), [showToast]);
  const info = useCallback((message: string, options?: ToastOptions) => showToast('info', message, options), [showToast]);
  const warning = useCallback((message: string, options?: ToastOptions) => showToast('warning', message, options), [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, success, error, info, warning, dismiss, clearAll }}>
      {children}

      {/* Floating Toast Notification Stack in Bottom-Right */}
      <aside aria-label="Notifications" className="agentforge-toast-container">
        {toasts.map((toast) => {
          let Icon = CheckCircle2;
          let colorClass = 'toast-success';
          if (toast.type === 'error') {
            Icon = AlertCircle;
            colorClass = 'toast-error';
          } else if (toast.type === 'info') {
            Icon = Info;
            colorClass = 'toast-info';
          } else if (toast.type === 'warning') {
            Icon = AlertTriangle;
            colorClass = 'toast-warning';
          }

          return (
            <div
              key={toast.id}
              className={`agentforge-toast-card ${colorClass}`}
              role="alert"
              aria-live="polite"
            >
              <div className="toast-icon-wrapper">
                <Icon size={14} />
              </div>

              <div className="toast-content">
                {toast.title && <div className="toast-title">{toast.title}</div>}
                <div className="toast-message">{toast.message}</div>
              </div>

              <button
                type="button"
                className="toast-close-btn"
                onClick={() => dismiss(toast.id)}
                title="Dismiss notification"
              >
                <X size={13} />
              </button>
            </div>
          );
        })}
      </aside>

      <style>{`
        .agentforge-toast-container {
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 999999;
          display: flex;
          flex-direction: column;
          gap: 8px;
          pointer-events: none;
          max-width: 380px;
          width: calc(100vw - 48px);
        }

        .agentforge-toast-card {
          pointer-events: auto;
          display: flex;
          align-items: center;
          gap: 11px;
          padding: 10px 13px;
          min-height: 44px;
          background: rgba(12, 16, 26, 0.94);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(255, 255, 255, 0.09);
          border-radius: 10px;
          box-shadow: 
            0 14px 34px -4px rgba(0, 0, 0, 0.65),
            0 2px 8px -2px rgba(0, 0, 0, 0.4),
            inset 0 1px 0 rgba(255, 255, 255, 0.07);
          animation: toastSlideUp 0.18s cubic-bezier(0.16, 1, 0.3, 1);
          transition: transform 0.14s ease, opacity 0.14s ease, border-color 0.14s ease;
          position: relative;
        }

        @keyframes toastSlideUp {
          from {
            transform: translateY(10px) scale(0.98);
            opacity: 0;
          }
          to {
            transform: translateY(0) scale(1);
            opacity: 1;
          }
        }

        .agentforge-toast-card:hover {
          border-color: rgba(255, 255, 255, 0.14);
          box-shadow: 
            0 18px 40px -4px rgba(0, 0, 0, 0.75),
            0 2px 8px -2px rgba(0, 0, 0, 0.4),
            inset 0 1px 0 rgba(255, 255, 255, 0.1);
        }

        /* Subtle Contextual Icon Accents (Clean, no left borders) */
        .toast-success .toast-icon-wrapper {
          color: #34d399;
          background: rgba(16, 185, 129, 0.12);
          border-color: rgba(16, 185, 129, 0.22);
        }

        .toast-error .toast-icon-wrapper {
          color: #f87171;
          background: rgba(239, 68, 68, 0.12);
          border-color: rgba(239, 68, 68, 0.22);
        }

        .toast-info .toast-icon-wrapper {
          color: #c084fc;
          background: rgba(168, 85, 247, 0.12);
          border-color: rgba(168, 85, 247, 0.22);
        }

        .toast-warning .toast-icon-wrapper {
          color: #fbbf24;
          background: rgba(245, 158, 11, 0.12);
          border-color: rgba(245, 158, 11, 0.22);
        }

        /* Icon */
        .toast-icon-wrapper {
          width: 24px;
          height: 24px;
          border-radius: 6px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          margin-top: 0;
        }

        /* Content */
        .toast-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 2px;
          min-width: 0;
        }

        .toast-title {
          font-size: 12.5px;
          font-weight: 600;
          color: #f8fafc;
          letter-spacing: -0.01em;
          line-height: 1.25;
        }

        .toast-message {
          font-size: 12.5px;
          font-weight: 500;
          color: #cbd5e1;
          line-height: 1.35;
          word-break: break-word;
          margin: 0;
        }

        /* Close Button */
        .toast-close-btn {
          background: transparent;
          border: none;
          color: #64748b;
          padding: 4px;
          margin: 0;
          border-radius: 5px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.12s ease;
          flex-shrink: 0;
          align-self: center;
        }

        .toast-close-btn:hover {
          color: #f1f5f9;
          background: rgba(255, 255, 255, 0.07);
        }
      `}</style>
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextValue => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
