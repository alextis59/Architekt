import type { DomainAggregate } from '@architekt/domain';
import { createFileSystemPersistence } from './fileSystemPersistence.js';
import { createMemoryPersistence } from './memoryPersistence.js';

export type PersistenceAdapter = {
  load: () => Promise<DomainAggregate>;
  save: (data: DomainAggregate) => Promise<void>;
};

export { createFileSystemPersistence, createMemoryPersistence };
