import { createEmptyDomainAggregate, validateDomainAggregate, type DomainAggregate } from '@architekt/domain';
import type { PersistenceAdapter } from './index.js';
import type { Collection, MongoClient } from 'mongodb';

type MongoPersistenceOptions = {
  uri: string;
  database: string;
  collection: string;
};

type PersistenceDocument = {
  _id: string;
  aggregates: Record<string, DomainAggregate>;
};

export const createMongoPersistence = ({
  uri,
  database,
  collection
}: MongoPersistenceOptions): PersistenceAdapter => {
  let clientPromise: Promise<MongoClient> | null = null;

  const loadMongoModule = async () =>
    import('mongodb').catch((error: unknown) => {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: string }).code === 'ERR_MODULE_NOT_FOUND'
      ) {
        throw new Error(
          "MongoDB persistence requires the optional 'mongodb' dependency. Install it with `npm install mongodb` to enable this driver."
        );
      }

      throw error;
    });

  const getCollection = async (): Promise<Collection<PersistenceDocument>> => {
    if (!clientPromise) {
      clientPromise = loadMongoModule().then(({ MongoClient: Mongo }) =>
        Mongo.connect(uri, {
          serverSelectionTimeoutMS: 5_000
        })
      );
    }

    const client = await clientPromise;
    return client.db(database).collection<PersistenceDocument>(collection);
  };

  return {
    async load(userId) {
      const col = await getCollection();
      const document = await col.findOne({ _id: 'architekt' });

      if (!document) {
        return createEmptyDomainAggregate();
      }

      const aggregates = document.aggregates ??
        ('aggregate' in document && document.aggregate
          ? { 'local-user': validateDomainAggregate((document as { aggregate: DomainAggregate }).aggregate) }
          : {});

      const aggregate = aggregates[userId];
      return aggregate ? validateDomainAggregate(aggregate) : createEmptyDomainAggregate();
    },
    async save(userId, data) {
      const col = await getCollection();
      const aggregate = validateDomainAggregate(data);

      await col.updateOne(
        { _id: 'architekt' },
        {
          $set: {
            [`aggregates.${userId}`]: aggregate
          }
        },
        { upsert: true }
      );
    },
    async loadAll() {
      const col = await getCollection();
      const document = await col.findOne({ _id: 'architekt' });

      if (!document) {
        return {};
      }

      const aggregates =
        document.aggregates ??
        ('aggregate' in document && document.aggregate
          ? { 'local-user': validateDomainAggregate((document as { aggregate: DomainAggregate }).aggregate) }
          : {});

      return Object.fromEntries(
        Object.entries(aggregates).map(([userId, aggregate]) => [userId, validateDomainAggregate(aggregate)])
      );
    }
  };
};
