import { describe, expect, it, vi } from 'vitest';
import type { DataModel } from '@architekt/domain';
import {
  DataModelDraft,
  createDataModelDraft,
  createEmptyAttributeDraft,
  createEmptyDataModelDraft,
  toDataModelPayload
} from './DataModelDesigner.helpers.js';

describe('DataModelDesigner helpers', () => {
  it('creates a draft from an existing data model', () => {
    const model: DataModel = {
      id: 'model-1',
      name: 'Order',
      description: 'Order schema',
      attributes: [
        {
          id: 'attr-1',
          name: 'id',
          description: 'Primary key',
          type: 'string',
          constraints: 'required',
          readOnly: true,
          encrypted: false,
          attributes: []
        }
      ]
    };

    const draft = createDataModelDraft(model);

    expect(draft).toEqual({
      id: 'model-1',
      name: 'Order',
      description: 'Order schema',
      attributes: [
        {
          id: 'attr-1',
          localId: 'attr-1',
          name: 'id',
          description: 'Primary key',
          type: 'string',
          constraints: 'required',
          readOnly: true,
          encrypted: false,
          attributes: []
        }
      ]
    });
  });

  it('generates payloads from drafts and trims values', () => {
    const draft = {
      id: 'model-2',
      name: '  Customer  ',
      description: '  Captures customer info  ',
      attributes: [
        {
          id: 'attr-1',
          localId: 'attr-1',
          name: ' name ',
          description: ' primary ',
          type: ' string ',
          constraints: ' required ',
          readOnly: false,
          encrypted: true,
          attributes: []
        }
      ]
    } satisfies DataModelDraft;

    const payload = toDataModelPayload(draft);

    expect(payload).toEqual({
      name: 'Customer',
      description: 'Captures customer info',
      attributes: [
        {
          id: 'attr-1',
          name: 'name',
          description: 'primary',
          type: 'string',
          constraints: 'required',
          readOnly: false,
          encrypted: true,
          attributes: []
        }
      ]
    });
  });

  it('creates empty attribute drafts with defaults', () => {
    const spy = vi.spyOn(globalThis.Math, 'random').mockReturnValue(0.123456789);

    const draft = createEmptyAttributeDraft();

    expect(draft.name).toBe('');
    expect(draft.description).toBe('');
    expect(draft.type).toBe('');
    expect(draft.constraints).toBe('');
    expect(draft.readOnly).toBe(false);
    expect(draft.encrypted).toBe(false);
    expect(draft.attributes).toEqual([]);
    expect(draft.localId).toBeDefined();

    spy.mockRestore();
  });

  it('provides an empty data model draft template', () => {
    expect(createEmptyDataModelDraft()).toEqual({ name: '', description: '', attributes: [] });
  });
});

