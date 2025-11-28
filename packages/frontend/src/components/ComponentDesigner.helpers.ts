import type { Component, ComponentEntryPoint } from '@architekt/domain';
import type {
  ComponentEntryPointPayload,
  ComponentPayload
} from '../api/projects.js';
import {
  AttributeDraft,
  cloneAttributeDraft,
  generateLocalId,
  toAttributePayload
} from './DataModelDesigner.helpers.js';

export type EntryPointDraft = {
  id?: string;
  localId: string;
  name: string;
  description: string;
  tags: string[];
  type: string;
  functionName: string;
  protocol: string;
  method: string;
  path: string;
  requestModelIds: string[];
  responseModelIds: string[];
  requestAttributes: AttributeDraft[];
  responseAttributes: AttributeDraft[];
};

export type ComponentDraft = {
  id?: string;
  name: string;
  description: string;
  entryPoints: EntryPointDraft[];
};

const createEntryPointDraftFromModel = (
  entryPoint: ComponentEntryPoint
): EntryPointDraft => ({
  id: entryPoint.id,
  localId: entryPoint.id ?? generateLocalId(),
  name: entryPoint.name,
  description: entryPoint.description,
  tags: [...entryPoint.tags],
  type: entryPoint.type,
  functionName: entryPoint.functionName,
  protocol: entryPoint.protocol,
  method: entryPoint.method,
  path: entryPoint.path,
  requestModelIds: [...entryPoint.requestModelIds],
  responseModelIds: [...entryPoint.responseModelIds],
  requestAttributes: (entryPoint.requestAttributes ?? []).map(cloneAttributeDraft),
  responseAttributes: (entryPoint.responseAttributes ?? []).map(cloneAttributeDraft)
});

export const createComponentDraft = (
  component: Component,
  entryPoints: Record<string, ComponentEntryPoint>
): ComponentDraft => ({
  id: component.id,
  name: component.name,
  description: component.description,
  entryPoints: component.entryPointIds
    .map((entryPointId) => entryPoints[entryPointId])
    .filter((entryPoint): entryPoint is ComponentEntryPoint => Boolean(entryPoint))
    .map(createEntryPointDraftFromModel)
});

export const createEmptyComponentDraft = (): ComponentDraft => ({
  name: '',
  description: '',
  entryPoints: []
});

export const createEmptyEntryPointDraft = (): EntryPointDraft => ({
  localId: generateLocalId(),
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

const normalizeIdentifiers = (identifiers: string[]): string[] => {
  const seen = new Set<string>();
  for (const identifier of identifiers) {
    const trimmed = identifier.trim();
    if (trimmed.length > 0) {
      seen.add(trimmed);
    }
  }
  return [...seen];
};

const mapModelIdentifiers = (
  identifiers: string[],
  modelLookup?: Map<string, string>
): string[] => {
  const normalized = normalizeIdentifiers(identifiers);

  if (!modelLookup) {
    return normalized;
  }

  const resolved = new Set<string>();
  for (const identifier of normalized) {
    const name = (modelLookup.get(identifier) ?? identifier).trim();
    if (name.length > 0) {
      resolved.add(name);
    }
  }

  return [...resolved];
};

const toEntryPointPayload = (
  entryPoint: EntryPointDraft,
  options: { includeIds?: boolean; modelLookup?: Map<string, string> } = {}
): ComponentEntryPointPayload => {
  const { includeIds = true, modelLookup } = options;
  const payload: ComponentEntryPointPayload = {
    name: entryPoint.name.trim(),
    description: entryPoint.description.trim(),
    tags: normalizeIdentifiers(entryPoint.tags),
    type: entryPoint.type.trim(),
    functionName: entryPoint.functionName.trim(),
    protocol: entryPoint.protocol.trim(),
    method: entryPoint.method.trim(),
    path: entryPoint.path.trim(),
    requestModelIds: mapModelIdentifiers(entryPoint.requestModelIds, modelLookup),
    responseModelIds: mapModelIdentifiers(entryPoint.responseModelIds, modelLookup),
    requestAttributes: entryPoint.requestAttributes.map((attribute) =>
      toAttributePayload(attribute, { includeIds })
    ),
    responseAttributes: entryPoint.responseAttributes.map((attribute) =>
      toAttributePayload(attribute, { includeIds })
    )
  };

  if (includeIds && entryPoint.id) {
    payload.id = entryPoint.id;
  }

  return payload;
};

export const toComponentPayload = (draft: ComponentDraft): ComponentPayload => ({
  name: draft.name.trim(),
  description: draft.description.trim(),
  entryPoints: draft.entryPoints.map(toEntryPointPayload)
});

export const toExportableComponentPayload = (
  draft: ComponentDraft,
  modelLookup?: Map<string, string>
): ComponentPayload => ({
  name: draft.name.trim(),
  description: draft.description.trim(),
  entryPoints: draft.entryPoints.map((entryPoint) =>
    toEntryPointPayload(entryPoint, { includeIds: false, modelLookup })
  )
});
