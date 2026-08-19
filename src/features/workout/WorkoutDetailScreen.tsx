import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { getLocalDb, type WorkoutLocalRow } from '../../shared/db/database';
import { Button } from '../../shared/ui/Button';
import { Card } from '../../shared/ui/Card';
import { ErrorText } from '../../shared/ui/ErrorText';
import { ScreenContainer } from '../../shared/ui/ScreenContainer';
import { useTheme } from '../../shared/ui/ThemeProvider';
import { formatDuration, type HistorySet } from './workoutHistoryModel';

export interface WorkoutDetailScreenProps {
  workoutId: string;
  onGoBack?: () => void;
}

export function WorkoutDetailScreen({ workoutId, onGoBack }: WorkoutDetailScreenProps) {
  const theme = useTheme();
  const [workout] = useState<WorkoutLocalRow | null>(() =>
    getLocalDb().getWorkout(workoutId),
  );

  if (!workout) {
    return (
      <ScreenContainer>
        <ErrorText testID="workoutDetail.notFound">Workout not found</ErrorText>
        {onGoBack ? (
          <Button testID="workoutDetail.back" title="Go back" variant="ghost" onPress={onGoBack} />
        ) : null}
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
  const startedAt = new Date(workout.started_at);

  return (
    <ScreenContainer>
      {onGoBack ? (
        <Button testID="workoutDetail.back" title="Back to history" variant="ghost" onPress={onGoBack} />
      ) : null}

      <Text style={[styles.title, { color: theme.text }]}>{templateName}</Text>
      <Text style={[styles.subtitle, { color: theme.subtext0 }]}>
        {startedAt.toLocaleDateString(undefined, {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        })}{' '}
        · {formatDuration(workout)}
      </Text>

      {workout.notes ? (
        <Card testID="workoutDetail.notes" style={styles.notesCard}>
          <Text style={[styles.notesLabel, { color: theme.subtext0 }]}>Notes</Text>
          <Text style={[styles.notesText, { color: theme.text }]}>{workout.notes}</Text>
        </Card>
      ) : null}

      {exercises.map((exercise) => {
        const sets = (exercise.sets ?? []) as HistorySet[];
        const totalVolume = sets.reduce((total, set) => total + set.weight_kg * set.reps, 0);
        return (
          <Card key={exercise.id} testID={`workoutDetail.exercise.${exercise.id}`} style={styles.exerciseCard}>
            <View style={styles.exerciseHeader}>
              <Text style={[styles.exerciseName, { color: theme.text }]}>
                {exerciseNames.get(exercise.exercise_id) ?? exercise.exercise_id}
              </Text>
              <Text style={[styles.exerciseMeta, { color: theme.subtext0 }]}>
                {sets.length} {sets.length === 1 ? 'set' : 'sets'} · {totalVolume} kg
              </Text>
            </View>

            {sets.length === 0 ? (
              <Text style={[styles.noSets, { color: theme.subtext0 }]}>No sets logged</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.setsRow}>
                {sets.map((set) => (
                  <View
                    key={set.id}
                    testID={`workoutDetail.exercise.${exercise.id}.set.${set.id}`}
                    style={[
                      styles.setChip,
                      { borderColor: set.is_pr ? theme.green : theme.surface1 },
                    ]}
                  >
                    <Text style={[styles.setWeight, { color: set.is_pr ? theme.green : theme.text }]}>
                      {set.weight_kg} kg × {set.reps}
                    </Text>
                    {set.rpe != null ? (
                      <Text style={[styles.setMeta, { color: theme.subtext0 }]}>RPE {set.rpe}</Text>
                    ) : null}
                    {set.estimated_1rm != null ? (
                      <Text style={[styles.setMeta, { color: theme.subtext0 }]}>
                        e1RM {Math.round(set.estimated_1rm)}
                      </Text>
                    ) : null}
                    {set.is_warmup ? (
                      <Text style={[styles.setMeta, { color: theme.subtext0 }]}>warmup</Text>
                    ) : null}
                  </View>
                ))}
              </ScrollView>
            )}
          </Card>
        );
      })}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginTop: 8,
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 16,
    marginTop: 4,
  },
  notesCard: {
    marginBottom: 12,
  },
  notesLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  notesText: {
    fontSize: 15,
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
  exerciseMeta: {
    fontSize: 13,
  },
  noSets: {
    fontSize: 14,
  },
  setsRow: {
    flexGrow: 0,
  },
  setChip: {
    borderRadius: 12,
    borderWidth: 1,
    marginRight: 8,
    minWidth: 88,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  setWeight: {
    fontSize: 14,
    fontWeight: '700',
  },
  setMeta: {
    fontSize: 12,
    marginTop: 2,
  },
});
