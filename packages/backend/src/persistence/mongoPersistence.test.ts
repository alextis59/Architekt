import assert from 'node:assert/strict';
import test from 'node:test';
import { createEmptyDomainAggregate } from '@architekt/domain';
import { createMongoPersistence } from './mongoPersistence.js';

test('mongo persistence lazily connects and returns empty aggregate when no document exists', async (t) => {
  const findOne = t.mock.fn(async () => null);
  const updateOne = t.mock.fn(async () => undefined);

  const collection = { findOne, updateOne } as const;
  const collectionFactory = t.mock.fn(() => collection);
  const db = t.mock.fn(() => ({ collection: collectionFactory }));
  const client = { db };
  const connect = t.mock.fn(async () => client);

  const mongodb = await import('mongodb');
  const originalConnect = mongodb.MongoClient.connect;
  mongodb.MongoClient.connect = connect as unknown as typeof mongodb.MongoClient.connect;

  const persistence = createMongoPersistence({
    uri: 'mongodb://example:27017',
    database: 'architekt',
    collection: 'aggregates'
  });

  const aggregate = await persistence.load('user-1');

  assert.deepEqual(aggregate, createEmptyDomainAggregate());
  assert.equal(connect.mock.callCount(), 1);
  assert.equal(db.mock.callCount(), 1);
  assert.equal(collectionFactory.mock.callCount(), 1);
  assert.deepEqual(findOne.mock.calls[0]?.arguments, [{ _id: 'architekt' }]);
  mongodb.MongoClient.connect = originalConnect;
});

test('mongo persistence migrates legacy aggregate document shape', async (t) => {
  const legacyAggregate = createEmptyDomainAggregate();
  const findOne = t.mock.fn(async () => ({ _id: 'architekt', aggregate: legacyAggregate }));
  const collection = { findOne, updateOne: async () => undefined } as const;
  const mongodb = await import('mongodb');
  const originalConnect = mongodb.MongoClient.connect;
  mongodb.MongoClient.connect = (async () => ({
    db: () => ({
      collection: () => collection
    })
  })) as unknown as typeof mongodb.MongoClient.connect;

  const persistence = createMongoPersistence({
    uri: 'mongodb://localhost:27017',
    database: 'architekt',
    collection: 'aggregates'
  });

  const aggregate = await persistence.load('local-user');
  assert.deepEqual(aggregate, legacyAggregate);
  mongodb.MongoClient.connect = originalConnect;
});

test('mongo persistence saves aggregates with upsert semantics', async (t) => {
  const findOne = t.mock.fn(async () => ({ _id: 'architekt', aggregates: {} }));
  const updateOne = t.mock.fn(async () => undefined);
  const collection = { findOne, updateOne } as const;
  const connect = t.mock.fn(async () => ({
    db: () => ({
      collection: () => collection
    })
  }));
  const mongodb = await import('mongodb');
  const originalConnect = mongodb.MongoClient.connect;
  mongodb.MongoClient.connect = connect as unknown as typeof mongodb.MongoClient.connect;

  const persistence = createMongoPersistence({
    uri: 'mongodb://localhost:27017',
    database: 'architekt',
    collection: 'aggregates'
  });

  await persistence.load('user-a');
  const aggregate = createEmptyDomainAggregate();
  await persistence.save('user-a', aggregate);

  assert.equal(connect.mock.callCount(), 1);
  assert.equal(updateOne.mock.callCount(), 1);
  const call = updateOne.mock.calls[0];
  assert.deepEqual(call?.arguments[0], { _id: 'architekt' });
  assert.deepEqual(call?.arguments[1], {
    $set: {
      'aggregates.user-a': aggregate
    }
  });
  assert.deepEqual(call?.arguments[2], { upsert: true });
  mongodb.MongoClient.connect = originalConnect;
});

test('mongo persistence surfaces helpful error when mongodb dependency is missing', async () => {
  const mongodb = await import('mongodb');
  const originalConnect = mongodb.MongoClient.connect;
  mongodb.MongoClient.connect = (async () => {
    const error = new Error(
      "MongoDB persistence requires the optional 'mongodb' dependency. Install it with `npm install mongodb` to enable this driver."
    );
    (error as NodeJS.ErrnoException).code = 'ERR_MODULE_NOT_FOUND';
    throw error;
  }) as unknown as typeof mongodb.MongoClient.connect;

  const persistence = createMongoPersistence({
    uri: 'mongodb://localhost:27017',
    database: 'architekt',
    collection: 'aggregates'
  });

  await assert.rejects(
    () => persistence.load('user-1'),
    /MongoDB persistence requires the optional 'mongodb' dependency/
  );
  mongodb.MongoClient.connect = originalConnect;
});
