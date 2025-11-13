import { createEmptyDomainAggregate, validateDomainAggregate, type DomainAggregate } from '@architekt/domain';
import type { PersistenceAdapter } from './index.js';

type MemoryStore = Record<string, DomainAggregate>;

const sanitizeStore = (input: unknown): MemoryStore => {
  if (!input || typeof input !== 'object') {
    return {};
  }

  if ('projects' in (input as Record<string, unknown>)) {
    const aggregate = validateDomainAggregate(input);
    return { 'local-user': aggregate };
  }

  const entries = Object.entries(input as Record<string, unknown>).flatMap(
    ([userId, value]): [string, DomainAggregate][] => {
      try {
        const aggregate = validateDomainAggregate(value);
        return [[userId, aggregate]];
      } catch {
        return [];
      }
    }
  );

  return Object.fromEntries(entries);
};

export const createMemoryPersistence = (initialData: unknown = {}): PersistenceAdapter => {
  let store = sanitizeStore(initialData);

  return {
    async load(userId) {
      const aggregate = store[userId];
      return aggregate ? validateDomainAggregate(aggregate) : createEmptyDomainAggregate();
    },
    async save(userId, data) {
      const aggregate = validateDomainAggregate(data);
      store = { ...store, [userId]: aggregate };
    }
  };
};
