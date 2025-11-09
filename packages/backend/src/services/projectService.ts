import { randomUUID } from 'node:crypto';
import {
  createProjectIndex,
  findProjectById,
  type DomainAggregate,
  type Project,
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
