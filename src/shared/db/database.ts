import type {
  BodyWeightEntry,
  Exercise,
  ExerciseMedia,
  MuscleGroup,
  Template,
  TemplateExercise,
  TemplateMedia,
  Workout,
  WorkoutExercise,
} from '../api/gym';
import { SCHEMA_SQL, SYNC_TABLES, type SyncTable } from './schema';

export type { SyncTable } from './schema';

export type Operation = 'create' | 'update' | 'delete';

export type SqlParam = string | number | null | boolean | Uint8Array;

export interface SqlConnection {
  execSync(source: string): void;
  runSync(source: string, ...params: SqlParam[]): { changes: number };
  getFirstSync<T>(source: string, ...params: SqlParam[]): T | null;
  getAllSync<T>(source: string, ...params: SqlParam[]): T[];
}

export interface SyncColumns {
  is_dirty: number;
  operation: Operation | null;
  last_synced_at: string | null;
}

export type ExerciseLocalRow = Exercise & SyncColumns;
export type TemplateLocalRow = Template & SyncColumns;
export type WorkoutLocalRow = Workout & SyncColumns;
export type BodyWeightLocalRow = BodyWeightEntry & SyncColumns;

export type LocalRow = ExerciseLocalRow | TemplateLocalRow | WorkoutLocalRow | BodyWeightLocalRow;

export type ServerRow = Exercise | Template | Workout | BodyWeightEntry;

export interface ExerciseRawRow {
  id: string;
  name: string;
  description: string | null;
  notes: string | null;
  is_built_in: number;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  version: number;
  media: string | null;
  muscle_groups: string | null;
  is_dirty: number;
  operation: Operation | null;
  last_synced_at: string | null;
}

export interface TemplateRawRow {
  id: string;
  name: string;
  description: string | null;
  is_public: number;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  version: number;
  exercises: string | null;
  media: string | null;
  is_dirty: number;
  operation: Operation | null;
  last_synced_at: string | null;
}

export interface WorkoutRawRow {
  id: string;
  user_id: string;
  template_id: string | null;
  started_at: string;
  finished_at: string | null;
  notes: string | null;
  exercises: string | null;
  created_at: string;
  updated_at: string;
  version: number;
  is_dirty: number;
  operation: Operation | null;
  last_synced_at: string | null;
}

export interface BodyWeightRawRow {
  id: string;
  weight_kg: number;
  measured_at: string;
  created_at: string;
  updated_at: string;
  is_dirty: number;
  operation: Operation | null;
  last_synced_at: string | null;
}

function parseJson<T>(value: string | null): T | undefined {
  if (!value) {
    return undefined;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function toJson(value: unknown): string | null {
  return value === undefined || value === null ? null : JSON.stringify(value);
}

export function mapExerciseRow(raw: ExerciseRawRow): ExerciseLocalRow {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description ?? undefined,
    notes: raw.notes ?? undefined,
    is_built_in: raw.is_built_in === 1,
    created_by_user_id: raw.created_by_user_id ?? undefined,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    version: raw.version,
    media: parseJson<ExerciseMedia[]>(raw.media),
    muscle_groups: parseJson<MuscleGroup[]>(raw.muscle_groups),
    is_dirty: raw.is_dirty,
    operation: raw.operation,
    last_synced_at: raw.last_synced_at,
  };
}

export function mapTemplateRow(raw: TemplateRawRow): TemplateLocalRow {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description ?? undefined,
    is_public: raw.is_public === 1,
    created_by_user_id: raw.created_by_user_id ?? undefined,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    version: raw.version,
    exercises: parseJson<TemplateExercise[]>(raw.exercises),
    media: parseJson<TemplateMedia[]>(raw.media),
    is_dirty: raw.is_dirty,
    operation: raw.operation,
    last_synced_at: raw.last_synced_at,
  };
}

export function mapWorkoutRow(raw: WorkoutRawRow): WorkoutLocalRow {
  return {
    id: raw.id,
    user_id: raw.user_id,
    template_id: raw.template_id ?? undefined,
    started_at: raw.started_at,
    finished_at: raw.finished_at ?? undefined,
    notes: raw.notes ?? undefined,
    exercises: parseJson<WorkoutExercise[]>(raw.exercises),
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    is_dirty: raw.is_dirty,
    operation: raw.operation,
    last_synced_at: raw.last_synced_at,
  };
}

export function mapBodyWeightRow(raw: BodyWeightRawRow): BodyWeightLocalRow {
  return {
    id: raw.id,
    weight_kg: raw.weight_kg,
    measured_at: raw.measured_at,
    created_at: raw.created_at,
    is_dirty: raw.is_dirty,
    operation: raw.operation,
    last_synced_at: raw.last_synced_at,
  };
}

