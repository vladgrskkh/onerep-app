import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Template } from '../../../shared/api/gym';
import { gymApi } from '../../../shared/api/gym';
import { getLocalDb } from '../../../shared/db/database';
import { newId } from '../../../shared/db/ids';
import { useSync } from '../../../shared/sync/useSync';
import { Button } from '../../../shared/ui/Button';
import { Card } from '../../../shared/ui/Card';
import { ErrorText } from '../../../shared/ui/ErrorText';
import { ScreenContainer } from '../../../shared/ui/ScreenContainer';
import { useTheme } from '../../../shared/ui/ThemeProvider';
import { getUserMessage, useAuth } from '../../auth/AuthContext';
import { startWorkoutFromTemplate } from '../../workout/workoutModel';

export interface TemplateDetailScreenProps {
  templateId: string;
  onGoBack?: () => void;
  onWorkoutStarted?: (workoutId: string) => void;
  onForked?: (template: Template) => void;
}

export function TemplateDetailScreen({
  templateId,
  onGoBack,
  onWorkoutStarted,
  onForked,
}: TemplateDetailScreenProps) {
  const theme = useTheme();
  const { user } = useAuth();
  const { sync } = useSync();
  const [template, setTemplate] = useState(() => getLocalDb().getTemplate(templateId));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!template) {
    return (
      <ScreenContainer>
        <ErrorText testID="templateDetail.notFound">Template not found</ErrorText>
        {onGoBack ? (
          <Button testID="templateDetail.back" title="Go back" variant="ghost" onPress={onGoBack} />
        ) : null}
      </ScreenContainer>
    );
  }

  const refresh = () =>
    setTemplate(
      getLocalDb().findTemplateByClientID(template.client_id ?? template.id) ??
        getLocalDb().getTemplate(template.id),
    );

  const startWorkout = () => {
    if (!user) {
      setError('Sign in to start a workout');
      return;
    }
    // Local-first: copies the template client-side into a pending workout
    // create op; the sync engine pushes it as start + addExercise when online.
    const workout = startWorkoutFromTemplate(template, user.id);
    void sync();
    onWorkoutStarted?.(workout.id);
  };

  const publish = async () => {
    setBusy(true);
    setError(null);
    try {
      // Publishing needs the server-assigned id: push a pending create first,
      // then re-resolve the row through its client_id (the server assigns its
      // own id and timestamps, so the client id is the only stable handle).
      await sync();
      const pushed = getLocalDb().findTemplateByClientID(template.client_id ?? template.id);
      if (pushed && pushed.is_dirty === 1) {
        throw new Error('template has not reached the server yet');
      }
      const published = await gymApi.templates.publish((pushed ?? template).id);
      getLocalDb().upsertRemote('templates', published);
      refresh();
    } catch (publishError) {
      setError(getUserMessage(publishError, 'Could not publish the template'));
    } finally {
      setBusy(false);
    }
  };

  const fork = () => {
    if (!user) {
      setError('Sign in to fork a template');
      return;
    }
    // Forking is a local copy with a create op; the sync engine pushes it as
    // a brand-new template owned by the current user when online.
    const now = new Date().toISOString();
    const copy: Template = {
      ...template,
      id: newId(),
      name: `${template.name} (copy)`,
      is_public: false,
      created_by_user_id: user.id,
      created_at: now,
      updated_at: now,
      version: 1,
      exercises: template.exercises,
    };
    getLocalDb().upsertTemplate(copy, {
      is_dirty: 1,
      operation: 'create',
      client_id: copy.id,
    });
    void sync();
    onForked?.(copy);
  };

  const exerciseNames = new Map(
    getLocalDb()
      .getExercises()
      .map((exercise) => [exercise.id, exercise.name]),
  );
  const planned = template.exercises ?? [];
  const isOwner = template.created_by_user_id === user?.id;

  return (
    <ScreenContainer>
      {onGoBack ? (
        <Button testID="templateDetail.back" title="Back" variant="ghost" onPress={onGoBack} />
      ) : null}

      <Text style={[styles.title, { color: theme.text }]}>{template.name}</Text>
      <Text style={[styles.subtitle, { color: theme.subtext0 }]}>
        {template.is_public ? 'Public template' : isOwner ? 'Your template' : 'Community template'}
      </Text>
      {template.description ? (
        <Text style={[styles.description, { color: theme.text }]}>{template.description}</Text>
      ) : null}

      {error ? <ErrorText testID="templateDetail.error">{error}</ErrorText> : null}

      <Text style={[styles.heading, { color: theme.subtext0 }]}>EXERCISES</Text>
      {planned.length === 0 ? (
        <Text style={[styles.empty, { color: theme.subtext0 }]}>No exercises in this template</Text>
      ) : (
        planned.map((item) => (
          <Card key={`${item.exercise_id}-${item.sort_order}`} style={styles.exerciseRow}>
            <Text style={[styles.exerciseName, { color: theme.text }]}>
              {exerciseNames.get(item.exercise_id) ?? item.exercise_id}
            </Text>
            <Text testID={`templateDetail.plannedSets.${item.exercise_id}`} style={[styles.plannedSets, { color: theme.subtext0 }]}>
              {item.planned_sets} planned {item.planned_sets === 1 ? 'set' : 'sets'}
            </Text>
          </Card>
        ))
      )}

      <Button
        testID="templateDetail.startWorkout"
        title="Start workout"
        onPress={startWorkout}
        style={styles.primaryAction}
      />

      <View style={styles.actions}>
        {!template.is_public ? (
          <Button
            testID="templateDetail.publish"
            title="Publish"
            variant="ghost"
            loading={busy}
            disabled={busy}
            onPress={publish}
          />
        ) : null}
        <Button testID="templateDetail.fork" title="Fork" variant="ghost" onPress={fork} />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    marginBottom: 12,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
  },
  heading: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 20,
  },
  empty: {
    fontSize: 14,
  },
  exerciseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  exerciseName: {
    fontSize: 15,
    fontWeight: '600',
  },
  plannedSets: {
    fontSize: 13,
  },
  primaryAction: {
    marginTop: 24,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
});
