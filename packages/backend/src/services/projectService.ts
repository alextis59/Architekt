import { randomUUID } from 'node:crypto';
import {
  createProjectIndex,
  findProjectById,
  type Component,
  type ComponentEntryPoint,
  type DataModel,
  type DataModelAttribute,
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

const ensureBoolean = (value: unknown, fallback = false): boolean =>
  typeof value === 'boolean' ? value : fallback;

const ensureNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
};

const cloneAggregate = (aggregate: DomainAggregate): DomainAggregate => ({
  projects: JSON.parse(JSON.stringify(aggregate.projects))
});

const loadAggregate = async (persistence: PersistenceAdapter, userId: string): Promise<DomainAggregate> =>
  persistence.load(userId);

const saveAggregate = async (
  persistence: PersistenceAdapter,
  userId: string,
  aggregate: DomainAggregate
): Promise<void> => {
  await persistence.save(userId, aggregate);
};

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

type StepEndpointInput = {
  componentId?: unknown;
  entryPointId?: unknown;
};

type StepInput = {
  id?: unknown;
  name: unknown;
  description?: unknown;
  source?: unknown;
  target?: unknown;
  tags?: unknown;
  alternateFlowIds?: unknown;
};

type UpdateFlowInput = Partial<CreateFlowInput> & {
  steps?: unknown;
};

type DataModelAttributeInput = {
  id?: unknown;
  name: unknown;
  description?: unknown;
  type: unknown;
  constraints?: unknown;
  required?: unknown;
  unique?: unknown;
  readOnly?: unknown;
  encrypted?: unknown;
  private?: unknown;
  attributes?: unknown;
  element?: unknown;
};

type CreateDataModelInput = {
  name: unknown;
  description?: unknown;
  attributes?: unknown;
};

type UpdateDataModelInput = Partial<CreateDataModelInput> & {
  attributes?: unknown;
};

type ComponentEntryPointInput = {
  id?: unknown;
  name: unknown;
  description?: unknown;
  type?: unknown;
  protocol?: unknown;
  method?: unknown;
  path?: unknown;
  requestModelIds?: unknown;
  responseModelIds?: unknown;
};

type CreateComponentInput = {
  name: unknown;
  description?: unknown;
  entryPoints?: unknown;
};

