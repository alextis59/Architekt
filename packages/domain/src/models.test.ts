import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createEmptyDomainAggregate,
  createProjectIndex,
  validateDomainAggregate,
  findProjectById,
  getRootSystem,
  isValidDomainAggregate,
  DomainSchemas,
  default as DomainModels
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
                source: {
                  componentId: 'component-1',
                  entryPointId: ''
                },
                target: {
                  componentId: 'component-1',
                  entryPointId: ''
                },
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
                required: 'yes',
                unique: null,
                readOnly: 'no',
                encrypted: 'yes',
                private: 'ignored',
                attributes: [
                  { id: 'attr-child', name: 'unused', description: '', type: '' },
                  { id: 'attr-child-2', name: 'Legal', description: null, type: 'object', attributes: null }
                ]
              },
              { id: 'attr-2', name: '', type: 'string' }
            ]
          }
        },
        components: {
          ignored: { id: '', name: '', entryPointIds: [] },
          'component-1': {
            id: 'component-1',
            name: 'Customer API',
            description: null,
            entryPointIds: ['ep-1', 'ep-2', 'missing']
          }
        },
        entryPoints: {
          'ep-1': {
            id: 'ep-1',
            name: 'Get customer',
            description: null,
            type: 'http',
            protocol: 'HTTP',
            method: 'GET',
            path: '/customers/:id',
            requestModelIds: ['model-1', ''],
            responseModelIds: ['model-1']
          },
          'ep-2': { id: 'ep-2', name: '', type: 'queue', protocol: 'AMQP', path: 'queue' }
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
  assert.equal(attribute.required, false);
  assert.equal(attribute.unique, false);
  assert.deepEqual(attribute.constraints, []);
  assert.equal(attribute.readOnly, false);
  assert.equal(attribute.encrypted, false);
  assert.equal(attribute.private, false);
  assert.equal(attribute.attributes.length, 1);
  assert.equal(attribute.attributes[0].id, 'attr-child-2');
  assert.equal(attribute.attributes[0].required, false);
  assert.equal(attribute.attributes[0].unique, false);
  assert.equal(attribute.attributes[0].private, false);
  assert.equal(Object.keys(project.components).length, 1);
  const component = project.components['component-1'];
  assert.ok(component);
  assert.equal(component.description, '');
  assert.deepEqual(component.entryPointIds, ['ep-1', 'ep-2', 'missing']);
  assert.equal(Object.keys(project.entryPoints).length, 1);
  const entryPoint = project.entryPoints['ep-1'];
  assert.equal(entryPoint.protocol, 'HTTP');
  assert.deepEqual(entryPoint.requestModelIds, ['model-1']);
});

test('validateDomainAggregate preserves enum constraints defined with values arrays', () => {
  const aggregate = validateDomainAggregate({
    projects: {
      proj: {
        id: 'proj',
        name: 'Payments',
        description: '',
        tags: [],
        rootSystemId: 'root',
        systems: { root: { id: 'root', name: 'Root', description: '', tags: [], childIds: [], isRoot: true } },
        flows: {},
        components: {},
        entryPoints: {},
        dataModels: {
          'model-1': {
            id: 'model-1',
            name: 'Card',
            description: '',
            attributes: [
              {
                id: 'attr-1',
                name: 'Type',
                description: '',
                type: 'string',
                required: false,
                unique: false,
                constraints: [{ type: 'enum', values: ['VISA', 'MASTERCARD', 'VISA'] }],
                readOnly: false,
                encrypted: false,
                private: false,
                attributes: []
              }
            ]
          }
        }
      }
    }
  });

  const project = aggregate.projects.proj;
  assert.ok(project);
  const attribute = project.dataModels['model-1'].attributes[0];
  assert.deepEqual(attribute.constraints, [{ type: 'enum', values: ['VISA', 'MASTERCARD'] }]);
});

