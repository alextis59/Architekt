import type { DataModel } from '@architekt/domain';
import type {
  DataModelAttributePayload,
  DataModelPayload
} from '../api/projects.js';

export type AttributeDraft = {
  id?: string;
  localId: string;
  name: string;
  description: string;
  type: string;
  constraints: string;
  readOnly: boolean;
  encrypted: boolean;
  attributes: AttributeDraft[];
};

export type DataModelDraft = {
  id?: string;
  name: string;
  description: string;
  attributes: AttributeDraft[];
};

export const generateLocalId = (): string => {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return `draft-${Math.random().toString(36).slice(2, 11)}`;
};

export const createEmptyAttributeDraft = (): AttributeDraft => ({
  localId: generateLocalId(),
  name: '',
  description: '',
  type: '',
  constraints: '',
  readOnly: false,
  encrypted: false,
  attributes: []
});

const createAttributeDraftFromModel = (attribute: DataModel['attributes'][number]): AttributeDraft => ({
  id: attribute.id,
  localId: attribute.id ?? generateLocalId(),
  name: attribute.name,
  description: attribute.description,
  type: attribute.type,
  constraints: attribute.constraints,
  readOnly: attribute.readOnly,
  encrypted: attribute.encrypted,
  attributes: attribute.attributes.map(createAttributeDraftFromModel)
});

export const createDataModelDraft = (dataModel: DataModel): DataModelDraft => ({
  id: dataModel.id,
  name: dataModel.name,
  description: dataModel.description,
  attributes: dataModel.attributes.map(createAttributeDraftFromModel)
});

export const createEmptyDataModelDraft = (): DataModelDraft => ({
  name: '',
  description: '',
  attributes: []
});

const toAttributePayload = (attribute: AttributeDraft): DataModelAttributePayload => {
  const payload: DataModelAttributePayload = {
    name: attribute.name.trim(),
    description: attribute.description.trim(),
    type: attribute.type.trim(),
    constraints: attribute.constraints.trim(),
    readOnly: attribute.readOnly,
    encrypted: attribute.encrypted,
    attributes: attribute.attributes.map(toAttributePayload)
  };

  if (attribute.id) {
    payload.id = attribute.id;
  }

  return payload;
};

export const toDataModelPayload = (draft: DataModelDraft): DataModelPayload => ({
  name: draft.name.trim(),
  description: draft.description.trim(),
  attributes: draft.attributes.map(toAttributePayload)
});

