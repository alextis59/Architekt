import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { createApp } from './app.js';
import { createMemoryPersistence } from './persistence/index.js';
import { createProjectIndex } from '@architekt/domain';

const testAuthConfig = {
  mode: 'local' as const,
  defaultUserId: 'test-user',
  defaultUserName: 'Test User'
};

const googleAuthConfig = {
  mode: 'google' as const,
  clientId: 'test-client-id'
};

const createTestApp = (initialData?: unknown) => {
  const persistence =
    initialData === undefined
      ? createMemoryPersistence()
      : createMemoryPersistence({ [testAuthConfig.defaultUserId]: initialData });

  return createApp({ persistence, auth: testAuthConfig });
};

const createGoogleTestApp = () => {
  const persistence = createMemoryPersistence();
  return createApp({ persistence, auth: googleAuthConfig });
};

test('GET /health responds with ok status', async () => {
  const app = createTestApp();

  const response = await request(app).get('/health');

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { status: 'ok' });
});

test('GET /api/auth/config returns local auth mode', async () => {
  const app = createTestApp();

  const response = await request(app).get('/api/auth/config');

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { mode: 'local' });
});

test('GET /api/auth/config returns google auth mode', async () => {
  const app = createGoogleTestApp();

  const response = await request(app).get('/api/auth/config');

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { mode: 'google', clientId: googleAuthConfig.clientId });
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
        flows: {},
        dataModels: {},
        components: {}
      }
    }
  };
  const app = createTestApp(aggregate);

  const response = await request(app).get('/api/projects');

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { projects: createProjectIndex(aggregate) });
});

test('POST /projects creates a project with root system', async () => {
  const app = createTestApp();

  const response = await request(app)
    .post('/api/projects')
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
  assert.deepEqual(project.dataModels, {});
  assert.deepEqual(project.components, {});
});

test('PUT /projects/:projectId updates project metadata', async () => {
  const app = createTestApp();

  const creation = await request(app).post('/api/projects').send({ name: 'Beta' });
  const projectId = creation.body.project.id;

  const update = await request(app)
    .put(`/api/projects/${projectId}`)
    .send({ description: 'Updated description', tags: ['one', 'two', 'one'] });

  assert.equal(update.status, 200);
  assert.equal(update.body.project.description, 'Updated description');
  const updatedTags = [...update.body.project.tags].sort();
  assert.deepEqual(updatedTags, ['one', 'two']);

  const retrieval = await request(app).get(`/api/projects/${projectId}`);
  assert.equal(retrieval.body.project.description, 'Updated description');
});

test('DELETE /projects/:projectId removes project', async () => {
  const app = createTestApp();

  const creation = await request(app).post('/api/projects').send({ name: 'Gamma' });
  const projectId = creation.body.project.id;

  const deletion = await request(app).delete(`/api/projects/${projectId}`);
  assert.equal(deletion.status, 204);

  const retrieval = await request(app).get(`/api/projects/${projectId}`);
  assert.equal(retrieval.status, 404);
});

test('System endpoints manage hierarchy with validation', async () => {
  const app = createTestApp();

  const creation = await request(app).post('/api/projects').send({ name: 'Delta' });
  const projectId = creation.body.project.id;
  const rootSystemId = creation.body.project.rootSystemId;

  const systemCreation = await request(app)
    .post(`/api/projects/${projectId}/systems`)
    .send({ name: 'API Layer', description: 'Handles requests', tags: ['api', 'service'] });

  assert.equal(systemCreation.status, 201);
  const systemId = systemCreation.body.system.id;

  const childCreation = await request(app)
    .post(`/api/projects/${projectId}/systems`)
    .send({ name: 'Worker', parentId: systemId });

  assert.equal(childCreation.status, 201);
  const childId = childCreation.body.system.id;

  const systemsResponse = await request(app).get(`/api/projects/${projectId}/systems`);
  assert.equal(systemsResponse.status, 200);
  const systemIds = systemsResponse.body.systems.map((system: { id: string }) => system.id);
  assert.deepEqual(systemIds.sort(), [childId, rootSystemId, systemId].sort());

  const parentRetrieval = await request(app).get(`/api/projects/${projectId}`);
  const parent = parentRetrieval.body.project.systems[systemId];
  assert.deepEqual(parent.childIds, [childId]);

  const update = await request(app)
    .put(`/api/projects/${projectId}/systems/${systemId}`)
    .send({ description: 'Updated', tags: ['api', 'layer'] });
  assert.equal(update.status, 200);
  assert.equal(update.body.system.description, 'Updated');
  const updatedSystemTags = [...update.body.system.tags].sort();
  assert.deepEqual(updatedSystemTags, ['api', 'layer']);

  const deleteChild = await request(app).delete(`/api/projects/${projectId}/systems/${systemId}`);
  assert.equal(deleteChild.status, 204);

  const projectAfterDeletion = await request(app).get(`/api/projects/${projectId}`);
  const systemsAfterDeletion = projectAfterDeletion.body.project.systems;
  assert.ok(!systemsAfterDeletion[systemId]);
  assert.ok(!systemsAfterDeletion[childId]);
  assert.deepEqual(systemsAfterDeletion[rootSystemId].childIds, []);
});

