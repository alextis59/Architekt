import type { DomainAggregate } from '@architekt/domain';
import { createFileSystemPersistence } from './fileSystemPersistence.js';
import { createMemoryPersistence } from './memoryPersistence.js';
import { createMongoPersistence } from './mongoPersistence.js';

export type PersistenceAdapter = {
  load: () => Promise<DomainAggregate>;
  save: (data: DomainAggregate) => Promise<void>;
};

export type FileSystemPersistenceConfig = {
  driver: 'filesystem';
  dataFile: string;
  backupDir?: string;
  maxBackups?: number;
};

export type MemoryPersistenceConfig = {
  driver: 'memory';
  seed?: DomainAggregate;
};

export type MongoPersistenceConfig = {
  driver: 'mongo';
  uri: string;
  database: string;
  collection: string;
};

export type PersistenceConfig =
  | FileSystemPersistenceConfig
  | MemoryPersistenceConfig
  | MongoPersistenceConfig;

export const createPersistence = async (config: PersistenceConfig): Promise<PersistenceAdapter> => {
  switch (config.driver) {
    case 'filesystem':
      return createFileSystemPersistence({
        dataFile: config.dataFile,
        backupDir: config.backupDir,
        maxBackups: config.maxBackups
      });
    case 'memory':
      return createMemoryPersistence(config.seed);
    case 'mongo':
      return createMongoPersistence({
        uri: config.uri,
        database: config.database,
        collection: config.collection
      });
    default: {
      const exhaustive: never = config;
      throw new Error(`Unsupported persistence driver ${(exhaustive as { driver: string }).driver}`);
    }
  }
};

export { createFileSystemPersistence, createMemoryPersistence, createMongoPersistence };
