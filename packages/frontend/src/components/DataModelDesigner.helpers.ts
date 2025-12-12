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
  tags: string[];
  type: string;
  required: boolean;
  unique: boolean;
  constraints: AttributeConstraintDraft[];
  readOnly: boolean;
  encrypted: boolean;
  private: boolean;
  attributes: AttributeDraft[];
  element: AttributeDraft | null;
};

export type AttributeConstraintDraft =
  | {
      type: 'regex' | 'minLength' | 'maxLength' | 'min' | 'max';
      value: string;
    }
  | { type: 'enum'; values: string[] };

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
  tags: [],
  type: '',
  required: false,
  unique: false,
  constraints: [],
  readOnly: false,
  encrypted: false,
  private: false,
  attributes: [],
  element: null
});

export const getConstraintTypesForAttribute = (
  type: string
): AttributeConstraintDraft['type'][] => {
  const normalized = type.trim().toLowerCase();
  if (normalized === 'string') {
    return ['regex', 'minLength', 'maxLength', 'enum'];
  }
  if (normalized === 'number' || normalized === 'integer') {
    return ['min', 'max'];
  }
  return [];
};

export const formatConstraintDisplay = (constraint: AttributeConstraintDraft): string => {
  if (constraint.type === 'enum') {
    return constraint.values.length > 0
      ? `Enum: ${constraint.values.join(', ')}`
      : 'Enum';
  }

  const value = constraint.value.trim();
  switch (constraint.type) {
    case 'regex':
      return value ? `Regex: ${value}` : 'Regex';
    case 'minLength':
      return value ? `Min length: ${value}` : 'Min length';
    case 'maxLength':
      return value ? `Max length: ${value}` : 'Max length';
    case 'min':
      return value ? `Min: ${value}` : 'Min';
    case 'max':
      return value ? `Max: ${value}` : 'Max';
    default:
      return value || constraint.type;
  }
};

export const cloneAttributeDraft = (attribute: AttributeDraft): AttributeDraft => ({
  ...attribute,
  tags: [...attribute.tags],
  constraints: attribute.constraints.map((constraint) =>
    constraint.type === 'enum' ? { type: 'enum', values: [...constraint.values] } : { ...constraint }
  ),
  attributes: attribute.attributes.map(cloneAttributeDraft),
  element: attribute.element ? cloneAttributeDraft(attribute.element) : null
});

export const collectAttributeIds = (attributes: AttributeDraft[]): Set<string> => {
  const ids = new Set<string>();
  const visit = (attribute: AttributeDraft) => {
    ids.add(attribute.localId);
    attribute.attributes.forEach(visit);
    if (attribute.element) {
      visit(attribute.element);
    }
  };

  attributes.forEach(visit);
  return ids;
};

export const retainExpandedAttributeIds = (
  expanded: Set<string>,
  draft: { attributes: AttributeDraft[] } | null
): Set<string> => {
  if (!draft) {
    return new Set<string>();
  }

  const validIds = collectAttributeIds(draft.attributes);
  const next = new Set<string>();

  expanded.forEach((id) => {
    if (validIds.has(id)) {
      next.add(id);
    }
  });

  return next;
};

type UpdateAttributeFn = (attribute: AttributeDraft) => AttributeDraft;

export const updateAttributeInList = (
  attributes: AttributeDraft[],
  targetId: string,
  updater: UpdateAttributeFn
): AttributeDraft[] => {
  const updateAttributeNode = (attribute: AttributeDraft): AttributeDraft => {
    if (attribute.localId === targetId) {
      return updater(attribute);
    }

    const updatedAttributes = updateAttributeInList(attribute.attributes, targetId, updater);
    const updatedElement = attribute.element
      ? updateAttributeNode(attribute.element)
      : null;

    if (updatedAttributes !== attribute.attributes || updatedElement !== attribute.element) {
      return {
        ...attribute,
        attributes: updatedAttributes,
        element: updatedElement
      };
    }

    return attribute;
  };

  return attributes.map(updateAttributeNode);
};

export const removeAttributeFromList = (attributes: AttributeDraft[], targetId: string): AttributeDraft[] =>
  attributes
    .filter((attribute) => attribute.localId !== targetId)
    .map((attribute) => {
      const updatedAttributes = removeAttributeFromList(attribute.attributes, targetId);

      let updatedElement = attribute.element;
      if (attribute.element) {
        if (attribute.element.localId === targetId) {
          updatedElement = null;
        } else {
          const prunedElement = removeAttributeFromList([attribute.element], targetId)[0];
          updatedElement = prunedElement ?? attribute.element;
        }
      }

      if (updatedAttributes !== attribute.attributes || updatedElement !== attribute.element) {
        return {
          ...attribute,
          attributes: updatedAttributes,
          element: updatedElement
        };
      }

      return attribute;
    });