export function exerciseToRaw(exercise: Exercise, sync: Partial<SyncColumns> = {}): ExerciseRawRow {
  return {
    id: exercise.id,
    name: exercise.name,
    description: exercise.description ?? null,
    notes: exercise.notes ?? null,
    is_built_in: exercise.is_built_in ? 1 : 0,
    created_by_user_id: exercise.created_by_user_id ?? null,
    created_at: exercise.created_at,
    updated_at: exercise.updated_at,
    version: exercise.version,
    media: toJson(exercise.media),
    muscle_groups: toJson(exercise.muscle_groups),
    is_dirty: sync.is_dirty ?? 0,
    operation: sync.operation ?? null,
    last_synced_at: sync.last_synced_at ?? null,
  };
}

export function templateToRaw(template: Template, sync: Partial<SyncColumns> = {}): TemplateRawRow {
  return {
    id: template.id,
    name: template.name,
    description: template.description ?? null,
    is_public: template.is_public ? 1 : 0,
    created_by_user_id: template.created_by_user_id ?? null,
    created_at: template.created_at,
    updated_at: template.updated_at,
    version: template.version,
    exercises: toJson(template.exercises),
    media: toJson(template.media),
    is_dirty: sync.is_dirty ?? 0,
    operation: sync.operation ?? null,
    last_synced_at: sync.last_synced_at ?? null,
  };
}

export function workoutToRaw(workout: Workout, sync: Partial<SyncColumns> = {}): WorkoutRawRow {
  return {
    id: workout.id,
    user_id: workout.user_id,
    template_id: workout.template_id ?? null,
    started_at: workout.started_at,
    finished_at: workout.finished_at ?? null,
    notes: workout.notes ?? null,
    exercises: toJson(workout.exercises),
    created_at: workout.created_at,
    updated_at: workout.updated_at,
    version: 0,
    is_dirty: sync.is_dirty ?? 0,
    operation: sync.operation ?? null,
    last_synced_at: sync.last_synced_at ?? null,
  };
}

export function bodyWeightToRaw(
  entry: BodyWeightEntry,
  sync: Partial<SyncColumns> = {},
): BodyWeightRawRow {
  return {
    id: entry.id,
    weight_kg: entry.weight_kg,
    measured_at: entry.measured_at,
    created_at: entry.created_at,
    updated_at: entry.created_at,
    is_dirty: sync.is_dirty ?? 0,
    operation: sync.operation ?? null,
    last_synced_at: sync.last_synced_at ?? null,
  };
}

function assertSyncTable(table: string): asserts table is SyncTable {
  if (!(SYNC_TABLES as readonly string[]).includes(table)) {
    throw new Error(`Unknown sync table: ${table}`);
  }
}

export function dirtyRowsSql(table: SyncTable): string {
  assertSyncTable(table);
  return `SELECT * FROM ${table} WHERE is_dirty = 1 ORDER BY created_at ASC, id ASC`;
}

const SYNC_STATE_KEY = 'last_synced_at';

const UPSERT_SYNC_STATE_SQL = `INSERT INTO sync_state (key, value) VALUES ('${SYNC_STATE_KEY}', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`;
const GET_SYNC_STATE_SQL = `SELECT value FROM sync_state WHERE key = '${SYNC_STATE_KEY}'`;

const EXERCISE_COLUMNS =
  'id, name, description, notes, is_built_in, created_by_user_id, created_at, updated_at, version, media, muscle_groups';
const TEMPLATE_COLUMNS =
  'id, name, description, is_public, created_by_user_id, created_at, updated_at, version, exercises, media';
const WORKOUT_COLUMNS =
  'id, user_id, template_id, started_at, finished_at, notes, exercises, created_at, updated_at, version';
const BODY_WEIGHT_COLUMNS = 'id, weight_kg, measured_at, created_at, updated_at';

function buildLocalUpsertSql(table: SyncTable, columns: string): string {
  const syncColumns = 'is_dirty, operation, last_synced_at';
  return `INSERT INTO ${table} (${columns}, ${syncColumns}) VALUES (${[
    ...columns.split(', ').map(() => '?'),
    '?',
    '?',
    '?',
  ].join(', ')}) ON CONFLICT(id) DO UPDATE SET ${columns
    .split(', ')
    .filter((column) => column !== 'id')
    .map((column) => `${column} = excluded.${column}`)
    .join(', ')}, is_dirty = excluded.is_dirty, operation = CASE WHEN excluded.is_dirty = 0 THEN NULL WHEN is_dirty = 1 THEN operation ELSE excluded.operation END, last_synced_at = CASE WHEN excluded.is_dirty = 1 THEN last_synced_at ELSE excluded.updated_at END`;
}

