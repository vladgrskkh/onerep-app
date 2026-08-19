import { ApiError } from '../api/client';
import {
  gymApi,
  type ExerciseCreateRequest,
  type ExerciseUpdateRequest,
  type LogSetRequest,
  type TemplateCreateRequest,
  type TemplateUpdateRequest,
  type Workout,
  type WorkoutSet,
} from '../api/gym';
import type {
  BodyWeightLocalRow,
  ExerciseLocalRow,
  LocalRow,
  Operation,
  ServerRow,
  SyncStore,
  SyncTable,
  TemplateLocalRow,
  WorkoutLocalRow,
} from '../db/database';

export interface SyncTableAdapter {
  table: SyncTable;
  pull: (since?: string) => Promise<ServerRow[]>;
  fetchOne: (id: string) => Promise<ServerRow | null>;
  pushCreate?: PushHandler;
  pushUpdate?: PushHandler;
  pushDelete?: PushHandler;
  isConflict: (error: unknown) => boolean;
}

type GenerationGuard = () => boolean;

export type PushHandler = (
  row: LocalRow,
  isCurrentGeneration: GenerationGuard,
) => Promise<ServerRow | void | null>;

export interface SyncError {
  table: SyncTable;
  id: string;
  operation: Operation | null;
  message: string;
}

export interface PushResult {
  pushed: number;
  conflicts: number;
  droppedChangeIds: string[];
  unsupported: number;
  skippedIds: string[];
  errors: SyncError[];
}

export interface PullResult {
  pulled: number;
  lastSyncedAt: string | null;
}

export interface SyncResult extends PushResult, PullResult {
  startedAt: string;
  finishedAt: string;
}

export interface SyncEngineDeps {
  store: SyncStore;
  adapters: SyncTableAdapter[];
  clock?: () => string;
}

const PUSH_ORDER: Operation[] = ['delete', 'update', 'create'];

export function isConflictError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 409 || error.status === 404);
}

export class SyncEngine {
  private inFlight: { generation: number; promise: Promise<SyncResult> } | null = null;
  private readonly store: SyncStore;
  private readonly adapters: SyncTableAdapter[];
  private readonly clock: () => string;

  constructor(deps: SyncEngineDeps) {
    this.store = deps.store;
    this.adapters = deps.adapters;
    this.clock = deps.clock ?? (() => new Date().toISOString());
  }

  sync(): Promise<SyncResult> {
    const generation = this.store.getDataGeneration();
    if (!this.inFlight || this.inFlight.generation !== generation) {
      const run = this.run(generation);
      const promise = run.finally(() => {
        if (this.inFlight?.promise === promise) {
          this.inFlight = null;
        }
      });
      this.inFlight = { generation, promise };
    }
    return this.inFlight.promise;
  }

  getLastSyncedAt(): string | null {
    return this.store.getLastSyncedAt();
  }

  async pushLocal(generation = this.store.getDataGeneration()): Promise<PushResult> {
    const result: PushResult = {
      pushed: 0,
      conflicts: 0,
      droppedChangeIds: [],
      unsupported: 0,
      skippedIds: [],
      errors: [],
    };

    for (const adapter of this.adapters) {
      if (!this.isCurrentGeneration(generation)) {
        return result;
      }
      const dirty = this.store.getDirtyRows(adapter.table);
      const ordered: LocalRow[] = [];
      for (const operation of PUSH_ORDER) {
        ordered.push(...dirty.filter((row) => row.operation === operation));
      }

      for (const row of ordered) {
        if (!this.isCurrentGeneration(generation)) {
          return result;
        }
        await this.pushRow(adapter, row, result, generation);
      }
    }

    return result;
  }

  async pullRemote(generation = this.store.getDataGeneration()): Promise<PullResult> {
    const since = this.store.getLastSyncedAt() ?? undefined;
    const pulledAt = this.clock();
    let pulled = 0;

    for (const adapter of this.adapters) {
      if (!this.isCurrentGeneration(generation)) {
        return { pulled, lastSyncedAt: null };
      }
      const rows = await adapter.pull(since);
      for (const row of rows) {
        if (!this.isCurrentGeneration(generation)) {
          return { pulled, lastSyncedAt: null };
        }
        if (this.store.isDirtyRow(adapter.table, row.id)) {
          continue;
        }
        this.store.upsertRemote(adapter.table, row);
        pulled += 1;
      }
    }

    if (!this.isCurrentGeneration(generation)) {
      return { pulled, lastSyncedAt: null };
    }
    this.store.setLastSyncedAt(pulledAt);
    return { pulled, lastSyncedAt: pulledAt };
  }