export const addAttributeToList = (
  attributes: AttributeDraft[],
  parentId: string | null,
  newAttribute: AttributeDraft
): AttributeDraft[] => {
  if (parentId === null) {
    return [...attributes, newAttribute];
  }

  return attributes.map((attribute) => {
    if (attribute.localId === parentId) {
      return {
        ...attribute,
        attributes: [...attribute.attributes, newAttribute]
      };
    }

    if (attribute.element?.localId === parentId) {
      return {
        ...attribute,
        element: {
          ...attribute.element,
          attributes: [...attribute.element.attributes, newAttribute]
        }
      };
    }

    return {
      ...attribute,
      attributes: addAttributeToList(attribute.attributes, parentId, newAttribute),
      element: attribute.element
        ? {
            ...attribute.element,
            attributes: addAttributeToList(attribute.element.attributes, parentId, newAttribute)
          }
        : null
    };
  });
};

export const findAttributeInList = (
  attributes: AttributeDraft[],
  targetId: string
): AttributeDraft | null => {
  for (const attribute of attributes) {
    if (attribute.localId === targetId) {
      return attribute;
    }

    const nestedMatch = findAttributeInList(attribute.attributes, targetId);
    if (nestedMatch) {
      return nestedMatch;
    }

    if (attribute.element) {
      const elementMatch = findAttributeInList([attribute.element], targetId);
      if (elementMatch) {
        return elementMatch;
      }
    }
  }

  return null;
};

const createAttributeDraftFromModel = (attribute: DataModel['attributes'][number]): AttributeDraft => ({
  id: attribute.id,
  localId: attribute.id ?? generateLocalId(),
  name: attribute.name,
  description: attribute.description,
  tags: attribute.tags ?? [],
  type: attribute.type,
  required: attribute.required,
  unique: attribute.unique,
  constraints: attribute.constraints.map((constraint) => ({
    ...constraint,
    ...(constraint.type === 'regex'
      ? { value: constraint.value }
      : constraint.type === 'enum'
        ? { values: [...constraint.values] }
        : { value: String(constraint.value) })
  })),
  readOnly: attribute.readOnly,
  encrypted: attribute.encrypted,
  private: attribute.private ?? false,
  attributes: attribute.attributes.map(createAttributeDraftFromModel),
  element: attribute.element ? createAttributeDraftFromModel(attribute.element) : null
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

type AttributePayloadOptions = {
  includeIds?: boolean;
};

export const toAttributePayload = (
  attribute: AttributeDraft,
  { includeIds = true }: AttributePayloadOptions = {}
): DataModelAttributePayload => {
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

    if (type === 'enum') {
      const candidates = Array.isArray(constraint.values)
        ? constraint.values
        : typeof (constraint as { value?: unknown }).value === 'string'
          ? ((constraint as { value: string }).value.split(/,|\n/) as string[])
          : [];
      const unique = new Set(
        candidates
          .map((value) => value.trim())
          .filter((value): value is string => value.length > 0)
      );
      if (unique.size === 0) {
        continue;
      }
      constraintMap.set(type, { type: 'enum', values: [...unique] });
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

  const type = attribute.type.trim();
  const payload: DataModelAttributePayload = {
    name: attribute.name.trim(),
    description: attribute.description.trim(),
    tags: attribute.tags,
    type,
    required: attribute.required,
    unique: attribute.unique,
    constraints: Array.from(constraintMap.values()),
    readOnly: attribute.readOnly,
    encrypted: attribute.encrypted,
    private: attribute.private,
    ...(type.toLowerCase() === 'object'
      ? { attributes: attribute.attributes.map((child) => toAttributePayload(child, { includeIds })) }
      : {})
  };

  if (attribute.type.trim().toLowerCase() === 'array' && attribute.element) {
    payload.element = toAttributePayload(attribute.element, { includeIds });
  }

  if (includeIds && attribute.id) {
    payload.id = attribute.id;
  }

  return payload;
};

export const toDataModelPayload = (draft: DataModelDraft): DataModelPayload => ({
  name: draft.name.trim(),
  description: draft.description.trim(),
  attributes: draft.attributes.map(toAttributePayload)
});

export const toExportableDataModelPayload = (draft: DataModelDraft): DataModelPayload => ({
  name: draft.name.trim(),
  description: draft.description.trim(),
  attributes: draft.attributes.map((attribute) => toAttributePayload(attribute, { includeIds: false }))
});