function buildRemoteUpsertSql(table: SyncTable, columns: string): string {
  const values = columns.split(', ').map(() => '?');
  const sets = columns
    .split(', ')
    .filter((column) => column !== 'id')
    .map((column) => `${column} = excluded.${column}`);
  return `INSERT INTO ${table} (${columns}, is_dirty, operation, last_synced_at) VALUES (${[
    ...values,
    '0',
    'NULL',
    'NULL',
  ].join(', ')}) ON CONFLICT(id) DO UPDATE SET ${[
    ...sets,
    'is_dirty = 0',
    'operation = NULL',
    'last_synced_at = excluded.updated_at',
  ].join(', ')} WHERE is_dirty = 0`;
}

function buildMarkSyncedSql(table: SyncTable, columns: string): string {
  const sets = columns
    .split(', ')
    .filter((column) => column !== 'id')
    .map((column) => `${column} = ?`);
  return `UPDATE ${table} SET ${sets.join(', ')}, is_dirty = 0, operation = NULL, last_synced_at = ? WHERE id = ?`;
}

function exerciseValues(row: ExerciseRawRow): SqlParam[] {
  return [
    row.id,
    row.name,
    row.description,
    row.notes,
    row.is_built_in,
    row.created_by_user_id,
    row.created_at,
    row.updated_at,
    row.version,
    row.media,
    row.muscle_groups,
  ];
}

function templateValues(row: TemplateRawRow): SqlParam[] {
  return [
    row.id,
    row.name,
    row.description,
    row.is_public,
    row.created_by_user_id,
    row.created_at,
    row.updated_at,
    row.version,
    row.exercises,
    row.media,
  ];
}

function workoutValues(row: WorkoutRawRow): SqlParam[] {
  return [
    row.id,
    row.user_id,
    row.template_id,
    row.started_at,
    row.finished_at,
    row.notes,
    row.exercises,
    row.created_at,
    row.updated_at,
    row.version,
  ];
}

function bodyWeightValues(row: BodyWeightRawRow): SqlParam[] {
  return [row.id, row.weight_kg, row.measured_at, row.created_at, row.updated_at];
}

export interface SyncStore {
  getDirtyRows(table: SyncTable): LocalRow[];
  isDirtyRow(table: SyncTable, id: string): boolean;
  markSynced(table: SyncTable, id: string, server: ServerRow): void;
  removeRow(table: SyncTable, id: string): void;
  upsertRemote(table: SyncTable, row: ServerRow): void;
  getLastSyncedAt(): string | null;
  setLastSyncedAt(value: string): void;
}

export class LocalDb implements SyncStore {
  constructor(private readonly conn: SqlConnection) {}

  init(): void {
    this.conn.execSync(SCHEMA_SQL);
  }

  // -- exercises --------------------------------------------------------------

  upsertExercise(exercise: Exercise, sync: Partial<SyncColumns> = {}): void {
    const row = exerciseToRaw(exercise, sync);
    this.conn.runSync(
      buildLocalUpsertSql('exercises', EXERCISE_COLUMNS),
      ...exerciseValues(row),
      row.is_dirty,
      row.operation,
      row.last_synced_at,
    );
  }

  getExercise(id: string): ExerciseLocalRow | null {
    const raw = this.conn.getFirstSync<ExerciseRawRow>(
      'SELECT * FROM exercises WHERE id = ?',
      id,
    );
    return raw ? mapExerciseRow(raw) : null;
  }

  getExercises(): ExerciseLocalRow[] {
    return this.conn.getAllSync<ExerciseRawRow>('SELECT * FROM exercises').map(mapExerciseRow);
  }

  // Local exercise ids are remapped to server ids when a create op is pushed
  // (markSynced); the client-generated created_at is the stable handle for
  // re-resolving a just-pushed row (e.g. to attach media).
  findExerciseByCreatedAt(createdAt: string): ExerciseLocalRow | null {
    const raw = this.conn.getFirstSync<ExerciseRawRow>(
      'SELECT * FROM exercises WHERE created_at = ?',
      createdAt,
    );
    return raw ? mapExerciseRow(raw) : null;
  }

  // -- templates ----------------------------------------------------------------

  upsertTemplate(template: Template, sync: Partial<SyncColumns> = {}): void {
    const row = templateToRaw(template, sync);
    this.conn.runSync(
      buildLocalUpsertSql('templates', TEMPLATE_COLUMNS),
      ...templateValues(row),
      row.is_dirty,
      row.operation,
      row.last_synced_at,
    );
  }

