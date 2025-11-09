import { createEmptyDomainAggregate, validateDomainAggregate } from '@architekt/domain';

export const createMemoryPersistence = (initialData = createEmptyDomainAggregate()) => {
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
