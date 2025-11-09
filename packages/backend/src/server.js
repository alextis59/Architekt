import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createFileSystemPersistence } from './persistence/index.js';

export const startServer = async () => {
  const config = loadConfig();
  const directory = path.dirname(config.dataFile);
  await fs.mkdir(directory, { recursive: true });

  const persistence = createFileSystemPersistence({ dataFile: config.dataFile });
  const app = createApp({ persistence });

  const server = http.createServer((req, res) => {
    app.handle(req, res);
  });

  return new Promise((resolve) => {
    server.listen(config.port, () => {
      // eslint-disable-next-line no-console
      console.log(`Architekt backend listening on port ${config.port}`);
      resolve(server);
    });
  });
};