  getTemplate(id: string): TemplateLocalRow | null {
    const raw = this.conn.getFirstSync<TemplateRawRow>('SELECT * FROM templates WHERE id = ?', id);
    return raw ? mapTemplateRow(raw) : null;
  }

  getTemplates(): TemplateLocalRow[] {
    return this.conn.getAllSync<TemplateRawRow>('SELECT * FROM templates').map(mapTemplateRow);
  }

  // Local template ids are remapped to server ids when a create op is pushed
  // (markSynced); the client-generated created_at is the stable handle for
  // re-resolving a just-pushed row (e.g. to publish it).
  findTemplateByCreatedAt(createdAt: string): TemplateLocalRow | null {
    const raw = this.conn.getFirstSync<TemplateRawRow>(
      'SELECT * FROM templates WHERE created_at = ?',
      createdAt,
    );
    return raw ? mapTemplateRow(raw) : null;
  }

  // -- workouts ------------------------------------------------------------------

  upsertWorkout(workout: Workout, sync: Partial<SyncColumns> = {}): void {
    const row = workoutToRaw(workout, sync);
    this.conn.runSync(
      buildLocalUpsertSql('workouts', WORKOUT_COLUMNS),
      ...workoutValues(row),
      row.is_dirty,
      row.operation,
      row.last_synced_at,
    );
  }

  getWorkout(id: string): WorkoutLocalRow | null {
    const raw = this.conn.getFirstSync<WorkoutRawRow>('SELECT * FROM workouts WHERE id = ?', id);
    return raw ? mapWorkoutRow(raw) : null;
  }

  getWorkouts(): WorkoutLocalRow[] {
    return this.conn.getAllSync<WorkoutRawRow>('SELECT * FROM workouts').map(mapWorkoutRow);
  }

  // Local workout ids are remapped to server ids when a create op is pushed
  // (markSynced), so screens keep the client-generated started_at as a
  // stable handle and re-resolve the row after syncs.
  findWorkoutByStartedAt(startedAt: string): WorkoutLocalRow | null {
    const raw = this.conn.getFirstSync<WorkoutRawRow>(
      'SELECT * FROM workouts WHERE started_at = ?',
      startedAt,
    );
    return raw ? mapWorkoutRow(raw) : null;
  }

  // -- body weights -----------------------------------------------------------------

  upsertBodyWeight(entry: BodyWeightEntry, sync: Partial<SyncColumns> = {}): void {
    const row = bodyWeightToRaw(entry, sync);
    this.conn.runSync(
      buildLocalUpsertSql('body_weights', BODY_WEIGHT_COLUMNS),
      ...bodyWeightValues(row),
      row.is_dirty,
      row.operation,
      row.last_synced_at,
    );
  }

  getBodyWeights(): BodyWeightLocalRow[] {
    return this.conn
      .getAllSync<BodyWeightRawRow>('SELECT * FROM body_weights')
      .map(mapBodyWeightRow);
  }

  // -- generic sync helpers ---------------------------------------------------------

  getDirtyRows(table: SyncTable): LocalRow[] {
    assertSyncTable(table);
    switch (table) {
      case 'exercises':
        return this.conn.getAllSync<ExerciseRawRow>(dirtyRowsSql(table)).map(mapExerciseRow);
      case 'templates':
        return this.conn.getAllSync<TemplateRawRow>(dirtyRowsSql(table)).map(mapTemplateRow);
      case 'workouts':
        return this.conn.getAllSync<WorkoutRawRow>(dirtyRowsSql(table)).map(mapWorkoutRow);
      case 'body_weights':
        return this.conn.getAllSync<BodyWeightRawRow>(dirtyRowsSql(table)).map(mapBodyWeightRow);
    }
  }

  isDirtyRow(table: SyncTable, id: string): boolean {
    assertSyncTable(table);
    const row = this.conn.getFirstSync<{ is_dirty: number }>(
      `SELECT is_dirty FROM ${table} WHERE id = ?`,
      id,
    );
    return row?.is_dirty === 1;
  }

  markSynced(table: SyncTable, id: string, server: ServerRow): void {
    switch (table) {
      case 'exercises':
        this.markExerciseSynced(id, server as Exercise);
        break;
      case 'templates':
        this.markTemplateSynced(id, server as Template);
        break;
      case 'workouts':
        this.markWorkoutSynced(id, server as Workout);
        break;
      case 'body_weights':
        this.markBodyWeightSynced(id, server as BodyWeightEntry);
        break;
    }
  }

