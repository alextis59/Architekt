import type { Flow, Project } from '@architekt/domain';
import { describe, expect, it } from 'vitest';
import {
  collectFlowTags,
  collectStepTagsFromDraft,
  createDraftFromFlow,
  createEmptyFlowDraft,
  validateFlowDraft
} from './FlowWorkspace.js';

const baseFlow: Flow = {
  id: 'flow-1',
  name: 'Checkout',
  description: 'Primary checkout experience',
  tags: ['critical', 'payments'],
  systemScopeIds: ['sys-1', 'sys-2'],
  steps: [
    {
      id: 'step-1',
      name: 'Validate cart',
      description: 'Ensure items are available',
      sourceSystemId: 'sys-1',
      targetSystemId: 'sys-2',
      tags: ['validation'],
      alternateFlowIds: []
    },
    {
      id: 'step-2',
      name: 'Process payment',
      description: 'Charge credit card',
      sourceSystemId: 'sys-2',
      targetSystemId: 'sys-2',
      tags: ['billing'],
      alternateFlowIds: []
    }
  ]
};

const alternateFlow: Flow = {
  id: 'flow-2',
  name: 'Checkout fallback',
  description: 'Handles payment errors',
  tags: ['fallback'],
  systemScopeIds: ['sys-1', 'sys-2'],
  steps: [
    {
      id: 'step-3',
      name: 'Retry payment',
      description: 'Retry with alternate provider',
      sourceSystemId: 'sys-2',
      targetSystemId: 'sys-2',
      tags: ['billing', 'retry'],
      alternateFlowIds: []
    }
  ]
};

const project: Project = {
  id: 'proj-1',
  name: 'Demo',
  description: 'Synthetic project',
  tags: ['demo'],
  rootSystemId: 'sys-1',
  systems: {
    'sys-1': {
      id: 'sys-1',
      name: 'Storefront',
      description: 'UI layer',
      tags: ['ui'],
      childIds: ['sys-2'],
      isRoot: true
    },
    'sys-2': {
      id: 'sys-2',
      name: 'Payments service',
      description: 'Handles card charges',
      tags: ['payments'],
      childIds: [],
      isRoot: false
    }
  },
  flows: {
    'flow-1': baseFlow,
    'flow-2': alternateFlow
  }
};

describe('collectFlowTags', () => {
  it('aggregates and sorts unique tags from project flows', () => {
    const tags = collectFlowTags(project);
    expect(tags).toEqual(['critical', 'fallback', 'payments']);
  });
});

describe('collectStepTagsFromDraft', () => {
  it('returns an empty list when draft is null', () => {
    expect(collectStepTagsFromDraft(null)).toEqual([]);
  });

  it('collects unique tags from step drafts', () => {
    const draft = createDraftFromFlow(baseFlow);
    draft.steps[0]?.tags.push('retry');
    const tags = collectStepTagsFromDraft(draft);
    expect(tags).toEqual(['billing', 'retry', 'validation']);
  });
});

describe('validateFlowDraft', () => {
  it('flags missing name and scope', () => {
    const draft = createEmptyFlowDraft([]);
    const result = validateFlowDraft(draft, project);
    expect(result.isValid).toBe(false);
    expect(result.flow).toEqual([
      'Flow name is required.',
      'Select at least one system for the flow scope.'
    ]);
  });

  it('detects duplicate step names and out-of-scope systems', () => {
    const draft = createDraftFromFlow(baseFlow);
    draft.name = 'Updated checkout';
    draft.systemScopeIds = ['sys-1'];
    // Duplicate step name and out of scope system
    draft.steps[1] = {
      ...draft.steps[1],
      name: 'Validate cart',
      sourceSystemId: 'sys-2',
      targetSystemId: 'sys-2'
    };

    const result = validateFlowDraft(draft, project);
    expect(result.isValid).toBe(false);
    expect(result.steps[0]).toContain('Step name must be unique.');
    expect(result.steps[1]).toEqual([
      'Step name must be unique.',
      'Source system must be part of the flow scope.',
      'Target system must be part of the flow scope.'
    ]);
  });

  it('accepts a valid draft including alternate flow references', () => {
    const draft = createDraftFromFlow(baseFlow);
    draft.steps[0] = {
      ...draft.steps[0],
      alternateFlowIds: ['flow-2']
    };

    const result = validateFlowDraft(draft, project);
    expect(result.isValid).toBe(true);
    expect(result.flow).toEqual([]);
  });
});
