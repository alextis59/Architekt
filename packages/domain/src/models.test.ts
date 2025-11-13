import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createEmptyDomainAggregate,
  createProjectIndex,
  validateDomainAggregate
} from './models.js';

test('validateDomainAggregate sanitizes invalid structures', () => {
  const aggregate = validateDomainAggregate({
    projects: {
      invalid: { id: '', name: '', rootSystemId: '' },
      valid: {
        id: 'proj-1',
        name: 'Project One',
        description: null,
        tags: ['core', 123],
        rootSystemId: 'root-1',
        systems: {
          'root-1': { id: 'root-1', name: 'Root', childIds: ['child-1'], isRoot: 'yes' }
        },
        flows: {
          'flow-1': {
            id: 'flow-1',
            name: 'Main Flow',
            systemScopeIds: ['root-1'],
            steps: [
              {
                id: 'step-1',
                name: 'Step 1',
                sourceSystemId: 'root-1',
                targetSystemId: 'root-1',
                alternateFlowIds: ['']
              }
            ]
          }
        },
        dataModels: {
          ignored: { id: '', name: '', attributes: [] },
          'model-1': {
            id: 'model-1',
            name: 'Customer',
            description: null,
            attributes: [
              {
                id: 'attr-1',
                name: 'Full name',
                description: null,
                type: 'string',
                constraints: '',
                readOnly: 'no',
                encrypted: 'yes',
                attributes: [
                  { id: 'attr-child', name: 'unused', description: '', type: '' },
                  { id: 'attr-child-2', name: 'Legal', description: null, type: 'object', attributes: null }
                ]
              },
              { id: 'attr-2', name: '', type: 'string' }
            ]
          }
        }
      }
    }
  });

  assert.deepEqual(Object.keys(aggregate.projects), ['valid']);
  const project = aggregate.projects.valid;
  assert.equal(project.description, '');
  assert.equal(project.systems['root-1'].isRoot, false);
  assert.equal(project.flows['flow-1'].steps[0].alternateFlowIds.length, 0);
  assert.equal(Object.keys(project.dataModels).length, 1);
  const model = project.dataModels['model-1'];
  assert.ok(model);
  assert.equal(model.description, '');
  assert.equal(model.attributes.length, 1);
  const attribute = model.attributes[0];
  assert.equal(attribute.readOnly, false);
  assert.equal(attribute.encrypted, false);
  assert.equal(attribute.attributes.length, 1);
  assert.equal(attribute.attributes[0].id, 'attr-child-2');
});

test('createProjectIndex returns projects list', () => {
  const aggregate = createEmptyDomainAggregate();
  aggregate.projects['proj-1'] = {
    id: 'proj-1',
    name: 'Demo',
    description: '',
    tags: [],
    rootSystemId: 'sys-1',
    systems: {},
    flows: {},
    dataModels: {}
  };

  assert.deepEqual(createProjectIndex(aggregate), [aggregate.projects['proj-1']]);
});
