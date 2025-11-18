import { describe, expect, it, vi } from 'vitest';
import type { DataModel } from '@architekt/domain';
import {
  DataModelDraft,
  createDataModelDraft,
  createEmptyAttributeDraft,
  createEmptyDataModelDraft,
  toDataModelPayload,
  toExportableDataModelPayload
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
          required: true,
          unique: true,
          constraints: [{ type: 'minLength', value: 3 }],
          readOnly: true,
          encrypted: false,
          attributes: [],
          element: null
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
          required: true,
          unique: true,
          constraints: [{ type: 'minLength', value: '3' }],
          readOnly: true,
          encrypted: false,
          attributes: [],
          element: null
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
          required: true,
          unique: false,
          constraints: [
            { type: 'regex', value: ' ^[A-Z]+$ ' },
            { type: 'minLength', value: ' 5 ' }
          ],
          readOnly: false,
          encrypted: true
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
          required: true,
          unique: false,
          constraints: [
            { type: 'regex', value: '^[A-Z]+$' },
            { type: 'minLength', value: 5 }
          ],
          readOnly: false,
          encrypted: true
        }
      ]
    });
  });

  it('preserves enum constraints when provided as delimited strings', () => {
    const draft = {
      id: 'model-3',
      name: 'Membership',
      description: '',
      attributes: [
        {
          id: 'attr-1',
          localId: 'attr-1',
          name: 'tier',
          description: '',
          type: 'string',
          required: false,
          unique: false,
          constraints: [{ type: 'enum', value: ' silver, gold\nplatinum ' } as never],
          readOnly: false,
          encrypted: false
        }
      ]
    } satisfies DataModelDraft;

    const payload = toDataModelPayload(draft);

    expect(payload.attributes[0].constraints).toEqual([
      { type: 'enum', values: ['silver', 'gold', 'platinum'] }
    ]);
  });

  it('omits attribute ids and non-object children for export payloads', () => {
    const draft = {
      name: 'Inventory',
      description: 'Inventory data',
      attributes: [
        {
          id: 'attr-1',
          localId: 'attr-1',
          name: 'sku',
          description: 'Stock keeping unit',
          type: 'string',
          required: true,
          unique: true,
          constraints: [],
          readOnly: false,
          encrypted: false,
          attributes: [],
          element: null
        },
        {
          id: 'attr-2',
          localId: 'attr-2',
          name: 'dimensions',
          description: 'Product dimensions',
          type: 'object',
          required: false,
          unique: false,
          constraints: [],
          readOnly: false,
          encrypted: false,
          attributes: [
            {
              id: 'attr-3',
              localId: 'attr-3',
              name: 'height',
              description: '',
              type: 'number',
              required: false,
              unique: false,
              constraints: [],
              readOnly: false,
              encrypted: false,
              attributes: [],
              element: null
            }
          ],
          element: null
        }
      ]
    } satisfies DataModelDraft;

    const payload = toExportableDataModelPayload(draft);

    expect(payload).toEqual({
      name: 'Inventory',
      description: 'Inventory data',
      attributes: [
        {
          name: 'sku',
          description: 'Stock keeping unit',
          type: 'string',
          required: true,
          unique: true,
          constraints: [],
          readOnly: false,
          encrypted: false
        },
        {
          name: 'dimensions',
          description: 'Product dimensions',
          type: 'object',
          required: false,
          unique: false,
          constraints: [],
          readOnly: false,
          encrypted: false,
          attributes: [
            {
              name: 'height',
              description: '',
              type: 'number',
              required: false,
              unique: false,
              constraints: [],
              readOnly: false,
              encrypted: false
            }
          ]
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
    expect(draft.required).toBe(false);
    expect(draft.unique).toBe(false);
    expect(draft.constraints).toEqual([]);
    expect(draft.readOnly).toBe(false);
    expect(draft.encrypted).toBe(false);
    expect(draft.attributes).toEqual([]);
    expect(draft.element).toBeNull();
    expect(draft.localId).toBeDefined();

    spy.mockRestore();
  });

  it('provides an empty data model draft template', () => {
    expect(createEmptyDataModelDraft()).toEqual({ name: '', description: '', attributes: [] });
  });
});

