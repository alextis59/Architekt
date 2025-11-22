import type { Component, DataModel, Flow, Project, System } from '@architekt/domain';
import { apiRequest } from './client.js';

export type ProjectSummary = Pick<Project, 'id' | 'name' | 'description' | 'tags' | 'rootSystemId' | 'sharedWith'>;

const sanitizeTags = (tags: string[]): string[] => {
  const unique = new Set<string>();
  for (const tag of tags) {
    const trimmed = tag.trim();
    if (trimmed.length > 0) {
      unique.add(trimmed);
    }
  }
  return [...unique];
};

const sanitizeIdentifiers = (identifiers: string[]): string[] => {
  const unique = new Set<string>();
  for (const identifier of identifiers) {
    const trimmed = identifier.trim();
    if (trimmed.length > 0) {
      unique.add(trimmed);
    }
  }
  return [...unique];
};

export const fetchProjects = async (): Promise<ProjectSummary[]> => {
  const response = await apiRequest<{ projects: Project[] }>('/projects');
  return response.projects.map(({ id, name, description, tags, rootSystemId, sharedWith }) => ({
    id,
    name,
    description,
    tags,
    rootSystemId,
    sharedWith
  }));
};

export const createProject = async (input: {
  name: string;
  description?: string;
  tags?: string[];
}): Promise<Project> => {
  const payload = {
    name: input.name,
    description: input.description ?? '',
    tags: sanitizeTags(input.tags ?? [])
  };

  const response = await apiRequest<{ project: Project }>('/projects', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  return response.project;
};

export const updateProject = async (
  projectId: string,
  input: {
    name: string;
    description?: string;
    tags?: string[];
  }
): Promise<Project> => {
  const payload = {
    name: input.name,
    description: input.description ?? '',
    tags: sanitizeTags(input.tags ?? [])
  };

  const response = await apiRequest<{ project: Project }>(`/projects/${projectId}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });

  return response.project;
};

export const shareProject = async (projectId: string, email: string): Promise<Project> => {
  const normalizedEmail = email.trim().toLowerCase();

  const response = await apiRequest<{ project: Project }>(`/projects/${projectId}/share`, {
    method: 'POST',
    body: JSON.stringify({ email: normalizedEmail })
  });

  return response.project;
};

export const fetchProjectDetails = async (projectId: string): Promise<Project> => {
  const response = await apiRequest<{ project: Project }>(`/projects/${projectId}`);
  return response.project;
};

export const createSystem = async (
  projectId: string,
  input: {
    name: string;
    description?: string;
    tags?: string[];
    parentId?: string;
  }
): Promise<System> => {
  const payload = {
    name: input.name,
    description: input.description ?? '',
    tags: sanitizeTags(input.tags ?? []),
    parentId: input.parentId ?? undefined
  };

  const response = await apiRequest<{ system: System }>(`/projects/${projectId}/systems`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  return response.system;
};

export const updateSystem = async (
  projectId: string,
  systemId: string,
  input: {
    name: string;
    description?: string;
    tags?: string[];
  }
): Promise<System> => {
  const payload = {
    name: input.name,
    description: input.description ?? '',
    tags: sanitizeTags(input.tags ?? [])
  };

  const response = await apiRequest<{ system: System }>(
    `/projects/${projectId}/systems/${systemId}`,
    {
      method: 'PUT',
      body: JSON.stringify(payload)
    }
  );

  return response.system;
};

export const deleteSystem = async (projectId: string, systemId: string): Promise<void> => {
  await apiRequest(`/projects/${projectId}/systems/${systemId}`, {
    method: 'DELETE'
  });
};

type StepPayload = {
  id?: string;
  name: string;
  description: string;
  source: {
    componentId: string;
    entryPointId?: string | null;
  };
  target: {
    componentId: string;
    entryPointId?: string | null;
  };
  tags: string[];
  alternateFlowIds: string[];
};

type FlowPayload = {
  name: string;
  description: string;
  tags: string[];
  systemScopeIds: string[];
  steps: StepPayload[];
};

const sanitizeStepPayloads = (steps: StepPayload[]): StepPayload[] =>
  steps.map((step) => ({
    ...step,
    name: step.name,
    description: step.description,
    tags: sanitizeTags(step.tags),
    alternateFlowIds: Array.from(new Set(step.alternateFlowIds))
  }));

const prepareFlowPayload = (input: FlowPayload): FlowPayload => ({
  name: input.name,
  description: input.description,
  tags: sanitizeTags(input.tags),
  systemScopeIds: Array.from(new Set(input.systemScopeIds)),
  steps: sanitizeStepPayloads(input.steps)
});

type AttributeConstraintPayload =
  | { type: 'regex'; value: string }
  | { type: 'minLength' | 'maxLength' | 'min' | 'max'; value: number }
  | { type: 'enum'; values: string[] };

type DataModelAttributePayload = {
  id?: string;
  name: string;
  description: string;
  type: string;
  required: boolean;
  unique: boolean;
  constraints: AttributeConstraintPayload[];
  readOnly: boolean;
  encrypted: boolean;
  private: boolean;
  attributes?: DataModelAttributePayload[];
  element?: DataModelAttributePayload | null;
};

type DataModelPayload = {
  name: string;
  description: string;
  attributes: DataModelAttributePayload[];
};

type AttributeConstraintInput = { type?: unknown; value?: unknown };

const sanitizeAttributeConstraintPayload = (
  constraint: AttributeConstraintInput
): AttributeConstraintPayload | null => {
  const type = typeof constraint.type === 'string' ? constraint.type.trim() : '';

  switch (type) {
    case 'regex': {
      const value = typeof constraint.value === 'string' ? constraint.value.trim() : '';
      if (!value) {
        return null;
      }
      return { type: 'regex', value };
    }
    case 'minLength':
    case 'maxLength': {
      const numeric = Number(constraint.value);
      if (!Number.isFinite(numeric)) {
        return null;
      }
      const integer = Math.trunc(numeric);
      if (!Number.isFinite(integer) || integer < 0) {
        return null;
      }
      return { type, value: integer };
    }
    case 'min':
    case 'max': {
      const numeric = Number(constraint.value);
      if (!Number.isFinite(numeric)) {
        return null;
      }
      return { type, value: numeric };
    }
    case 'enum': {
      const candidates = Array.isArray((constraint as { values?: unknown }).values)
        ? (constraint as { values: unknown[] }).values
        : Array.isArray(constraint.value)
          ? (constraint.value as unknown[])
          : [];
      const unique = new Set<string>();
      for (const value of candidates) {
        if (typeof value === 'string' && value.trim()) {
          unique.add(value.trim());
        }
      }
      if (unique.size === 0) {
        return null;
      }
      return { type: 'enum', values: [...unique] };
    }
    default:
      return null;
  }
};

const sanitizeAttributePayload = (
  attribute: DataModelAttributePayload
): DataModelAttributePayload | null => {
  const name = attribute.name.trim();
  const type = attribute.type.trim();
  const isObjectType = type.toLowerCase() === 'object';

  if (!name || !type) {
    return null;
  }

  const constraintInputs = Array.isArray(attribute.constraints)
    ? attribute.constraints
    : [];
  const seen = new Set<AttributeConstraintPayload['type']>();
  const constraints: AttributeConstraintPayload[] = [];

  for (const rawConstraint of constraintInputs) {
    const sanitized = sanitizeAttributeConstraintPayload(rawConstraint);
    if (sanitized && !seen.has(sanitized.type)) {
      seen.add(sanitized.type);
      constraints.push(sanitized);
    }
  }

  const attributes =
    isObjectType && Array.isArray(attribute.attributes)
      ? attribute.attributes
      : [];

  const cleaned: DataModelAttributePayload = {
    name,
    description: attribute.description.trim(),
    type,
    required: Boolean(attribute.required),
    unique: Boolean(attribute.unique),
    constraints,
    readOnly: Boolean(attribute.readOnly),
    encrypted: Boolean(attribute.encrypted),
    private: Boolean(attribute.private),
    ...(isObjectType
      ? {
          attributes: attributes
            .map((child) => sanitizeAttributePayload(child))
            .filter((child): child is DataModelAttributePayload => child !== null)
        }
      : {})
  };

  if (type === 'array' && attribute.element) {
    const element = sanitizeAttributePayload(attribute.element);
    if (element) {
      cleaned.element = element;
    }
  }

  if (attribute.id) {
    cleaned.id = attribute.id;
  }

  return cleaned;
};

const sanitizeDataModelPayload = (input: DataModelPayload): DataModelPayload => ({
  name: input.name.trim(),
  description: input.description.trim(),
  attributes: input.attributes
    .map((attribute) => sanitizeAttributePayload(attribute))
    .filter((attribute): attribute is DataModelAttributePayload => attribute !== null)
});

export const createFlow = async (projectId: string, input: FlowPayload): Promise<Flow> => {
  const payload = prepareFlowPayload(input);

  const response = await apiRequest<{ flow: Flow }>(`/projects/${projectId}/flows`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  return response.flow;
};

export const updateFlow = async (
  projectId: string,
  flowId: string,
  input: FlowPayload
): Promise<Flow> => {
  const payload = prepareFlowPayload(input);

  const response = await apiRequest<{ flow: Flow }>(`/projects/${projectId}/flows/${flowId}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });

  return response.flow;
};

