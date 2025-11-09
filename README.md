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

- `npm test` – runs the backend and frontend test suites with Node's built-in test runner.
- `npm run start:backend` – launches the filesystem-backed HTTP server.

## Packages

- `@architekt/domain` – shared domain helpers that validate persisted aggregate data.
- `@architekt/backend` – minimal HTTP API exposing health and project listing endpoints.
- `@architekt/frontend` – static landing page placeholder for the future React interface.

## Continuous Integration

The GitHub Actions workflow in `.github/workflows/ci.yml` installs dependencies (no
external downloads are required) and executes the shared `npm test` script.
