import { describe, expect, it } from 'vitest';
import type { Flow, Project } from '@architekt/domain';
import {
  collectFlowTags,
  collectStepTagsFromDraft,
  createDraftFromFlow,
  createEmptyFlowDraft,
  toFlowPayload,
  validateFlowDraft
} from './FlowWorkspace.js';

describe('FlowWorkspace helpers', () => {
  const project: Project = {
    id: 'proj',
    name: 'Project',
    description: '',
    tags: [],
    rootSystemId: 'sys-1',
    systems: {
      'sys-1': {
        id: 'sys-1',
        name: 'System 1',
        description: '',
        tags: [],
        childIds: [],
        isRoot: true
      },
      'sys-2': {
        id: 'sys-2',
        name: 'System 2',
        description: '',
        tags: [],
        childIds: [],
        isRoot: false
      }
    },
    flows: {},
    dataModels: {},
    components: {
      'component-1': {
        id: 'component-1',
        name: 'Component 1',
        description: '',
        entryPointIds: ['ep-1', 'ep-2']
      }
    },
    entryPoints: {
      'ep-1': {
        id: 'ep-1',
        name: 'Endpoint 1',
        description: '',
        type: 'http',
        protocol: 'HTTP',
        method: 'GET',
        path: '/one',
        target: '',
        requestModelIds: [],
        responseModelIds: []
      },
      'ep-2': {
        id: 'ep-2',
        name: 'Endpoint 2',
        description: '',
        type: 'http',
        protocol: 'HTTP',
        method: 'POST',
        path: '/two',
        target: '',
        requestModelIds: [],
        responseModelIds: []
      }
    }
  };

  it('creates drafts from flows and converts them back to sanitized payloads', () => {
    const flow: Flow = {
      id: 'flow-1',
      name: 'Checkout',
      description: 'Flow description',
      tags: ['primary', 'primary', ' '],
      systemScopeIds: ['sys-1', 'sys-2', 'sys-1'],
      steps: [
        {
          id: 'step-1',
          name: 'Validate cart',
          description: 'Ensure items are valid',
          source: {
            componentId: 'component-1',
            entryPointId: 'ep-1'
          },
          target: {
            componentId: 'component-1',
            entryPointId: 'ep-2'
          },
          tags: ['validate', 'validate'],
          alternateFlowIds: ['flow-2', 'flow-2']
        }
      ]
    };

    const draft = createDraftFromFlow(flow);
    expect(draft.name).toBe('Checkout');
    expect(draft.steps).toHaveLength(1);

    const payload = toFlowPayload(draft);
    expect(payload).toEqual({
      name: 'Checkout',
      description: 'Flow description',
      tags: ['primary'],
      systemScopeIds: ['sys-1', 'sys-2'],
      steps: [
        {
          id: 'step-1',
          name: 'Validate cart',
          description: 'Ensure items are valid',
          source: {
            componentId: 'component-1',
            entryPointId: 'ep-1'
          },
          target: {
            componentId: 'component-1',
            entryPointId: 'ep-2'
          },
          tags: ['validate'],
          alternateFlowIds: ['flow-2']
        }
      ]
    });
  });

  it('validates draft flows and reports missing fields', () => {
    const draft = createEmptyFlowDraft(['sys-1']);
    draft.steps.push({
      name: ' ',
      description: '',
      source: {
        componentId: '',
        entryPointId: null
      },
      target: {
        componentId: '',
        entryPointId: null
      },
      tags: ['a', ''],
      alternateFlowIds: ['flow-1', 'flow-1']
    });

    const validation = validateFlowDraft(draft, { ...project, flows: { 'flow-1': { ...draft, id: 'flow-1', steps: [] } as Flow } });
    expect(validation.isValid).toBe(false);
    expect(validation.flow).toContain('Flow name is required.');
    expect(validation.steps[0]).toContain('Step name is required.');
    expect(validation.steps[0]).toContain('Select a source component.');
    expect(validation.steps[0]).toContain('Select a target component.');
  });

  it('collects tag sets from projects and drafts', () => {
    const projectWithTags: Project = {
      ...project,
      flows: {
        'flow-a': {
          id: 'flow-a',
          name: 'Flow A',
          description: '',
          tags: ['alpha', 'beta'],
          systemScopeIds: ['sys-1'],
          steps: []
        },
        'flow-b': {
          id: 'flow-b',
          name: 'Flow B',
          description: '',
          tags: ['beta', 'gamma'],
          systemScopeIds: ['sys-2'],
          steps: []
        }
      }
    };

    expect(collectFlowTags(projectWithTags)).toEqual(['alpha', 'beta', 'gamma']);

    const draft = createEmptyFlowDraft(['sys-1']);
    draft.steps.push({
      name: 'Step',
      description: '',
      source: {
        componentId: 'component-1',
        entryPointId: 'ep-1'
      },
      target: {
        componentId: 'component-1',
        entryPointId: 'ep-2'
      },
      tags: ['tag-a', 'tag-b', 'tag-a'],
      alternateFlowIds: []
    });
    expect(collectStepTagsFromDraft(draft)).toEqual(['tag-a', 'tag-b']);
  });
});