type UpdateComponentInput = Partial<CreateComponentInput> & {
  entryPoints?: unknown;
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

const getDataModelOrThrow = (project: Project, dataModelId: string): DataModel => {
  const dataModel = project.dataModels[dataModelId];

  if (!dataModel) {
    throw new NotFoundError(`Data model ${dataModelId} not found in project ${project.id}`);
  }

  return dataModel;
};

const getComponentOrThrow = (project: Project, componentId: string): Component => {
  const component = project.components[componentId];

  if (!component) {
    throw new NotFoundError(`Component ${componentId} not found in project ${project.id}`);
  }

  return component;
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

const ensureAlternateFlows = (flowIds: Set<string>, value: unknown): string[] => {
  const ids = ensureUniqueStrings(value);

  for (const id of ids) {
    if (!flowIds.has(id)) {
      throw new BadRequestError(`Alternate flow ${id} is not part of the project`);
    }
  }

  return ids;
};

const cloneAttributeConstraints = (
  constraints: DataModelAttribute['constraints']
): DataModelAttribute['constraints'] => constraints.map((constraint) => ({ ...constraint }));

const cloneAttributeElement = (element: DataModelAttribute | null): DataModelAttribute | null => {
  if (!element) {
    return null;
  }

  return {
    ...element,
    constraints: cloneAttributeConstraints(element.constraints),
    attributes: cloneDataModelAttributes(element.attributes),
    element: cloneAttributeElement(element.element)
  };
};

const cloneDataModelAttributes = (attributes: DataModelAttribute[]): DataModelAttribute[] =>
  attributes.map((attribute) => ({
    ...attribute,
    constraints: cloneAttributeConstraints(attribute.constraints),
    attributes: cloneDataModelAttributes(attribute.attributes),
    element: cloneAttributeElement(attribute.element)
  }));

const cloneComponentEntryPoints = (entryPoints: ComponentEntryPoint[]): ComponentEntryPoint[] =>
  entryPoints.map((entryPoint) => ({
    ...entryPoint,
    requestModelIds: [...entryPoint.requestModelIds],
    responseModelIds: [...entryPoint.responseModelIds]
  }));

const parseAttributeConstraint = (raw: unknown): DataModelAttribute['constraints'][number] => {
  if (!raw || typeof raw !== 'object') {
    throw new BadRequestError('Data model attribute constraint must be an object');
  }

  const candidate = raw as { type?: unknown; value?: unknown };
  const type = ensureString(candidate.type);

  switch (type) {
    case 'regex': {
      const value = ensureString(candidate.value);
      if (!value) {
        throw new BadRequestError('Regex constraint requires a pattern');
      }
      return { type: 'regex', value };
    }
    case 'minLength':
    case 'maxLength': {
      const numeric = ensureNumber(candidate.value);
      if (numeric === null) {
        throw new BadRequestError(`${type} constraint requires an integer value`);
      }
      const integer = Math.trunc(numeric);
      if (!Number.isFinite(integer) || integer < 0) {
        throw new BadRequestError(`${type} constraint must be a non-negative integer`);
      }
      return { type, value: integer };
    }
    case 'min':
    case 'max': {
      const numeric = ensureNumber(candidate.value);
      if (numeric === null) {
        throw new BadRequestError(`${type} constraint requires a numeric value`);
      }
      return { type, value: numeric };
    }
    case 'enum': {
      if (!Array.isArray(candidate.value)) {
        throw new BadRequestError('Enum constraint requires an array of values');
      }
      const unique = new Set<string>();
      for (const value of candidate.value) {
        const stringValue = ensureString(value);
        if (stringValue) {
          unique.add(stringValue);
        }
      }
      if (unique.size === 0) {
        throw new BadRequestError('Enum constraint requires at least one value');
      }
      return { type: 'enum', values: [...unique] };
    }
    default:
      throw new BadRequestError(`Unsupported constraint type: ${type || 'unknown'}`);
  }
};

const sanitizeAttributeConstraints = ({
  rawConstraints,
  previous
}: {
  rawConstraints: unknown;
  previous?: DataModelAttribute['constraints'];
}): DataModelAttribute['constraints'] => {
  if (rawConstraints === undefined) {
    return previous ? cloneAttributeConstraints(previous) : [];
  }

  if (rawConstraints === null) {
    return [];
  }

  if (typeof rawConstraints === 'string') {
    return [];
  }

  if (!Array.isArray(rawConstraints)) {
    throw new BadRequestError('Data model attribute constraints must be an array');
  }

  const seen = new Set<DataModelAttribute['constraints'][number]['type']>();
  const result: DataModelAttribute['constraints'] = [];

  for (const rawConstraint of rawConstraints) {
    const constraint = parseAttributeConstraint(rawConstraint);
    if (!seen.has(constraint.type)) {
      seen.add(constraint.type);
      result.push(constraint);
    }
  }

  return result;
};

const sanitizeArrayElement = ({
  rawElement,
  type,
  existing
}: {
  rawElement: unknown;
  type: string;
  existing?: DataModelAttribute | null;
}): DataModelAttribute | null => {
  if (type !== 'array') {
    return null;
  }

  if (rawElement === undefined) {
    return existing ? cloneDataModelAttributes([existing])[0] : null;
  }

  if (rawElement === null) {
    return null;
  }

  if (!rawElement || typeof rawElement !== 'object') {
    throw new BadRequestError('Array element definition must be an object');
  }

  const input = rawElement as DataModelAttributeInput;
  const providedId = ensureString(input.id);
  const previous = existing && providedId && existing.id === providedId ? existing : undefined;

  const name = ensureString(input.name) || ensureString(previous?.name);
  if (!name) {
    throw new BadRequestError('Array element name is required');
  }

  const elementType = ensureString(input.type) || ensureString(previous?.type);
  if (!elementType) {
    throw new BadRequestError('Array element type is required');
  }

  const id = previous?.id ?? (providedId || randomUUID());

  const description =
    typeof input.description === 'string'
      ? input.description.trim()
      : previous?.description ?? '';

  const constraints = sanitizeAttributeConstraints({
    rawConstraints: input.constraints,
    previous: previous?.constraints
  });

  const childExisting = previous
    ? new Map(previous.attributes.map((attribute) => [attribute.id, attribute] as [string, DataModelAttribute]))
    : undefined;

  const attributes = sanitizeDataModelAttributes({
    rawAttributes: input.attributes,
    existing: childExisting
  });

  return {
    id,
    name,
    description,
    type: elementType,
    required: ensureBoolean(input.required, previous?.required ?? false),
    unique: ensureBoolean(input.unique, previous?.unique ?? false),
    constraints,
    readOnly: ensureBoolean(input.readOnly, previous?.readOnly ?? false),
    encrypted: ensureBoolean(input.encrypted, previous?.encrypted ?? false),
    private: ensureBoolean(input.private, previous?.private ?? false),
    attributes,
    element: sanitizeArrayElement({
      rawElement: input.element,
      type: elementType,
      existing: previous?.element
    })
  };
};

const sanitizeDataModelAttributes = ({
  rawAttributes,
  existing
}: {
  rawAttributes: unknown;
  existing?: Map<string, DataModelAttribute>;
}): DataModelAttribute[] => {
  if (rawAttributes === undefined) {
    if (!existing) {
      return [];
    }

    return cloneDataModelAttributes(Array.from(existing.values()));
  }

  if (!Array.isArray(rawAttributes)) {
    throw new BadRequestError('Data model attributes must be an array');
  }

  const result: DataModelAttribute[] = [];

  for (const raw of rawAttributes) {
    if (!raw || typeof raw !== 'object') {
      throw new BadRequestError('Data model attribute must be an object');
    }

    const input = raw as DataModelAttributeInput;
    const providedId = ensureString(input.id);
    const previous = providedId && existing ? existing.get(providedId) : undefined;

    if (previous && existing) {
      existing.delete(providedId);
    }

    const name = ensureString(input.name);
    if (!name) {
      throw new BadRequestError('Attribute name is required');
    }

    const type = ensureString(input.type);
    if (!type) {
      throw new BadRequestError('Attribute type is required');
    }

    const id = previous?.id ?? (providedId || randomUUID());

    const description =
      typeof input.description === 'string'
        ? input.description.trim()
        : previous?.description ?? '';

    const constraints = sanitizeAttributeConstraints({
      rawConstraints: input.constraints,
      previous: previous?.constraints
    });

    const required = ensureBoolean(input.required, previous?.required ?? false);
    const unique = ensureBoolean(input.unique, previous?.unique ?? false);

    const readOnly = ensureBoolean(input.readOnly, previous?.readOnly ?? false);
    const encrypted = ensureBoolean(input.encrypted, previous?.encrypted ?? false);
    const isPrivate = ensureBoolean(input.private, previous?.private ?? false);

    const childExisting = previous
      ? new Map(previous.attributes.map((attribute) => [attribute.id, attribute] as [string, DataModelAttribute]))
      : undefined;

    const attributes = sanitizeDataModelAttributes({
      rawAttributes: input.attributes,
      existing: childExisting
    });

    const element = sanitizeArrayElement({
      rawElement: input.element,
      type,
      existing: previous?.element
    });

    result.push({
      id,
      name,
      description,
      type,
      required,
      unique,
      constraints,
      readOnly,
      encrypted,
      private: isPrivate,
      attributes,
      element
    });
  }

  return result;
};

const sanitizeComponentEntryPoints = ({
  rawEntryPoints,
  existing
}: {
  rawEntryPoints: unknown;
  existing?: Map<string, ComponentEntryPoint>;
}): ComponentEntryPoint[] => {
  if (rawEntryPoints === undefined) {
    if (!existing) {
      return [];
    }

    return cloneComponentEntryPoints(Array.from(existing.values()));
  }

  if (!Array.isArray(rawEntryPoints)) {
    throw new BadRequestError('Component entry points must be an array');
  }

  const result: ComponentEntryPoint[] = [];

  for (const raw of rawEntryPoints) {
    if (!raw || typeof raw !== 'object') {
      throw new BadRequestError('Component entry point must be an object');
    }

    const input = raw as ComponentEntryPointInput;
    const providedId = ensureString(input.id);
    const previous = providedId && existing ? existing.get(providedId) : undefined;

    if (previous && existing) {
      existing.delete(providedId);
    }

    const name = ensureString(input.name);
    if (!name) {
      throw new BadRequestError('Entry point name is required');
    }

    const type = ensureString(input.type);
    if (!type) {
      throw new BadRequestError('Entry point type is required');
    }

    const id = previous?.id ?? (providedId || randomUUID());
    const description =
      typeof input.description === 'string' ? input.description.trim() : previous?.description ?? '';
    const protocol =
      typeof input.protocol === 'string' ? input.protocol.trim() : previous?.protocol ?? '';
    const method = typeof input.method === 'string' ? input.method.trim() : previous?.method ?? '';
    const path = typeof input.path === 'string' ? input.path.trim() : previous?.path ?? '';

    const requestModelIds =
      input.requestModelIds !== undefined
        ? ensureUniqueStrings(input.requestModelIds)
        : previous?.requestModelIds ?? [];

    const responseModelIds =
      input.responseModelIds !== undefined
        ? ensureUniqueStrings(input.responseModelIds)
        : previous?.responseModelIds ?? [];

    result.push({
      id,
      name,
      description,
      type,
      protocol,
      method,
      path,
      requestModelIds,
      responseModelIds
    });
  }

  return result;
};

const validateComponentEntryPointModels = (project: Project, entryPoints: ComponentEntryPoint[]) => {
  for (const entryPoint of entryPoints) {
    for (const modelId of entryPoint.requestModelIds) {
      if (!project.dataModels[modelId]) {
        throw new BadRequestError(
          `Entry point ${entryPoint.name} request model ${modelId} does not exist in project ${project.id}`
        );
      }
    }

    for (const modelId of entryPoint.responseModelIds) {
      if (!project.dataModels[modelId]) {
        throw new BadRequestError(
          `Entry point ${entryPoint.name} response model ${modelId} does not exist in project ${project.id}`
        );
      }
    }
  }
};

const sanitizeSteps = ({
  project,
  rawSteps,
  existingFlowIds,
  reuseSteps
}: {
  project: Project;
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

  const result: Step[] = [];

  const sanitizeEndpoint = (raw: unknown, role: 'source' | 'target'): Step['source'] => {
    if (!raw || typeof raw !== 'object') {
      throw new BadRequestError(`Step ${role} must be an object`);
    }

    const input = raw as StepEndpointInput;
    const componentId = ensureString(input.componentId);

    if (!componentId) {
      throw new BadRequestError(`Step ${role} component is required`);
    }

    const component = project.components[componentId];
    if (!component) {
      throw new BadRequestError(
        `Step ${role} component ${componentId} does not exist in project ${project.id}`
      );
    }

    const entryPointIdValue = ensureString(input.entryPointId);
    let entryPointId: string | null = null;

    if (entryPointIdValue) {
      const entryPoint = project.entryPoints[entryPointIdValue];
      if (!entryPoint) {
        throw new BadRequestError(
          `Step ${role} entry point ${entryPointIdValue} does not exist in project ${project.id}`
        );
      }

      if (!component.entryPointIds.includes(entryPointIdValue)) {
        throw new BadRequestError(
          `Step ${role} entry point ${entryPointIdValue} must belong to component ${componentId}`
        );
      }

      entryPointId = entryPointIdValue;
    }

    return {
      componentId,
      entryPointId
    };
  };

  for (const raw of rawSteps) {
    const stepInput = (raw && typeof raw === 'object' ? (raw as StepInput) : {}) as StepInput;
    const providedId = ensureString(stepInput.id);
    const name = ensureString(stepInput.name);

    if (!name) {
      throw new BadRequestError('Step name is required');
    }

    const description = ensureString(stepInput.description);
    const source = sanitizeEndpoint(stepInput.source, 'source');
    const target = sanitizeEndpoint(stepInput.target, 'target');

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
      source,
      target,
      tags,
      alternateFlowIds
    });
  }

  return result;
};

export const listProjects = async (persistence: PersistenceAdapter, userId: string) => {
  const aggregate = await loadAggregate(persistence, userId);
  return createProjectIndex(aggregate);
};

export const getProject = async (persistence: PersistenceAdapter, userId: string, projectId: string) => {
  const aggregate = await loadAggregate(persistence, userId);
  const project = getProjectOrThrow(aggregate, projectId);
  return project;
};

export const createProject = async (
  persistence: PersistenceAdapter,
  userId: string,
  input: CreateProjectInput
) => {
  const name = ensureString(input.name);
  if (!name) {
    throw new BadRequestError('Project name is required');
  }

  const description = ensureString(input.description);
  const tags = ensureTags(input.tags);

  const aggregate = cloneAggregate(await loadAggregate(persistence, userId));

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
    flows: {},
    dataModels: {},
    components: {},
    entryPoints: {}
  };

  await saveAggregate(persistence, userId, aggregate);

  return aggregate.projects[projectId];
};

