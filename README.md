# Architekt

Architekt is a lightweight monorepo containing a filesystem-backed backend service, a
vanilla HTML prototype, and shared domain utilities for the architecture design platform
outlined in `Project.md`.

The repository is designed to operate without external npm registry access so that the
project can be installed and tested in constrained environments.

## Getting started

```bash
npm install
npm test
```

### Available scripts

- `npm test` – runs the backend, shared domain, and frontend test suites.
- `npm run start:backend` – launches the HTTP server using the configured persistence adapter.
- `npm run start:frontend` – starts the Vite development server for the React client.
- `npm run dev` – spawns both backend and frontend dev servers with shared console output.
- `npm run data:export -- --out ./backup.json` – exports the current domain aggregate to stdout or the provided file.
- `npm run data:migrate:mongo` – copies the filesystem store into a MongoDB collection using the active environment variables.

## Packages

- `@architekt/domain` – shared domain helpers that validate persisted aggregate data.
- `@architekt/backend` – minimal HTTP API exposing health and project listing endpoints.
- `@architekt/frontend` – static landing page placeholder for the future React interface.

## Persistence configuration

The backend can persist data either to the local filesystem (default) or to MongoDB.

Environment variables:

- `PERSISTENCE_DRIVER` – `filesystem` (default) or `mongo`.
- `DATA_DIR` – directory for filesystem storage (defaults to `<repo>/data`).
- `BACKUP_DIR` – optional directory for rotated JSON backups (defaults to `<DATA_DIR>/backups`).
- `MAX_BACKUPS` – number of historical backups to retain (defaults to 10).
- `MONGO_URI` – MongoDB connection string (required when `PERSISTENCE_DRIVER=mongo`).
- `MONGO_DATABASE` – target MongoDB database (defaults to `architekt`).
- `MONGO_COLLECTION` – target MongoDB collection (defaults to `aggregates`).

Filesystem writes are atomic and automatically back up the previous payload before
persisting. Backups older than the configured threshold are pruned each time new data
is saved. The `npm run data:export` script can snapshot the aggregate on demand, and
`npm run data:migrate:mongo` seeds MongoDB using the filesystem store.

## Continuous Integration

The GitHub Actions workflow in `.github/workflows/ci.yml` installs dependencies (no
external downloads are required) and executes the shared `npm test` script.
