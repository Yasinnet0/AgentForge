import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { flushSync } from 'react-dom';

export type ThemeMode = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';

export interface ThemeTransitionOrigin {
  clientX?: number;
  clientY?: number;
}

interface ThemeContextValue {
  themeMode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setThemeMode: (mode: ThemeMode, origin?: ThemeTransitionOrigin | React.MouseEvent) => void;
  toggleTheme: (origin?: ThemeTransitionOrigin | React.MouseEvent) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = 'agentforge_theme';

function getSystemTheme(): ResolvedTheme {
  try {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      return 'light';
    }
  } catch {}
  return 'dark';
}

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  return mode === 'system' ? getSystemTheme() : mode;
}

function readStoredThemeMode(): ThemeMode {
  try {
    const val = localStorage.getItem(STORAGE_KEY);
    if (val === 'light' || val === 'dark' || val === 'system') {
      return val;
    }
  } catch {}
  return 'dark';
}

function applyThemeDomOnly(mode: ThemeMode, resolved: ResolvedTheme): void {
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.dataset.themeMode = mode;
  root.style.colorScheme = resolved;
  root.style.backgroundColor = resolved === 'light' ? '#eaeff6' : '#090d16';
}

function syncMainProcessTheme(mode: ThemeMode, resolved: ResolvedTheme): void {
  if (window.electronAPI?.setTheme) {
    window.electronAPI.setTheme({ themeMode: mode, resolvedTheme: resolved }).catch(() => {});
  }
}

function resolveTransitionCoordinates(origin?: ThemeTransitionOrigin | React.MouseEvent): { x: number; y: number } {
  const defaultX = Math.max(0, window.innerWidth - 56);
  const defaultY = 24;

  if (!origin) {
    return { x: defaultX, y: defaultY };
  }

  const clientX = typeof origin.clientX === 'number' ? origin.clientX : 0;
  const clientY = typeof origin.clientY === 'number' ? origin.clientY : 0;

  if (Number.isFinite(origin.clientX) && Number.isFinite(origin.clientY) && (clientX !== 0 || clientY !== 0)) {
    return { x: clientX, y: clientY };
  }

  if ('currentTarget' in origin && origin.currentTarget instanceof HTMLElement) {
    const rect = origin.currentTarget.getBoundingClientRect();
    if (rect.width > 0 || rect.height > 0) {
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    }
  }

  return { x: defaultX, y: defaultY };
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(readStoredThemeMode);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolveTheme(readStoredThemeMode()));
  const resolvedThemeRef = useRef<ResolvedTheme>(resolvedTheme);
  resolvedThemeRef.current = resolvedTheme;
  const fallbackTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const initialMode = readStoredThemeMode();
    const initialResolved = resolveTheme(initialMode);
    resolvedThemeRef.current = initialResolved;
    setThemeModeState(initialMode);
    setResolvedTheme(initialResolved);
    applyThemeDomOnly(initialMode, initialResolved);
    syncMainProcessTheme(initialMode, initialResolved);

    return () => {
      if (fallbackTimerRef.current !== null) {
        window.clearTimeout(fallbackTimerRef.current);
      }
    };
  }, []);

  const performThemeSwitch = useCallback(
    (nextMode: ThemeMode, origin?: ThemeTransitionOrigin | React.MouseEvent) => {
      try {
        localStorage.setItem(STORAGE_KEY, nextMode);
      } catch {}

      const nextResolved = resolveTheme(nextMode);
      const root = document.documentElement;

      if (nextResolved === resolvedThemeRef.current) {
        setThemeModeState(nextMode);
        root.dataset.themeMode = nextMode;
        syncMainProcessTheme(nextMode, nextResolved);
        return;
      }

      const { x, y } = resolveTransitionCoordinates(origin);
      const endRadius = Math.ceil(
        Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
      );
      const prefersReducedMotion = Boolean(
        window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
      );

      resolvedThemeRef.current = nextResolved;

      const docWithVt = document as Document & {
        startViewTransition?: (updateCallback: () => void) => {
          ready: Promise<void>;
          finished: Promise<void>;
        };
      };

      if (!prefersReducedMotion && typeof docWithVt.startViewTransition === 'function') {
        try {
          const transition = docWithVt.startViewTransition(() => {
            root.classList.add('theme-snap');
            try {
              flushSync(() => {
                setThemeModeState(nextMode);
                setResolvedTheme(nextResolved);
              });
              applyThemeDomOnly(nextMode, nextResolved);
              void root.offsetHeight;
            } finally {
              root.classList.remove('theme-snap');
            }
          });

          transition.ready
            .then(() => {
              document.documentElement.animate(
                {
                  clipPath: [
                    `circle(0px at ${x}px ${y}px)`,
                    `circle(${endRadius}px at ${x}px ${y}px)`,
                  ],
                },
                {
                  duration: 360,
                  easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                  pseudoElement: '::view-transition-new(root)',
                }
              );
            })
            .catch(() => {});

          transition.finished
            .catch(() => {})
            .finally(() => {
              syncMainProcessTheme(nextMode, nextResolved);
            });
          return;
        } catch {
          root.classList.remove('theme-snap');
        }
      }

      if (!prefersReducedMotion) {
        if (fallbackTimerRef.current !== null) {
          window.clearTimeout(fallbackTimerRef.current);
        }
        root.classList.add('theme-fade-fallback');
        fallbackTimerRef.current = window.setTimeout(() => {
          root.classList.remove('theme-fade-fallback');
          fallbackTimerRef.current = null;
        }, 260);
      }

      setThemeModeState(nextMode);
      setResolvedTheme(nextResolved);
      applyThemeDomOnly(nextMode, nextResolved);
      syncMainProcessTheme(nextMode, nextResolved);
    },
    []
  );

  useEffect(() => {
    if (themeMode !== 'system' || !window.matchMedia) return;
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const handleChange = () => {
      performThemeSwitch('system', {
        clientX: window.innerWidth / 2,
        clientY: window.innerHeight / 2,
      });
    };
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, [themeMode, performThemeSwitch]);

  const setThemeMode = useCallback(
    (mode: ThemeMode, origin?: ThemeTransitionOrigin | React.MouseEvent) => {
      performThemeSwitch(mode, origin);
    },
    [performThemeSwitch]
  );

  const toggleTheme = useCallback(
    (origin?: ThemeTransitionOrigin | React.MouseEvent) => {
      const next: ThemeMode = resolvedThemeRef.current === 'dark' ? 'light' : 'dark';
      performThemeSwitch(next, origin);
    },
    [performThemeSwitch]
  );

  return (
    <ThemeContext.Provider value={{ themeMode, resolvedTheme, setThemeMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}
