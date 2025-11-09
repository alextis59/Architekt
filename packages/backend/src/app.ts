import express, { type NextFunction, type Request, type Response } from 'express';
import type { PersistenceAdapter } from './persistence/index.js';
import { HttpError } from './httpError.js';
import {
  createProject,
  createSystem,
  createFlow,
  deleteProject,
  deleteSystem,
  deleteFlow,
  getProject,
  getSystem,
  getFlow,
  listProjects,
  listSystems,
  listFlows,
  updateProject,
  updateSystem,
  updateFlow
} from './services/projectService.js';

type AppOptions = {
  persistence: PersistenceAdapter;
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

export const createApp = ({ persistence }: AppOptions) => {
  const app = express();
  app.use(express.json());

  app.get(
    '/health',
    asyncHandler(async (_req, res) => {
      res.json({ status: 'ok' });
    })
  );

  app.get(
    '/projects',
    asyncHandler(async (_req, res) => {
      const projects = await listProjects(persistence);
      res.json({ projects });
    })
  );

  app.post(
    '/projects',
    asyncHandler(async (req, res) => {
      const project = await createProject(persistence, req.body ?? {});
      res.status(201).json({ project });
    })
  );

  app.get(
    '/projects/:projectId',
    asyncHandler(async (req, res) => {
      const project = await getProject(persistence, req.params.projectId);
      res.json({ project });
    })
  );

  app.put(
    '/projects/:projectId',
    asyncHandler(async (req, res) => {
      const project = await updateProject(persistence, req.params.projectId, req.body ?? {});
      res.json({ project });
    })
  );

  app.delete(
    '/projects/:projectId',
    asyncHandler(async (req, res) => {
      await deleteProject(persistence, req.params.projectId);
      res.status(204).send();
    })
  );

  app.get(
    '/projects/:projectId/systems',
    asyncHandler(async (req, res) => {
      const systems = await listSystems(persistence, req.params.projectId);
      res.json({ systems });
    })
  );

  app.post(
    '/projects/:projectId/systems',
    asyncHandler(async (req, res) => {
      const system = await createSystem(persistence, req.params.projectId, req.body ?? {});
      res.status(201).json({ system });
    })
  );

  app.get(
    '/projects/:projectId/systems/:systemId',
    asyncHandler(async (req, res) => {
      const system = await getSystem(persistence, req.params.projectId, req.params.systemId);
      res.json({ system });
    })
  );

  app.put(
    '/projects/:projectId/systems/:systemId',
    asyncHandler(async (req, res) => {
      const system = await updateSystem(
        persistence,
        req.params.projectId,
        req.params.systemId,
        req.body ?? {}
      );
      res.json({ system });
    })
  );

  app.delete(
    '/projects/:projectId/systems/:systemId',
    asyncHandler(async (req, res) => {
      await deleteSystem(persistence, req.params.projectId, req.params.systemId);
      res.status(204).send();
    })
  );

  app.get(
    '/projects/:projectId/flows',
    asyncHandler(async (req, res) => {
      const flows = await listFlows(persistence, req.params.projectId);
      res.json({ flows });
    })
  );

  app.post(
    '/projects/:projectId/flows',
    asyncHandler(async (req, res) => {
      const flow = await createFlow(persistence, req.params.projectId, req.body ?? {});
      res.status(201).json({ flow });
    })
  );

  app.get(
    '/projects/:projectId/flows/:flowId',
    asyncHandler(async (req, res) => {
      const flow = await getFlow(persistence, req.params.projectId, req.params.flowId);
      res.json({ flow });
    })
  );

  app.put(
    '/projects/:projectId/flows/:flowId',
    asyncHandler(async (req, res) => {
      const flow = await updateFlow(persistence, req.params.projectId, req.params.flowId, req.body ?? {});
      res.json({ flow });
    })
  );

  app.delete(
    '/projects/:projectId/flows/:flowId',
    asyncHandler(async (req, res) => {
      await deleteFlow(persistence, req.params.projectId, req.params.flowId);
      res.status(204).send();
    })
  );

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof HttpError) {
      res.status(error.status).json({ message: error.message });
      return;
    }

    // eslint-disable-next-line no-console
    console.error('Unexpected error', error);
    res.status(500).json({ message: 'Internal Server Error' });
  });

  return app;
};
