import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { BodyWeightEntry, OneRMEntry, VolumeEntry } from '../../shared/api/gym';
import { gymApi } from '../../shared/api/gym';
import { ApiError } from '../../shared/api/client';
import { getLocalDb, type ExerciseLocalRow } from '../../shared/db/database';
import { newId } from '../../shared/db/ids';
import { muscleGroupName } from '../../shared/db/muscleGroups';
import { useSync } from '../../shared/sync/useSync';
import { Button } from '../../shared/ui/Button';
import { Card } from '../../shared/ui/Card';
import { ErrorText } from '../../shared/ui/ErrorText';
import { ScreenContainer } from '../../shared/ui/ScreenContainer';
import { AppTextInput } from '../../shared/ui/TextInput';
import { useTheme } from '../../shared/ui/ThemeProvider';
import { getUserMessage } from '../auth/AuthContext';
import { BarChart, LineChart, type ChartPoint } from './charts';

// Progress data flow: the sync engine only syncs exercises/templates/workouts/
// body_weights. Server-computed progress payloads (1RM, volume) are fetched
// here on demand and cached in the local progress_cache table so offline
// opens still render the last known data. Body weight uses the synced
// body_weights table (offline logs become dirty create ops and push later).

const VOLUME_WEEKS = 8;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function readCached<T>(key: string): T | null {
  const raw = getLocalDb().getProgressCache(key);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function startOfWeek(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  const day = copy.getDay() || 7;
  copy.setDate(copy.getDate() - day + 1);
  return copy;
}

function weeksAgo(weeks: number): string {
  return new Date(Date.now() - weeks * WEEK_MS).toISOString();
}

export interface WeeklyVolumeGroup {
  muscleGroupId: number;
  label: string;
  points: ChartPoint[];
}

export interface WeeklyVolumeData {
  total: ChartPoint[];
  byMuscleGroup: WeeklyVolumeGroup[];
}

function buildWeeklyPoints(buckets: Map<number, number>, now: number): ChartPoint[] {
  const points: ChartPoint[] = [];
  for (let week = VOLUME_WEEKS - 1; week >= 0; week -= 1) {
    const weekStart = now - week * WEEK_MS;
    points.push({
      value: buckets.get(weekStart) ?? 0,
      label: new Date(weekStart).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    });
  }
  return points;
}

export function buildWeeklyVolume(entries: VolumeEntry[]): WeeklyVolumeData {
  if (entries.length === 0) {
    return { total: [], byMuscleGroup: [] };
  }

  const totalBuckets = new Map<number, number>();
  const groupBuckets = new Map<number, Map<number, number>>();
  for (const entry of entries) {
    const weekStart = startOfWeek(new Date(entry.date)).getTime();
    totalBuckets.set(weekStart, (totalBuckets.get(weekStart) ?? 0) + entry.total_kg);
    const buckets = groupBuckets.get(entry.muscle_group_id) ?? new Map<number, number>();
    buckets.set(weekStart, (buckets.get(weekStart) ?? 0) + entry.total_kg);
    groupBuckets.set(entry.muscle_group_id, buckets);
  }
  const now = startOfWeek(new Date()).getTime();
  return {
    total: buildWeeklyPoints(totalBuckets, now),
    byMuscleGroup: [...groupBuckets.entries()]
      .sort(([firstId], [secondId]) => firstId - secondId)
      .map(([muscleGroupId, buckets]) => ({
        muscleGroupId,
        label: muscleGroupName(muscleGroupId),
        points: buildWeeklyPoints(buckets, now),
      })),
  };
}

export function to1rmPoints(entries: OneRMEntry[]): ChartPoint[] {
  return [...entries]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((entry) => ({
      value: entry.estimated_1rm,
      label: new Date(entry.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    }));
}

function sortByMeasuredAt(entries: BodyWeightEntry[]): BodyWeightEntry[] {
  return [...entries].sort((a, b) => b.measured_at.localeCompare(a.measured_at));
}

function isNetworkFailure(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 0 &&
    ['NETWORK', 'NETWORK_ERROR', 'TIMEOUT'].includes(error.code)
  );
}

export function AnalyticsScreen() {
  const theme = useTheme();
  const { sync, isSyncing, lastSyncAt } = useSync();

  const [exercises, setExercises] = useState<ExerciseLocalRow[]>(() => getLocalDb().getExercises());
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(
    () => getLocalDb().getExercises()[0]?.id ?? null,
  );
  const [oneRm, setOneRm] = useState<OneRMEntry[]>([]);
  const [volume, setVolume] = useState<VolumeEntry[]>([]);
  const [bodyWeights, setBodyWeights] = useState<BodyWeightEntry[]>(() =>
    sortByMeasuredAt(getLocalDb().getBodyWeights()),
  );
  const [refreshing, setRefreshing] = useState(false);
  const [oneRmError, setOneRmError] = useState<string | null>(null);
  const [volumeError, setVolumeError] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [weightDraft, setWeightDraft] = useState('');
  const [logging, setLogging] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);

  const loadOneRm = useCallback(async (exerciseId: string | null) => {
    if (!exerciseId) {
      setOneRm([]);
      return;
    }
    const db = getLocalDb();
    const generation = db.getDataGeneration();
    const cached = readCached<OneRMEntry[]>(`progress:1rm:${exerciseId}`);
    if (cached) {
      setOneRm(cached);
    }
    try {
      const entries = await gymApi.progress.get1rm({ exercise_id: exerciseId, from: weeksAgo(12) });
      if (db.getDataGeneration() !== generation) {
        return;
      }
      setOneRm(entries);
      setOneRmError(null);
      db.setProgressCache(`progress:1rm:${exerciseId}`, JSON.stringify(entries));
    } catch (error) {
      if (db.getDataGeneration() !== generation) {
        return;
      }
      setOneRmError(getUserMessage(error, 'Could not load 1RM history'));
    }
  }, []);

  const loadVolume = useCallback(async () => {
    const db = getLocalDb();
    const generation = db.getDataGeneration();
    const cached = readCached<VolumeEntry[]>('progress:volume');
    if (cached) {
      setVolume(cached);
    }
    try {
      const entries = await gymApi.progress.getVolume({ from: weeksAgo(VOLUME_WEEKS) });
      if (db.getDataGeneration() !== generation) {
        return;
      }
      setVolume(entries);
      setVolumeError(null);
      db.setProgressCache('progress:volume', JSON.stringify(entries));
    } catch (error) {
      if (db.getDataGeneration() !== generation) {
        return;
      }
      setVolumeError(getUserMessage(error, 'Could not load weekly volume'));
    }
  }, []);

  const refresh = useCallback(async () => {
    const db = getLocalDb();
    const generation = db.getDataGeneration();
    setRefreshing(true);
    try {
      await sync();
      if (db.getDataGeneration() !== generation) {
        return;
      }
      setExercises(db.getExercises());
      setBodyWeights(sortByMeasuredAt(db.getBodyWeights()));
      await Promise.all([loadOneRm(selectedExerciseId), loadVolume()]);
    } finally {
      setRefreshing(false);
    }
  }, [sync, loadOneRm, loadVolume, selectedExerciseId]);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(async () => {
      if (!cancelled) {
        await loadOneRm(selectedExerciseId);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selectedExerciseId, loadOneRm]);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(async () => {
      if (!cancelled) {
        await loadVolume();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [loadVolume]);

  // Re-read the synced body weight rows after a background sync lands.
  useEffect(() => {
    if (lastSyncAt === null) {
      return;
    }
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) {
        setBodyWeights(sortByMeasuredAt(getLocalDb().getBodyWeights()));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [lastSyncAt]);

  const submitWeight = async () => {
    const weight = parseFloat(weightDraft);
    if (!Number.isFinite(weight) || weight <= 0) {
      setLogError('Enter a valid weight in kg');
      return;
    }
    setLogging(true);
    setLogError(null);
    const measuredAt = new Date().toISOString();
    const db = getLocalDb();
    const generation = db.getDataGeneration();
    try {
      const entry = await gymApi.progress.logBodyWeight({ weight_kg: weight, measured_at: measuredAt });
      if (db.getDataGeneration() !== generation) {
        return;
      }
      db.upsertRemote('body_weights', entry);
      setBodyWeights(sortByMeasuredAt(db.getBodyWeights()));
      setWeightDraft('');
      setLogOpen(false);
    } catch (error) {
      if (db.getDataGeneration() !== generation) {
        return;
      }
      if (!isNetworkFailure(error)) {
        setLogError(getUserMessage(error, 'Could not save body weight'));
        return;
      }
      // Offline: store locally with a create op; the sync engine pushes it
      // through the body_weights adapter when connectivity returns.
      const local: BodyWeightEntry = {
        id: newId(),
        weight_kg: weight,
        measured_at: measuredAt,
        created_at: measuredAt,
      };
      db.upsertBodyWeight(local, { is_dirty: 1, operation: 'create' });
      setBodyWeights(sortByMeasuredAt(db.getBodyWeights()));
      setWeightDraft('');
      setLogOpen(false);
      setLogError(getUserMessage(error, 'Saved locally; will sync when possible'));
    } finally {
      setLogging(false);
    }
  };

  const selectedName =
    exercises.find((exercise) => exercise.id === selectedExerciseId)?.name ?? 'Exercise';

  const latestWeight = bodyWeights[0] ?? null;
  const weeklyVolume = buildWeeklyVolume(volume);
  const weightPoints: ChartPoint[] = sortByMeasuredAt(bodyWeights)
    .reverse()
    .map((entry) => ({
      value: entry.weight_kg,
      label: new Date(entry.measured_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    }));

  return (
    <ScreenContainer>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing || isSyncing} onRefresh={() => void refresh()} />
        }
      >
        <Text style={[styles.title, { color: theme.text }]}>Analytics</Text>

        <Card testID="analytics.1rmCard">
          <Text style={[styles.cardTitle, { color: theme.text }]}>Estimated 1RM</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selector}>
            {exercises.map((exercise) => {
              const selected = exercise.id === selectedExerciseId;
              return (
                <Pressable
                  key={exercise.id}
                  testID={`analytics.exerciseChip.${exercise.id}`}
                  accessibilityRole="button"
                  onPress={() => setSelectedExerciseId(exercise.id)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: selected ? theme.mauve : theme.surface0,
                      borderColor: selected ? theme.mauve : theme.surface1,
                    },
                  ]}
                >
                  <Text
                    numberOfLines={1}
                    style={[styles.chipLabel, { color: selected ? theme.base : theme.text }]}
                  >
                    {exercise.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {oneRm.length > 0 ? (
            <>
              <LineChart testID="analytics.1rmChart" points={to1rmPoints(oneRm)} />
              <Text style={[styles.hint, { color: theme.subtext0 }]}>
                Latest e1RM {Math.round(to1rmPoints(oneRm)[to1rmPoints(oneRm).length - 1].value)} kg ·{' '}
                {selectedName}
              </Text>
            </>
          ) : (
            <Text testID="analytics.1rmEmpty" style={[styles.empty, { color: theme.subtext0 }]}>
              No sets logged for {selectedName} yet
            </Text>
          )}
          {oneRmError ? <ErrorText testID="analytics.1rmError">{oneRmError}</ErrorText> : null}
        </Card>

        <Card testID="analytics.volumeCard" style={styles.spacedCard}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Weekly volume</Text>
          <BarChart testID="analytics.volumeChart" bars={weeklyVolume.total} />
          <Text style={[styles.hint, { color: theme.subtext0 }]}>
            Total kg per week, last {VOLUME_WEEKS} weeks
          </Text>
          {weeklyVolume.byMuscleGroup.length > 0 ? (
            <>
              <Text style={[styles.breakdownTitle, { color: theme.text }]}>By muscle group</Text>
              {weeklyVolume.byMuscleGroup.map((group, index) => (
                <View
                  key={group.muscleGroupId}
                  testID={`analytics.volumeGroup.${group.muscleGroupId}`}
                  style={[styles.volumeGroup, { borderTopColor: theme.surface0 }]}
                >
                  <Text
                    testID={`analytics.volumeGroupLabel.${group.muscleGroupId}`}
                    style={[styles.groupLabel, { color: theme.subtext0 }]}
                  >
                    {group.label}
                  </Text>
                  <BarChart
                    testID={`analytics.volumeGroupChart.${group.muscleGroupId}`}
                    bars={group.points}
                    color={
                      [theme.blue, theme.mauve, theme.teal, theme.peach, theme.green, theme.lavender][
                        index % 6
                      ]
                    }
                  />
                </View>
              ))}
            </>
          ) : null}
          {volumeError ? <ErrorText testID="analytics.volumeError">{volumeError}</ErrorText> : null}
        </Card>

        <Card testID="analytics.weightCard" style={styles.spacedCard}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Body weight</Text>
          {latestWeight ? (
            <>
              <View style={styles.weightRow}>
                <Text testID="analytics.weightValue" style={[styles.weightValue, { color: theme.text }]}>
                  {latestWeight.weight_kg} kg
                </Text>
                <Text style={[styles.weightDate, { color: theme.subtext0 }]}>
                  {new Date(latestWeight.measured_at).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })}
                </Text>
              </View>
              {weightPoints.length > 1 ? (
                <LineChart testID="analytics.weightChart" points={weightPoints} height={100} />
              ) : null}
            </>
          ) : (
            <Text testID="analytics.weightEmpty" style={[styles.empty, { color: theme.subtext0 }]}>
              No weight logged yet
            </Text>
          )}

          {logOpen ? (
            <View style={styles.logForm}>
              <AppTextInput
                testID="analytics.weightInput"
                label="Weight (kg)"
                value={weightDraft}
                onChangeText={setWeightDraft}
                keyboardType="decimal-pad"
              />
              <View style={styles.logActions}>
                <Button
                  testID="analytics.weightSubmit"
                  title="Save"
                  loading={logging}
                  disabled={logging}
                  onPress={() => void submitWeight()}
                />
                <Button
                  testID="analytics.weightCancel"
                  title="Cancel"
                  variant="ghost"
                  onPress={() => {
                    setLogOpen(false);
                    setLogError(null);
                  }}
                />
              </View>
            </View>
          ) : (
            <Button testID="analytics.weightLog" title="LOG" onPress={() => setLogOpen(true)} />
          )}
          {logError ? <ErrorText testID="analytics.weightError">{logError}</ErrorText> : null}
        </Card>

        <Text testID="analytics.moreSources" style={[styles.moreSources, { color: theme.overlay0 }]}>
          More sources coming: steps · sleep · heart rate
        </Text>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  selector: {
    flexGrow: 0,
    marginTop: 12,
  },
  chip: {
    borderRadius: 16,
    borderWidth: 1,
    marginRight: 8,
    maxWidth: 180,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  hint: {
    fontSize: 12,
    marginTop: 8,
  },
  breakdownTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 16,
  },
  volumeGroup: {
    borderTopWidth: 1,
    marginTop: 12,
    paddingTop: 12,
  },
  groupLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  empty: {
    fontSize: 14,
    marginTop: 12,
  },
  spacedCard: {
    marginTop: 16,
  },
  weightRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  weightValue: {
    fontSize: 28,
    fontWeight: '700',
  },
  weightDate: {
    fontSize: 13,
  },
  logForm: {
    marginTop: 12,
  },
  logActions: {
    flexDirection: 'row',
    gap: 8,
  },
  moreSources: {
    fontSize: 13,
    marginTop: 20,
    textAlign: 'center',
  },
});
