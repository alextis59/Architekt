import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import test from 'node:test';
import { createFileSystemPersistence } from './fileSystemPersistence.js';

const createTempFile = async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'architekt-test-'));
  return path.join(dir, 'data.json');
};

test('returns an empty aggregate when the file does not exist', async () => {
  const dataFile = await createTempFile();
  const persistence = createFileSystemPersistence({ dataFile });
  const userId = 'tester';

  const aggregate = await persistence.load(userId);

  assert.deepEqual(aggregate, { projects: {} });
});

test('persists and loads aggregate data', async () => {
  const dataFile = await createTempFile();
  const persistence = createFileSystemPersistence({ dataFile });
  const projectId = crypto.randomUUID();
  const systemId = crypto.randomUUID();
  const userId = 'tester';

  const aggregate = {
    projects: {
      [projectId]: {
        id: projectId,
        name: 'Test project',
        description: 'Example',
        tags: ['demo'],
        rootSystemId: systemId,
        systems: {
          [systemId]: {
            id: systemId,
            name: 'Root',
            description: 'Root system',
            tags: [],
            childIds: [],
            isRoot: true
          }
        },
        flows: {},
        dataModels: {},
        components: {},
        entryPoints: {}
      }
    }
  };

  await persistence.save(userId, aggregate);

  const loaded = await persistence.load(userId);

  assert.deepEqual(loaded, aggregate);
});

test('creates backups when overwriting existing data', async () => {
  const dataFile = await createTempFile();
  const backupDir = path.join(path.dirname(dataFile), 'backups');
  const persistence = createFileSystemPersistence({ dataFile, backupDir, maxBackups: 5 });
  const userId = 'tester';

  await persistence.save(userId, { projects: {} });
  await persistence.save(userId, { projects: {} });

  const backups = await fs.readdir(backupDir);
  assert.equal(backups.length, 1);
  assert.ok(backups[0].endsWith('.json'));
});

test('prunes old backups beyond the configured threshold', async () => {
  const dataFile = await createTempFile();
  const backupDir = path.join(path.dirname(dataFile), 'backups');
  const persistence = createFileSystemPersistence({ dataFile, backupDir, maxBackups: 2 });
  const userId = 'tester';

  await persistence.save(userId, { projects: {} });

  for (let index = 0; index < 4; index += 1) {
    await persistence.save(userId, { projects: {} });
  }

  const backups = await fs.readdir(backupDir);
  assert.equal(backups.length, 2);
});

test('keeps data isolated per user', async () => {
  const dataFile = await createTempFile();
  const persistence = createFileSystemPersistence({ dataFile });

  await persistence.save('user-a', {
    projects: {
      alpha: {
        id: 'alpha',
        name: 'Alpha',
        description: '',
        tags: [],
        rootSystemId: 'root-a',
        systems: {
          'root-a': { id: 'root-a', name: 'Alpha Root', description: '', tags: [], childIds: [], isRoot: true }
        },
        flows: {},
        dataModels: {},
        components: {},
        entryPoints: {}
      }
    }
  });
  await persistence.save('user-b', {
    projects: {
      beta: {
        id: 'beta',
        name: 'Beta',
        description: '',
        tags: [],
        rootSystemId: 'root-b',
        systems: {
          'root-b': { id: 'root-b', name: 'Beta Root', description: '', tags: [], childIds: [], isRoot: true }
        },
        flows: {},
        dataModels: {},
        components: {},
        entryPoints: {}
      }
    }
  });

  const userAAggregate = await persistence.load('user-a');
  const userBAggregate = await persistence.load('user-b');

  assert.ok(userAAggregate.projects.alpha);
  assert.ok(!userAAggregate.projects.beta);
  assert.ok(userBAggregate.projects.beta);
  assert.ok(!userBAggregate.projects.alpha);
});
