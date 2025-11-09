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
        }
      }
    }
  });

  assert.deepEqual(Object.keys(aggregate.projects), ['valid']);
  const project = aggregate.projects.valid;
  assert.equal(project.description, '');
  assert.equal(project.systems['root-1'].isRoot, false);
  assert.equal(project.flows['flow-1'].steps[0].alternateFlowIds.length, 0);
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
    flows: {}
  };

  assert.deepEqual(createProjectIndex(aggregate), [aggregate.projects['proj-1']]);
});
