export interface UpdateHistoryRecord {
  id: string;
  packageId: string;
  packageName: string;
  packageType: 'SKILL' | 'MCP' | 'PLUGIN';
  category?: string;
  previousVersion: string;
  newVersion: string;
  timestamp: string;
  timestampFormatted: string;
  targetAgents: Array<{
    id: string;
    name: string;
    color: string;
    path: string;
  }>;
  changedFiles: string[];
  summary: string;
  sourceRegistry?: string;
  sourceUrl?: string;
  status: 'success' | 'failed';
  errorMessage?: string;
}

const STORAGE_KEY = 'agentforge_update_history_v1';

export function getUpdateHistory(): UpdateHistoryRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('Failed reading update history from localStorage:', err);
    return [];
  }
}

export function saveUpdateRecord(record: Omit<UpdateHistoryRecord, 'id' | 'timestamp' | 'timestampFormatted'>): UpdateHistoryRecord {
  const current = getUpdateHistory();
  const now = new Date();
  const formatted = now.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  const newRecord: UpdateHistoryRecord = {
    ...record,
    id: `upd-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: now.toISOString(),
    timestampFormatted: formatted,
  };

  try {
    // Keep up to 100 historical records
    const updated = [newRecord, ...current.slice(0, 99)];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('Failed saving update history to localStorage:', err);
  }

  return newRecord;
}

export function clearUpdateHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}
