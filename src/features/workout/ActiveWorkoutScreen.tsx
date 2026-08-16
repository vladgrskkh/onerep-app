import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import type { LogSetRequest, Workout } from '../../shared/api/gym';
import { gymApi } from '../../shared/api/gym';
import { getLocalDb, type Operation, type WorkoutLocalRow } from '../../shared/db/database';
import { newId } from '../../shared/db/ids';
import { useSync } from '../../shared/sync/useSync';
import { Button } from '../../shared/ui/Button';
import { Card } from '../../shared/ui/Card';
import { ErrorText } from '../../shared/ui/ErrorText';
import { ScreenContainer } from '../../shared/ui/ScreenContainer';
import { AppTextInput } from '../../shared/ui/TextInput';
import { useTheme } from '../../shared/ui/ThemeProvider';
import { getUserMessage } from '../auth/AuthContext';
import {
  appendSet,
  appendWorkoutExercise,
  nextSetNumber,
  type WorkoutSetWithPr,
} from './workoutModel';

export interface ActiveWorkoutScreenProps {
  workoutId: string;
  onWorkoutFinished?: (workout: Workout) => void;
}

interface LogForm {
  exerciseId: string | null;
  weight: string;
  reps: string;
  rpe: string;
  rest: string;
  isWarmup: boolean;
}

const EMPTY_FORM: LogForm = {
  exerciseId: null,
  weight: '',
  reps: '',
  rpe: '',
  rest: '',
  isWarmup: false,
};

