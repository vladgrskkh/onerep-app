import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { Exercise } from '../../../shared/api/gym';
import { getLocalDb, type ExerciseLocalRow } from '../../../shared/db/database';
import { MUSCLE_GROUPS, muscleGroupName } from '../../../shared/db/muscleGroups';
import { useSync } from '../../../shared/sync/useSync';
import { Button } from '../../../shared/ui/Button';
import { Card } from '../../../shared/ui/Card';
import { ErrorText } from '../../../shared/ui/ErrorText';
import { ScreenContainer } from '../../../shared/ui/ScreenContainer';
import { AppTextInput } from '../../../shared/ui/TextInput';
import { useTheme } from '../../../shared/ui/ThemeProvider';
import { getUserMessage } from '../../auth/AuthContext';

export interface ExerciseListScreenProps {
  onSelectExercise?: (exercise: Exercise) => void;
  onCreateExercise?: () => void;
}

function filterExercises(
  exercises: ExerciseLocalRow[],
  search: string,
  muscleGroupId: number | null,
): ExerciseLocalRow[] {
  const query = search.trim().toLowerCase();
  return exercises.filter((exercise) => {
    if (muscleGroupId !== null && !exercise.muscle_groups?.some((g) => g.id === muscleGroupId)) {
      return false;
    }
    return query === '' || exercise.name.toLowerCase().includes(query);
  });
}

export function ExerciseListScreen({ onSelectExercise, onCreateExercise }: ExerciseListScreenProps) {
  const theme = useTheme();
  const { sync, isSyncing, lastSyncAt, lastError } = useSync();
  const [exercises, setExercises] = useState<ExerciseLocalRow[]>(() => getLocalDb().getExercises());
  const [search, setSearch] = useState('');
  const [muscleGroupId, setMuscleGroupId] = useState<number | null>(null);

  // Pull remote rows on first mount when the local cache is empty (first run),
  // then read from SQLite. Subsequent data comes from sync + local writes.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (getLocalDb().getExercises().length === 0) {
        await sync();
        if (!cancelled) {
          setExercises(getLocalDb().getExercises());
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sync]);

  // Re-read rows after a background (connectivity-triggered) sync lands.
  useEffect(() => {
    if (lastSyncAt === null) {
      return;
    }
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) {
        setExercises(getLocalDb().getExercises());
      }
    });
    return () => {
      cancelled = true;
    };
  }, [lastSyncAt]);

  const onRefresh = async () => {
    await sync();
    setExercises(getLocalDb().getExercises());
  };

  const visible = useMemo(
    () => filterExercises(exercises, search, muscleGroupId),
    [exercises, search, muscleGroupId],
  );

  return (
    <ScreenContainer scrollable={false}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Exercises</Text>
        <Button
          testID="exercises.create"
          title="New exercise"
          variant="ghost"
          onPress={onCreateExercise}
          style={styles.createButton}
        />
      </View>

      <AppTextInput
        testID="exercises.search"
        placeholder="Search exercises"
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        style={styles.search}
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
      >
        <Pressable
          testID={`exercises.filter.all`}
          accessibilityRole="button"
          onPress={() => setMuscleGroupId(null)}
          style={[
            styles.chip,
            {
              backgroundColor: muscleGroupId === null ? theme.mauve : theme.surface0,
              borderColor: muscleGroupId === null ? theme.mauve : theme.surface1,
            },
          ]}
        >
          <Text
            style={[styles.chipLabel, { color: muscleGroupId === null ? theme.base : theme.text }]}
          >
            All
          </Text>
        </Pressable>
        {MUSCLE_GROUPS.map((group) => {
          const active = muscleGroupId === group.id;
          return (
            <Pressable
              key={group.id}
              testID={`exercises.filter.${group.name}`}
              accessibilityRole="button"
              onPress={() => setMuscleGroupId(active ? null : group.id)}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? theme.mauve : theme.surface0,
                  borderColor: active ? theme.mauve : theme.surface1,
                },
              ]}
            >
              <Text style={[styles.chipLabel, { color: active ? theme.base : theme.text }]}>
                {group.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {lastError ? (
        <ErrorText testID="exercises.error">{getUserMessage(lastError, 'Sync failed')}</ErrorText>
      ) : null}

      {isSyncing && visible.length === 0 ? (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.mauve} />
        </View>
      ) : (
        <FlatList
          testID="exercises.list"
          data={visible}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isSyncing}
              onRefresh={onRefresh}
              tintColor={theme.mauve}
            />
          }
          ListEmptyComponent={
            <Text style={[styles.empty, { color: theme.subtext0 }]}>No exercises yet</Text>
          }
          renderItem={({ item }) => (
            <Pressable
              testID={`exercises.row.${item.id}`}
              accessibilityRole="button"
              onPress={() => onSelectExercise?.(item)}
            >
              <Card style={styles.row}>
                <View style={styles.rowText}>
                  <Text style={[styles.rowName, { color: theme.text }]}>{item.name}</Text>
                  <Text style={[styles.rowSub, { color: theme.subtext0 }]} numberOfLines={1}>
                    {(item.muscle_groups ?? []).map((g) => muscleGroupName(g.id)).join(', ') ||
                      'No muscle groups'}
                  </Text>
                </View>
                {item.is_built_in ? (
                  <Text style={[styles.builtIn, { color: theme.overlay0 }]}>Built-in</Text>
                ) : null}
              </Card>
            </Pressable>
          )}
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
  createButton: {
    minHeight: 40,
    paddingVertical: 6,
  },
  search: {
    marginTop: 16,
  },
  chipsRow: {
    gap: 8,
    paddingVertical: 12,
  },
  chip: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
  },
  listContent: {
    gap: 12,
    paddingBottom: 24,
  },
  empty: {
    paddingVertical: 24,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowText: {
    flex: 1,
    marginRight: 12,
  },
  rowName: {
    fontSize: 16,
    fontWeight: '600',
  },
  rowSub: {
    fontSize: 13,
    marginTop: 2,
  },
  builtIn: {
    fontSize: 12,
  },
});