test('validateDomainAggregate removes entities missing identifiers', () => {
  const aggregate = validateDomainAggregate({
    projects: {
      'keep-me': {
        id: 'keep-me',
        name: 'Retained Project',
        rootSystemId: 'root',
        description: null,
        tags: ['  tagged  ', null],
        systems: {
          root: { id: 'root', name: 'Root System', description: null, tags: ['sys'], childIds: ['child'], isRoot: true },
          '': { name: 'missing id' },
          child: { id: 'child', name: '', description: '', tags: [], childIds: [], isRoot: false }
        },
        flows: {
          'valid-flow': {
            id: 'valid-flow',
            name: 'Valid Flow',
            description: null,
            systemScopeIds: [123, 'root'],
            tags: ['primary', ''],
            steps: [
              {
                id: 'step-1',
                name: 'Valid Step',
                description: null,
                source: {
                  componentId: 'component-1',
                  entryPointId: null
                },
                target: {
                  componentId: 'component-2',
                  entryPointId: null
                },
                tags: [''],
                alternateFlowIds: ['alt']
              },
              {
                id: 'step-2',
                name: '',
                source: {
                  componentId: 'component-1',
                  entryPointId: null
                },
                target: {
                  componentId: 'component-2',
                  entryPointId: null
                }
              }
            ]
          },
          'missing-name': { id: 'missing-name', name: '', description: '', systemScopeIds: [], tags: [], steps: [] }
        },
        dataModels: {
          'valid-model': {
            id: 'valid-model',
            name: 'Model',
            description: null,
            attributes: [
              {
                id: 'attr-keep',
                name: 'Attribute',
                type: 'string',
                description: null,
                readOnly: true,
                encrypted: true,
                private: true
              },
              { id: 'attr-drop', name: '', type: 'string' }
            ]
          },
          'invalid-model': { id: '', name: 'no id', attributes: [] }
        },
        components: {
          'valid-component': {
            id: 'valid-component',
            name: 'Orders API',
            description: null,
            entryPointIds: ['ep-keep', 'ep-drop']
          },
          'invalid-component': { id: '', name: 'Unnamed', entryPointIds: [] }
        },
        entryPoints: {
          'ep-keep': {
            id: 'ep-keep',
            name: 'List orders',
            description: null,
            type: 'http',
            protocol: 'HTTP',
            method: 'GET',
            path: '/orders',
            requestModelIds: ['valid-model'],
            responseModelIds: ['valid-model']
          },
          'ep-drop': { id: 'ep-drop', name: '', type: 'http', protocol: 'HTTP' }
        }
      }
    }
  });

  const project = aggregate.projects['keep-me'];
  assert.ok(project);
  assert.deepEqual(project.tags, ['  tagged  ']);
  assert.deepEqual(Object.keys(project.systems), ['root']);
  assert.equal(project.systems.root.description, '');
  assert.deepEqual(project.systems.root.childIds, ['child']);
  assert.deepEqual(Object.keys(project.flows), ['valid-flow']);
  assert.equal(project.flows['valid-flow'].steps.length, 1);
  assert.equal(project.flows['valid-flow'].steps[0].tags.length, 0);
  assert.deepEqual(project.flows['valid-flow'].systemScopeIds, ['root']);
  assert.equal(project.dataModels['valid-model'].attributes.length, 1);
  assert.equal(project.dataModels['valid-model'].attributes[0].readOnly, true);
  assert.equal(project.dataModels['valid-model'].attributes[0].encrypted, true);
  assert.equal(project.dataModels['valid-model'].attributes[0].private, true);
  assert.deepEqual(Object.keys(project.components), ['valid-component']);
  assert.deepEqual(project.components['valid-component'].entryPointIds, ['ep-keep', 'ep-drop']);
  assert.deepEqual(Object.keys(project.entryPoints), ['ep-keep']);
  assert.deepEqual(project.entryPoints['ep-keep'].requestModelIds, ['valid-model']);
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
    dataModels: {},
    components: {},
    entryPoints: {}
  };

  assert.deepEqual(createProjectIndex(aggregate), [aggregate.projects['proj-1']]);
});

test('findProjectById returns project or null when missing', () => {
  const aggregate = createEmptyDomainAggregate();
  aggregate.projects['existing'] = {
    id: 'existing',
    name: 'Existing Project',
    description: '',
    tags: [],
    rootSystemId: 'root-1',
    systems: {
      'root-1': {
        id: 'root-1',
        name: 'Root',
        description: '',
        tags: [],
        childIds: [],
        isRoot: true
      }
    },
    flows: {},
    dataModels: {},
    components: {},
    entryPoints: {}
  };

  assert.equal(findProjectById(aggregate, 'existing')?.id, 'existing');
  assert.equal(findProjectById(aggregate, 'missing'), null);
});

test('getRootSystem returns the primary system for the project', () => {
  const aggregate = createEmptyDomainAggregate();
  aggregate.projects['proj'] = {
    id: 'proj',
    name: 'With Root',
    description: '',
    tags: [],
    rootSystemId: 'root-system',
    systems: {
      'root-system': {
        id: 'root-system',
        name: 'Root',
        description: '',
        tags: [],
        childIds: [],
        isRoot: true
      }
    },
    flows: {},
    dataModels: {},
    components: {},
    entryPoints: {}
  };

  const project = aggregate.projects['proj'];
  assert.equal(getRootSystem(project)?.id, 'root-system');

  const withoutRoot = { ...project, rootSystemId: 'missing' };
  assert.equal(getRootSystem(withoutRoot), null);
});

test('isValidDomainAggregate validates aggregates without throwing', () => {
  const validAggregate = {
    projects: {
      proj: {
        id: 'proj',
        name: 'Valid',
        description: '',
        tags: [],
        rootSystemId: 'root',
        systems: {
          root: {
            id: 'root',
            name: 'Root',
            description: '',
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

  assert.equal(isValidDomainAggregate(validAggregate), true);
  assert.equal(
    isValidDomainAggregate({
      projects: {
        invalid: {
          id: 'proj',
          name: '',
          rootSystemId: '',
          systems: {},
          flows: {},
          dataModels: {},
          components: {},
          entryPoints: {}
        }
      }
    }),
    false
  );
  assert.equal(isValidDomainAggregate({ projects: 'not-an-object' }), false);
  assert.equal(isValidDomainAggregate({}), true);
});

test('DomainSchemas exposes schema helpers', () => {
  assert.equal(DomainSchemas.validateDomainAggregate, validateDomainAggregate);
  assert.equal(DomainSchemas.createEmptyDomainAggregate, createEmptyDomainAggregate);
});

test('default export mirrors named helpers', () => {
  assert.equal(DomainModels.validateDomainAggregate, validateDomainAggregate);
  assert.equal(DomainModels.createEmptyDomainAggregate, createEmptyDomainAggregate);
  assert.equal(DomainModels.createProjectIndex, createProjectIndex);
  assert.equal(DomainModels.findProjectById, findProjectById);
  assert.equal(DomainModels.getRootSystem, getRootSystem);
  assert.equal(DomainModels.isValidDomainAggregate, isValidDomainAggregate);
});
