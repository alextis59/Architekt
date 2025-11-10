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
  aggregate: DomainAggregate;
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
    async load() {
      const col = await getCollection();
      const document = await col.findOne({ _id: 'architekt' });

      if (!document) {
        return createEmptyDomainAggregate();
      }

      return validateDomainAggregate(document.aggregate);
    },
    async save(data) {
      const col = await getCollection();
      const aggregate = validateDomainAggregate(data);

      await col.updateOne(
        { _id: 'architekt' },
        {
          $set: {
            aggregate
          }
        },
        { upsert: true }
      );
    }
  };
};
