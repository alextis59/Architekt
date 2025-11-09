import { randomUUID } from 'node:crypto';
import {
  createProjectIndex,
  findProjectById,
  type DomainAggregate,
  type Flow,
  type Project,
  type Step,
  type System
} from '@architekt/domain';
import type { PersistenceAdapter } from '../persistence/index.js';
import { BadRequestError, NotFoundError } from '../httpError.js';

const ensureString = (value: unknown, fallback = ''): string => {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  return fallback;
};

const ensureTags = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const deduplicated = new Set<string>();
  for (const tag of value) {
    const sanitized = ensureString(tag);
    if (sanitized) {
      deduplicated.add(sanitized);
    }
  }

  return [...deduplicated];
};

const cloneAggregate = (aggregate: DomainAggregate): DomainAggregate => ({
  projects: JSON.parse(JSON.stringify(aggregate.projects))
});

type CreateProjectInput = {
  name: unknown;
  description?: unknown;
  tags?: unknown;
};

type UpdateProjectInput = Partial<CreateProjectInput>;

type CreateSystemInput = {
  name: unknown;
  description?: unknown;
  tags?: unknown;
  parentId?: unknown;
};

type UpdateSystemInput = Partial<CreateSystemInput>;

type CreateFlowInput = {
  name: unknown;
  description?: unknown;
  tags?: unknown;
  systemScopeIds?: unknown;
  steps?: unknown;
};

type StepInput = {
  id?: unknown;
  name: unknown;
  description?: unknown;
  sourceSystemId: unknown;
  targetSystemId: unknown;
  tags?: unknown;
  alternateFlowIds?: unknown;
};

type UpdateFlowInput = Partial<CreateFlowInput> & {
  steps?: unknown;
};

const getProjectOrThrow = (aggregate: DomainAggregate, projectId: string): Project => {
  const project = findProjectById(aggregate, projectId);

  if (!project) {
    throw new NotFoundError(`Project ${projectId} not found`);
  }

  return project;
};

const getSystemOrThrow = (project: Project, systemId: string): System => {
  const system = project.systems[systemId];

  if (!system) {
    throw new NotFoundError(`System ${systemId} not found in project ${project.id}`);
  }

  return system;
};

const getFlowOrThrow = (project: Project, flowId: string): Flow => {
  const flow = project.flows[flowId];

  if (!flow) {
    throw new NotFoundError(`Flow ${flowId} not found in project ${project.id}`);
  }

  return flow;
};

const collectDescendants = (project: Project, systemId: string): string[] => {
  const visited = new Set<string>();
  const stack = [systemId];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || visited.has(current)) {
      continue;
    }

    visited.add(current);
    const system = project.systems[current];
    if (!system) {
      continue;
    }

    for (const childId of system.childIds) {
      stack.push(childId);
    }
  }

  return [...visited];
};

const findParentId = (project: Project, systemId: string): string | null => {
  for (const candidate of Object.values(project.systems)) {
    if (candidate.childIds.includes(systemId)) {
      return candidate.id;
    }
  }

  return null;
};

const ensureUniqueStrings = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const unique: string[] = [];
  const seen = new Set<string>();

  for (const entry of value) {
    const sanitized = ensureString(entry);
    if (!sanitized || seen.has(sanitized)) {
      continue;
    }

    unique.push(sanitized);
    seen.add(sanitized);
  }

  return unique;
};

const ensureSystemScope = (project: Project, input: unknown): string[] => {
  const scope = ensureUniqueStrings(input).filter((id) => Boolean(project.systems[id]));

  if (scope.length === 0) {
    throw new BadRequestError('Flow system scope must reference at least one valid system');
  }

  return scope;
};

const ensureSystemInScope = (project: Project, systemId: string, scope: Set<string>, role: string) => {
  if (!project.systems[systemId]) {
    throw new BadRequestError(`Step ${role} system ${systemId} does not exist in project ${project.id}`);
  }

  if (!scope.has(systemId)) {
    throw new BadRequestError(`Step ${role} system ${systemId} must be part of the flow scope`);
  }
};

const ensureAlternateFlows = (flowIds: Set<string>, value: unknown): string[] => {
  const ids = ensureUniqueStrings(value);

  for (const id of ids) {
    if (!flowIds.has(id)) {
      throw new BadRequestError(`Alternate flow ${id} is not part of the project`);
    }
  }

  return ids;
};

