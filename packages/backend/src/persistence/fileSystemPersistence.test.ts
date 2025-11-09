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
        flows: {}
      }
    }
  };

  await persistence.save(aggregate);

  const loaded = await persistence.load();

  assert.deepEqual(loaded, aggregate);
});