export const updateProject = async (
  persistence: PersistenceAdapter,
  userId: string,
  projectId: string,
  input: UpdateProjectInput
) => {
  const aggregate = cloneAggregate(await loadAggregate(persistence, userId));
  const project = getProjectOrThrow(aggregate, projectId);

  const name = ensureString(input.name, project.name);
  const description = ensureString(input.description, project.description);
  const tags = input.tags ? ensureTags(input.tags) : project.tags;

  project.name = name;
  project.description = description;
  project.tags = tags;

  await saveAggregate(persistence, userId, aggregate);

  return project;
};

export const deleteProject = async (persistence: PersistenceAdapter, userId: string, projectId: string) => {
  const aggregate = cloneAggregate(await loadAggregate(persistence, userId));
  const project = getProjectOrThrow(aggregate, projectId);

  delete aggregate.projects[project.id];

  await saveAggregate(persistence, userId, aggregate);
};

export const listSystems = async (
  persistence: PersistenceAdapter,
  userId: string,
  projectId: string
): Promise<System[]> => {
  const aggregate = await loadAggregate(persistence, userId);
  const project = getProjectOrThrow(aggregate, projectId);
  return Object.values(project.systems);
};

export const getSystem = async (
  persistence: PersistenceAdapter,
  userId: string,
  projectId: string,
  systemId: string
) => {
  const aggregate = await loadAggregate(persistence, userId);
  const project = getProjectOrThrow(aggregate, projectId);
  return getSystemOrThrow(project, systemId);
};

