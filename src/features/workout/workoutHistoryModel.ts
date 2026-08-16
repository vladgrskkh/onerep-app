import type { Workout, WorkoutSet } from '../../shared/api/gym';

export interface HistorySet extends WorkoutSet {
  is_pr?: boolean;
  estimated_1rm?: number;
}

export function workoutExerciseCount(workout: Workout): number {
  return workout.exercises?.length ?? 0;
}

export function workoutSetCount(workout: Workout): number {
  return (workout.exercises ?? []).reduce((total, exercise) => total + (exercise.sets?.length ?? 0), 0);
}

export function formatDuration(workout: Workout): string {
  const start = new Date(workout.started_at).getTime();
  const end = workout.finished_at ? new Date(workout.finished_at).getTime() : Date.now();
  const minutes = Math.max(0, Math.round((end - start) / 60_000));
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours} h` : `${hours} h ${remainder} min`;
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function formatDateLabel(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const day = startOfDay(date).getTime();
  const today = startOfDay(now).getTime();
  const yesterday = today - 86_400_000;
  if (day === today) {
    return 'Today';
  }
  if (day === yesterday) {
    return 'Yesterday';
  }
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}