function formatRest(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function PrBadge() {
  const theme = useTheme();
  const [scale] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const animation = Animated.sequence([
      Animated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: true }),
      Animated.delay(1200),
      Animated.timing(scale, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [scale]);

  return (
    <Animated.View
      testID="workout.prBadge"
      style={[
        styles.prBadge,
        {
          backgroundColor: theme.green,
          opacity: scale,
          transform: [{ scale }],
        },
      ]}
    >
      <Text style={[styles.prBadgeLabel, { color: theme.base }]}>PR!</Text>
    </Animated.View>
  );
}

function resolveWorkoutRow(workoutId: string): WorkoutLocalRow | null {
  // workoutId is the client-generated uuid in the start-from-template flow,
  // which doubles as the row's client_id both before and after the push
  // re-key. Server ids (history navigation) have no client_id entry and fall
  // through to the id lookup.
  return getLocalDb().findWorkoutByClientID(workoutId) ?? getLocalDb().getWorkout(workoutId);
}

export function ActiveWorkoutScreen({ workoutId, onWorkoutFinished }: ActiveWorkoutScreenProps) {
  const theme = useTheme();
  const { sync, lastSyncAt } = useSync();
  const [workout, setWorkout] = useState<WorkoutLocalRow | null>(() =>
    resolveWorkoutRow(workoutId),
  );
  // Stable handle across the markSynced re-key: on local create client_id ==
  // the generated id, and the db layer carries it onto the pushed row (whose
  // id and timestamps are server-assigned).
  const clientIdRef = useRef<string | null>(
    workout ? (workout.client_id ?? (workout.is_dirty === 1 ? workout.id : null)) : null,
  );
  const [logForm, setLogForm] = useState<LogForm>(EMPTY_FORM);
  const [restRemaining, setRestRemaining] = useState<number | null>(null);
  const [lastPr, setLastPr] = useState<WorkoutSetWithPr | null>(null);
  const [addingExercise, setAddingExercise] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [logging, setLogging] = useState(false);

  // Re-reads the row fresh from SQLite. Handlers always operate on the fresh
  // row so a set log can never re-insert a dirty create for a workout the
  // sync engine already pushed (which would duplicate it on the server).
  const resolveCurrent = useCallback((): WorkoutLocalRow | null => {
    const clientId = clientIdRef.current;
    const row = clientId
      ? (getLocalDb().findWorkoutByClientID(clientId) ?? getLocalDb().getWorkout(workoutId))
      : getLocalDb().getWorkout(workoutId);
    if (row) {
      clientIdRef.current = row.client_id ?? (row.is_dirty === 1 ? row.id : null);
    }
    return row;
  }, [workoutId]);

  const reload = useCallback(() => {
    const row = resolveCurrent();
    if (row) {
      setWorkout(row);
    }
  }, [resolveCurrent]);

  useEffect(() => {
    if (lastSyncAt === null) {
      return;
    }
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) {
        reload();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [lastSyncAt, reload]);

  const ticking = restRemaining !== null && restRemaining > 0;
  useEffect(() => {
    if (!ticking) {
      return;
    }
    const timer = setInterval(() => {
      setRestRemaining((previous) => {
        if (previous === null || previous <= 0) {
          return previous;
        }
        const next = previous - 1;
        if (next === 0) {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [ticking]);

  if (!workout) {
    return (
      <ScreenContainer>
        <ErrorText testID="activeWorkout.notFound">Workout not found</ErrorText>
      </ScreenContainer>
    );
  }

  const exerciseNames = new Map(
    getLocalDb()
      .getExercises()
      .map((exercise) => [exercise.id, exercise.name]),
  );
  const templateName = workout.template_id
    ? (getLocalDb().getTemplate(workout.template_id)?.name ?? 'Workout')
    : 'Workout';
  const exercises = workout.exercises ?? [];

  const persist = (current: WorkoutLocalRow, next: Workout, dirty: boolean, operation: Operation | null) => {
    const local: WorkoutLocalRow = {
      ...next,
      client_id: current.client_id,
      is_dirty: dirty ? 1 : 0,
      operation: dirty ? operation : null,
      last_synced_at: current.last_synced_at,
    };
    getLocalDb().upsertWorkout(next, {
      is_dirty: local.is_dirty,
      operation: local.operation ?? undefined,
      client_id: current.client_id,
    });
    clientIdRef.current = local.client_id ?? (local.is_dirty === 1 ? local.id : null);
    setWorkout(local);
  };

  const openLogForm = (exerciseId: string) => setLogForm({ ...EMPTY_FORM, exerciseId });

  const submitSet = async () => {
    const exerciseId = logForm.exerciseId;
    if (!exerciseId) {
      return;
    }
    const weight = parseFloat(logForm.weight);
    const reps = parseInt(logForm.reps, 10);
    if (!Number.isFinite(weight) || weight <= 0 || !Number.isFinite(reps) || reps < 1) {
      setError('Enter a valid weight and reps');
      return;
    }
    setError(null);
    setLogging(true);
    try {
      const current = resolveCurrent();
      if (!current) {
        setError('Workout not found');
        return;
      }
      const request: LogSetRequest = {
        weight_kg: weight,
        reps,
        rpe: logForm.rpe ? parseFloat(logForm.rpe) : undefined,
        rest_seconds: logForm.rest ? parseInt(logForm.rest, 10) : undefined,
        is_warmup: logForm.isWarmup,
      };
      const pendingSet: WorkoutSetWithPr = {
        id: newId(),
        set_number: nextSetNumber(current.exercises?.find((e) => e.id === exerciseId)?.sets),
        weight_kg: request.weight_kg,
        reps: request.reps,
        rpe: request.rpe,
        rest_seconds: request.rest_seconds,
        is_warmup: request.is_warmup ?? false,
      };

      let saved: WorkoutSetWithPr;
      if (current.is_dirty === 1) {
        // Pending create: the sync engine replays start + addExercise + every
        // set against the API, and the server computes PRs during that push.
        saved = pendingSet;
        persist(current, appendSet(current, exerciseId, saved), true, current.operation ?? 'create');
      } else {
        try {
          const result = await gymApi.workouts.logSet(current.id, exerciseId, request);
          saved = result;
          persist(current, appendSet(current, exerciseId, result), false, null);
        } catch (postError) {
          // Offline: keep the set locally and mark the row dirty. Note: the
          // sync engine has no workout update push yet, so this set stays
          // local until that lands.
          saved = pendingSet;
          persist(current, appendSet(current, exerciseId, pendingSet), true, 'update');
          setError(
            `Set saved locally (sync pending): ${getUserMessage(
              postError,
              'requires a connection',
            )}`,
          );
        }
      }

      if (saved.is_pr) {
        setLastPr(saved);
      }
      if (request.rest_seconds && request.rest_seconds > 0) {
        setRestRemaining(request.rest_seconds);
      }
      setLogForm(EMPTY_FORM);
      void sync();
    } finally {
      setLogging(false);
    }
  };

  const addExercise = async (exerciseId: string) => {
    setError(null);
    const current = resolveCurrent();
    if (!current) {
      setError('Workout not found');
      return;
    }
    const { workout: next, workoutExercise } = appendWorkoutExercise(current, exerciseId);
    if (current.is_dirty === 1) {
      persist(current, next, true, current.operation ?? 'create');
    } else {
      try {
        const serverExercise = await gymApi.workouts.addExercise(current.id, { exercise_id: exerciseId });
        persist(
          current,
          {
            ...next,
            exercises: (next.exercises ?? []).map((item) =>
              item.id === workoutExercise.id ? serverExercise : item,
            ),
          },
          false,
          null,
        );
      } catch (addError) {
        persist(current, next, true, 'update');
        setError(getUserMessage(addError, 'Saved locally; will sync when possible'));
      }
    }
    setAddSearch('');
    setAddingExercise(false);
    void sync();
  };

  const finishWorkout = async () => {
    setFinishing(true);
    setError(null);
    try {
      const current = resolveCurrent();
      if (!current) {
        setError('Workout not found');
        return;
      }
      const finished = await gymApi.workouts.finish(current.id);
      getLocalDb().upsertRemote('workouts', finished);
      onWorkoutFinished?.(finished);
    } catch (finishError) {
      // Offline: record the finish locally. Note: no workout update push in
      // the sync engine yet, so the finished_at won't reach the server until
      // that lands.
      const current = resolveCurrent();
      if (current) {
        const finished = { ...current, finished_at: new Date().toISOString() };
        persist(current, finished, current.is_dirty === 1, current.operation ?? 'update');
        onWorkoutFinished?.(finished);
      }
      setError(getUserMessage(finishError, 'Finish saved locally; will sync when possible'));
    } finally {
      setFinishing(false);
    }
  };

  const addedExerciseIds = new Set(exercises.map((item) => item.exercise_id));
  const addResults = getLocalDb()
    .getExercises()
    .filter((exercise) => !addedExerciseIds.has(exercise.id))
    .filter(
      (exercise) =>
        addSearch.trim() === '' ||
        exercise.name.toLowerCase().includes(addSearch.trim().toLowerCase()),
    )
    .slice(0, 10);

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: theme.text }]}>{templateName}</Text>
          <Text style={[styles.subtitle, { color: theme.subtext0 }]}>
            {exercises.length} {exercises.length === 1 ? 'exercise' : 'exercises'}
          </Text>
        </View>
        {restRemaining !== null && restRemaining > 0 ? (
          <View testID="workout.restTimer" style={[styles.restPill, { backgroundColor: theme.sky }]}>
            <Text testID="workout.restTimerLabel" style={[styles.restPillLabel, { color: theme.base }]}>
              Rest {formatRest(restRemaining ?? 0)}
            </Text>
          </View>
        ) : null}
      </View>

      {error ? <ErrorText testID="activeWorkout.error">{error}</ErrorText> : null}
      {lastPr ? <PrBadge key={lastPr.id} /> : null}

      {exercises.map((exercise) => {
        const sets = exercise.sets ?? [];
        const isLogging = logForm.exerciseId === exercise.id;
        return (
          <Card key={exercise.id} testID={`workout.exercise.${exercise.id}`} style={styles.exerciseCard}>
            <View style={styles.exerciseHeader}>
              <Text style={[styles.exerciseName, { color: theme.text }]}>
                {exerciseNames.get(exercise.exercise_id) ?? exercise.exercise_id}
              </Text>
              <Text testID={`workout.nextSet.${exercise.id}`} style={[styles.nextSet, { color: theme.subtext0 }]}>
                Next: set {nextSetNumber(sets)}
              </Text>
            </View>

            {sets.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.setRow}>
                {sets.map((set) => (
                  <View
                    key={set.id}
                    testID={`workout.exercise.${exercise.id}.set.${set.id}`}
                    style={[
                      styles.setChip,
                      {
                        borderColor: (set as WorkoutSetWithPr).is_pr ? theme.green : theme.surface1,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.setChipLabel,
                        { color: (set as WorkoutSetWithPr).is_pr ? theme.green : theme.text },
                      ]}
                    >
                      {set.weight_kg}×{set.reps}
                      {set.is_warmup ? ' · warmup' : ''}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            ) : null}

            {isLogging ? (
              <View style={styles.logForm}>
                <View style={styles.logRow}>
                  <AppTextInput
                    testID="workout.logWeight"
                    label="Weight (kg)"
                    value={logForm.weight}
                    onChangeText={(value) => setLogForm({ ...logForm, weight: value })}
                    keyboardType="decimal-pad"
                    style={styles.logField}
                  />
                  <AppTextInput
                    testID="workout.logReps"
                    label="Reps"
                    value={logForm.reps}
                    onChangeText={(value) => setLogForm({ ...logForm, reps: value })}
                    keyboardType="number-pad"
                    style={styles.logField}
                  />
                </View>
                <View style={styles.logRow}>
                  <AppTextInput
                    testID="workout.logRpe"
                    label="RPE (1-10)"
                    value={logForm.rpe}
                    onChangeText={(value) => setLogForm({ ...logForm, rpe: value })}
                    keyboardType="decimal-pad"
                    style={styles.logField}
                  />
                  <AppTextInput
                    testID="workout.logRest"
                    label="Rest (sec)"
                    value={logForm.rest}
                    onChangeText={(value) => setLogForm({ ...logForm, rest: value })}
                    keyboardType="number-pad"
                    style={styles.logField}
                  />
                </View>
                <View style={styles.warmupRow}>
                  <Text style={[styles.warmupLabel, { color: theme.text }]}>Warmup set</Text>
                  <Switch
                    testID="workout.logWarmup"
                    value={logForm.isWarmup}
                    onValueChange={(value) => setLogForm({ ...logForm, isWarmup: value })}
                    trackColor={{ false: theme.surface1, true: theme.mauve }}
                    thumbColor={theme.text}
                  />
                </View>
                <View style={styles.logActions}>
                  <Button
                    testID="workout.submitSet"
                    title="Log set"
                    loading={logging}
                    disabled={logging}
                    onPress={submitSet}
                  />
                  <Button
                    testID="workout.cancelSet"
                    title="Cancel"
                    variant="ghost"
                    onPress={() => setLogForm(EMPTY_FORM)}
                  />
                </View>
              </View>
            ) : (
              <Button
                testID={`workout.logSet.${exercise.id}`}
                title="LOG SET"
                onPress={() => openLogForm(exercise.id)}
                style={styles.logSetButton}
              />
            )}
          </Card>
        );
      })}

      {addingExercise ? (
        <View style={styles.addSection}>
          <AppTextInput
            testID="workout.addSearch"
            placeholder="Search exercises"
            value={addSearch}
            onChangeText={setAddSearch}
            autoCapitalize="none"
          />
          {addResults.map((exercise) => (
            <Pressable
              key={exercise.id}
              testID={`workout.addExercise.${exercise.id}`}
              accessibilityRole="button"
              onPress={() => void addExercise(exercise.id)}
            >
              <Card style={styles.addRow}>
                <Text style={[styles.addName, { color: theme.text }]}>{exercise.name}</Text>
                <Text style={[styles.addAction, { color: theme.mauve }]}>+ Add</Text>
              </Card>
            </Pressable>
          ))}
          <Button
            testID="workout.cancelAdd"
            title="Close"
            variant="ghost"
            onPress={() => setAddingExercise(false)}
          />
        </View>
      ) : (
        <Button
          testID="workout.addExercise"
          title="Add exercise"
          variant="ghost"
          onPress={() => setAddingExercise(true)}
        />
      )}

      <Button
        testID="workout.finish"
        title="Finish workout"
        variant="destructive"
        loading={finishing}
        disabled={finishing}
        onPress={finishWorkout}
        style={styles.finish}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  restPill: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  restPillLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  prBadge: {
    alignSelf: 'flex-start',
    borderRadius: 12,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  prBadgeLabel: {
    fontSize: 14,
    fontWeight: '800',
  },
  exerciseCard: {
    marginBottom: 12,
  },
  exerciseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  exerciseName: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
  },
  nextSet: {
    fontSize: 13,
  },
  setRow: {
    flexGrow: 0,
    marginBottom: 12,
  },
  setChip: {
    borderRadius: 12,
    borderWidth: 1,
    marginRight: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  setChipLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  logForm: {
    marginTop: 4,
  },
  logRow: {
    flexDirection: 'row',
    gap: 12,
  },
  logField: {
    flex: 1,
  },
  warmupRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  warmupLabel: {
    fontSize: 15,
  },
  logActions: {
    flexDirection: 'row',
    gap: 8,
  },
  logSetButton: {
    marginTop: 4,
  },
  addSection: {
    marginTop: 4,
  },
  addRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  addName: {
    fontSize: 15,
  },
  addAction: {
    fontSize: 14,
    fontWeight: '600',
  },
  finish: {
    marginTop: 16,
  },
});
