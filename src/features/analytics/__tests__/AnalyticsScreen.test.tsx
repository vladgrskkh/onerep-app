import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { act, create } from 'react-test-renderer';

import type { BodyWeightEntry, OneRMEntry, VolumeEntry } from '../../../shared/api/gym';
import { ApiError } from '../../../shared/api/client';

const exercises = [
  { id: 'e1', name: 'Bench Press' },
  { id: 'e2', name: 'Squat' },
];

const oneRmEntries: OneRMEntry[] = [
  { date: '2026-01-05T00:00:00Z', estimated_1rm: 100 },
  { date: '2026-01-19T00:00:00Z', estimated_1rm: 105 },
  { date: '2026-02-02T00:00:00Z', estimated_1rm: 110 },
];

const volumeEntries: VolumeEntry[] = [
  { date: new Date().toISOString(), muscle_group_id: 1, total_kg: 2500 },
];

const bodyWeights: BodyWeightEntry[] = [
  {
    id: 'bw2',
    weight_kg: 83.2,
    measured_at: '2026-02-01T08:00:00Z',
    created_at: '2026-02-01T08:00:00Z',
  },
  {
    id: 'bw1',
    weight_kg: 84.0,
    measured_at: '2026-01-01T08:00:00Z',
    created_at: '2026-01-01T08:00:00Z',
  },
];

const cache = new Map<string, string>();

const mockGetExercises = jest.fn(() => exercises);
const mockGetBodyWeights = jest.fn(() => bodyWeights);
const mockGetProgressCache = jest.fn((key: string) => cache.get(key) ?? null);
const mockSetProgressCache = jest.fn((key: string, value: string) => {
  cache.set(key, value);
});
const mockUpsertRemote = jest.fn<(table: string, row: unknown) => void>();
const mockUpsertBodyWeight = jest.fn<(row: unknown, sync?: object) => void>();
const mockSync = jest.fn(async () => ({ lastSyncedAt: '2026-02-03T00:00:00Z' }));

jest.mock('../../../shared/db/database', () => ({
  getLocalDb: jest.fn(() => ({
    getExercises: mockGetExercises,
    getBodyWeights: mockGetBodyWeights,
    getProgressCache: mockGetProgressCache,
    setProgressCache: mockSetProgressCache,
    upsertRemote: mockUpsertRemote,
    upsertBodyWeight: mockUpsertBodyWeight,
  })),
}));

jest.mock('../../../shared/sync/useSync', () => ({
  useSync: () => ({ sync: mockSync, isSyncing: false, lastSyncAt: null, lastError: null }),
}));

jest.mock('../../../shared/api/gym', () => ({
  gymApi: {
    progress: {
      get1rm: jest.fn(async () => [] as OneRMEntry[]),
      getVolume: jest.fn(async () => [] as VolumeEntry[]),
      logBodyWeight: jest.fn(async () => ({} as BodyWeightEntry)),
    },
  },
}));

// eslint-disable-next-line import/first
import { gymApi } from '../../../shared/api/gym';

const mockGet1rm = gymApi.progress.get1rm as jest.Mock<(...args: any[]) => any>;
const mockGetVolume = gymApi.progress.getVolume as jest.Mock<(...args: any[]) => any>;
const mockLogBodyWeight = gymApi.progress.logBodyWeight as jest.Mock<(...args: any[]) => any>;

// eslint-disable-next-line import/first
import { AnalyticsScreen, buildWeeklyVolume, to1rmPoints } from '../AnalyticsScreen';

async function renderAnalytics() {
  let instance: ReturnType<typeof create>;
  await act(async () => {
    instance = create(<AnalyticsScreen />);
  });
  return instance!;
}

beforeEach(() => {
  jest.clearAllMocks();
  cache.clear();
  mockGet1rm.mockResolvedValue([]);
  mockGetVolume.mockResolvedValue([]);
});