export const deleteFlow = async (projectId: string, flowId: string): Promise<void> => {
  await apiRequest(`/projects/${projectId}/flows/${flowId}`, {
    method: 'DELETE'
  });
};

export const createDataModel = async (
  projectId: string,
  input: DataModelPayload
): Promise<DataModel> => {
  const payload = sanitizeDataModelPayload(input);

  const response = await apiRequest<{ dataModel: DataModel }>(
    `/projects/${projectId}/data-models`,
    {
      method: 'POST',
      body: JSON.stringify(payload)
    }
  );

  return response.dataModel;
};

export const updateDataModel = async (
  projectId: string,
  dataModelId: string,
  input: DataModelPayload
): Promise<DataModel> => {
  const payload = sanitizeDataModelPayload(input);

  const response = await apiRequest<{ dataModel: DataModel }>(
    `/projects/${projectId}/data-models/${dataModelId}`,
    {
      method: 'PUT',
      body: JSON.stringify(payload)
    }
  );

  return response.dataModel;
};

export const deleteDataModel = async (
  projectId: string,
  dataModelId: string
): Promise<void> => {
  await apiRequest(`/projects/${projectId}/data-models/${dataModelId}`, {
    method: 'DELETE'
  });
};

type ComponentEntryPointPayload = {
  id?: string;
  name: string;
  description: string;
  type: string;
  protocol: string;
  method: string;
  path: string;
  requestModelIds: string[];
  responseModelIds: string[];
};

