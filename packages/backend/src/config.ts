import path from 'node:path';
import type { PersistenceConfig } from './persistence/index.js';

export type BackendConfig = {
  port: number;
  persistence: PersistenceConfig;
};

const parseNumber = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? `${fallback}`, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

export const loadConfig = (): BackendConfig => {
  const port = parseNumber(process.env.PORT, 4000);
  const driver = (process.env.PERSISTENCE_DRIVER ?? 'filesystem').toLowerCase();

  if (driver === 'mongo') {
    const uri = process.env.MONGO_URI;

    if (!uri) {
      throw new Error('MONGO_URI must be defined when using mongo persistence');
    }

    const database = process.env.MONGO_DATABASE ?? 'architekt';
    const collection = process.env.MONGO_COLLECTION ?? 'aggregates';

    return {
      port,
      persistence: {
        driver: 'mongo',
        uri,
        database,
        collection
      }
    };
  }

  const dataDir = process.env.DATA_DIR ?? path.resolve(process.cwd(), 'data');
  const dataFile = path.join(dataDir, 'store.json');
  const backupDir = process.env.BACKUP_DIR ?? path.join(dataDir, 'backups');
  const maxBackups = Math.max(0, parseNumber(process.env.MAX_BACKUPS, 10));

  return {
    port,
    persistence: {
      driver: 'filesystem',
      dataFile,
      backupDir,
      maxBackups
    }
  };
};
