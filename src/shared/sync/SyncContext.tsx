import NetInfo from '@react-native-community/netinfo';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '../../features/auth/AuthContext';
import { getLocalDb } from '../db/database';
import { createGymSyncEngine, SyncEngine, type SyncResult } from './SyncEngine';
import type { UseSyncResult } from './useSync';

const SyncContext = createContext<UseSyncResult | null>(null);

export interface SyncProviderProps {
  children?: React.ReactNode;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export function SyncProvider({ children }: SyncProviderProps) {
  const { user } = useAuth();
  const userRef = useRef(user);
  const [engine] = useState<SyncEngine>(() => createGymSyncEngine(getLocalDb()));
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(() => engine.getLastSyncedAt());
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);
  const [lastError, setLastError] = useState<Error | null>(null);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const sync = useCallback(async (): Promise<SyncResult | null> => {
    if (!userRef.current) {
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
  }, [engine]);

  useEffect(() => {
    if (!user) {
      return;
    }
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected && userRef.current) {
        void sync();
      }
    });
    return unsubscribe;
  }, [user, sync]);

  const value = useMemo(
    () => ({ sync, isSyncing, lastSyncAt, lastSyncResult, lastError }),
    [sync, isSyncing, lastSyncAt, lastSyncResult, lastError],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSyncContext(): UseSyncResult {
  const value = useContext(SyncContext);
  if (!value) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return value;
}
