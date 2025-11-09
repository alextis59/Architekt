import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { createProjectIndex } from '@architekt/domain';
import { createApp } from './app.js';
import { createMemoryPersistence } from './persistence/index.js';

test('GET /health responds with ok status', async () => {
  const app = createApp({ persistence: createMemoryPersistence() });

  const response = await request(app).get('/health');

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { status: 'ok' });
});

test('GET /projects returns sanitized projects', async () => {
  const aggregate = {
    projects: {
      'proj-1': {
        id: 'proj-1',
        name: 'Demo',
        description: '',
        tags: [],
        rootSystemId: 'sys-1',
        systems: {
          'sys-1': {
            id: 'sys-1',
            name: 'Root',
            description: '',
            tags: [],
            childIds: [],
            isRoot: true
          }
        },
        flows: {}
      }
    }
  };
  const persistence = createMemoryPersistence(aggregate);
  const app = createApp({ persistence });

  const response = await request(app).get('/projects');

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { projects: createProjectIndex(aggregate) });
});
