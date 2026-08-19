import { useSyncContext } from './SyncContext';
import type { SyncResult } from './SyncEngine';

export interface UseSyncResult {
  sync: () => Promise<SyncResult | null>;
  isSyncing: boolean;
  lastSyncAt: string | null;
  lastSyncResult: SyncResult | null;
  lastError: Error | null;
}

export function useSync(): UseSyncResult {
  return useSyncContext();
}