const sanitizeSteps = ({
  project,
  scope,
  rawSteps,
  existingFlowIds,
  reuseSteps
}: {
  project: Project;
  scope: string[];
  rawSteps: unknown;
  existingFlowIds: Set<string>;
  reuseSteps?: Map<string, Step>;
}): Step[] => {
  if (rawSteps === undefined) {
    return reuseSteps ? Array.from(reuseSteps.values()) : [];
  }

  if (!Array.isArray(rawSteps)) {
    throw new BadRequestError('Flow steps must be an array');
  }

  const scopeSet = new Set(scope);
  const result: Step[] = [];

  for (const raw of rawSteps) {
    const stepInput = (raw && typeof raw === 'object' ? (raw as StepInput) : {}) as StepInput;
    const providedId = ensureString(stepInput.id);
    const name = ensureString(stepInput.name);

    if (!name) {
      throw new BadRequestError('Step name is required');
    }

    const description = ensureString(stepInput.description);
    const sourceSystemId = ensureString(stepInput.sourceSystemId);
    const targetSystemId = ensureString(stepInput.targetSystemId);

    if (!sourceSystemId || !targetSystemId) {
      throw new BadRequestError('Step source and target systems are required');
    }

    ensureSystemInScope(project, sourceSystemId, scopeSet, 'source');
    ensureSystemInScope(project, targetSystemId, scopeSet, 'target');

    const tags = ensureTags(stepInput.tags);
    const alternateFlowIds = ensureAlternateFlows(existingFlowIds, stepInput.alternateFlowIds);

    let id = providedId;
    if (providedId && reuseSteps?.has(providedId)) {
      id = providedId;
      reuseSteps.delete(providedId);
    } else {
      id = randomUUID();
    }

    result.push({
      id,
      name,
      description,
      sourceSystemId,
      targetSystemId,
      tags,
      alternateFlowIds
    });
  }

  return result;
};

const validateExistingStepsAgainstScope = (steps: Step[], project: Project, scope: string[]) => {
  const scopeSet = new Set(scope);
  for (const step of steps) {
    ensureSystemInScope(project, step.sourceSystemId, scopeSet, 'source');
    ensureSystemInScope(project, step.targetSystemId, scopeSet, 'target');
  }
};

export const listProjects = async (persistence: PersistenceAdapter) => {
  const aggregate = await persistence.load();
  return createProjectIndex(aggregate);
};

export const getProject = async (persistence: PersistenceAdapter, projectId: string) => {
  const aggregate = await persistence.load();
  const project = getProjectOrThrow(aggregate, projectId);
  return project;
};

export const createProject = async (
  persistence: PersistenceAdapter,
  input: CreateProjectInput
) => {
  const name = ensureString(input.name);
  if (!name) {
    throw new BadRequestError('Project name is required');
  }

  const description = ensureString(input.description);
  const tags = ensureTags(input.tags);

  const aggregate = cloneAggregate(await persistence.load());

  const projectId = randomUUID();
  const rootSystemId = randomUUID();

  aggregate.projects[projectId] = {
    id: projectId,
    name,
    description,
    tags,
    rootSystemId,
    systems: {
      [rootSystemId]: {
        id: rootSystemId,
        name,
        description: '',
        tags: [],
        childIds: [],
        isRoot: true
      }
    },
    flows: {}
  };

  await persistence.save(aggregate);

  return aggregate.projects[projectId];
};

export const updateProject = async (
  persistence: PersistenceAdapter,
  projectId: string,
  input: UpdateProjectInput
) => {
  const aggregate = cloneAggregate(await persistence.load());
  const project = getProjectOrThrow(aggregate, projectId);

  const name = ensureString(input.name, project.name);
  const description = ensureString(input.description, project.description);
  const tags = input.tags ? ensureTags(input.tags) : project.tags;

  project.name = name;
  project.description = description;
  project.tags = tags;

  await persistence.save(aggregate);

  return project;
};

export const deleteProject = async (persistence: PersistenceAdapter, projectId: string) => {
  const aggregate = cloneAggregate(await persistence.load());
  const project = getProjectOrThrow(aggregate, projectId);

  delete aggregate.projects[project.id];

  await persistence.save(aggregate);
};

export const listSystems = async (
  persistence: PersistenceAdapter,
  projectId: string
): Promise<System[]> => {
  const aggregate = await persistence.load();
  const project = getProjectOrThrow(aggregate, projectId);
  return Object.values(project.systems);
};

export const getSystem = async (
  persistence: PersistenceAdapter,
  projectId: string,
  systemId: string
) => {
  const aggregate = await persistence.load();
  const project = getProjectOrThrow(aggregate, projectId);
  return getSystemOrThrow(project, systemId);
};

export const createSystem = async (
  persistence: PersistenceAdapter,
  projectId: string,
  input: CreateSystemInput
) => {
  const name = ensureString(input.name);
  if (!name) {
    throw new BadRequestError('System name is required');
  }

  const aggregate = cloneAggregate(await persistence.load());
  const project = getProjectOrThrow(aggregate, projectId);

  const parentId = ensureString(input.parentId, project.rootSystemId);
  const parent = getSystemOrThrow(project, parentId);

  const systemId = randomUUID();
  const description = ensureString(input.description);
  const tags = ensureTags(input.tags);

  project.systems[systemId] = {
    id: systemId,
    name,
    description,
    tags,
    childIds: [],
    isRoot: false
  };

  parent.childIds = Array.from(new Set([...parent.childIds, systemId]));

  await persistence.save(aggregate);

  return project.systems[systemId];
};

