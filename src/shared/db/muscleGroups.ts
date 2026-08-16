// Static catalog mirroring the server's seeded muscle_groups rows
// (gym-api migrations: chest, quads, biceps, triceps, shoulders, back,
// glutes, hamstrings, calves, abs, forearms, traps, lats, adductors,
// obliques). Ids are stable across environments because they come from a
// SERIAL seed; the gym API has no muscle-group listing endpoint yet.
export interface MuscleGroupOption {
  id: number;
  name: string;
}

export const MUSCLE_GROUPS: MuscleGroupOption[] = [
  { id: 1, name: 'chest' },
  { id: 2, name: 'quads' },
  { id: 3, name: 'biceps' },
  { id: 4, name: 'triceps' },
  { id: 5, name: 'shoulders' },
  { id: 6, name: 'back' },
  { id: 7, name: 'glutes' },
  { id: 8, name: 'hamstrings' },
  { id: 9, name: 'calves' },
  { id: 10, name: 'abs' },
  { id: 11, name: 'forearms' },
  { id: 12, name: 'traps' },
  { id: 13, name: 'lats' },
  { id: 14, name: 'adductors' },
  { id: 15, name: 'obliques' },
];

const MUSCLE_GROUP_NAMES = new Map(MUSCLE_GROUPS.map((group) => [group.id, group.name]));

export function muscleGroupName(id: number): string {
  return MUSCLE_GROUP_NAMES.get(id) ?? `muscle group ${id}`;
}