export const createSystem = async (
  persistence: PersistenceAdapter,
  userId: string,
  projectId: string,
  input: CreateSystemInput
) => {
  const name = ensureString(input.name);
  if (!name) {
    throw new BadRequestError('System name is required');
  }

  const aggregate = cloneAggregate(await loadAggregate(persistence, userId));
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

  await saveAggregate(persistence, userId, aggregate);

  return project.systems[systemId];
};

export const updateSystem = async (
  persistence: PersistenceAdapter,
  userId: string,
  projectId: string,
  systemId: string,
  input: UpdateSystemInput
) => {
  const aggregate = cloneAggregate(await loadAggregate(persistence, userId));
  const project = getProjectOrThrow(aggregate, projectId);
  const system = getSystemOrThrow(project, systemId);

  const name = ensureString(input.name, system.name);
  const description = ensureString(input.description, system.description);
  const tags = input.tags ? ensureTags(input.tags) : system.tags;

  system.name = name;
  system.description = description;
  system.tags = tags;

  await saveAggregate(persistence, userId, aggregate);

  return system;
};

export const deleteSystem = async (
  persistence: PersistenceAdapter,
  userId: string,
  projectId: string,
  systemId: string
) => {
  const aggregate = cloneAggregate(await loadAggregate(persistence, userId));
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

  await saveAggregate(persistence, userId, aggregate);
};

