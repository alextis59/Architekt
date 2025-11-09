import express, { type NextFunction, type Request, type Response } from 'express';
import { createProjectIndex } from '@architekt/domain';
import type { PersistenceAdapter } from './persistence/index.js';

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
      const data = await persistence.load();
      res.json({ projects: createProjectIndex(data) });
    })
  );

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    // eslint-disable-next-line no-console
    console.error('Unexpected error', error);
    res.status(500).json({ message: 'Internal Server Error' });
  });

  return app;
};
