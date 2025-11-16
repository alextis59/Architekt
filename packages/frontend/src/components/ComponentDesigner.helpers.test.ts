import { describe, expect, it, vi } from 'vitest';
import type { Component, ComponentEntryPoint } from '@architekt/domain';
import {
  ComponentDraft,
  createComponentDraft,
  createEmptyComponentDraft,
  createEmptyEntryPointDraft,
  toComponentPayload
} from './ComponentDesigner.helpers.js';

const createComponent = (): { component: Component; entryPoints: Record<string, ComponentEntryPoint> } => {
  const entryPoint: ComponentEntryPoint = {
    id: 'entry-1',
    name: 'Get customer',
    description: 'Fetch by id',
    type: 'http',
    protocol: 'HTTP',
    method: 'GET',
    path: '/customers/:id',
    requestModelIds: ['model-1'],
    responseModelIds: ['model-1']
  };

  const component: Component = {
    id: 'component-1',
    name: 'Customer API',
    description: 'Handles customers',
    entryPointIds: [entryPoint.id]
  };

  return {
    component,
    entryPoints: { [entryPoint.id]: entryPoint }
  };
};

describe('ComponentDesigner helpers', () => {
  it('creates a draft from an existing component', () => {
    const { component, entryPoints } = createComponent();

    const draft = createComponentDraft(component, entryPoints);

    expect(draft).toEqual({
      id: 'component-1',
      name: 'Customer API',
      description: 'Handles customers',
      entryPoints: [
        {
          id: 'entry-1',
          localId: 'entry-1',
          name: 'Get customer',
          description: 'Fetch by id',
          type: 'http',
          protocol: 'HTTP',
          method: 'GET',
          path: '/customers/:id',
          requestModelIds: ['model-1'],
          responseModelIds: ['model-1']
        }
      ]
    });
  });

  it('creates empty entry point drafts with defaults', () => {
    const spy = vi.spyOn(globalThis.Math, 'random').mockReturnValue(0.987654321);

    const draft = createEmptyEntryPointDraft();

    expect(draft).toMatchObject({
      name: '',
      description: '',
      type: '',
      protocol: '',
      method: '',
      path: '',
      requestModelIds: [],
      responseModelIds: []
    });
    expect(draft.localId).toBeDefined();

    spy.mockRestore();
  });

  it('produces payloads from drafts trimming values and deduplicating identifiers', () => {
    const draft = {
      id: 'component-2',
      name: '  Orders Service  ',
      description: '  Handles orders  ',
      entryPoints: [
        {
          id: 'entry-1',
          localId: 'entry-1',
          name: '  Create order  ',
          description: '  Submit new order  ',
          type: '  http  ',
          protocol: '  HTTP  ',
          method: '  POST  ',
          path: '  /orders  ',
          requestModelIds: [' model-1 ', 'model-1'],
          responseModelIds: [' model-2 ', '']
        }
      ]
    } satisfies ComponentDraft;

    const payload = toComponentPayload(draft);

    expect(payload).toEqual({
      name: 'Orders Service',
      description: 'Handles orders',
      entryPoints: [
        {
          id: 'entry-1',
          name: 'Create order',
          description: 'Submit new order',
          type: 'http',
          protocol: 'HTTP',
          method: 'POST',
          path: '/orders',
          requestModelIds: ['model-1'],
          responseModelIds: ['model-2']
        }
      ]
    });
  });

  it('provides an empty component draft template', () => {
    expect(createEmptyComponentDraft()).toEqual({ name: '', description: '', entryPoints: [] });
  });
});