export const updateSystem = async (
  persistence: PersistenceAdapter,
  projectId: string,
  systemId: string,
  input: UpdateSystemInput
) => {
  const aggregate = cloneAggregate(await persistence.load());
  const project = getProjectOrThrow(aggregate, projectId);
  const system = getSystemOrThrow(project, systemId);

  const name = ensureString(input.name, system.name);
  const description = ensureString(input.description, system.description);
  const tags = input.tags ? ensureTags(input.tags) : system.tags;

  system.name = name;
  system.description = description;
  system.tags = tags;

  await persistence.save(aggregate);

  return system;
};

export const deleteSystem = async (
  persistence: PersistenceAdapter,
  projectId: string,
  systemId: string
) => {
  const aggregate = cloneAggregate(await persistence.load());
  const project = getProjectOrThrow(aggregate, projectId);
  const system = getSystemOrThrow(project, systemId);

  if (system.isRoot) {
    throw new BadRequestError('Root system cannot be deleted');
  }

  const descendantIds = collectDescendants(project, systemId);

  const parentId = findParentId(project, systemId);
  if (parentId) {
    const parent = project.systems[parentId];
    parent.childIds = parent.childIds.filter((child) => child !== systemId);
  }

  for (const id of descendantIds) {
    delete project.systems[id];
  }

  await persistence.save(aggregate);
};

type FlowFilters = {
  scope?: string[];
  tags?: string[];
};

export const listFlows = async (
  persistence: PersistenceAdapter,
  projectId: string,
  filters: FlowFilters = {}
): Promise<Flow[]> => {
  const aggregate = await persistence.load();
  const project = getProjectOrThrow(aggregate, projectId);
  const flows = Object.values(project.flows);

  const scopeFilters = filters.scope?.length ? filters.scope : null;
  const tagFilters = filters.tags?.length ? filters.tags : null;

  return flows.filter((flow) => {
    if (scopeFilters && !scopeFilters.every((systemId) => flow.systemScopeIds.includes(systemId))) {
      return false;
    }

    if (tagFilters && !tagFilters.every((tag) => flow.tags.includes(tag))) {
      return false;
    }

    return true;
  });
};

export const getFlow = async (
  persistence: PersistenceAdapter,
  projectId: string,
  flowId: string
) => {
  const aggregate = await persistence.load();
  const project = getProjectOrThrow(aggregate, projectId);
  return getFlowOrThrow(project, flowId);
};

export const createFlow = async (
  persistence: PersistenceAdapter,
  projectId: string,
  input: CreateFlowInput
) => {
  const aggregate = cloneAggregate(await persistence.load());
  const project = getProjectOrThrow(aggregate, projectId);

  const name = ensureString(input.name);
  if (!name) {
    throw new BadRequestError('Flow name is required');
  }

  const description = ensureString(input.description);
  const tags = ensureTags(input.tags);
  const flowId = randomUUID();

  const systemScopeIds = ensureSystemScope(project, input.systemScopeIds);

  const existingFlowIds = new Set<string>([flowId, ...Object.keys(project.flows)]);
  const steps = sanitizeSteps({
    project,
    scope: systemScopeIds,
    rawSteps: input.steps,
    existingFlowIds
  });

  project.flows[flowId] = {
    id: flowId,
    name,
    description,
    tags,
    systemScopeIds,
    steps
  };

  await persistence.save(aggregate);

  return project.flows[flowId];
};

export const updateFlow = async (
  persistence: PersistenceAdapter,
  projectId: string,
  flowId: string,
  input: UpdateFlowInput
) => {
  const aggregate = cloneAggregate(await persistence.load());
  const project = getProjectOrThrow(aggregate, projectId);
  const flow = getFlowOrThrow(project, flowId);

  const name = ensureString(input.name, flow.name);
  const description = ensureString(input.description, flow.description);
  const tags = input.tags ? ensureTags(input.tags) : flow.tags;

  const systemScopeIds = input.systemScopeIds
    ? ensureSystemScope(project, input.systemScopeIds)
    : flow.systemScopeIds;

  const reuseSteps = new Map(flow.steps.map((step) => [step.id, step] as [string, Step]));
  const existingFlowIds = new Set<string>(Object.keys(project.flows));
  existingFlowIds.add(flowId);

  let steps: Step[];
  if (input.steps !== undefined) {
    steps = sanitizeSteps({
      project,
      scope: systemScopeIds,
      rawSteps: input.steps,
      existingFlowIds,
      reuseSteps
    });
  } else {
    validateExistingStepsAgainstScope(flow.steps, project, systemScopeIds);
    steps = flow.steps;
  }

  flow.name = name;
  flow.description = description;
  flow.tags = tags;
  flow.systemScopeIds = systemScopeIds;
  flow.steps = steps;

  await persistence.save(aggregate);

  return flow;
};

export const deleteFlow = async (
  persistence: PersistenceAdapter,
  projectId: string,
  flowId: string
) => {
  const aggregate = cloneAggregate(await persistence.load());
  const project = getProjectOrThrow(aggregate, projectId);
  const flow = getFlowOrThrow(project, flowId);

  delete project.flows[flow.id];

  for (const otherFlow of Object.values(project.flows)) {
    for (const step of otherFlow.steps) {
      step.alternateFlowIds = step.alternateFlowIds.filter((id) => id !== flowId);
    }
  }

  await persistence.save(aggregate);
};
