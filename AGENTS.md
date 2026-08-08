# onerep-app

React Native (Expo) frontend for OneRep gym training app.

## Stack
- React Native (Expo SDK 52+), React Native Web, TypeScript
- expo-sqlite, expo-secure-store, expo-camera, expo-image-picker
- React Navigation, TanStack Query

## Commands
```bash
npm start         # Start Expo dev server
npm run lint      # ESLint
npm run typecheck # tsc --noEmit
npm test          # Run tests
```

## Architecture
```
src/
  features/       # auth, exercises, templates, workouts, progress
  shared/         # api client, sync engine, SQLite, UI components, hooks
  navigation/     # React Navigation config
```

Each feature folder is self-contained with screens and local state.

## Offline-first
All data mirrored in local SQLite (expo-sqlite). Sync engine pushes local changes
then pulls remote via `?since=` polling on existing REST endpoints.

## CI
- Lint + typecheck on push/PR
- EAS builds for deployment

## Local dev
```bash
npm ci
npx expo start
```
