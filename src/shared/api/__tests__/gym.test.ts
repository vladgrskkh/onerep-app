import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { GYM_BASE } from '../client';
import { gymApi } from '../gym';

const mockFetch = jest.fn<typeof fetch>();
globalThis.fetch = mockFetch as unknown as typeof fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  mockFetch.mockReset();
});

function lastCall(): [RequestInfo | URL, RequestInit | undefined] {
  return mockFetch.mock.calls[mockFetch.mock.calls.length - 1] as [
    RequestInfo | URL,
    RequestInit | undefined,
  ];
}

describe('gymApi URL building', () => {
  it('lists exercises with search, muscle_group and since filters', async () => {
    mockFetch.mockImplementation(async () => jsonResponse([]));

    await gymApi.exercises.list({
      search: 'squat',
      muscle_group: '3',
      since: new Date('2026-01-01T00:00:00Z'),
    });

    const [url] = lastCall();
    expect(url).toBe(
      `${GYM_BASE}/v1/exercises?search=squat&muscle_group=3&since=${encodeURIComponent(
        '2026-01-01T00:00:00.000Z',
      )}`,
    );
  });

  it('builds CRUD URLs for exercises', async () => {
    mockFetch.mockImplementation(async () => jsonResponse({ id: 'e1' }));
    await gymApi.exercises.get('e1');
    expect(lastCall()[0]).toBe(`${GYM_BASE}/v1/exercises/e1`);

    await gymApi.exercises.create({ name: 'Squat' });
    expect(lastCall()[0]).toBe(`${GYM_BASE}/v1/exercises`);
    expect(JSON.parse(lastCall()[1]?.body as string)).toEqual({ name: 'Squat' });

    await gymApi.exercises.update('e1', { name: 'Squat 2', notes: '' });
    expect(lastCall()[0]).toBe(`${GYM_BASE}/v1/exercises/e1`);
    expect(JSON.parse(lastCall()[1]?.body as string)).toEqual({ name: 'Squat 2' });

    await gymApi.exercises.delete('e1');
    expect(lastCall()[0]).toBe(`${GYM_BASE}/v1/exercises/e1`);
    expect(lastCall()[1]?.method).toBe('DELETE');
  });

  it('requests exercise media presigned uploads', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse(
        {
          id: 'm1',
          s3_key: 'media/e1/photo-1.jpg',
          upload_url: 'https://s3.example.com/key',
          expires_in: 900,
        },
        201,
      ),
    );

    const media = await gymApi.exercises.uploadMedia('e1', {
      media_type: 'photo',
      content_type: 'image/jpeg',
    });

    const [url, init] = lastCall();
    expect(url).toBe(`${GYM_BASE}/v1/exercises/e1/media`);
    expect(JSON.parse(init?.body as string)).toEqual({
      media_type: 'photo',
      content_type: 'image/jpeg',
    });
    expect(media.expires_in).toBe(900);
    expect(media.upload_url).toBe('https://s3.example.com/key');
  });

  it('lists public templates and handles publish/fork', async () => {
    mockFetch.mockImplementation(async () => jsonResponse([]));
    await gymApi.templates.list({ public: true });
    expect(lastCall()[0]).toBe(`${GYM_BASE}/v1/templates?public=true`);

    mockFetch.mockImplementation(async () => jsonResponse({ id: 't1' }));
    await gymApi.templates.publish('t1');
    expect(lastCall()[0]).toBe(`${GYM_BASE}/v1/templates/t1/publish`);

    await gymApi.templates.fork('t1');
    expect(lastCall()[0]).toBe(`${GYM_BASE}/v1/templates/t1/fork`);
  });

  it('creates templates with exercise items, omitting zero planned_sets', async () => {
    mockFetch.mockImplementation(async () => jsonResponse({ id: 't1' }));

    await gymApi.templates.create({
      name: 'Push day',
      exercises: [{ exercise_id: 'e1', planned_sets: 5 }, { exercise_id: 'e2' }],
    });

    const [, init] = lastCall();
    expect(JSON.parse(init?.body as string)).toEqual({
      name: 'Push day',
      exercises: [{ exercise_id: 'e1', planned_sets: 5 }, { exercise_id: 'e2' }],
    });
  });

  it('starts workouts with an optional template', async () => {
    mockFetch.mockImplementation(async () => jsonResponse({ id: 'w1' }));

    await gymApi.workouts.start({ template_id: 't1' });
    expect(lastCall()[0]).toBe(`${GYM_BASE}/v1/workouts`);
    expect(JSON.parse(lastCall()[1]?.body as string)).toEqual({ template_id: 't1' });

    await gymApi.workouts.start();
    expect(JSON.parse(lastCall()[1]?.body as string)).toEqual({});
  });

  it('logs sets to the workout exercise sets URL', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse(
        {
          id: 's1',
          set_number: 1,
          weight_kg: 100,
          reps: 5,
          is_warmup: false,
          is_pr: true,
          estimated_1rm: 116.7,
        },
        201,
      ),
    );

    const set = await gymApi.workouts.logSet('w1', 'we1', {
      weight_kg: 100,
      reps: 5,
      rpe: 0,
      rest_seconds: 90,
      is_warmup: false,
    });

    const [url, init] = lastCall();
    expect(url).toBe(`${GYM_BASE}/v1/workouts/w1/exercises/we1/sets`);
    expect(JSON.parse(init?.body as string)).toEqual({ weight_kg: 100, reps: 5, rest_seconds: 90 });
    expect(set).toMatchObject({ is_pr: true, estimated_1rm: 116.7 });
  });

  it('finishes workouts via PATCH', async () => {
    mockFetch.mockImplementation(async () => jsonResponse({ id: 'w1' }));

    await gymApi.workouts.finish('w1');

    expect(lastCall()[0]).toBe(`${GYM_BASE}/v1/workouts/w1/finish`);
    expect(lastCall()[1]?.method).toBe('PATCH');
  });

  it('builds progress URLs with date ranges', async () => {
    mockFetch.mockImplementation(async () => jsonResponse([]));

    await gymApi.progress.get1rm({
      exercise_id: 'e1',
      from: new Date('2026-01-01T00:00:00Z'),
      to: new Date('2026-02-01T00:00:00Z'),
    });
    expect(lastCall()[0]).toBe(
      `${GYM_BASE}/v1/progress/1rm?exercise_id=e1&from=${encodeURIComponent(
        '2026-01-01T00:00:00.000Z',
      )}&to=${encodeURIComponent('2026-02-01T00:00:00.000Z')}`,
    );

    await gymApi.progress.getVolume({ from: '2026-01-01T00:00:00Z' });
    expect(lastCall()[0]).toBe(
      `${GYM_BASE}/v1/progress/volume?from=${encodeURIComponent('2026-01-01T00:00:00Z')}`,
    );

    await gymApi.progress.getBodyWeight();
    expect(lastCall()[0]).toBe(`${GYM_BASE}/v1/progress/body-weight`);
  });

  it('logs body weight with an optional measured_at', async () => {
    mockFetch.mockImplementation(async () => jsonResponse({ id: 'bw1' }));

    await gymApi.progress.logBodyWeight({
      weight_kg: 82.5,
      measured_at: new Date('2026-01-01T08:00:00Z'),
    });

    const [url, init] = lastCall();
    expect(url).toBe(`${GYM_BASE}/v1/progress/body-weight`);
    expect(JSON.parse(init?.body as string)).toEqual({
      weight_kg: 82.5,
      measured_at: '2026-01-01T08:00:00.000Z',
    });
  });
});
