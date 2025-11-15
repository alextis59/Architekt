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
  required: boolean;
  unique: boolean;
  constraints: AttributeConstraintDraft[];
  readOnly: boolean;
  encrypted: boolean;
  attributes: AttributeDraft[];
};

export type AttributeConstraintDraft = {
  type: 'regex' | 'minLength' | 'maxLength' | 'min' | 'max';
  value: string;
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
  required: false,
  unique: false,
  constraints: [],
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
  required: attribute.required,
  unique: attribute.unique,
  constraints: attribute.constraints.map((constraint) => ({
    type: constraint.type,
    value: constraint.type === 'regex' ? constraint.value : String(constraint.value)
  })),
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
  const constraintMap = new Map<AttributeConstraintDraft['type'], DataModelAttributePayload['constraints'][number]>();

  for (const constraint of attribute.constraints) {
    const type = constraint.type;
    if (constraintMap.has(type)) {
      continue;
    }

    if (type === 'regex') {
      const value = constraint.value.trim();
      if (!value) {
        continue;
      }
      constraintMap.set(type, { type, value });
      continue;
    }

    const trimmed = constraint.value.trim();
    if (!trimmed) {
      continue;
    }

    const numeric = Number(trimmed);
    if (!Number.isFinite(numeric)) {
      continue;
    }

    if (type === 'minLength' || type === 'maxLength') {
      const integer = Math.trunc(numeric);
      if (!Number.isFinite(integer) || integer < 0) {
        continue;
      }
      constraintMap.set(type, { type, value: integer });
    } else {
      constraintMap.set(type, { type, value: numeric });
    }
  }

  const payload: DataModelAttributePayload = {
    name: attribute.name.trim(),
    description: attribute.description.trim(),
    type: attribute.type.trim(),
    required: attribute.required,
    unique: attribute.unique,
    constraints: Array.from(constraintMap.values()),
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