type FlowFilters = {
  scope?: string[];
  tags?: string[];
};

export const listFlows = async (
  persistence: PersistenceAdapter,
  userId: string,
  projectId: string,
  filters: FlowFilters = {}
): Promise<Flow[]> => {
  const aggregate = await loadAggregate(persistence, userId);
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
  userId: string,
  projectId: string,
  flowId: string
) => {
  const aggregate = await loadAggregate(persistence, userId);
  const project = getProjectOrThrow(aggregate, projectId);
  return getFlowOrThrow(project, flowId);
};

export const createFlow = async (
  persistence: PersistenceAdapter,
  userId: string,
  projectId: string,
  input: CreateFlowInput
) => {
  const aggregate = cloneAggregate(await loadAggregate(persistence, userId));
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

  await saveAggregate(persistence, userId, aggregate);

  return project.flows[flowId];
};

export const updateFlow = async (
  persistence: PersistenceAdapter,
  userId: string,
  projectId: string,
  flowId: string,
  input: UpdateFlowInput
) => {
  const aggregate = cloneAggregate(await loadAggregate(persistence, userId));
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
      rawSteps: input.steps,
      existingFlowIds,
      reuseSteps
    });
  } else {
    steps = flow.steps;
  }

  flow.name = name;
  flow.description = description;
  flow.tags = tags;
  flow.systemScopeIds = systemScopeIds;
  flow.steps = steps;

  await saveAggregate(persistence, userId, aggregate);

  return flow;
};