describe('buildWeeklyVolume', () => {
  it('keeps the total and distinct muscle-group series labeled and separate', () => {
    const now = new Date();

    const volume = buildWeeklyVolume([
      { date: now.toISOString(), muscle_group_id: 1, total_kg: 1000 },
      { date: now.toISOString(), muscle_group_id: 3, total_kg: 500 },
    ]);

    expect(volume.total).toHaveLength(8);
    expect(volume.total[volume.total.length - 1].value).toBe(1500);
    expect(volume.total[0].value).toBe(0);
    expect(volume.byMuscleGroup.map((group) => ({
      id: group.muscleGroupId,
      label: group.label,
      currentWeek: group.points[group.points.length - 1].value,
    }))).toEqual([
      { id: 1, label: 'chest', currentWeek: 1000 },
      { id: 3, label: 'biceps', currentWeek: 500 },
    ]);
  });

  it('returns empty total and group series when no volume is logged', () => {
    expect(buildWeeklyVolume([])).toEqual({ total: [], byMuscleGroup: [] });
  });
});

describe('to1rmPoints', () => {
  it('sorts entries by date', () => {
    const points = to1rmPoints([
      { date: '2026-02-02T00:00:00Z', estimated_1rm: 110 },
      { date: '2026-01-05T00:00:00Z', estimated_1rm: 100 },
    ]);
    expect(points.map((point) => point.value)).toEqual([100, 110]);
  });
});

