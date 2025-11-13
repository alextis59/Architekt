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

  const aggregate = await persistence.load();

  assert.deepEqual(aggregate, { projects: {} });
});

test('persists and loads aggregate data', async () => {
  const dataFile = await createTempFile();
  const persistence = createFileSystemPersistence({ dataFile });
  const projectId = crypto.randomUUID();
  const systemId = crypto.randomUUID();

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
        dataModels: {}
      }
    }
  };

  await persistence.save(aggregate);

  const loaded = await persistence.load();

  assert.deepEqual(loaded, aggregate);
});

test('creates backups when overwriting existing data', async () => {
  const dataFile = await createTempFile();
  const backupDir = path.join(path.dirname(dataFile), 'backups');
  const persistence = createFileSystemPersistence({ dataFile, backupDir, maxBackups: 5 });

  await persistence.save({ projects: {} });
  await persistence.save({ projects: {} });

  const backups = await fs.readdir(backupDir);
  assert.equal(backups.length, 1);
  assert.ok(backups[0].endsWith('.json'));
});

test('prunes old backups beyond the configured threshold', async () => {
  const dataFile = await createTempFile();
  const backupDir = path.join(path.dirname(dataFile), 'backups');
  const persistence = createFileSystemPersistence({ dataFile, backupDir, maxBackups: 2 });

  await persistence.save({ projects: {} });

  for (let index = 0; index < 4; index += 1) {
    await persistence.save({ projects: {} });
  }

  const backups = await fs.readdir(backupDir);
  assert.equal(backups.length, 2);
});