export const deleteFlow = async (
  persistence: PersistenceAdapter,
  userId: string,
  projectId: string,
  flowId: string
) => {
  const aggregate = cloneAggregate(await loadAggregate(persistence, userId));
  const project = getProjectOrThrow(aggregate, projectId);
  const flow = getFlowOrThrow(project, flowId);

  delete project.flows[flow.id];

  for (const otherFlow of Object.values(project.flows)) {
    for (const step of otherFlow.steps) {
      step.alternateFlowIds = step.alternateFlowIds.filter((id) => id !== flowId);
    }
  }

  await saveAggregate(persistence, userId, aggregate);
};

export const listDataModels = async (
  persistence: PersistenceAdapter,
  userId: string,
  projectId: string
): Promise<DataModel[]> => {
  const aggregate = await loadAggregate(persistence, userId);
  const project = getProjectOrThrow(aggregate, projectId);
  return Object.values(project.dataModels);
};

export const getDataModel = async (
  persistence: PersistenceAdapter,
  userId: string,
  projectId: string,
  dataModelId: string
) => {
  const aggregate = await loadAggregate(persistence, userId);
  const project = getProjectOrThrow(aggregate, projectId);
  return getDataModelOrThrow(project, dataModelId);
};

export const createDataModel = async (
  persistence: PersistenceAdapter,
  userId: string,
  projectId: string,
  input: CreateDataModelInput
) => {
  const name = ensureString(input.name);
  if (!name) {
    throw new BadRequestError('Data model name is required');
  }

  const description =
    typeof input.description === 'string' ? input.description.trim() : '';

  const aggregate = cloneAggregate(await loadAggregate(persistence, userId));
  const project = getProjectOrThrow(aggregate, projectId);

  const dataModelId = randomUUID();
  const attributes = sanitizeDataModelAttributes({ rawAttributes: input.attributes });

  project.dataModels[dataModelId] = {
    id: dataModelId,
    name,
    description,
    attributes
  };

  await saveAggregate(persistence, userId, aggregate);

  return project.dataModels[dataModelId];
};

export const updateDataModel = async (
  persistence: PersistenceAdapter,
  userId: string,
  projectId: string,
  dataModelId: string,
  input: UpdateDataModelInput
) => {
  const aggregate = cloneAggregate(await loadAggregate(persistence, userId));
  const project = getProjectOrThrow(aggregate, projectId);
  const dataModel = getDataModelOrThrow(project, dataModelId);

  const name = ensureString(input.name, dataModel.name);
  const description =
    typeof input.description === 'string' ? input.description.trim() : dataModel.description;

  let attributes: DataModelAttribute[] | null = null;
  if (input.attributes !== undefined) {
    const existing = new Map(
      dataModel.attributes.map((attribute) => [attribute.id, attribute] as [string, DataModelAttribute])
    );
    attributes = sanitizeDataModelAttributes({
      rawAttributes: input.attributes,
      existing
    });
  }

  dataModel.name = name;
  dataModel.description = description;
  if (attributes !== null) {
    dataModel.attributes = attributes;
  }

  await saveAggregate(persistence, userId, aggregate);

  return dataModel;
};