  private async run(generation: number): Promise<SyncResult> {
    const startedAt = this.clock();
    const push = await this.pushLocal(generation);
    const pull = await this.pullRemote(generation);
    return {
      ...push,
      ...pull,
      startedAt,
      finishedAt: this.clock(),
    };
  }

  private async pushRow(
    adapter: SyncTableAdapter,
    row: LocalRow,
    result: PushResult,
    generation: number,
  ): Promise<void> {
    if (!this.isCurrentGeneration(generation)) {
      return;
    }
    const handler =
      row.operation === 'delete'
        ? adapter.pushDelete
        : row.operation === 'update'
          ? adapter.pushUpdate
          : row.operation === 'create'
            ? adapter.pushCreate
            : undefined;

    if (!handler) {
      result.unsupported += 1;
      result.skippedIds.push(`${adapter.table}:${row.id}`);
      return;
    }

    try {
      const server = await handler(row, () => this.isCurrentGeneration(generation));
      if (!this.isCurrentGeneration(generation)) {
        return;
      }
      if (row.operation === 'delete') {
        this.store.removeRow(adapter.table, row.id);
      } else if (server) {
        this.store.markSynced(adapter.table, row.id, server);
      } else {
        return;
      }
      result.pushed += 1;
    } catch (error) {
      if (!this.isCurrentGeneration(generation)) {
        return;
      }
      if (adapter.isConflict(error)) {
        result.conflicts += 1;
        result.droppedChangeIds.push(`${adapter.table}:${row.id}`);
        await this.recoverFromConflict(adapter, row, result, generation);
      } else {
        result.errors.push({
          table: adapter.table,
          id: row.id,
          operation: row.operation,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private async recoverFromConflict(
    adapter: SyncTableAdapter,
    row: LocalRow,
    result: PushResult,
    generation: number,
  ): Promise<void> {
    if (!this.isCurrentGeneration(generation)) {
      return;
    }
    this.store.removeRow(adapter.table, row.id);
    try {
      const server = await adapter.fetchOne(row.id);
      if (!this.isCurrentGeneration(generation)) {
        return;
      }
      if (server) {
        this.store.upsertRemote(adapter.table, server);
      }
    } catch (error) {
      if (!this.isCurrentGeneration(generation)) {
        return;
      }
      result.errors.push({
        table: adapter.table,
        id: row.id,
        operation: row.operation,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private isCurrentGeneration(generation: number): boolean {
    return this.store.getDataGeneration() === generation;
  }
}

function exerciseCreateRequest(row: ExerciseLocalRow): ExerciseCreateRequest {
  return {
    name: row.name,
    description: row.description,
    notes: row.notes,
    muscle_group_ids: row.muscle_groups?.map((group) => group.id),
  };
}

function exerciseUpdateRequest(row: ExerciseLocalRow): ExerciseUpdateRequest {
  return {
    name: row.name,
    description: row.description,
    notes: row.notes,
    muscle_group_ids: row.muscle_groups?.map((group) => group.id),
  };
}

function templateCreateRequest(row: TemplateLocalRow): TemplateCreateRequest {
  return {
    name: row.name,
    description: row.description,
    exercises: row.exercises?.map((item) => ({
      exercise_id: item.exercise_id,
      planned_sets: item.planned_sets,
    })),
  };
}

function templateUpdateRequest(row: TemplateLocalRow): TemplateUpdateRequest {
  return {
    name: row.name,
    description: row.description,
    exercises: row.exercises?.map((item) => ({
      exercise_id: item.exercise_id,
      planned_sets: item.planned_sets,
    })),
  };
}

function logSetRequest(set: WorkoutSet): LogSetRequest {
  return {
    weight_kg: set.weight_kg,
    reps: set.reps,
    rpe: set.rpe,
    rest_seconds: set.rest_seconds,
    is_warmup: set.is_warmup,
  };
}

async function pushWithGeneration<T>(
  request: () => Promise<T>,
  isCurrentGeneration: GenerationGuard,
): Promise<T | null> {
  if (!isCurrentGeneration()) {
    return null;
  }
  const response = await request();
  return isCurrentGeneration() ? response : null;
}

async function fetchOrNull<T>(request: () => Promise<T>): Promise<T | null> {
  try {
    return await request();
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

const exercisesAdapter: SyncTableAdapter = {
  table: 'exercises',
  pull: (since) => gymApi.exercises.list(since ? { since } : undefined),
  fetchOne: (id) => fetchOrNull(() => gymApi.exercises.get(id)),
  pushCreate: (row, isCurrentGeneration) =>
    pushWithGeneration(
      () => gymApi.exercises.create(exerciseCreateRequest(row as ExerciseLocalRow)),
      isCurrentGeneration,
    ),
  pushUpdate: (row, isCurrentGeneration) =>
    pushWithGeneration(
      () => gymApi.exercises.update((row as ExerciseLocalRow).id, exerciseUpdateRequest(row as ExerciseLocalRow)),
      isCurrentGeneration,
    ),
  pushDelete: async (row, isCurrentGeneration) => {
    await pushWithGeneration(
      () => gymApi.exercises.delete((row as ExerciseLocalRow).id),
      isCurrentGeneration,
    );
  },
  isConflict: isConflictError,
};

const templatesAdapter: SyncTableAdapter = {
  table: 'templates',
  pull: (since) => gymApi.templates.list(since ? { since } : undefined),
  fetchOne: (id) => fetchOrNull(() => gymApi.templates.get(id)),
  pushCreate: (row, isCurrentGeneration) =>
    pushWithGeneration(
      () => gymApi.templates.create(templateCreateRequest(row as TemplateLocalRow)),
      isCurrentGeneration,
    ),
  pushUpdate: (row, isCurrentGeneration) =>
    pushWithGeneration(
      () => gymApi.templates.update((row as TemplateLocalRow).id, templateUpdateRequest(row as TemplateLocalRow)),
      isCurrentGeneration,
    ),
  pushDelete: async (row, isCurrentGeneration) => {
    await pushWithGeneration(
      () => gymApi.templates.delete((row as TemplateLocalRow).id),
      isCurrentGeneration,
    );
  },
  isConflict: isConflictError,
};

async function pushWorkoutCreate(
  row: WorkoutLocalRow,
  isCurrentGeneration: () => boolean = () => true,
): Promise<Workout | null> {
  const started = await gymApi.workouts.start({ template_id: row.template_id });
  if (!isCurrentGeneration()) {
    return null;
  }
  for (const exercise of row.exercises ?? []) {
    const serverExercise = await gymApi.workouts.addExercise(started.id, {
      exercise_id: exercise.exercise_id,
    });
    if (!isCurrentGeneration()) {
      return null;
    }
    for (const set of exercise.sets ?? []) {
      await gymApi.workouts.logSet(started.id, serverExercise.id, logSetRequest(set));
      if (!isCurrentGeneration()) {
        return null;
      }
    }
  }
  if (row.finished_at) {
    const finished = await gymApi.workouts.finish(started.id);
    if (!isCurrentGeneration()) {
      return null;
    }
    return finished;
  }
  const current = await gymApi.workouts.get(started.id);
  if (!isCurrentGeneration()) {
    return null;
  }
  return current;
}

async function pushWorkoutUpdate(
  row: WorkoutLocalRow,
  isCurrentGeneration: () => boolean = () => true,
): Promise<Workout | null> {
  if (!row.finished_at) {
    throw new Error('Workout update is only supported for finished workouts');
  }
  const finished = await gymApi.workouts.finish(row.id);
  if (!isCurrentGeneration()) {
    return null;
  }
  return finished;
}

const workoutsAdapter: SyncTableAdapter = {
  table: 'workouts',
  pull: (since) => gymApi.workouts.list(since ? { since } : undefined),
  fetchOne: (id) => fetchOrNull(() => gymApi.workouts.get(id)),
  pushCreate: (row, isCurrentGeneration) =>
    pushWorkoutCreate(row as WorkoutLocalRow, isCurrentGeneration),
  pushUpdate: (row, isCurrentGeneration) =>
    pushWorkoutUpdate(row as WorkoutLocalRow, isCurrentGeneration),
  isConflict: isConflictError,
};

const bodyWeightsAdapter: SyncTableAdapter = {
  table: 'body_weights',
  pull: (since) => gymApi.progress.getBodyWeight(since ? { since } : undefined),
  fetchOne: async () => null,
  pushCreate: async (row, isCurrentGeneration) => {
    const entry = row as BodyWeightLocalRow;
    return pushWithGeneration(
      () =>
        gymApi.progress.logBodyWeight({
          weight_kg: entry.weight_kg,
          measured_at: entry.measured_at,
        }),
      isCurrentGeneration,
    );
  },
  isConflict: isConflictError,
};

export function createGymSyncEngine(store: SyncStore, clock?: () => string): SyncEngine {
  return new SyncEngine({
    store,
    clock,
    adapters: [exercisesAdapter, templatesAdapter, workoutsAdapter, bodyWeightsAdapter],
  });
}
