import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import type { Template } from '../../../shared/api/gym';
import { gymApi } from '../../../shared/api/gym';
import { getLocalDb, type ExerciseLocalRow } from '../../../shared/db/database';
import { newId } from '../../../shared/db/ids';
import { useSync } from '../../../shared/sync/useSync';
import { Button } from '../../../shared/ui/Button';
import { Card } from '../../../shared/ui/Card';
import { ErrorText } from '../../../shared/ui/ErrorText';
import { ScreenContainer } from '../../../shared/ui/ScreenContainer';
import { AppTextInput } from '../../../shared/ui/TextInput';
import { useTheme } from '../../../shared/ui/ThemeProvider';
import { getUserMessage, useAuth } from '../../auth/AuthContext';

export interface CreateTemplateScreenProps {
  onCreated?: (template: Template) => void;
}

interface DraftExercise {
  exercise_id: string;
  planned_sets: number;
  name: string;
}

export function CreateTemplateScreen({ onCreated }: CreateTemplateScreenProps) {
  const theme = useTheme();
  const { user } = useAuth();
  const { sync } = useSync();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [publishOn, setPublishOn] = useState(false);
  const [added, setAdded] = useState<DraftExercise[]>([]);
  const [search, setSearch] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ name?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const catalog = getLocalDb().getExercises();
  const results = useMemo(() => {
    const addedIds = new Set(added.map((item) => item.exercise_id));
    const query = search.trim().toLowerCase();
    return catalog
      .filter((exercise) => !addedIds.has(exercise.id))
      .filter((exercise) => query === '' || exercise.name.toLowerCase().includes(query))
      .slice(0, 10);
  }, [catalog, added, search]);

  const addExercise = (exercise: ExerciseLocalRow) => {
    setAdded((current) => [
      ...current,
      { exercise_id: exercise.id, planned_sets: 3, name: exercise.name },
    ]);
    setSearch('');
  };

  const changePlannedSets = (exerciseId: string, delta: number) => {
    setAdded((current) =>
      current.map((item) =>
        item.exercise_id === exerciseId
          ? { ...item, planned_sets: Math.max(1, item.planned_sets + delta) }
          : item,
      ),
    );
  };

  const submit = async () => {
    if (!name.trim()) {
      setFieldErrors({ name: 'Name is required' });
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      const template: Template = {
        id: newId(),
        name: name.trim(),
        description: description.trim() || undefined,
        is_public: false,
        created_by_user_id: user?.id,
        created_at: now,
        updated_at: now,
        version: 1,
        exercises: added.map((item, index) => ({
          exercise_id: item.exercise_id,
          sort_order: index,
          planned_sets: item.planned_sets,
        })),
      };
      // Offline-first: pending create pushed by the sync engine. Publishing
      // needs the server-assigned id, so it runs after the create has been
      // pushed; the client_id is the stable handle to the pushed row.
      getLocalDb().upsertTemplate(template, {
        is_dirty: 1,
        operation: 'create',
        client_id: template.id,
      });
      await sync();

      if (publishOn) {
        try {
          const pushed = getLocalDb().findTemplateByClientID(template.id);
          if (!pushed || pushed.is_dirty === 1) {
            throw new Error('template has not reached the server yet');
          }
          const published = await gymApi.templates.publish(pushed.id);
          getLocalDb().upsertRemote('templates', published);
        } catch (publishError) {
          setError(
            `Template saved locally, but publishing failed: ${getUserMessage(
              publishError,
              'requires a connection',
            )}`,
          );
        }
      }

      const created = getLocalDb().findTemplateByClientID(template.id) ?? template;
      onCreated?.(created);
    } catch (submitError) {
      setError(getUserMessage(submitError, 'Could not create the template'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenContainer>
      <Text style={[styles.title, { color: theme.text }]}>New template</Text>

      {error ? <ErrorText testID="createTemplate.error">{error}</ErrorText> : null}

      <AppTextInput
        testID="createTemplate.name"
        label="Name"
        value={name}
        onChangeText={setName}
        error={fieldErrors.name}
      />
      <AppTextInput
        testID="createTemplate.description"
        label="Description"
        value={description}
        onChangeText={setDescription}
        multiline
      />

      <View style={styles.publishRow}>
        <Text style={[styles.publishLabel, { color: theme.text }]}>Publish for everyone</Text>
        <Switch
          testID="createTemplate.publish"
          value={publishOn}
          onValueChange={setPublishOn}
          trackColor={{ false: theme.surface1, true: theme.mauve }}
          thumbColor={theme.text}
        />
      </View>

      <Text style={[styles.heading, { color: theme.subtext0 }]}>EXERCISES</Text>
      {added.length === 0 ? (
        <Text style={[styles.empty, { color: theme.subtext0 }]}>No exercises added yet</Text>
      ) : (
        added.map((item) => (
          <Card key={item.exercise_id} style={styles.addedRow}>
            <Text style={[styles.addedName, { color: theme.text }]}>{item.name}</Text>
            <View style={styles.stepper}>
              <Pressable
                testID={`createTemplate.less.${item.exercise_id}`}
                accessibilityRole="button"
                onPress={() => changePlannedSets(item.exercise_id, -1)}
                style={[styles.stepButton, { borderColor: theme.surface1 }]}
              >
                <Text style={{ color: theme.text }}>−</Text>
              </Pressable>
              <Text style={[styles.stepValue, { color: theme.text }]}>{item.planned_sets}</Text>
              <Pressable
                testID={`createTemplate.more.${item.exercise_id}`}
                accessibilityRole="button"
                onPress={() => changePlannedSets(item.exercise_id, 1)}
                style={[styles.stepButton, { borderColor: theme.surface1 }]}
              >
                <Text style={{ color: theme.text }}>+</Text>
              </Pressable>
              <Text style={[styles.stepHint, { color: theme.subtext0 }]}>sets</Text>
            </View>
          </Card>
        ))
      )}

      <AppTextInput
        testID="createTemplate.exerciseSearch"
        label="Add exercises"
        placeholder="Search exercises"
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
      />
      {results.map((exercise) => (
        <Pressable
          key={exercise.id}
          testID={`createTemplate.addExercise.${exercise.id}`}
          accessibilityRole="button"
          onPress={() => addExercise(exercise)}
        >
          <Card style={styles.resultRow}>
            <Text style={[styles.resultName, { color: theme.text }]}>{exercise.name}</Text>
            <Text style={[styles.resultAdd, { color: theme.mauve }]}>+ Add</Text>
          </Card>
        </Pressable>
      ))}

      <Button
        testID="createTemplate.submit"
        title="Create template"
        loading={submitting}
        disabled={submitting}
        onPress={submit}
        style={styles.submit}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 16,
  },
  publishRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  publishLabel: {
    fontSize: 15,
  },
  heading: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 16,
  },
  empty: {
    fontSize: 14,
    marginBottom: 8,
  },
  addedRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  addedName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  stepper: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  stepButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  stepValue: {
    fontSize: 15,
    fontWeight: '600',
    minWidth: 18,
    textAlign: 'center',
  },
  stepHint: {
    fontSize: 12,
  },
  resultRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  resultName: {
    fontSize: 15,
  },
  resultAdd: {
    fontSize: 14,
    fontWeight: '600',
  },
  submit: {
    marginTop: 20,
  },
});