describe('AnalyticsScreen', () => {
  it('renders the 1RM selector, volume card and body weight card', async () => {
    const instance = await renderAnalytics();

    expect(instance.root.findByProps({ testID: 'analytics.1rmCard' })).toBeTruthy();
    expect(instance.root.findByProps({ testID: 'analytics.volumeCard' })).toBeTruthy();
    expect(instance.root.findByProps({ testID: 'analytics.weightCard' })).toBeTruthy();
    expect(instance.root.findByProps({ testID: 'analytics.exerciseChip.e1' })).toBeTruthy();
    expect(instance.root.findByProps({ testID: 'analytics.exerciseChip.e2' })).toBeTruthy();
    expect(instance.root.findByProps({ testID: 'analytics.moreSources' })).toBeTruthy();
  });

  it('fetches and charts 1RM for the selected exercise, caching the payload', async () => {
    mockGet1rm.mockResolvedValue(oneRmEntries);
    const instance = await renderAnalytics();

    expect(mockGet1rm).toHaveBeenCalledWith(
      expect.objectContaining({ exercise_id: 'e1', from: expect.any(String) }),
    );
    expect(instance.root.findByProps({ testID: 'analytics.1rmChart' })).toBeTruthy();
    expect(cache.get('progress:1rm:e1')).toContain('"estimated_1rm":110');
  });

  it('switches exercises from the selector and reloads 1RM', async () => {
    mockGet1rm.mockResolvedValue(oneRmEntries);
    const instance = await renderAnalytics();

    await act(async () => {
      instance.root.findByProps({ testID: 'analytics.exerciseChip.e2' }).props.onPress();
    });

    expect(mockGet1rm).toHaveBeenLastCalledWith(
      expect.objectContaining({ exercise_id: 'e2' }),
    );
  });

  it('shows the API user message when the 1RM fetch fails', async () => {
    mockGet1rm.mockRejectedValue({
      status: 500,
      message: 'boom',
      userMessage: 'Could not load 1RM history',
    });
    const instance = await renderAnalytics();

    expect(instance.root.findByProps({ testID: 'analytics.1rmError' }).props.children).toBe(
      'Could not load 1RM history',
    );
  });

  it('charts weekly volume from the API and caches it', async () => {
    mockGetVolume.mockResolvedValue(volumeEntries);
    const instance = await renderAnalytics();

    expect(mockGetVolume).toHaveBeenCalledWith(expect.objectContaining({ from: expect.any(String) }));
    const bars = instance.root.findAll(
      (node) =>
        typeof node.props.testID === 'string' && node.props.testID.startsWith('analytics.volumeChart.bar.'),
    );
    expect(bars.length).toBeGreaterThan(0);
    expect(cache.get('progress:volume')).toContain('"total_kg":2500');
  });

  it('renders separate weekly volume charts labeled by muscle group', async () => {
    mockGetVolume.mockResolvedValue([
      { date: new Date().toISOString(), muscle_group_id: 1, total_kg: 1000 },
      { date: new Date().toISOString(), muscle_group_id: 3, total_kg: 500 },
    ]);
    const instance = await renderAnalytics();

    expect(instance.root.findByProps({ testID: 'analytics.volumeGroup.1' })).toBeTruthy();
    expect(instance.root.findByProps({ testID: 'analytics.volumeGroup.3' })).toBeTruthy();
    expect(instance.root.findByProps({ testID: 'analytics.volumeGroupLabel.1' }).props.children).toBe('chest');
    expect(instance.root.findByProps({ testID: 'analytics.volumeGroupLabel.3' }).props.children).toBe('biceps');
  });

  it('shows the volume chart empty state without muscle-group charts when no volume is logged', async () => {
    const instance = await renderAnalytics();

    expect(instance.root.findByProps({ testID: 'analytics.volumeChart.empty' })).toBeTruthy();
    expect(instance.root.findAll(
      (node) => typeof node.props.testID === 'string' && node.props.testID.startsWith('analytics.volumeGroup.'),
    )).toHaveLength(0);
  });

  it('renders the latest body weight and the weight trend chart', async () => {
    const instance = await renderAnalytics();

    const children = instance.root.findByProps({ testID: 'analytics.weightValue' }).props
      .children as unknown;
    expect([children].flat().join('')).toBe('83.2 kg');
    expect(instance.root.findByProps({ testID: 'analytics.weightChart' })).toBeTruthy();
  });

  it('logs a body weight through the API and refreshes from local db', async () => {
    const created: BodyWeightEntry = {
      id: 'bw3',
      weight_kg: 82.0,
      measured_at: '2026-02-03T08:00:00Z',
      created_at: '2026-02-03T08:00:00Z',
    };
    mockLogBodyWeight.mockResolvedValue(created);
    const instance = await renderAnalytics();

    await act(async () => {
      instance.root.findByProps({ testID: 'analytics.weightLog' }).props.onPress();
    });
    await act(async () => {
      instance.root.findByProps({ testID: 'analytics.weightInput' }).props.onChangeText('82');
    });
    await act(async () => {
      await instance.root.findByProps({ testID: 'analytics.weightSubmit' }).props.onPress();
    });

    expect(mockLogBodyWeight).toHaveBeenCalledWith(
      expect.objectContaining({ weight_kg: 82 }),
    );
    expect(mockUpsertRemote).toHaveBeenCalledWith('body_weights', created);
  });

  it('stores the weight locally as a dirty create when offline', async () => {
    mockLogBodyWeight.mockRejectedValue(new ApiError(0, 'NETWORK', 'offline', 'Offline'));
    const instance = await renderAnalytics();

    await act(async () => {
      instance.root.findByProps({ testID: 'analytics.weightLog' }).props.onPress();
    });
    await act(async () => {
      instance.root.findByProps({ testID: 'analytics.weightInput' }).props.onChangeText('82');
    });
    await act(async () => {
      await instance.root.findByProps({ testID: 'analytics.weightSubmit' }).props.onPress();
    });

    expect(mockUpsertBodyWeight).toHaveBeenCalledWith(
      expect.objectContaining({ weight_kg: 82 }),
      expect.objectContaining({ is_dirty: 1, operation: 'create' }),
    );
    expect(instance.root.findByProps({ testID: 'analytics.weightError' }).props.children).toBe(
      'Offline',
    );
  });
});
