import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PersistenceAdapter } from './persistence/index.js';
import { HttpError, UnauthorizedError } from './httpError.js';
import {
  createProject,
  createSystem,
  createFlow,
  createDataModel,
  createComponent,
  deleteProject,
  deleteSystem,
  deleteFlow,
  deleteDataModel,
  deleteComponent,
  getProject,
  getSystem,
  getFlow,
  getDataModel,
  getComponent,
  listProjects,
  listSystems,
  listFlows,
  listDataModels,
  listComponents,
  updateProject,
  updateSystem,
  updateFlow,
  updateDataModel,
  updateComponent
} from './services/projectService.js';
import { createAuthMiddleware, type AuthConfig } from './auth.js';

const getAuthenticatedUser = (req: Request) => {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required');
  }

  return req.user;
};

type AppOptions = {
  persistence: PersistenceAdapter;
  auth: AuthConfig;
};

const asyncHandler = (
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void> | void
) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };

const parseQueryValues = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.flatMap((item) => (typeof item === 'string' ? [item] : []));
  }

  return typeof value === 'string' ? [value] : [];
};

const sanitizeFilterValues = (values: string[]): string[] => {
  const deduplicated = new Set<string>();

  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed) {
      deduplicated.add(trimmed);
    }
  }

  return [...deduplicated];
};