test('Data model endpoints manage nested attributes', async () => {
  const app = createTestApp();

  const creation = await request(app).post('/api/projects').send({ name: 'Schemas' });
  const projectId = creation.body.project.id;

  const dataModelCreation = await request(app)
    .post(`/api/projects/${projectId}/data-models`)
    .send({
      name: 'Customer',
      description: 'Customer profile',
      attributes: [
        {
          name: 'id',
          description: 'Unique identifier',
          type: 'string',
          required: true,
          unique: true,
          constraints: [{ type: 'regex', value: '^[A-Z0-9-]+$' }],
          readOnly: true,
          encrypted: false,
          private: false,
          attributes: []
        }
      ]
    });

  assert.equal(dataModelCreation.status, 201);
  const dataModelId = dataModelCreation.body.dataModel.id;
  const attributeId = dataModelCreation.body.dataModel.attributes[0].id;

  const listResponse = await request(app).get(`/api/projects/${projectId}/data-models`);
  assert.equal(listResponse.status, 200);
  assert.equal(listResponse.body.dataModels.length, 1);

  const updateResponse = await request(app)
    .put(`/api/projects/${projectId}/data-models/${dataModelId}`)
    .send({
      description: 'Updated profile',
      attributes: [
        {
          id: attributeId,
          name: 'id',
          description: 'Unique identifier',
          type: 'string',
          required: true,
          unique: true,
          constraints: [{ type: 'regex', value: '^[A-Z0-9-]+$' }],
          readOnly: true,
          encrypted: true,
          private: true,
          attributes: [
            {
              name: 'format',
              description: 'UUID format',
              type: 'string',
              required: false,
              unique: false,
              constraints: [{ type: 'minLength', value: 36 }],
              readOnly: true,
              encrypted: false,
              private: false,
              attributes: []
            }
          ]
        }
      ]
    });

  assert.equal(updateResponse.status, 200);
  assert.equal(updateResponse.body.dataModel.description, 'Updated profile');
  assert.equal(updateResponse.body.dataModel.attributes[0].required, true);
  assert.equal(updateResponse.body.dataModel.attributes[0].unique, true);
  assert.deepEqual(updateResponse.body.dataModel.attributes[0].constraints, [
    { type: 'regex', value: '^[A-Z0-9-]+$' }
  ]);
  assert.equal(updateResponse.body.dataModel.attributes[0].encrypted, true);
  assert.equal(updateResponse.body.dataModel.attributes[0].private, true);
  assert.equal(updateResponse.body.dataModel.attributes[0].attributes.length, 1);
  const childId = updateResponse.body.dataModel.attributes[0].attributes[0].id;
  assert.deepEqual(updateResponse.body.dataModel.attributes[0].attributes[0].constraints, [
    { type: 'minLength', value: 36 }
  ]);

  const retrieval = await request(app).get(
    `/api/projects/${projectId}/data-models/${dataModelId}`
  );
  assert.equal(retrieval.status, 200);
  assert.equal(retrieval.body.dataModel.attributes[0].attributes[0].id, childId);

  const deletion = await request(app).delete(
    `/api/projects/${projectId}/data-models/${dataModelId}`
  );
  assert.equal(deletion.status, 204);

  const afterDeletion = await request(app).get(`/api/projects/${projectId}/data-models`);
  assert.equal(afterDeletion.body.dataModels.length, 0);
});

