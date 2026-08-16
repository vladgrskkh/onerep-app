import NetInfo from '@react-native-community/netinfo';
import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '../../features/auth/AuthContext';
import { getLocalDb } from '../db/database';
import { createGymSyncEngine, SyncEngine, type SyncResult } from './SyncEngine';

export interface UseSyncResult {
  sync: () => Promise<SyncResult | null>;
  isSyncing: boolean;
  lastSyncAt: string | null;
  lastSyncResult: SyncResult | null;
  lastError: Error | null;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export function useSync(): UseSyncResult {
  const { user } = useAuth();
  const [engine] = useState<SyncEngine>(() => createGymSyncEngine(getLocalDb()));
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(() => engine.getLastSyncedAt());
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);
  const [lastError, setLastError] = useState<Error | null>(null);

  const sync = useCallback(async (): Promise<SyncResult | null> => {
    if (!user) {
      return null;
    }
    setIsSyncing(true);
    setLastError(null);
    try {
      const result = await engine.sync();
      if (result) {
        setLastSyncAt(result.lastSyncedAt);
        setLastSyncResult(result);
      }
      return result;
    } catch (error) {
      setLastError(toError(error));
      return null;
    } finally {
      setIsSyncing(false);
    }
  }, [user, engine]);

  useEffect(() => {
    if (!user) {
      return;
    }
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected) {
        void sync();
      }
    });
    return unsubscribe;
  }, [user, sync]);

  return { sync, isSyncing, lastSyncAt, lastSyncResult, lastError };
}
