import { useCallback, useEffect, useState } from 'react';

import { getLocalDb, type WorkoutLocalRow } from '../../shared/db/database';
import { useSync } from '../../shared/sync/useSync';
import { ActiveWorkoutScreen } from './ActiveWorkoutScreen';
import { WorkoutDetailScreen } from './WorkoutDetailScreen';
import { WorkoutListScreen } from './WorkoutListScreen';

export interface WorkoutTabProps {
  // Route param set when a workout is started from the Programs tab. The id
  // is the client-generated uuid, stable before and after the push re-key.
  activeWorkoutId?: string;
  onClearActiveWorkout?: () => void;
}

export function findActiveWorkout(): WorkoutLocalRow | null {
  const rows = getLocalDb().getWorkouts();
  return rows.find((row) => row.finished_at == null) ?? null;
}

function resolveWorkoutRow(workoutId: string): WorkoutLocalRow | null {
  return getLocalDb().findWorkoutByClientID(workoutId) ?? getLocalDb().getWorkout(workoutId);
}

// The Workout tab: shows the active workout when one exists (no finished_at),
// otherwise the workout history list with an in-tab detail view.
export function WorkoutTab({ activeWorkoutId, onClearActiveWorkout }: WorkoutTabProps) {
  const { lastSyncAt } = useSync();
  const [active, setActive] = useState<WorkoutLocalRow | null>(() =>
    activeWorkoutId ? resolveWorkoutRow(activeWorkoutId) : findActiveWorkout(),
  );
  const [detailWorkoutId, setDetailWorkoutId] = useState<string | null>(null);

  useEffect(() => {
    if (!activeWorkoutId) {
      return;
    }
    const row = resolveWorkoutRow(activeWorkoutId);
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled && row) {
        setActive(row);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [activeWorkoutId]);

  // After a background sync the finished state may have changed (e.g. the
  // finish patch was pushed), so re-detect the active workout.
  useEffect(() => {
    if (lastSyncAt === null) {
      return;
    }
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) {
        setActive(findActiveWorkout());
      }
    });
    return () => {
      cancelled = true;
    };
  }, [lastSyncAt]);

  const finishWorkout = useCallback(() => {
    setActive(null);
    onClearActiveWorkout?.();
  }, [onClearActiveWorkout]);

  if (active) {
    const workoutId = activeWorkoutId ?? active.client_id ?? active.id;
    return <ActiveWorkoutScreen workoutId={workoutId} onWorkoutFinished={finishWorkout} />;
  }

  if (detailWorkoutId) {
    return (
      <WorkoutDetailScreen
        workoutId={detailWorkoutId}
        onGoBack={() => setDetailWorkoutId(null)}
      />
    );
  }

  return <WorkoutListScreen onSelectWorkout={(workout) => setDetailWorkoutId(workout.id)} />;
}
