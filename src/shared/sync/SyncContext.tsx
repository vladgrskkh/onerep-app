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
  const previousUserIdRef = useRef(user?.id ?? null);
  const [store] = useState(() => getLocalDb());
  const [engine] = useState<SyncEngine>(() => createGymSyncEngine(store));
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(() => engine.getLastSyncedAt());
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);
  const [lastError, setLastError] = useState<Error | null>(null);

  useEffect(() => {
    const previousUserId = previousUserIdRef.current;
    const nextUserId = user?.id ?? null;
    userRef.current = user;
    previousUserIdRef.current = nextUserId;

    if (previousUserId === nextUserId) {
      return;
    }
    setIsSyncing(false);
    setLastSyncAt(null);
    setLastSyncResult(null);
    setLastError(null);
  }, [user]);

  const sync = useCallback(async (): Promise<SyncResult | null> => {
    const accountId = userRef.current?.id;
    if (!accountId) {
      return null;
    }
    const generation = store.getDataGeneration();
    const isCurrentAccount = () =>
      userRef.current?.id === accountId && store.getDataGeneration() === generation;

    setIsSyncing(true);
    setLastError(null);
    try {
      const result = await engine.sync();
      if (result && isCurrentAccount()) {
        setLastSyncAt(result.lastSyncedAt);
        setLastSyncResult(result);
      }
      return result;
    } catch (error) {
      if (isCurrentAccount()) {
        setLastError(toError(error));
      }
      return null;
    } finally {
      if (isCurrentAccount()) {
        setIsSyncing(false);
      }
    }
  }, [engine, store]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected && userRef.current) {
        void sync();
      }
    });
    return unsubscribe;
  }, [sync]);

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
