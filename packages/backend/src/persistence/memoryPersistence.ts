import { createEmptyDomainAggregate, validateDomainAggregate } from '@architekt/domain';
import type { PersistenceAdapter } from './index.js';

type MemoryPersistenceOptions = {
  initialData?: Parameters<PersistenceAdapter['save']>[0];
};

export const createMemoryPersistence = (
  initialData: MemoryPersistenceOptions['initialData'] = createEmptyDomainAggregate()
): PersistenceAdapter => {
  let store = validateDomainAggregate(initialData);

  return {
    async load() {
      return validateDomainAggregate(store);
    },
    async save(data) {
      store = validateDomainAggregate(data);
    }
  };
};