export const deleteDataModel = async (
  persistence: PersistenceAdapter,
  userId: string,
  projectId: string,
  dataModelId: string
) => {
  const aggregate = cloneAggregate(await loadAggregate(persistence, userId));
  const project = getProjectOrThrow(aggregate, projectId);
  const dataModel = getDataModelOrThrow(project, dataModelId);

  delete project.dataModels[dataModel.id];

  await saveAggregate(persistence, userId, aggregate);
};

export const listComponents = async (
  persistence: PersistenceAdapter,
  userId: string,
  projectId: string
): Promise<Component[]> => {
  const aggregate = await loadAggregate(persistence, userId);
  const project = getProjectOrThrow(aggregate, projectId);
  return Object.values(project.components);
};

export const getComponent = async (
  persistence: PersistenceAdapter,
  userId: string,
  projectId: string,
  componentId: string
) => {
  const aggregate = await loadAggregate(persistence, userId);
  const project = getProjectOrThrow(aggregate, projectId);
  return getComponentOrThrow(project, componentId);
};

export const createComponent = async (
  persistence: PersistenceAdapter,
  userId: string,
  projectId: string,
  input: CreateComponentInput
) => {
  const name = ensureString(input.name);
  if (!name) {
    throw new BadRequestError('Component name is required');
  }

  const description = typeof input.description === 'string' ? input.description.trim() : '';

  const aggregate = cloneAggregate(await loadAggregate(persistence, userId));
  const project = getProjectOrThrow(aggregate, projectId);

  const componentId = randomUUID();
  const entryPoints = sanitizeComponentEntryPoints({ rawEntryPoints: input.entryPoints });

  validateComponentEntryPointModels(project, entryPoints);

  const entryPointIds: string[] = [];
  for (const entryPoint of entryPoints) {
    project.entryPoints[entryPoint.id] = entryPoint;
    entryPointIds.push(entryPoint.id);
  }

  project.components[componentId] = {
    id: componentId,
    name,
    description,
    entryPointIds
  };

  await saveAggregate(persistence, userId, aggregate);

  return project.components[componentId];
};

export const updateComponent = async (
  persistence: PersistenceAdapter,
  userId: string,
  projectId: string,
  componentId: string,
  input: UpdateComponentInput
) => {
  const aggregate = cloneAggregate(await loadAggregate(persistence, userId));
  const project = getProjectOrThrow(aggregate, projectId);
  const component = getComponentOrThrow(project, componentId);

  const name = ensureString(input.name, component.name);
  const description =
    typeof input.description === 'string' ? input.description.trim() : component.description;

  let entryPoints: ComponentEntryPoint[] | null = null;
  if (input.entryPoints !== undefined) {
    const existing = new Map<string, ComponentEntryPoint>();
    for (const entryPointId of component.entryPointIds) {
      const existingEntryPoint = project.entryPoints[entryPointId];
      if (existingEntryPoint) {
        existing.set(entryPointId, existingEntryPoint);
      }
    }
    entryPoints = sanitizeComponentEntryPoints({ rawEntryPoints: input.entryPoints, existing });
  }

  if (entryPoints !== null) {
    validateComponentEntryPointModels(project, entryPoints);

    const nextEntryPointIds: string[] = [];
    const retainedIds = new Set<string>();

    for (const entryPoint of entryPoints) {
      project.entryPoints[entryPoint.id] = entryPoint;
      nextEntryPointIds.push(entryPoint.id);
      retainedIds.add(entryPoint.id);
    }

    for (const previousId of component.entryPointIds) {
      if (!retainedIds.has(previousId)) {
        delete project.entryPoints[previousId];
      }
    }

    component.entryPointIds = nextEntryPointIds;
  }

  component.name = name;
  component.description = description;

  await saveAggregate(persistence, userId, aggregate);

  return component;
};

export const deleteComponent = async (
  persistence: PersistenceAdapter,
  userId: string,
  projectId: string,
  componentId: string
) => {
  const aggregate = cloneAggregate(await loadAggregate(persistence, userId));
  const project = getProjectOrThrow(aggregate, projectId);
  const component = getComponentOrThrow(project, componentId);

  for (const entryPointId of component.entryPointIds) {
    delete project.entryPoints[entryPointId];
  }

  delete project.components[component.id];

  await saveAggregate(persistence, userId, aggregate);
};
