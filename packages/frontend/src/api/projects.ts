import type { Flow, Project, System } from '@architekt/domain';
import { apiRequest } from './client.js';

export type ProjectSummary = Pick<Project, 'id' | 'name' | 'description' | 'tags' | 'rootSystemId'>;

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

export const fetchProjects = async (): Promise<ProjectSummary[]> => {
  const response = await apiRequest<{ projects: Project[] }>('/projects');
  return response.projects.map(({ id, name, description, tags, rootSystemId }) => ({
    id,
    name,
    description,
    tags,
    rootSystemId
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
  sourceSystemId: string;
  targetSystemId: string;
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

export type { FlowPayload, StepPayload };

