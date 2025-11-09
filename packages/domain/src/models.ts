export type Step = {
  id: string;
  name: string;
  description: string;
  sourceSystemId: string;
  targetSystemId: string;
  tags: string[];
  alternateFlowIds: string[];
};

export type Flow = {
  id: string;
  name: string;
  description: string;
  systemScopeIds: string[];
  tags: string[];
  steps: Step[];
};

export type System = {
  id: string;
  name: string;
  description: string;
  tags: string[];
  childIds: string[];
  isRoot: boolean;
};

export type Project = {
  id: string;
  name: string;
  description: string;
  tags: string[];
  rootSystemId: string;
  systems: Record<string, System>;
  flows: Record<string, Flow>;
};

export type DomainAggregate = {
  projects: Record<string, Project>;
};

type UnknownRecord = Record<string, unknown> | undefined | null;

type SanitizedEntity<T> = T & { id: string; name: string };

type StepInput = Partial<Step> & { id?: string };
type FlowInput = Partial<Flow> & { id?: string; steps?: StepInput[] };
type SystemInput = Partial<System> & { id?: string };
type ProjectInput = Partial<Project> & { id?: string; systems?: UnknownRecord; flows?: UnknownRecord };

type DomainAggregateInput = {
  projects?: UnknownRecord;
};

const ensureString = (value: unknown, fallback = ''): string => {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  return fallback;
};

const ensureStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => ensureString(item))
    .filter((item): item is string => item.length > 0);
};

const ensureBoolean = (value: unknown, fallback = false): boolean =>
  typeof value === 'boolean' ? value : fallback;

const sanitizeStep = (raw: StepInput): Step => ({
  id: ensureString(raw?.id),
  name: ensureString(raw?.name),
  description: ensureString(raw?.description, ''),
  sourceSystemId: ensureString(raw?.sourceSystemId),
  targetSystemId: ensureString(raw?.targetSystemId),
  tags: ensureStringArray(raw?.tags),
  alternateFlowIds: ensureStringArray(raw?.alternateFlowIds)
});

const sanitizeFlow = (raw: FlowInput): Flow => ({
  id: ensureString(raw?.id),
  name: ensureString(raw?.name),
  description: ensureString(raw?.description, ''),
  systemScopeIds: ensureStringArray(raw?.systemScopeIds),
  tags: ensureStringArray(raw?.tags),
  steps: Array.isArray(raw?.steps)
    ? raw.steps
        .map((step) => sanitizeStep(step))
        .filter((step): step is SanitizedEntity<Step> => Boolean(step.id) && Boolean(step.name))
    : []
});

const sanitizeSystem = (raw: SystemInput): System => ({
  id: ensureString(raw?.id),
  name: ensureString(raw?.name),
  description: ensureString(raw?.description, ''),
  tags: ensureStringArray(raw?.tags),
  childIds: ensureStringArray(raw?.childIds),
  isRoot: ensureBoolean(raw?.isRoot, false)
});

const sanitizeProject = (raw: ProjectInput): Project => {
  const systemsInput = raw?.systems && typeof raw.systems === 'object' ? raw.systems : {};
  const flowsInput = raw?.flows && typeof raw.flows === 'object' ? raw.flows : {};

  const systemEntries = Object.entries(systemsInput as Record<string, SystemInput>)
    .map(([id, value]): [string, System] => [id, sanitizeSystem({ id, ...value })])
    .filter((entry): entry is [string, System] => {
      const [, system] = entry;
      return Boolean(system.id) && Boolean(system.name);
    });

  const flowEntries = Object.entries(flowsInput as Record<string, FlowInput>)
    .map(([id, value]): [string, Flow] => [id, sanitizeFlow({ id, ...value })])
    .filter((entry): entry is [string, Flow] => {
      const [, flow] = entry;
      return Boolean(flow.id) && Boolean(flow.name);
    });

  const rootSystemId = ensureString(raw?.rootSystemId);

  return {
    id: ensureString(raw?.id),
    name: ensureString(raw?.name),
    description: ensureString(raw?.description, ''),
    tags: ensureStringArray(raw?.tags),
    rootSystemId,
    systems: Object.fromEntries(systemEntries),
    flows: Object.fromEntries(flowEntries)
  };
};

export const validateDomainAggregate = (input: unknown): DomainAggregate => {
  const aggregate = (input ?? {}) as DomainAggregateInput;
  const projectEntries =
    aggregate.projects && typeof aggregate.projects === 'object'
      ? Object.entries(aggregate.projects as Record<string, ProjectInput>)
          .map(([id, value]): [string, Project] => [id, sanitizeProject({ id, ...value })])
          .filter((entry): entry is [string, Project] => {
            const [, project] = entry;
            return Boolean(project.id) && Boolean(project.name) && Boolean(project.rootSystemId);
          })
      : [];

  return { projects: Object.fromEntries(projectEntries) };
};

export const createEmptyDomainAggregate = (): DomainAggregate => ({ projects: {} });

export const createProjectIndex = (aggregate: DomainAggregate): Project[] =>
  Object.values(aggregate.projects);

export const findProjectById = (aggregate: DomainAggregate, projectId: string): Project | null =>
  aggregate.projects[projectId] ?? null;

export const getRootSystem = (project: Project): System | null =>
  project.systems[project.rootSystemId] ?? null;

export const isValidDomainAggregate = (input: unknown): boolean => {
  try {
    const result = validateDomainAggregate(input);
    return Object.keys(result.projects).length > 0 || (input as DomainAggregateInput)?.projects === undefined;
  } catch {
    return false;
  }
};

export const DomainSchemas = {
  validateDomainAggregate,
  createEmptyDomainAggregate
};

export default {
  validateDomainAggregate,
  createEmptyDomainAggregate,
  createProjectIndex,
  findProjectById,
  getRootSystem,
  isValidDomainAggregate
};
