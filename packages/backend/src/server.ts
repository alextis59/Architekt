import type { Server } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createPersistence } from './persistence/index.js';

export const startServer = async (): Promise<Server> => {
  const config = loadConfig();
  const persistenceConfig = config.persistence;

  if (persistenceConfig.driver === 'filesystem') {
    const directory = path.dirname(persistenceConfig.dataFile);
    await fs.mkdir(directory, { recursive: true });

    if (persistenceConfig.backupDir) {
      await fs.mkdir(persistenceConfig.backupDir, { recursive: true });
    }
  }

  const persistence = await createPersistence(persistenceConfig);
  const app = createApp({ persistence, auth: config.auth });

  return new Promise((resolve) => {
    const server = app.listen(config.port, () => {
      // eslint-disable-next-line no-console
      console.log(`Architekt backend listening on port ${config.port}`);
      resolve(server);
    });
  });
};
