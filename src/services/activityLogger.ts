import { useState, useEffect } from 'react';

export type ActivityType = 'SKILL' | 'MCP' | 'PLUGIN' | 'AGENT' | 'ENV' | 'SYSTEM' | 'DAEMON' | 'RULES' | 'RULE';
export type ActivityStatus = 'success' | 'warning' | 'error' | 'info';

export interface ActivityItem {
  id: string;
  timestamp: number;
  time: string;
  title: string;
  description: string;
  type: ActivityType;
  status?: ActivityStatus;
  agentName?: string;
}

const STORAGE_KEY = 'agentforge_activity_stream';
const MAX_ACTIVITIES = 60;

// Format relative time
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffSec = Math.floor((now - timestamp) / 1000);

  if (diffSec < 15) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  return new Date(timestamp).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Cache
let activitiesCache: ActivityItem[] = [];
let isInitialized = false;
const listeners = new Set<(activities: ActivityItem[]) => void>();

function initCache(): void {
  if (isInitialized) return;
  isInitialized = true;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Filter legacy items
        activitiesCache = parsed
          .filter((item) => {
            if (!item || !item.title) return false;
            if (item.id && item.id.startsWith('seed-')) return false;
            if (item.title.includes('Capabilities Synchronized') || item.title.includes('Scanned')) return false;
            if (item.title.includes('Target Agent')) return false;
            if (item.title.includes('Folder Opened') || item.title.includes('Config Opened')) return false;
            if (item.title.includes('Daemon Online') || item.title.includes('Environment Verification')) return false;
            return true;
          })
          .map((item) => ({
            ...item,
            time: formatRelativeTime(item.timestamp),
          }));
        saveCache();
        return;
      }
    }
  } catch (err) {
    console.warn('Failed to load activity stream from storage:', err);
  }

  activitiesCache = [];
  saveCache();
}

function saveCache(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(activitiesCache));
  } catch (err) {
    console.warn('Failed to persist activity stream to storage:', err);
  }
}

function notifyListeners(): void {
  const snapshot = [...activitiesCache];
  listeners.forEach((listener) => listener(snapshot));
}

export interface LogActivityParams {
  type: ActivityType;
  title: string;
  description: string;
  status?: ActivityStatus;
  agentName?: string;
}

export function logActivity(params: LogActivityParams): ActivityItem {
  initCache();

  const now = Date.now();
  const newItem: ActivityItem = {
    id: `act-${now}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: now,
    time: 'Just now',
    title: params.title,
    description: params.description,
    type: params.type,
    status: params.status || 'info',
    agentName: params.agentName,
  };

  activitiesCache = [newItem, ...activitiesCache].slice(0, MAX_ACTIVITIES);
  saveCache();
  notifyListeners();

  return newItem;
}

export function clearActivities(): void {
  activitiesCache = [];
  saveCache();
  notifyListeners();
}

export function getActivities(): ActivityItem[] {
  initCache();
  return [...activitiesCache];
}

// Hook
export function useActivityStream(): {
  activities: ActivityItem[];
  logActivity: typeof logActivity;
  clearActivities: typeof clearActivities;
} {
  const [activities, setActivities] = useState<ActivityItem[]>(() => {
    initCache();
    return [...activitiesCache];
  });

  useEffect(() => {
    initCache();
    setActivities([...activitiesCache]);

    const handleUpdate = (updated: ActivityItem[]) => {
      setActivities(updated);
    };

    listeners.add(handleUpdate);

    // Refresh relative times
    const interval = setInterval(() => {
      setActivities((prev) =>
        prev.map((item) => ({
          ...item,
          time: formatRelativeTime(item.timestamp),
        }))
      );
    }, 15000);

    return () => {
      listeners.delete(handleUpdate);
      clearInterval(interval);
    };
  }, []);

  return {
    activities,
    logActivity,
    clearActivities,
  };
}
