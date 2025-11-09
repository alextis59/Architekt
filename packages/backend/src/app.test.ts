import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { createApp } from './app.js';
import { createMemoryPersistence } from './persistence/index.js';
import { createProjectIndex } from '@architekt/domain';

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

test('POST /projects creates a project with root system', async () => {
  const persistence = createMemoryPersistence();
  const app = createApp({ persistence });

  const response = await request(app)
    .post('/projects')
    .send({ name: 'Alpha', description: 'First project', tags: ['alpha', 'alpha', ''] });

  assert.equal(response.status, 201);
  const { project } = response.body;
  assert.ok(project.id);
  assert.equal(project.name, 'Alpha');
  assert.deepEqual(project.tags, ['alpha']);
  assert.ok(project.rootSystemId);
  const root = project.systems[project.rootSystemId];
  assert.ok(root);
  assert.equal(root.name, 'Alpha');
  assert.equal(root.isRoot, true);
});

test('PUT /projects/:projectId updates project metadata', async () => {
  const persistence = createMemoryPersistence();
  const app = createApp({ persistence });

  const creation = await request(app).post('/projects').send({ name: 'Beta' });
  const projectId = creation.body.project.id;

  const update = await request(app)
    .put(`/projects/${projectId}`)
    .send({ description: 'Updated description', tags: ['one', 'two', 'one'] });

  assert.equal(update.status, 200);
  assert.equal(update.body.project.description, 'Updated description');
  const updatedTags = [...update.body.project.tags].sort();
  assert.deepEqual(updatedTags, ['one', 'two']);

  const retrieval = await request(app).get(`/projects/${projectId}`);
  assert.equal(retrieval.body.project.description, 'Updated description');
});

test('DELETE /projects/:projectId removes project', async () => {
  const persistence = createMemoryPersistence();
  const app = createApp({ persistence });

  const creation = await request(app).post('/projects').send({ name: 'Gamma' });
  const projectId = creation.body.project.id;

  const deletion = await request(app).delete(`/projects/${projectId}`);
  assert.equal(deletion.status, 204);

  const retrieval = await request(app).get(`/projects/${projectId}`);
  assert.equal(retrieval.status, 404);
});

test('System endpoints manage hierarchy with validation', async () => {
  const persistence = createMemoryPersistence();
  const app = createApp({ persistence });

  const creation = await request(app).post('/projects').send({ name: 'Delta' });
  const projectId = creation.body.project.id;
  const rootSystemId = creation.body.project.rootSystemId;

  const systemCreation = await request(app)
    .post(`/projects/${projectId}/systems`)
    .send({ name: 'API Layer', description: 'Handles requests', tags: ['api', 'service'] });

  assert.equal(systemCreation.status, 201);
  const systemId = systemCreation.body.system.id;

  const childCreation = await request(app)
    .post(`/projects/${projectId}/systems`)
    .send({ name: 'Worker', parentId: systemId });

  assert.equal(childCreation.status, 201);
  const childId = childCreation.body.system.id;

  const systemsResponse = await request(app).get(`/projects/${projectId}/systems`);
  assert.equal(systemsResponse.status, 200);
  const systemIds = systemsResponse.body.systems.map((system: { id: string }) => system.id);
  assert.deepEqual(systemIds.sort(), [childId, rootSystemId, systemId].sort());

  const parentRetrieval = await request(app).get(`/projects/${projectId}`);
  const parent = parentRetrieval.body.project.systems[systemId];
  assert.deepEqual(parent.childIds, [childId]);

  const update = await request(app)
    .put(`/projects/${projectId}/systems/${systemId}`)
    .send({ description: 'Updated', tags: ['api', 'layer'] });
  assert.equal(update.status, 200);
  assert.equal(update.body.system.description, 'Updated');
  const updatedSystemTags = [...update.body.system.tags].sort();
  assert.deepEqual(updatedSystemTags, ['api', 'layer']);

  const deleteChild = await request(app).delete(`/projects/${projectId}/systems/${systemId}`);
  assert.equal(deleteChild.status, 204);

  const projectAfterDeletion = await request(app).get(`/projects/${projectId}`);
  const systemsAfterDeletion = projectAfterDeletion.body.project.systems;
  assert.ok(!systemsAfterDeletion[systemId]);
  assert.ok(!systemsAfterDeletion[childId]);
  assert.deepEqual(systemsAfterDeletion[rootSystemId].childIds, []);
});

test('DELETE /projects/:projectId/systems/:systemId prevents root removal', async () => {
  const persistence = createMemoryPersistence();
  const app = createApp({ persistence });

  const creation = await request(app).post('/projects').send({ name: 'Epsilon' });
  const projectId = creation.body.project.id;
  const rootSystemId = creation.body.project.rootSystemId;

  const deletion = await request(app).delete(`/projects/${projectId}/systems/${rootSystemId}`);
  assert.equal(deletion.status, 400);
  assert.equal(deletion.body.message, 'Root system cannot be deleted');
});
