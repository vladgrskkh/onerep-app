import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Workout } from '../../shared/api/gym';
import { getLocalDb, type WorkoutLocalRow } from '../../shared/db/database';
import { useSync } from '../../shared/sync/useSync';
import { Card } from '../../shared/ui/Card';
import { ScreenContainer } from '../../shared/ui/ScreenContainer';
import { useTheme } from '../../shared/ui/ThemeProvider';
import { formatDateLabel, formatDuration, workoutExerciseCount } from './workoutHistoryModel';

export interface WorkoutListScreenProps {
  onSelectWorkout?: (workout: Workout) => void;
}

interface WorkoutDay {
  label: string;
  workouts: WorkoutLocalRow[];
}

export function readHistory(): WorkoutLocalRow[] {
  return getLocalDb()
    .getWorkouts()
    .filter((workout) => workout.finished_at != null)
    .sort((a, b) => b.started_at.localeCompare(a.started_at));
}

export function groupByDay(workouts: WorkoutLocalRow[]): WorkoutDay[] {
  const days: WorkoutDay[] = [];
  for (const workout of workouts) {
    const label = formatDateLabel(workout.started_at);
    const day = days[days.length - 1];
    if (day && day.label === label) {
      day.workouts.push(workout);
    } else {
      days.push({ label, workouts: [workout] });
    }
  }
  return days;
}

export function WorkoutListScreen({ onSelectWorkout }: WorkoutListScreenProps) {
  const theme = useTheme();
  const { lastSyncAt } = useSync();
  const [history, setHistory] = useState<WorkoutLocalRow[]>(() => readHistory());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Re-read after a background (connectivity-triggered) sync lands so freshly
  // pulled workouts appear without a manual refresh.
  useEffect(() => {
    if (lastSyncAt === null) {
      return;
    }
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) {
        setHistory(readHistory());
      }
    });
    return () => {
      cancelled = true;
    };
  }, [lastSyncAt]);

  const selectWorkout = useCallback(
    (workout: WorkoutLocalRow) => {
      setSelectedId(workout.id);
      onSelectWorkout?.(workout);
    },
    [onSelectWorkout],
  );

  const days = groupByDay(history);

  if (history.length === 0) {
    return (
      <ScreenContainer>
        <Text style={[styles.title, { color: theme.text }]}>Workout history</Text>
        <Card testID="workoutList.empty" style={styles.emptyCard}>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>No workouts yet</Text>
          <Text style={[styles.emptyHint, { color: theme.subtext0 }]}>
            Start a workout from the Programs tab and it will show up here when you finish it.
          </Text>
        </Card>      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <Text style={[styles.title, { color: theme.text }]}>Workout history</Text>

      {days.map((day) => (
        <View key={day.label} style={styles.daySection}>
          <Text style={[styles.dayLabel, { color: theme.subtext0 }]}>{day.label}</Text>
          {day.workouts.map((workout) => {
            const templateName = workout.template_id
              ? (getLocalDb().getTemplate(workout.template_id)?.name ?? 'Workout')
              : 'Workout';
            const exerciseCount = workoutExerciseCount(workout);
            const selected = workout.id === selectedId;
            return (
              <Pressable
                key={workout.id}
                testID={`workoutList.row.${workout.id}`}
                accessibilityRole="button"
                onPress={() => selectWorkout(workout)}
              >
                <Card
                  testID={`workoutList.card.${workout.id}`}
                  style={[
                    styles.row,
                    selected ? { borderColor: theme.mauve } : null,
                  ]}
                >
                  <View style={styles.rowHeader}>
                    <Text style={[styles.rowTitle, { color: theme.text }]}>{templateName}</Text>
                    <Text style={[styles.rowTime, { color: theme.subtext0 }]}>
                      {new Date(workout.started_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>
                  <View style={styles.rowMeta}>
                    <Text style={[styles.rowMetaText, { color: theme.subtext0 }]}>
                      {exerciseCount} {exerciseCount === 1 ? 'exercise' : 'exercises'}
                    </Text>
                    <Text style={[styles.rowMetaText, { color: theme.subtext0 }]}>
                      {formatDuration(workout)}
                    </Text>
                  </View>
                </Card>
              </Pressable>
            );
          })}
        </View>
      ))}    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 16,
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  emptyHint: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  daySection: {
    marginBottom: 16,
  },
  dayLabel: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  row: {
    marginBottom: 8,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  rowTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  rowTime: {
    fontSize: 13,
  },
  rowMeta: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 4,
  },
  rowMetaText: {
    fontSize: 13,
  },
});