test('Component endpoints manage entry points with data model references', async () => {
  const app = createTestApp();

  const creation = await request(app).post('/api/projects').send({ name: 'Interfaces' });
  const projectId = creation.body.project.id;

  const dataModelResponse = await request(app)
    .post(`/api/projects/${projectId}/data-models`)
    .send({
      name: 'Customer',
      description: '',
      attributes: []
    });

  const dataModelId = dataModelResponse.body.dataModel.id;

  const componentCreation = await request(app)
    .post(`/api/projects/${projectId}/components`)
    .send({
      name: 'Customer API',
      description: 'Handles customer interactions',
      entryPoints: [
        {
          name: 'Get customer',
          description: 'Retrieve a customer record',
          type: 'http',
          protocol: 'HTTP',
          method: 'GET',
          path: '/customers/:id',
          target: '',
          requestModelIds: [dataModelId],
          responseModelIds: [dataModelId]
        }
      ]
    });

  assert.equal(componentCreation.status, 201);
  const componentId = componentCreation.body.component.id;
  const entryPointId = componentCreation.body.component.entryPoints[0].id;

  const listResponse = await request(app).get(`/api/projects/${projectId}/components`);
  assert.equal(listResponse.status, 200);
  assert.equal(listResponse.body.components.length, 1);

  const updateResponse = await request(app)
    .put(`/api/projects/${projectId}/components/${componentId}`)
    .send({
      description: 'Updated interactions',
      entryPoints: [
        {
          id: entryPointId,
          name: 'Get customer',
          description: 'Retrieve a customer record',
          type: 'http',
          protocol: 'HTTP',
          method: 'GET',
          path: '/customers/:id',
          target: '',
          requestModelIds: [dataModelId],
          responseModelIds: [dataModelId]
        },
        {
          name: 'Customer events',
          description: 'Publish customer updates',
          type: 'queue',
          protocol: 'AMQP',
          method: '',
          path: 'customers.events',
          target: 'broker',
          requestModelIds: [dataModelId],
          responseModelIds: []
        }
      ]
    });

  assert.equal(updateResponse.status, 200);
  assert.equal(updateResponse.body.component.description, 'Updated interactions');
  assert.equal(updateResponse.body.component.entryPoints.length, 2);

  const deletion = await request(app).delete(`/api/projects/${projectId}/components/${componentId}`);
  assert.equal(deletion.status, 204);

  const afterDeletion = await request(app).get(`/api/projects/${projectId}/components`);
  assert.equal(afterDeletion.status, 200);
  assert.equal(afterDeletion.body.components.length, 0);
});

test('DELETE /projects/:projectId/systems/:systemId prevents root removal', async () => {
  const app = createTestApp();

  const creation = await request(app).post('/api/projects').send({ name: 'Epsilon' });
  const projectId = creation.body.project.id;
  const rootSystemId = creation.body.project.rootSystemId;

  const deletion = await request(app).delete(`/api/projects/${projectId}/systems/${rootSystemId}`);
  assert.equal(deletion.status, 400);
  assert.equal(deletion.body.message, 'Root system cannot be deleted');
});

