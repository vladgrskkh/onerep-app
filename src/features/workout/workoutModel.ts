import type { Template, Workout, WorkoutExercise, WorkoutSet } from '../../shared/api/gym';
import { getLocalDb } from '../../shared/db/database';
import { newId } from '../../shared/db/ids';

// Sets logged against an already-synced workout carry the server-computed PR
// result; sets on a pending create are replayed through the sync engine and
// get PRs computed server-side during the push.
export interface WorkoutSetWithPr extends WorkoutSet {
  is_pr?: boolean;
  estimated_1rm?: number;
}

export function buildWorkoutFromTemplate(
  template: Template,
  userId: string,
  now: string,
): Workout {
  return {
    id: newId(),
    user_id: userId,
    template_id: template.id,
    started_at: now,
    created_at: now,
    updated_at: now,
    exercises: (template.exercises ?? []).map((item, index) => ({
      id: newId(),
      exercise_id: item.exercise_id,
      sort_order: index,
      sets: [],
    })),
  };
}

// Offline-first workout start: copies the template's exercises client-side
// into a local workout row with a create op. The sync engine's workout
// adapter replays start + addExercise + logSet against the API on push.
export function startWorkoutFromTemplate(template: Template, userId: string): Workout {
  const workout = buildWorkoutFromTemplate(template, userId, new Date().toISOString());
  getLocalDb().upsertWorkout(workout, { is_dirty: 1, operation: 'create' });
  return workout;
}

export function nextSetNumber(sets: WorkoutSet[] | undefined): number {
  return (sets?.length ?? 0) + 1;
}

export function appendSet(
  workout: Workout,
  workoutExerciseId: string,
  set: WorkoutSetWithPr,
): Workout {
  return {
    ...workout,
    updated_at: new Date().toISOString(),
    exercises: (workout.exercises ?? []).map((exercise) =>
      exercise.id === workoutExerciseId
        ? { ...exercise, sets: [...(exercise.sets ?? []), set] }
        : exercise,
    ),
  };
}

export function appendWorkoutExercise(
  workout: Workout,
  exerciseId: string,
): { workout: Workout; workoutExercise: WorkoutExercise } {
  const existing = workout.exercises ?? [];
  const workoutExercise: WorkoutExercise = {
    id: newId(),
    exercise_id: exerciseId,
    sort_order: existing.length,
    sets: [],
  };
  return {
    workout: {
      ...workout,
      updated_at: new Date().toISOString(),
      exercises: [...existing, workoutExercise],
    },
    workoutExercise,
  };
}
