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
  features/
    auth/         # login, register, profile
    exercises/    # browse, create, detail
    templates/    # my + public templates, fork, publish
    workouts/     # active workout, history, log sets
    progress/     # 1RM, volume, body weight charts
  shared/
    api/          # typed API client (auth + gym services)
    sync/         # sync engine (push local, pull remote via ?since=)
    db/           # expo-sqlite schema + helpers (mirrors server tables)
    ui/           # shared components
    hooks/        # shared hooks (useAuth, useSync, useOnlineStatus)
  navigation/     # React Navigation config
```

Each feature folder is self-contained: screens, its own API calls, local state.
Shared infra lives in `shared/`.

## Frontend conventions
- Offline-first: all writes go to local SQLite (`is_synced`, `last_synced_at`
  columns), sync engine pushes then pulls on connectivity.
- API client is generated/typed from `onerep-contracts` OpenAPI specs.
- JWT stored in expo-secure-store; auto-refresh on 401 via refresh token.
- Error responses use the shared OneRep error contract
  (`{ error: { code, message, user_message } }`) — surface `user_message`.

## CI
- Lint + typecheck on push/PR
- EAS builds for deployment

## Local dev
```bash
npm ci
npx expo start
```
