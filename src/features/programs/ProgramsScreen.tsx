import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Template } from '../../shared/api/gym';
import { useSync } from '../../shared/sync/useSync';
import { ScreenContainer } from '../../shared/ui/ScreenContainer';
import { useTheme } from '../../shared/ui/ThemeProvider';
import { useAuth } from '../auth/AuthContext';
import { startWorkoutFromTemplate } from '../workout/workoutModel';
import { CreateExerciseScreen } from './exercises/CreateExerciseScreen';
import { ExerciseDetailScreen } from './exercises/ExerciseDetailScreen';
import { ExerciseListScreen } from './exercises/ExerciseListScreen';
import { CreateTemplateScreen } from './templates/CreateTemplateScreen';
import { TemplateDetailScreen } from './templates/TemplateDetailScreen';
import { TemplateListScreen } from './templates/TemplateListScreen';

export interface ProgramsScreenProps {
  onWorkoutStarted?: (workoutId: string) => void;
}

type Segment = 'templates' | 'exercises';

type ViewState =
  | { name: 'list' }
  | { name: 'templateDetail'; templateId: string }
  | { name: 'createTemplate' }
  | { name: 'exerciseDetail'; exerciseId: string }
  | { name: 'createExercise' };

// Programs tab: Templates/Exercises segment control with in-tab navigation to
// detail and create screens (the existing screens are callback-driven, so
// sub-navigation is local state instead of a nested stack navigator).
export function ProgramsScreen({ onWorkoutStarted }: ProgramsScreenProps) {
  const theme = useTheme();
  const { user } = useAuth();
  const { sync } = useSync();
  const [segment, setSegment] = useState<Segment>('templates');
  const [view, setView] = useState<ViewState>({ name: 'list' });

  const startWorkout = (template: Template) => {
    if (!user) {
      return;
    }
    const workout = startWorkoutFromTemplate(template, user.id);
    void sync();
    onWorkoutStarted?.(workout.id);
  };

  const selectSegment = (next: Segment) => {
    setSegment(next);
    setView({ name: 'list' });
  };

  if (view.name === 'templateDetail') {
    return (
      <TemplateDetailScreen
        templateId={view.templateId}
        onGoBack={() => setView({ name: 'list' })}
        onWorkoutStarted={onWorkoutStarted}
        onForked={() => setView({ name: 'list' })}
      />
    );
  }

  if (view.name === 'createTemplate') {
    return (
      <CreateTemplateScreen
        onCreated={(template) => setView({ name: 'templateDetail', templateId: template.id })}
      />
    );
  }

  if (view.name === 'exerciseDetail') {
    return (
      <ExerciseDetailScreen
        exerciseId={view.exerciseId}
        onGoBack={() => setView({ name: 'list' })}
      />
    );
  }

  if (view.name === 'createExercise') {
    return <CreateExerciseScreen onCreated={() => setView({ name: 'list' })} />;
  }

  return (
    <ScreenContainer scrollable={false}>
      <View style={[styles.segment, { borderColor: theme.surface1 }]}>
        <Pressable
          testID="programs.segment.templates"
          accessibilityRole="button"
          accessibilityState={{ selected: segment === 'templates' }}
          onPress={() => selectSegment('templates')}
          style={[
            styles.segmentItem,
            segment === 'templates' ? { backgroundColor: theme.mauve } : undefined,
          ]}
        >
          <Text
            style={[
              styles.segmentLabel,
              { color: segment === 'templates' ? theme.base : theme.subtext0 },
            ]}
          >
            Templates
          </Text>
        </Pressable>
        <Pressable
          testID="programs.segment.exercises"
          accessibilityRole="button"
          accessibilityState={{ selected: segment === 'exercises' }}
          onPress={() => selectSegment('exercises')}
          style={[
            styles.segmentItem,
            segment === 'exercises' ? { backgroundColor: theme.mauve } : undefined,
          ]}
        >
          <Text
            style={[
              styles.segmentLabel,
              { color: segment === 'exercises' ? theme.base : theme.subtext0 },
            ]}
          >
            Exercises
          </Text>
        </Pressable>
      </View>

      {segment === 'templates' ? (
        <TemplateListScreen
          onSelectTemplate={(template) => setView({ name: 'templateDetail', templateId: template.id })}
          onStartWorkout={startWorkout}
          onEditTemplate={(template) => setView({ name: 'templateDetail', templateId: template.id })}
          onCreateTemplate={() => setView({ name: 'createTemplate' })}
        />
      ) : (
        <ExerciseListScreen
          onSelectExercise={(exercise) => setView({ name: 'exerciseDetail', exerciseId: exercise.id })}
          onCreateExercise={() => setView({ name: 'createExercise' })}
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  segment: {
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    margin: 20,
    marginBottom: 12,
    padding: 4,
  },
  segmentItem: {
    alignItems: 'center',
    borderRadius: 9,
    flex: 1,
    paddingVertical: 8,
  },
  segmentLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
});
