# Architekt workspace guide

## Toolchain
- Use **Node.js 20+** with the bundled npm CLI. The monorepo relies on npm workspaces; yarn/pnpm are not configured.
- TypeScript sources are compiled with the repo-wide `tsconfig.base.json`. Each package extends it.

## Installation
1. Install dependencies at the repository root:
   ```bash
   npm install
   ```
   This hoists shared dev dependencies such as `tsx` and `vitest`. Skipping this step causes the workspace test runners to fail with `Cannot find module 'tsx/cli'` or missing Vitest binaries.
2. No additional bootstrap is required; workspace build steps (e.g., generating `dist` output for `@architekt/domain`) are triggered by the scripts themselves.

## Tests
- Run the full suite from the root:
  ```bash
  npm test
  ```
  This runs the backend (Node test runner via `scripts/run-tsx-tests.mjs`), the domain unit tests, and the frontend Vitest suite.
- To focus on a single package, run `npm --workspace <package-name> test`, for example:
  ```bash
  npm --workspace @architekt/backend test
  npm --workspace @architekt/domain test
  npm --workspace @architekt/frontend test
  ```
- The custom TSX runner expects test files that match `*.test.ts` or `*.test.tsx` underneath the specified roots.

## Pre-submit checklist
Before sending work for review, run the following commands from the repository root and ensure they succeed:

```bash
npm run lint
npm run build
npm test
```

These commands catch lint regressions, verify production builds, and confirm the automated test suites still pass.

## Development workflows
- Start the backend API locally with:
  ```bash
  npm run start:backend
  ```
  The command builds the shared domain package before launching `packages/backend/src/index.ts` through TSX. The server listens on port `4000` by default and persists data to `data/store.json` (configurable via `DATA_DIR`).
- Build artifacts when needed:
  ```bash
  npm run build
  ```
  which executes each workspace's build script (e.g., compiling TypeScript to `dist/`).
- Lint or format across the repo using:
  ```bash
  npm run lint
  npm run format
  npm run format:write
  ```

## Repository layout
- `packages/domain` – Shared validation logic; emits reusable domain helpers.
- `packages/backend` – Express-based HTTP API backed by filesystem persistence.
- `packages/frontend` – Minimal Vite + React prototype; Vitest covers UI smoke tests.
- `scripts/run-tsx-tests.mjs` – Shared helper that discovers `*.test.ts(x)` files and executes them via TSX's test mode.

Follow these steps before making changes to ensure dependencies and tests are healthy for future work.