test('Flow endpoints manage flows and steps with validation', async () => {
  const app = createTestApp();

  const projectCreation = await request(app).post('/api/projects').send({ name: 'Flow Project' });
  const projectId = projectCreation.body.project.id;
  const rootSystemId = projectCreation.body.project.rootSystemId;

  const systemCreation = await request(app)
    .post(`/api/projects/${projectId}/systems`)
    .send({ name: 'Service Layer' });
  const serviceSystemId = systemCreation.body.system.id;

  const scope = [rootSystemId, serviceSystemId];

  const flowCreation = await request(app)
    .post(`/api/projects/${projectId}/flows`)
    .send({
      name: 'Primary Flow',
      description: 'Handles main scenario',
      tags: ['primary', 'primary'],
      systemScopeIds: scope,
      steps: [
        {
          name: 'Authenticate',
          description: 'Entry point',
          sourceSystemId: rootSystemId,
          targetSystemId: serviceSystemId,
          tags: ['auth'],
          alternateFlowIds: []
        }
      ]
    });

  assert.equal(flowCreation.status, 201);
  const flow = flowCreation.body.flow;
  assert.equal(flow.name, 'Primary Flow');
  assert.deepEqual(flow.tags, ['primary']);
  assert.deepEqual(flow.systemScopeIds.sort(), scope.sort());
  assert.equal(flow.steps.length, 1);
  const stepId = flow.steps[0].id;

  const flowsResponse = await request(app).get(`/api/projects/${projectId}/flows`);
  assert.equal(flowsResponse.status, 200);
  assert.equal(flowsResponse.body.flows.length, 1);

  const alternateFlowCreation = await request(app)
    .post(`/api/projects/${projectId}/flows`)
    .send({
      name: 'Fallback Flow',
      systemScopeIds: scope,
      steps: [
        {
          name: 'Retry',
          sourceSystemId: serviceSystemId,
          targetSystemId: rootSystemId,
          alternateFlowIds: [flow.id]
        }
      ]
    });

  assert.equal(alternateFlowCreation.status, 201);
  const alternateFlowId = alternateFlowCreation.body.flow.id;

  const updateResponse = await request(app)
    .put(`/api/projects/${projectId}/flows/${flow.id}`)
    .send({
      name: 'Primary Flow v2',
      steps: [
        {
          id: stepId,
          name: 'Authenticate',
          sourceSystemId: rootSystemId,
          targetSystemId: serviceSystemId,
          tags: ['auth', 'updated'],
          alternateFlowIds: [alternateFlowId]
        },
        {
          name: 'Dispatch',
          sourceSystemId: serviceSystemId,
          targetSystemId: serviceSystemId
        }
      ]
    });

  assert.equal(updateResponse.status, 200);
  assert.equal(updateResponse.body.flow.name, 'Primary Flow v2');
  assert.equal(updateResponse.body.flow.steps.length, 2);
  assert.equal(updateResponse.body.flow.steps[0].id, stepId);
  assert.deepEqual(updateResponse.body.flow.steps[0].alternateFlowIds, [alternateFlowId]);

  const deleteAlternate = await request(app).delete(`/api/projects/${projectId}/flows/${alternateFlowId}`);
  assert.equal(deleteAlternate.status, 204);

  const updatedPrimary = await request(app).get(`/api/projects/${projectId}/flows/${flow.id}`);
  assert.equal(updatedPrimary.status, 200);
  assert.deepEqual(updatedPrimary.body.flow.steps[0].alternateFlowIds, []);
});

