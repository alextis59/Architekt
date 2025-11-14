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

export type DataModelAttribute = {
  id: string;
  name: string;
  description: string;
  type: string;
  constraints: string;
  readOnly: boolean;
  encrypted: boolean;
  attributes: DataModelAttribute[];
};

export type DataModel = {
  id: string;
  name: string;
  description: string;
  attributes: DataModelAttribute[];
};

export type ComponentEntryPoint = {
  id: string;
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

export type Component = {
  id: string;
  name: string;
  description: string;
  entryPoints: ComponentEntryPoint[];
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
  dataModels: Record<string, DataModel>;
  components: Record<string, Component>;
};

export type DomainAggregate = {
  projects: Record<string, Project>;
};

type UnknownRecord = Record<string, unknown> | undefined | null;

type SanitizedEntity<T> = T & { id: string; name: string };

type StepInput = Partial<Step> & { id?: string };
type FlowInput = Partial<Flow> & { id?: string; steps?: StepInput[] };
type DataModelAttributeInput = Partial<DataModelAttribute> & { id?: string; attributes?: unknown };
type DataModelInput = Partial<DataModel> & { id?: string; attributes?: unknown };
type ComponentEntryPointInput =
  Partial<ComponentEntryPoint> & { id?: string; requestModelIds?: unknown; responseModelIds?: unknown };
type ComponentInput = Partial<Component> & { id?: string; entryPoints?: unknown };
type SystemInput = Partial<System> & { id?: string };
type ProjectInput =
  Partial<Project> & {
    id?: string;
    systems?: UnknownRecord;
    flows?: UnknownRecord;
    dataModels?: UnknownRecord;
    components?: UnknownRecord;
  };

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

const sanitizeDataModelAttribute = (raw: DataModelAttributeInput): DataModelAttribute => ({
  id: ensureString(raw?.id),
  name: ensureString(raw?.name),
  description: ensureString(raw?.description, ''),
  type: ensureString(raw?.type),
  constraints: ensureString(raw?.constraints, ''),
  readOnly: ensureBoolean(raw?.readOnly, false),
  encrypted: ensureBoolean(raw?.encrypted, false),
  attributes: sanitizeDataModelAttributeList(raw?.attributes)
});

function sanitizeDataModelAttributeList(raw: unknown): DataModelAttribute[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((value) => sanitizeDataModelAttribute((value ?? {}) as DataModelAttributeInput))
    .filter((attribute) => Boolean(attribute.id) && Boolean(attribute.name) && Boolean(attribute.type));
}

const sanitizeDataModel = (raw: DataModelInput): DataModel => ({
  id: ensureString(raw?.id),
  name: ensureString(raw?.name),
  description: ensureString(raw?.description, ''),
  attributes: sanitizeDataModelAttributeList(raw?.attributes)
});

const sanitizeComponentEntryPoint = (raw: ComponentEntryPointInput): ComponentEntryPoint => ({
  id: ensureString(raw?.id),
  name: ensureString(raw?.name),
  description: ensureString(raw?.description, ''),
  type: ensureString(raw?.type),
  protocol: ensureString(raw?.protocol),
  method: ensureString(raw?.method, ''),
  path: ensureString(raw?.path, ''),
  target: ensureString(raw?.target, ''),
  requestModelIds: ensureStringArray(raw?.requestModelIds),
  responseModelIds: ensureStringArray(raw?.responseModelIds)
});

const sanitizeComponentEntryPointList = (raw: unknown): ComponentEntryPoint[] => {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((value) => sanitizeComponentEntryPoint((value ?? {}) as ComponentEntryPointInput))
    .filter((entryPoint) => Boolean(entryPoint.id) && Boolean(entryPoint.name) && Boolean(entryPoint.type));
};

const sanitizeComponent = (raw: ComponentInput): Component => ({
  id: ensureString(raw?.id),
  name: ensureString(raw?.name),
  description: ensureString(raw?.description, ''),
  entryPoints: sanitizeComponentEntryPointList(raw?.entryPoints)
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
  const dataModelsInput = raw?.dataModels && typeof raw.dataModels === 'object' ? raw.dataModels : {};
  const componentsInput = raw?.components && typeof raw.components === 'object' ? raw.components : {};

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

  const dataModelEntries = Object.entries(dataModelsInput as Record<string, DataModelInput>)
    .map(([id, value]): [string, DataModel] => [id, sanitizeDataModel({ id, ...value })])
    .filter((entry): entry is [string, DataModel] => {
      const [, dataModel] = entry;
      return Boolean(dataModel.id) && Boolean(dataModel.name);
    });

  const componentEntries = Object.entries(componentsInput as Record<string, ComponentInput>)
    .map(([id, value]): [string, Component] => [id, sanitizeComponent({ id, ...value })])
    .filter((entry): entry is [string, Component] => {
      const [, component] = entry;
      return Boolean(component.id) && Boolean(component.name);
    });

  const rootSystemId = ensureString(raw?.rootSystemId);

  return {
    id: ensureString(raw?.id),
    name: ensureString(raw?.name),
    description: ensureString(raw?.description, ''),
    tags: ensureStringArray(raw?.tags),
    rootSystemId,
    systems: Object.fromEntries(systemEntries),
    flows: Object.fromEntries(flowEntries),
    dataModels: Object.fromEntries(dataModelEntries),
    components: Object.fromEntries(componentEntries)
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
