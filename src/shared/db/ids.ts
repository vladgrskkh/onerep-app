// Client-generated UUIDs for local-first rows (exercises, templates,
// workouts, workout exercises and sets created offline). The server assigns
// its own ids on push; markSynced remaps local rows to server ids.
export function newId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}