test('GET /projects/:projectId/flows applies optional filters', async () => {
  const app = createTestApp();

  const projectCreation = await request(app).post('/api/projects').send({ name: 'Filtered Flow Project' });
  const projectId = projectCreation.body.project.id;
  const rootSystemId = projectCreation.body.project.rootSystemId;

  const systemCreation = await request(app)
    .post(`/api/projects/${projectId}/systems`)
    .send({ name: 'Service Layer' });
  const serviceSystemId = systemCreation.body.system.id;

  const sharedTags = ['shared'];

  const flowOne = await request(app)
    .post(`/api/projects/${projectId}/flows`)
    .send({
      name: 'Primary Flow',
      tags: ['primary', ...sharedTags],
      systemScopeIds: [rootSystemId, serviceSystemId],
      steps: [
        {
          name: 'Authenticate',
          sourceSystemId: rootSystemId,
          targetSystemId: serviceSystemId
        }
      ]
    });
  assert.equal(flowOne.status, 201);

  const flowTwo = await request(app)
    .post(`/api/projects/${projectId}/flows`)
    .send({
      name: 'Service Only Flow',
      tags: sharedTags,
      systemScopeIds: [serviceSystemId],
      steps: [
        {
          name: 'Process',
          sourceSystemId: serviceSystemId,
          targetSystemId: serviceSystemId
        }
      ]
    });
  assert.equal(flowTwo.status, 201);

  const flowThree = await request(app)
    .post(`/api/projects/${projectId}/flows`)
    .send({
      name: 'Root Flow',
      tags: ['secondary'],
      systemScopeIds: [rootSystemId],
      steps: [
        {
          name: 'Initialize',
          sourceSystemId: rootSystemId,
          targetSystemId: rootSystemId
        }
      ]
    });
  assert.equal(flowThree.status, 201);

  const allFlows = await request(app).get(`/api/projects/${projectId}/flows`);
  assert.equal(allFlows.status, 200);
  assert.equal(allFlows.body.flows.length, 3);

  const sharedOnly = await request(app).get(`/api/projects/${projectId}/flows`).query({ tag: 'shared' });
  assert.equal(sharedOnly.status, 200);
  assert.equal(sharedOnly.body.flows.length, 2);

  const sharedAndPrimary = await request(app)
    .get(`/api/projects/${projectId}/flows`)
    .query({ tag: ['shared', 'primary'] });
  assert.equal(sharedAndPrimary.status, 200);
  assert.equal(sharedAndPrimary.body.flows.length, 1);

  const serviceScope = await request(app).get(`/api/projects/${projectId}/flows`).query({ scope: serviceSystemId });
  assert.equal(serviceScope.status, 200);
  assert.equal(serviceScope.body.flows.length, 2);

  const rootAndServiceScope = await request(app)
    .get(`/api/projects/${projectId}/flows`)
    .query({ scope: [serviceSystemId, rootSystemId] });
  assert.equal(rootAndServiceScope.status, 200);
  assert.equal(rootAndServiceScope.body.flows.length, 1);

  const combinedFilters = await request(app)
    .get(`/api/projects/${projectId}/flows`)
    .query({ scope: serviceSystemId, tag: 'primary' });
  assert.equal(combinedFilters.status, 200);
  assert.equal(combinedFilters.body.flows.length, 1);
});

test('Flow endpoints enforce scope and reference validation', async () => {
  const app = createTestApp();

  const projectCreation = await request(app).post('/api/projects').send({ name: 'Validation Project' });
  const projectId = projectCreation.body.project.id;
  const rootSystemId = projectCreation.body.project.rootSystemId;

  const invalidScope = await request(app)
    .post(`/api/projects/${projectId}/flows`)
    .send({ name: 'Invalid Scope', systemScopeIds: ['missing'] });
  assert.equal(invalidScope.status, 400);
  assert.equal(invalidScope.body.message, 'Flow system scope must reference at least one valid system');

  const serviceCreation = await request(app)
    .post(`/api/projects/${projectId}/systems`)
    .send({ name: 'Worker' });
  const workerId = serviceCreation.body.system.id;

  const invalidStep = await request(app)
    .post(`/api/projects/${projectId}/flows`)
    .send({
      name: 'Invalid Step',
      systemScopeIds: [rootSystemId],
      steps: [
        {
          name: 'Process',
          sourceSystemId: rootSystemId,
          targetSystemId: workerId
        }
      ]
    });

  assert.equal(invalidStep.status, 400);
  assert.equal(invalidStep.body.message, `Step target system ${workerId} must be part of the flow scope`);

  const validFlow = await request(app)
    .post(`/api/projects/${projectId}/flows`)
    .send({
      name: 'Valid Flow',
      systemScopeIds: [rootSystemId, workerId],
      steps: [
        {
          name: 'Process',
          sourceSystemId: rootSystemId,
          targetSystemId: workerId
        }
      ]
    });

  const flowId = validFlow.body.flow.id;

  const invalidAlternate = await request(app)
    .put(`/api/projects/${projectId}/flows/${flowId}`)
    .send({
      steps: [
        {
          id: validFlow.body.flow.steps[0].id,
          name: 'Process',
          sourceSystemId: rootSystemId,
          targetSystemId: workerId,
          alternateFlowIds: ['unknown']
        }
      ]
    });

  assert.equal(invalidAlternate.status, 400);
  assert.equal(invalidAlternate.body.message, 'Alternate flow unknown is not part of the project');

  const invalidScopeUpdate = await request(app)
    .put(`/api/projects/${projectId}/flows/${flowId}`)
    .send({ systemScopeIds: [rootSystemId] });

  assert.equal(invalidScopeUpdate.status, 400);
  assert.equal(
    invalidScopeUpdate.body.message,
    `Step target system ${workerId} must be part of the flow scope`
  );
});