type ComponentPayload = {
  name: string;
  description: string;
  entryPoints: ComponentEntryPointPayload[];
};

const sanitizeEntryPointPayload = (
  entryPoint: ComponentEntryPointPayload
): ComponentEntryPointPayload | null => {
  const name = entryPoint.name.trim();
  const type = entryPoint.type.trim();

  if (!name || !type) {
    return null;
  }

  const payload: ComponentEntryPointPayload = {
    name,
    description: entryPoint.description.trim(),
    type,
    protocol: entryPoint.protocol.trim(),
    method: entryPoint.method.trim(),
    path: entryPoint.path.trim(),
    requestModelIds: sanitizeIdentifiers(entryPoint.requestModelIds ?? []),
    responseModelIds: sanitizeIdentifiers(entryPoint.responseModelIds ?? [])
  };

  if (entryPoint.id) {
    payload.id = entryPoint.id;
  }

  return payload;
};

const sanitizeComponentPayload = (input: ComponentPayload): ComponentPayload => ({
  name: input.name.trim(),
  description: input.description.trim(),
  entryPoints: input.entryPoints
    .map((entryPoint) => sanitizeEntryPointPayload(entryPoint))
    .filter((entryPoint): entryPoint is ComponentEntryPointPayload => entryPoint !== null)
});

export const createComponent = async (
  projectId: string,
  input: ComponentPayload
): Promise<Component> => {
  const payload = sanitizeComponentPayload(input);

  const response = await apiRequest<{ component: Component }>(
    `/projects/${projectId}/components`,
    {
      method: 'POST',
      body: JSON.stringify(payload)
    }
  );

  return response.component;
};

export const updateComponent = async (
  projectId: string,
  componentId: string,
  input: ComponentPayload
): Promise<Component> => {
  const payload = sanitizeComponentPayload(input);

  const response = await apiRequest<{ component: Component }>(
    `/projects/${projectId}/components/${componentId}`,
    {
      method: 'PUT',
      body: JSON.stringify(payload)
    }
  );

  return response.component;
};

export const deleteComponent = async (
  projectId: string,
  componentId: string
): Promise<void> => {
  await apiRequest(`/projects/${projectId}/components/${componentId}`, {
    method: 'DELETE'
  });
};

export type {
  FlowPayload,
  StepPayload,
  DataModelPayload,
  DataModelAttributePayload,
  ComponentPayload,
  ComponentEntryPointPayload
};
