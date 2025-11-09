import fs from 'node:fs/promises';
import { createEmptyDomainAggregate, validateDomainAggregate } from '@architekt/domain';

/**
 * @typedef {{ load: () => Promise<import('@architekt/domain').DomainAggregate>, save: (data: import('@architekt/domain').DomainAggregate) => Promise<void> }} PersistenceAdapter
 */

/**
 * @param {{ dataFile: string }} options
 * @returns {PersistenceAdapter}
 */
export const createFileSystemPersistence = ({ dataFile }) => {
  const read = async () => {
    try {
      const raw = await fs.readFile(dataFile, 'utf-8');
      const parsed = JSON.parse(raw);
      return validateDomainAggregate(parsed);
    } catch (error) {
      if (error && typeof error === 'object' && error.code === 'ENOENT') {
        return createEmptyDomainAggregate();
      }
      throw error;
    }
  };

  const write = async (data) => {
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