  private markExerciseSynced(localId: string, server: Exercise): void {
    if (server.id !== localId) {
      this.removeRow('exercises', localId);
      this.upsertRemoteExercise(server);
      return;
    }
    const row = exerciseToRaw(server);
    this.conn.runSync(
      buildMarkSyncedSql('exercises', EXERCISE_COLUMNS),
      ...exerciseValues(row).slice(1),
      row.updated_at,
      localId,
    );
  }

  private markTemplateSynced(localId: string, server: Template): void {
    if (server.id !== localId) {
      this.removeRow('templates', localId);
      this.upsertRemoteTemplate(server);
      return;
    }
    const row = templateToRaw(server);
    this.conn.runSync(
      buildMarkSyncedSql('templates', TEMPLATE_COLUMNS),
      ...templateValues(row).slice(1),
      row.updated_at,
      localId,
    );
  }

  private markWorkoutSynced(localId: string, server: Workout): void {
    if (server.id !== localId) {
      this.removeRow('workouts', localId);
      this.upsertRemoteWorkout(server);
      return;
    }
    const row = workoutToRaw(server);
    this.conn.runSync(
      buildMarkSyncedSql('workouts', WORKOUT_COLUMNS),
      ...workoutValues(row).slice(1),
      row.updated_at,
      localId,
    );
  }

  private markBodyWeightSynced(localId: string, server: BodyWeightEntry): void {
    if (server.id !== localId) {
      this.removeRow('body_weights', localId);
      this.upsertRemoteBodyWeight(server);
      return;
    }
    const row = bodyWeightToRaw(server);
    this.conn.runSync(
      `UPDATE body_weights SET weight_kg = ?, measured_at = ?, created_at = ?, updated_at = updated_at, is_dirty = 0, operation = NULL, last_synced_at = ? WHERE id = ?`,
      row.weight_kg,
      row.measured_at,
      row.created_at,
      row.created_at,
      localId,
    );
  }

  removeRow(table: SyncTable, id: string): void {
    assertSyncTable(table);
    this.conn.runSync(`DELETE FROM ${table} WHERE id = ?`, id);
  }

  upsertRemote(table: SyncTable, row: ServerRow): void {
    switch (table) {
      case 'exercises':
        this.upsertRemoteExercise(row as Exercise);
        break;
      case 'templates':
        this.upsertRemoteTemplate(row as Template);
        break;
      case 'workouts':
        this.upsertRemoteWorkout(row as Workout);
        break;
      case 'body_weights':
        this.upsertRemoteBodyWeight(row as BodyWeightEntry);
        break;
    }
  }

  private upsertRemoteExercise(exercise: Exercise): void {
    const row = exerciseToRaw(exercise);
    this.conn.runSync(buildRemoteUpsertSql('exercises', EXERCISE_COLUMNS), ...exerciseValues(row));
  }

  private upsertRemoteTemplate(template: Template): void {
    const row = templateToRaw(template);
    this.conn.runSync(buildRemoteUpsertSql('templates', TEMPLATE_COLUMNS), ...templateValues(row));
  }

  private upsertRemoteWorkout(workout: Workout): void {
    const row = workoutToRaw(workout);
    this.conn.runSync(buildRemoteUpsertSql('workouts', WORKOUT_COLUMNS), ...workoutValues(row));
  }

  private upsertRemoteBodyWeight(entry: BodyWeightEntry): void {
    const row = bodyWeightToRaw(entry);
    this.conn.runSync(buildRemoteUpsertSql('body_weights', BODY_WEIGHT_COLUMNS), ...bodyWeightValues(row));
  }

  getLastSyncedAt(): string | null {
    const row = this.conn.getFirstSync<{ value: string }>(GET_SYNC_STATE_SQL);
    return row?.value ?? null;
  }

  setLastSyncedAt(value: string): void {
    this.conn.runSync(UPSERT_SYNC_STATE_SQL, value);
  }
}

export const DB_NAME = 'onerep.db';

let sqliteModule: typeof import('expo-sqlite') | null = null;

function loadSqlite(): typeof import('expo-sqlite') {
  if (!sqliteModule) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    sqliteModule = require('expo-sqlite') as typeof import('expo-sqlite');
  }
  return sqliteModule;
}

export function openLocalDb(): SqlConnection {
  const sqlite = loadSqlite();
  const conn = sqlite.openDatabaseSync(DB_NAME);
  conn.execSync(SCHEMA_SQL);
  return conn;
}

let shared: LocalDb | null = null;

export function getLocalDb(): LocalDb {
  if (!shared) {
    shared = new LocalDb(openLocalDb());
  }
  return shared;
}
