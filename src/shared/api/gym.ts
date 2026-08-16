import { ApiError, GYM_BASE, createClient, toQuery } from './client';
import type { UploadFile } from './client';

// Exercises

export interface MuscleGroup {
  id: number;
  is_primary: boolean;
}

export interface ExerciseMedia {
  id: string;
  media_type: string;
  sort_order: number;
  s3_key: string;
}

export interface Exercise {
  id: string;
  name: string;
  description?: string;
  notes?: string;
  is_built_in: boolean;
  created_by_user_id?: string;
  created_at: string;
  updated_at: string;
  version: number;
  media?: ExerciseMedia[];
  muscle_groups?: MuscleGroup[];
}

export interface ExerciseCreateRequest {
  name: string;
  description?: string;
  notes?: string;
  muscle_group_ids?: number[];
}

export interface ExerciseUpdateRequest {
  name?: string;
  description?: string;
  notes?: string;
  muscle_group_ids?: number[];
}

export interface ListExercisesParams {
  search?: string;
  muscle_group?: string;
  since?: Date | string;
}

// Media

export type MediaType = 'photo' | 'video';

export interface MediaUploadResponse {
  id: string;
  s3_key: string;
  upload_url: string;
  expires_in?: number;
}

export interface ExerciseMediaUploadRequest {
  media_type: MediaType;
  content_type: string;
}

export interface TemplateMediaUploadRequest {
  content_type: string;
}

// Templates

export interface TemplateExerciseItem {
  exercise_id: string;
  planned_sets?: number;
}

export interface TemplateCreateRequest {
  name: string;
  description?: string;
  exercises?: TemplateExerciseItem[];
}

export interface TemplateUpdateRequest {
  name?: string;
  description?: string;
  exercises?: TemplateExerciseItem[];
}

export interface TemplateExercise {
  exercise_id: string;
  sort_order: number;
  planned_sets: number;
}

export interface TemplateMedia {
  id: string;
  media_type: string;
  sort_order: number;
  s3_key: string;
}

export interface Template {
  id: string;
  name: string;
  description?: string;
  is_public: boolean;
  created_by_user_id?: string;
  created_at: string;
  updated_at: string;
  version: number;
  exercises?: TemplateExercise[];
  media?: TemplateMedia[];
}

export interface ListTemplatesParams {
  public?: boolean;
  since?: Date | string;
}

// Workouts

export interface StartWorkoutRequest {
  template_id?: string;
}

export interface AddExerciseRequest {
  exercise_id: string;
}

export interface LogSetRequest {
  weight_kg: number;
  reps: number;
  rpe?: number;
  rest_seconds?: number;
  is_warmup?: boolean;
}

export interface WorkoutSet {
  id: string;
  set_number: number;
  weight_kg: number;
  reps: number;
  rpe?: number;
  rest_seconds?: number;
  is_warmup: boolean;
}

export interface LogSetResult extends WorkoutSet {
  is_pr: boolean;
  estimated_1rm: number;
}

export interface WorkoutExercise {
  id: string;
  exercise_id: string;
  sort_order: number;
  notes?: string;
  sets?: WorkoutSet[];
}

export interface Workout {
  id: string;
  user_id: string;
  template_id?: string;
  started_at: string;
  finished_at?: string;
  notes?: string;
  exercises?: WorkoutExercise[];
  created_at: string;
  updated_at: string;
}

export interface ListWorkoutsParams {
  since?: Date | string;
}

// Progress

export interface OneRMEntry {
  date: string;
  estimated_1rm: number;
}

export interface VolumeEntry {
  date: string;
  muscle_group_id: number;
  total_kg: number;
}

export interface BodyWeightEntry {
  id: string;
  weight_kg: number;
  measured_at: string;
  created_at: string;
}

export interface LogBodyWeightRequest {
  weight_kg: number;
  measured_at?: Date | string;
}

export interface Get1RMParams {
  exercise_id: string;
  from?: Date | string;
  to?: Date | string;
}

export interface GetVolumeParams {
  from?: Date | string;
  to?: Date | string;
}

export interface GetBodyWeightParams {
  since?: Date | string;
}

const client = createClient(GYM_BASE);

export const gymApi = {
  exercises: {
    list: (params?: ListExercisesParams) => client.get<Exercise[]>(`/v1/exercises${toQuery(params)}`),
    get: (id: string) => client.get<Exercise>(`/v1/exercises/${id}`),
    create: (req: ExerciseCreateRequest) => client.post<Exercise>('/v1/exercises', { json: req }),
    update: (id: string, req: ExerciseUpdateRequest) =>
      client.patch<Exercise>(`/v1/exercises/${id}`, { json: req }),
    delete: (id: string) => client.delete<void>(`/v1/exercises/${id}`),
    uploadMedia: (id: string, req: ExerciseMediaUploadRequest) =>
      client.post<MediaUploadResponse>(`/v1/exercises/${id}/media`, { json: req }),
  },

  templates: {
    list: (params?: ListTemplatesParams) => client.get<Template[]>(`/v1/templates${toQuery(params)}`),
    get: (id: string) => client.get<Template>(`/v1/templates/${id}`),
    create: (req: TemplateCreateRequest) => client.post<Template>('/v1/templates', { json: req }),
    update: (id: string, req: TemplateUpdateRequest) =>
      client.patch<Template>(`/v1/templates/${id}`, { json: req }),
    publish: (id: string) => client.post<Template>(`/v1/templates/${id}/publish`),
    fork: (id: string) => client.post<Template>(`/v1/templates/${id}/fork`),
    delete: (id: string) => client.delete<void>(`/v1/templates/${id}`),
    uploadMedia: (id: string, req: TemplateMediaUploadRequest) =>
      client.post<MediaUploadResponse>(`/v1/templates/${id}/media`, { json: req }),
  },

  workouts: {
    start: (req?: StartWorkoutRequest) => client.post<Workout>('/v1/workouts', { json: req ?? {} }),
    list: (params?: ListWorkoutsParams) => client.get<Workout[]>(`/v1/workouts${toQuery(params)}`),
    get: (id: string) => client.get<Workout>(`/v1/workouts/${id}`),
    addExercise: (workoutId: string, req: AddExerciseRequest) =>
      client.post<WorkoutExercise>(`/v1/workouts/${workoutId}/exercises`, { json: req }),
    logSet: (workoutId: string, exerciseId: string, req: LogSetRequest) =>
      client.post<LogSetResult>(`/v1/workouts/${workoutId}/exercises/${exerciseId}/sets`, {
        json: req,
      }),
    finish: (id: string) => client.patch<Workout>(`/v1/workouts/${id}/finish`),
  },

  progress: {
    get1rm: (params: Get1RMParams) => client.get<OneRMEntry[]>(`/v1/progress/1rm${toQuery(params)}`),
    getVolume: (params?: GetVolumeParams) =>
      client.get<VolumeEntry[]>(`/v1/progress/volume${toQuery(params)}`),
    getBodyWeight: (params?: GetBodyWeightParams) =>
      client.get<BodyWeightEntry[]>(`/v1/progress/body-weight${toQuery(params)}`),
    logBodyWeight: (req: LogBodyWeightRequest) =>
      client.post<BodyWeightEntry>('/v1/progress/body-weight', { json: req }),
  },
};

export async function putFile(
  uploadUrl: string,
  file: UploadFile,
  contentType: string,
  timeoutMs: number = 60_000,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: file as BodyInit,
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new ApiError(res.status, `HTTP_${res.status}`, `Upload failed with status ${res.status}`);
    }
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ApiError(0, 'TIMEOUT', `Upload timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
