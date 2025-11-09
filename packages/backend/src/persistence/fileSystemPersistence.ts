import fs from 'node:fs/promises';
import { createEmptyDomainAggregate, validateDomainAggregate } from '@architekt/domain';
import type { PersistenceAdapter } from './index.js';

type FileSystemPersistenceOptions = {
  dataFile: string;
};

export const createFileSystemPersistence = ({ dataFile }: FileSystemPersistenceOptions): PersistenceAdapter => {
  const read = async () => {
    try {
      const raw = await fs.readFile(dataFile, 'utf-8');
      const parsed = JSON.parse(raw);
      return validateDomainAggregate(parsed);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
        return createEmptyDomainAggregate();
      }

      throw error;
    }
  };

  const write = async (data: Parameters<PersistenceAdapter['save']>[0]) => {
    const payload = JSON.stringify(validateDomainAggregate(data), null, 2);
    await fs.writeFile(dataFile, payload, 'utf-8');
  };

  return {
    async load() {
      return read();
    },
    async save(data) {
      await write(data);
    }
  };
};
