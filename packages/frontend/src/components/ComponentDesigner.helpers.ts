import type { Component, ComponentEntryPoint } from '@architekt/domain';
import type {
  ComponentEntryPointPayload,
  ComponentPayload
} from '../api/projects.js';
import { generateLocalId } from './DataModelDesigner.helpers.js';

export type EntryPointDraft = {
  id?: string;
  localId: string;
  name: string;
  description: string;
  type: string;
  protocol: string;
  method: string;
  path: string;
  requestModelIds: string[];
  responseModelIds: string[];
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
  type: entryPoint.type,
  protocol: entryPoint.protocol,
  method: entryPoint.method,
  path: entryPoint.path,
  requestModelIds: [...entryPoint.requestModelIds],
  responseModelIds: [...entryPoint.responseModelIds]
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
  type: '',
  protocol: '',
  method: '',
  path: '',
  requestModelIds: [],
  responseModelIds: []
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
    type: entryPoint.type.trim(),
    protocol: entryPoint.protocol.trim(),
    method: entryPoint.method.trim(),
    path: entryPoint.path.trim(),
    requestModelIds: mapModelIdentifiers(entryPoint.requestModelIds, modelLookup),
    responseModelIds: mapModelIdentifiers(entryPoint.responseModelIds, modelLookup)
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
