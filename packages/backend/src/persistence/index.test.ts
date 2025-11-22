import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createEmptyDomainAggregate } from '@architekt/domain';
import { createPersistence } from './index.js';

const createTempDir = async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'architekt-persistence-'));
  return dir;
};

test('createPersistence provides a functional filesystem adapter', async () => {
  const dir = await createTempDir();
  const adapter = await createPersistence({
    driver: 'filesystem',
    dataFile: path.join(dir, 'store.json'),
    backupDir: path.join(dir, 'backups'),
    maxBackups: 1
  });

  const empty = await adapter.load('user');
  assert.deepEqual(empty, createEmptyDomainAggregate());

  const aggregate = createEmptyDomainAggregate();
  aggregate.projects['proj'] = {
    id: 'proj',
    name: 'Proj',
    description: '',
    tags: [],
    sharedWith: [],
    rootSystemId: 'sys',
    systems: {},
    flows: {},
    dataModels: {},
    components: {},
    entryPoints: {}
  };

  await adapter.save('user', aggregate);
  const stored = await adapter.load('user');
  assert.deepEqual(stored.projects['proj']?.id, 'proj');
});

test('createPersistence returns memory adapter seeded with data', async () => {
  const seed = {
    projects: {
      'proj-1': {
        id: 'proj-1',
        name: 'Seeded',
        description: '',
        tags: [],
        sharedWith: [],
        rootSystemId: 'sys',
        systems: {},
        flows: {},
        dataModels: {},
        components: {},
        entryPoints: {}
      }
    }
  };

  const adapter = await createPersistence({ driver: 'memory', seed });
  const aggregate = await adapter.load('user');
  assert.deepEqual(aggregate, createEmptyDomainAggregate());
  await adapter.save('user', createEmptyDomainAggregate());
  const stored = await adapter.load('user');
  assert.deepEqual(stored, createEmptyDomainAggregate());
});

test('createPersistence returns mongo adapter that surfaces connection errors', async () => {
  const adapter = await createPersistence({
    driver: 'mongo',
    uri: 'mongodb://localhost:27017',
    database: 'architekt',
    collection: 'aggregates'
  });

  await assert.rejects(
    () => adapter.load('user'),
    /(MongoServerSelectionError|ECONNREFUSED)/
  );
});

test('createPersistence throws on unsupported driver', async () => {
  await assert.rejects(
    () => createPersistence({ driver: 'unknown' } as never),
    /Unsupported persistence driver/
  );
});
