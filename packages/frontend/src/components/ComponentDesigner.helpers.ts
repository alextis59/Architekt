import type { Component } from '@architekt/domain';
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
  target: string;
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
  entryPoint: Component['entryPoints'][number]
): EntryPointDraft => ({
  id: entryPoint.id,
  localId: entryPoint.id ?? generateLocalId(),
  name: entryPoint.name,
  description: entryPoint.description,
  type: entryPoint.type,
  protocol: entryPoint.protocol,
  method: entryPoint.method,
  path: entryPoint.path,
  target: entryPoint.target,
  requestModelIds: [...entryPoint.requestModelIds],
  responseModelIds: [...entryPoint.responseModelIds]
});

export const createComponentDraft = (component: Component): ComponentDraft => ({
  id: component.id,
  name: component.name,
  description: component.description,
  entryPoints: component.entryPoints.map(createEntryPointDraftFromModel)
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
  target: '',
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

const toEntryPointPayload = (entryPoint: EntryPointDraft): ComponentEntryPointPayload => {
  const payload: ComponentEntryPointPayload = {
    name: entryPoint.name.trim(),
    description: entryPoint.description.trim(),
    type: entryPoint.type.trim(),
    protocol: entryPoint.protocol.trim(),
    method: entryPoint.method.trim(),
    path: entryPoint.path.trim(),
    target: entryPoint.target.trim(),
    requestModelIds: normalizeIdentifiers(entryPoint.requestModelIds),
    responseModelIds: normalizeIdentifiers(entryPoint.responseModelIds)
  };

  if (entryPoint.id) {
    payload.id = entryPoint.id;
  }

  return payload;
};

export const toComponentPayload = (draft: ComponentDraft): ComponentPayload => ({
  name: draft.name.trim(),
  description: draft.description.trim(),
  entryPoints: draft.entryPoints.map(toEntryPointPayload)
});