export const createApp = ({ persistence, auth }: AppOptions) => {
  const app = express();
  app.use(express.json());

  // Serve static frontend files (public - allows frontend to load and show Google Sign-In)
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const frontendDistPath = path.join(__dirname, '..', '..', 'frontend', 'dist');
  app.use(express.static(frontendDistPath));

  // Health check endpoint (public)
  app.get(
    '/health',
    asyncHandler(async (_req, res) => {
      res.json({ status: 'ok' });
    })
  );

  // API routes under /api prefix
  const apiRouter = express.Router();

  // Apply authentication middleware to all subsequent API routes
  apiRouter.use(createAuthMiddleware(auth));

  apiRouter.get(
    '/projects',
    asyncHandler(async (req, res) => {
      const user = getAuthenticatedUser(req);
      const projects = await listProjects(persistence, user.id);
      res.json({ projects });
    })
  );

  apiRouter.post(
    '/projects',
    asyncHandler(async (req, res) => {
      const user = getAuthenticatedUser(req);
      const project = await createProject(persistence, user.id, req.body ?? {});
      res.status(201).json({ project });
    })
  );

  apiRouter.get(
    '/projects/:projectId',
    asyncHandler(async (req, res) => {
      const user = getAuthenticatedUser(req);
      const project = await getProject(persistence, user.id, req.params.projectId);
      res.json({ project });
    })
  );

  apiRouter.put(
    '/projects/:projectId',
    asyncHandler(async (req, res) => {
      const user = getAuthenticatedUser(req);
      const project = await updateProject(persistence, user.id, req.params.projectId, req.body ?? {});
      res.json({ project });
    })
  );

  apiRouter.delete(
    '/projects/:projectId',
    asyncHandler(async (req, res) => {
      const user = getAuthenticatedUser(req);
      await deleteProject(persistence, user.id, req.params.projectId);
      res.status(204).send();
    })
  );

  apiRouter.get(
    '/projects/:projectId/systems',
    asyncHandler(async (req, res) => {
      const user = getAuthenticatedUser(req);
      const systems = await listSystems(persistence, user.id, req.params.projectId);
      res.json({ systems });
    })
  );

  apiRouter.post(
    '/projects/:projectId/systems',
    asyncHandler(async (req, res) => {
      const user = getAuthenticatedUser(req);
      const system = await createSystem(persistence, user.id, req.params.projectId, req.body ?? {});
      res.status(201).json({ system });
    })
  );

  apiRouter.get(
    '/projects/:projectId/systems/:systemId',
    asyncHandler(async (req, res) => {
      const user = getAuthenticatedUser(req);
      const system = await getSystem(persistence, user.id, req.params.projectId, req.params.systemId);
      res.json({ system });
    })
  );

  apiRouter.put(
    '/projects/:projectId/systems/:systemId',
    asyncHandler(async (req, res) => {
      const user = getAuthenticatedUser(req);
      const system = await updateSystem(
        persistence,
        user.id,
        req.params.projectId,
        req.params.systemId,
        req.body ?? {}
      );
      res.json({ system });
    })
  );

  apiRouter.delete(
    '/projects/:projectId/systems/:systemId',
    asyncHandler(async (req, res) => {
      const user = getAuthenticatedUser(req);
      await deleteSystem(persistence, user.id, req.params.projectId, req.params.systemId);
      res.status(204).send();
    })
  );

  apiRouter.get(
    '/projects/:projectId/flows',
    asyncHandler(async (req, res) => {
      const user = getAuthenticatedUser(req);
      const scopeFilters = sanitizeFilterValues(parseQueryValues(req.query.scope));
      const tagFilters = sanitizeFilterValues(parseQueryValues(req.query.tag));

      const flows = await listFlows(persistence, user.id, req.params.projectId, {
        scope: scopeFilters,
        tags: tagFilters
      });
      res.json({ flows });
    })
  );

  apiRouter.post(
    '/projects/:projectId/flows',
    asyncHandler(async (req, res) => {
      const user = getAuthenticatedUser(req);
      const flow = await createFlow(persistence, user.id, req.params.projectId, req.body ?? {});
      res.status(201).json({ flow });
    })
  );

  apiRouter.get(
    '/projects/:projectId/flows/:flowId',
    asyncHandler(async (req, res) => {
      const user = getAuthenticatedUser(req);
      const flow = await getFlow(persistence, user.id, req.params.projectId, req.params.flowId);
      res.json({ flow });
    })
  );

  apiRouter.put(
    '/projects/:projectId/flows/:flowId',
    asyncHandler(async (req, res) => {
      const user = getAuthenticatedUser(req);
      const flow = await updateFlow(
        persistence,
        user.id,
        req.params.projectId,
        req.params.flowId,
        req.body ?? {}
      );
      res.json({ flow });
    })
  );

  apiRouter.delete(
    '/projects/:projectId/flows/:flowId',
    asyncHandler(async (req, res) => {
      const user = getAuthenticatedUser(req);
      await deleteFlow(persistence, user.id, req.params.projectId, req.params.flowId);
      res.status(204).send();
    })
  );

  apiRouter.get(
    '/projects/:projectId/data-models',
    asyncHandler(async (req, res) => {
      const user = getAuthenticatedUser(req);
      const dataModels = await listDataModels(persistence, user.id, req.params.projectId);
      res.json({ dataModels });
    })
  );

  apiRouter.post(
    '/projects/:projectId/data-models',
    asyncHandler(async (req, res) => {
      const user = getAuthenticatedUser(req);
      const dataModel = await createDataModel(persistence, user.id, req.params.projectId, req.body ?? {});
      res.status(201).json({ dataModel });
    })
  );

  apiRouter.get(
    '/projects/:projectId/data-models/:dataModelId',
    asyncHandler(async (req, res) => {
      const user = getAuthenticatedUser(req);
      const dataModel = await getDataModel(
        persistence,
        user.id,
        req.params.projectId,
        req.params.dataModelId
      );
      res.json({ dataModel });
    })
  );

  apiRouter.put(
    '/projects/:projectId/data-models/:dataModelId',
    asyncHandler(async (req, res) => {
      const user = getAuthenticatedUser(req);
      const dataModel = await updateDataModel(
        persistence,
        user.id,
        req.params.projectId,
        req.params.dataModelId,
        req.body ?? {}
      );
      res.json({ dataModel });
    })
  );

  apiRouter.delete(
    '/projects/:projectId/data-models/:dataModelId',
    asyncHandler(async (req, res) => {
      const user = getAuthenticatedUser(req);
      await deleteDataModel(persistence, user.id, req.params.projectId, req.params.dataModelId);
      res.status(204).send();
    })
  );

  apiRouter.get(
    '/projects/:projectId/components',
    asyncHandler(async (req, res) => {
      const user = getAuthenticatedUser(req);
      const components = await listComponents(persistence, user.id, req.params.projectId);
      res.json({ components });
    })
  );

  apiRouter.post(
    '/projects/:projectId/components',
    asyncHandler(async (req, res) => {
      const user = getAuthenticatedUser(req);
      const component = await createComponent(persistence, user.id, req.params.projectId, req.body ?? {});
      res.status(201).json({ component });
    })
  );

  apiRouter.get(
    '/projects/:projectId/components/:componentId',
    asyncHandler(async (req, res) => {
      const user = getAuthenticatedUser(req);
      const component = await getComponent(
        persistence,
        user.id,
        req.params.projectId,
        req.params.componentId
      );
      res.json({ component });
    })
  );

  apiRouter.put(
    '/projects/:projectId/components/:componentId',
    asyncHandler(async (req, res) => {
      const user = getAuthenticatedUser(req);
      const component = await updateComponent(
        persistence,
        user.id,
        req.params.projectId,
        req.params.componentId,
        req.body ?? {}
      );
      res.json({ component });
    })
  );

  apiRouter.delete(
    '/projects/:projectId/components/:componentId',
    asyncHandler(async (req, res) => {
      const user = getAuthenticatedUser(req);
      await deleteComponent(persistence, user.id, req.params.projectId, req.params.componentId);
      res.status(204).send();
    })
  );

  // Error handler for API routes
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  apiRouter.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof HttpError) {
      res.status(error.status).json({ message: error.message });
      return;
    }

    // eslint-disable-next-line no-console
    console.error('Unexpected error', error);
    res.status(500).json({ message: 'Internal Server Error' });
  });

  // Mount API router at /api
  app.use('/api', apiRouter);

  // Catch-all route for SPA routing - serves index.html for any unmatched routes
  app.get('*', (_req, res) => {
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });

  return app;
};
