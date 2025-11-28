import { describe, expect, it, vi } from 'vitest';
import type { Component, ComponentEntryPoint } from '@architekt/domain';
import {
  ComponentDraft,
  createComponentDraft,
  createEmptyComponentDraft,
  createEmptyEntryPointDraft,
  toComponentPayload,
  toExportableComponentPayload
} from './ComponentDesigner.helpers.js';

const createComponent = (): { component: Component; entryPoints: Record<string, ComponentEntryPoint> } => {
  const entryPoint: ComponentEntryPoint = {
    id: 'entry-1',
    name: 'Get customer',
    description: 'Fetch by id',
    tags: [],
    type: 'http',
    functionName: '',
    protocol: 'HTTP',
    method: 'GET',
    path: '/customers/:id',
    requestModelIds: ['model-1'],
    responseModelIds: ['model-1'],
    requestAttributes: [],
    responseAttributes: []
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
          tags: [],
          type: 'http',
          functionName: '',
          protocol: 'HTTP',
          method: 'GET',
          path: '/customers/:id',
          requestModelIds: ['model-1'],
          responseModelIds: ['model-1'],
          requestAttributes: [],
          responseAttributes: []
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
      tags: [],
      type: '',
      functionName: '',
      protocol: '',
      method: '',
      path: '',
      requestModelIds: [],
      responseModelIds: [],
      requestAttributes: [],
      responseAttributes: []
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
          tags: [' api ', 'async', 'api'],
          type: '  http  ',
          functionName: '  createOrder  ',
          protocol: '  HTTP  ',
          method: '  POST  ',
          path: '  /orders  ',
          requestModelIds: [' model-1 ', 'model-1'],
          responseModelIds: [' model-2 ', ''],
          requestAttributes: [
            {
              id: 'attr-1',
              localId: 'attr-1',
              name: '  Correlation  ',
              description: '  Tracking  ',
              type: '  string  ',
              required: true,
              unique: false,
              constraints: [{ type: 'regex', value: '^[a-z]+$' }],
              readOnly: false,
              encrypted: false,
              private: false,
              attributes: [],
              element: null
            }
          ],
          responseAttributes: []
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
          tags: ['api', 'async'],
          type: 'http',
          functionName: 'createOrder',
          protocol: 'HTTP',
          method: 'POST',
          path: '/orders',
          requestModelIds: ['model-1'],
          responseModelIds: ['model-2'],
          requestAttributes: [
            {
              id: 'attr-1',
              name: 'Correlation',
              description: 'Tracking',
              type: 'string',
              required: true,
              unique: false,
              constraints: [{ type: 'regex', value: '^[a-z]+$' }],
              readOnly: false,
              encrypted: false,
              private: false
            }
          ],
          responseAttributes: []
        }
      ]
    });
  });

  it('provides an empty component draft template', () => {
    expect(createEmptyComponentDraft()).toEqual({ name: '', description: '', entryPoints: [] });
  });

  it('replaces model identifiers with names in exportable payloads', () => {
    const draft: ComponentDraft = {
      name: 'Customer API',
      description: 'Handles customers',
      entryPoints: [
        {
          localId: 'entry-1',
          name: 'Get customer',
          description: 'Fetch by id',
          tags: [],
          type: 'http',
          functionName: '',
          protocol: 'HTTP',
          method: 'GET',
          path: '/customers/:id',
          requestModelIds: ['model-1', 'unknown-id'],
          responseModelIds: ['model-2'],
          requestAttributes: [],
          responseAttributes: []
        }
      ]
    };

    const lookup = new Map<string, string>([
      ['model-1', 'Customer Profile'],
      ['model-2', 'Audit Event']
    ]);

    expect(toExportableComponentPayload(draft, lookup)).toEqual({
      name: 'Customer API',
      description: 'Handles customers',
      entryPoints: [
        {
          name: 'Get customer',
          description: 'Fetch by id',
          tags: [],
          type: 'http',
          functionName: '',
          protocol: 'HTTP',
          method: 'GET',
          path: '/customers/:id',
          requestModelIds: ['Customer Profile', 'unknown-id'],
          responseModelIds: ['Audit Event'],
          requestAttributes: [],
          responseAttributes: []
        }
      ]
    });
  });
});
