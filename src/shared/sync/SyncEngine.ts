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
  pushCreate?: (row: LocalRow) => Promise<ServerRow>;
  pushUpdate?: (row: LocalRow) => Promise<ServerRow>;
  pushDelete?: (row: LocalRow) => Promise<void>;
  isConflict: (error: unknown) => boolean;
}

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
  private inFlight: Promise<SyncResult> | null = null;
  private readonly store: SyncStore;
  private readonly adapters: SyncTableAdapter[];
  private readonly clock: () => string;

  constructor(deps: SyncEngineDeps) {
    this.store = deps.store;
    this.adapters = deps.adapters;
    this.clock = deps.clock ?? (() => new Date().toISOString());
  }

  sync(): Promise<SyncResult> {
    if (!this.inFlight) {
      this.inFlight = this.run().finally(() => {
        this.inFlight = null;
      });
    }
    return this.inFlight;
  }

  getLastSyncedAt(): string | null {
    return this.store.getLastSyncedAt();
  }

  async pushLocal(): Promise<PushResult> {
    const result: PushResult = {
      pushed: 0,
      conflicts: 0,
      droppedChangeIds: [],
      unsupported: 0,
      skippedIds: [],
      errors: [],
    };

    for (const adapter of this.adapters) {
      const dirty = this.store.getDirtyRows(adapter.table);
      const ordered: LocalRow[] = [];
      for (const operation of PUSH_ORDER) {
        ordered.push(...dirty.filter((row) => row.operation === operation));
      }

      for (const row of ordered) {
        await this.pushRow(adapter, row, result);
      }
    }

    return result;
  }

  async pullRemote(): Promise<PullResult> {
    const since = this.store.getLastSyncedAt() ?? undefined;
    const pulledAt = this.clock();
    let pulled = 0;

    for (const adapter of this.adapters) {
      const rows = await adapter.pull(since);
      for (const row of rows) {
        if (this.store.isDirtyRow(adapter.table, row.id)) {
          continue;
        }
        this.store.upsertRemote(adapter.table, row);
        pulled += 1;
      }
    }

    this.store.setLastSyncedAt(pulledAt);
    return { pulled, lastSyncedAt: pulledAt };
  }

  private async run(): Promise<SyncResult> {
    const startedAt = this.clock();
    const push = await this.pushLocal();
    const pull = await this.pullRemote();
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
  ): Promise<void> {
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
      const server = await handler(row);
      if (row.operation === 'delete') {
        this.store.removeRow(adapter.table, row.id);
      } else if (server) {
        this.store.markSynced(adapter.table, row.id, server);
      }
      result.pushed += 1;
    } catch (error) {
      if (adapter.isConflict(error)) {
        result.conflicts += 1;
        result.droppedChangeIds.push(`${adapter.table}:${row.id}`);
        await this.recoverFromConflict(adapter, row, result);
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
  ): Promise<void> {
    this.store.removeRow(adapter.table, row.id);
    try {
      const server = await adapter.fetchOne(row.id);
      if (server) {
        this.store.upsertRemote(adapter.table, server);
      }
    } catch (error) {
      result.errors.push({
        table: adapter.table,
        id: row.id,
        operation: row.operation,
        message: error instanceof Error ? error.message : String(error),
      });
    }
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
  pushCreate: async (row) =>
    gymApi.exercises.create(exerciseCreateRequest(row as ExerciseLocalRow)),
  pushUpdate: async (row) =>
    gymApi.exercises.update((row as ExerciseLocalRow).id, exerciseUpdateRequest(row as ExerciseLocalRow)),
  pushDelete: async (row) => {
    await gymApi.exercises.delete((row as ExerciseLocalRow).id);
  },
  isConflict: isConflictError,
};

const templatesAdapter: SyncTableAdapter = {
  table: 'templates',
  pull: (since) => gymApi.templates.list(since ? { since } : undefined),
  fetchOne: (id) => fetchOrNull(() => gymApi.templates.get(id)),
  pushCreate: async (row) =>
    gymApi.templates.create(templateCreateRequest(row as TemplateLocalRow)),
  pushUpdate: async (row) =>
    gymApi.templates.update((row as TemplateLocalRow).id, templateUpdateRequest(row as TemplateLocalRow)),
  pushDelete: async (row) => {
    await gymApi.templates.delete((row as TemplateLocalRow).id);
  },
  isConflict: isConflictError,
};

async function pushWorkoutCreate(row: WorkoutLocalRow): Promise<Workout> {
  const started = await gymApi.workouts.start({ template_id: row.template_id });
  for (const exercise of row.exercises ?? []) {
    const serverExercise = await gymApi.workouts.addExercise(started.id, {
      exercise_id: exercise.exercise_id,
    });
    for (const set of exercise.sets ?? []) {
      await gymApi.workouts.logSet(started.id, serverExercise.id, logSetRequest(set));
    }
  }
  return gymApi.workouts.get(started.id);
}

const workoutsAdapter: SyncTableAdapter = {
  table: 'workouts',
  pull: (since) => gymApi.workouts.list(since ? { since } : undefined),
  fetchOne: (id) => fetchOrNull(() => gymApi.workouts.get(id)),
  pushCreate: (row) => pushWorkoutCreate(row as WorkoutLocalRow),
  isConflict: isConflictError,
};

const bodyWeightsAdapter: SyncTableAdapter = {
  table: 'body_weights',
  pull: (since) => gymApi.progress.getBodyWeight(since ? { since } : undefined),
  fetchOne: async () => null,
  pushCreate: async (row) => {
    const entry = row as BodyWeightLocalRow;
    return gymApi.progress.logBodyWeight({
      weight_kg: entry.weight_kg,
      measured_at: entry.measured_at,
    });
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
