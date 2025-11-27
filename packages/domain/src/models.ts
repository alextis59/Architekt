export type StepEndpoint = {
  componentId: string;
  entryPointId: string | null;
};

export type Step = {
  id: string;
  name: string;
  description: string;
  source: StepEndpoint;
  target: StepEndpoint;
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

export type AttributeConstraint =
  | { type: 'regex'; value: string }
  | { type: 'minLength' | 'maxLength' | 'min' | 'max'; value: number }
  | { type: 'enum'; values: string[] };

export type DataModelAttribute = {
  id: string;
  name: string;
  description: string;
  type: string;
  required: boolean;
  unique: boolean;
  constraints: AttributeConstraint[];
  readOnly: boolean;
  encrypted: boolean;
  private: boolean;
  attributes: DataModelAttribute[];
  element: DataModelAttribute | null;
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
  functionName: string;
  protocol: string;
  method: string;
  path: string;
  requestModelIds: string[];
  responseModelIds: string[];
  requestAttributes: DataModelAttribute[];
  responseAttributes: DataModelAttribute[];
};

export type Component = {
  id: string;
  name: string;
  description: string;
  entryPointIds: string[];
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
  sharedWith: string[];
  rootSystemId: string;
  systems: Record<string, System>;
  flows: Record<string, Flow>;
  dataModels: Record<string, DataModel>;
  components: Record<string, Component>;
  entryPoints: Record<string, ComponentEntryPoint>;
};

export type DomainAggregate = {
  projects: Record<string, Project>;
};

type UnknownRecord = Record<string, unknown> | undefined | null;

type SanitizedEntity<T> = T & { id: string; name: string };

type StepEndpointInput = Partial<StepEndpoint>;
type StepInput = Partial<Step> & { id?: string };
type FlowInput = Partial<Flow> & { id?: string; steps?: StepInput[] };
type DataModelAttributeInput =
  Partial<DataModelAttribute> & {
    id?: string;
    attributes?: unknown;
    constraints?: unknown;
    element?: unknown;
  };
type DataModelInput = Partial<DataModel> & { id?: string; attributes?: unknown };
type ComponentEntryPointInput =
  Partial<ComponentEntryPoint> & {
    id?: string;
    requestModelIds?: unknown;
    responseModelIds?: unknown;
    requestAttributes?: unknown;
    responseAttributes?: unknown;
  };
type ComponentInput = Partial<Component> & { id?: string; entryPointIds?: unknown };
type SystemInput = Partial<System> & { id?: string };
type ProjectInput =
  Partial<Project> & {
    id?: string;
    systems?: UnknownRecord;
    flows?: UnknownRecord;
    dataModels?: UnknownRecord;
    components?: UnknownRecord;
    entryPoints?: UnknownRecord;
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

const sanitizeConstraint = (raw: unknown): AttributeConstraint | null => {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const candidate = raw as { type?: unknown; value?: unknown; values?: unknown };
  const type = ensureString(candidate.type);

  switch (type) {
    case 'regex': {
      const value = ensureString(candidate.value);
      if (!value) {
        return null;
      }
      return { type: 'regex', value };
    }
    case 'minLength':
    case 'maxLength': {
      const numeric = ensureNumber(candidate.value);
      if (numeric === null) {
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
      const numeric = ensureNumber(candidate.value);
      if (numeric === null) {
        return null;
      }
      return { type, value: numeric };
    }
    case 'enum': {
      const candidates = Array.isArray(candidate.values)
        ? candidate.values
        : Array.isArray(candidate.value)
          ? candidate.value
          : [];
      const unique = new Set<string>();
      for (const item of candidates) {
        const value = ensureString(item);
        if (value) {
          unique.add(value);
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

const sanitizeConstraintList = (raw: unknown): AttributeConstraint[] => {
  if (!Array.isArray(raw)) {
    return [];
  }

  const seen = new Set<AttributeConstraint['type']>();
  const result: AttributeConstraint[] = [];

  for (const value of raw) {
    const constraint = sanitizeConstraint(value);
    if (constraint && !seen.has(constraint.type)) {
      seen.add(constraint.type);
      result.push(constraint);
    }
  }

  return result;
};

const sanitizeStepEndpoint = (raw: unknown): StepEndpoint => {
  const candidate = (raw && typeof raw === 'object' ? (raw as StepEndpointInput) : {}) as StepEndpointInput;
  const componentId = ensureString(candidate.componentId);
  const entryPointId = ensureString(candidate.entryPointId);

  return {
    componentId,
    entryPointId: entryPointId || null
  };
};

const sanitizeStep = (raw: StepInput): Step => ({
  id: ensureString(raw?.id),
  name: ensureString(raw?.name),
  description: ensureString(raw?.description, ''),
  source: sanitizeStepEndpoint(raw?.source),
  target: sanitizeStepEndpoint(raw?.target),
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
  required: ensureBoolean(raw?.required, false),
  unique: ensureBoolean(raw?.unique, false),
  constraints: sanitizeConstraintList(raw?.constraints),
  readOnly: ensureBoolean(raw?.readOnly, false),
  encrypted: ensureBoolean(raw?.encrypted, false),
  private: ensureBoolean(raw?.private, false),
  attributes: sanitizeDataModelAttributeList(raw?.attributes),
  element: sanitizeDataModelElement(raw?.element, raw?.type)
});

const sanitizeDataModelElement = (rawElement: unknown, rawType: unknown): DataModelAttribute | null => {
  const type = ensureString(rawType);

  if (type !== 'array') {
    return null;
  }

  if (!rawElement || typeof rawElement !== 'object') {
    return null;
  }

  const attributeInput = rawElement as DataModelAttributeInput;
  const sanitized = sanitizeDataModelAttribute(attributeInput);

  if (!sanitized.id || !sanitized.name || !sanitized.type) {
    return null;
  }

  return sanitized;
};

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
  functionName: ensureString(raw?.functionName, ''),
  protocol: ensureString(raw?.protocol),
  method: ensureString(raw?.method, ''),
  path: ensureString(raw?.path, ''),
  requestModelIds: ensureStringArray(raw?.requestModelIds),
  responseModelIds: ensureStringArray(raw?.responseModelIds),
  requestAttributes: sanitizeDataModelAttributeList(raw?.requestAttributes),
  responseAttributes: sanitizeDataModelAttributeList(raw?.responseAttributes)
});

const sanitizeComponent = (raw: ComponentInput): Component => ({
  id: ensureString(raw?.id),
  name: ensureString(raw?.name),
  description: ensureString(raw?.description, ''),
  entryPointIds: ensureStringArray(raw?.entryPointIds)
});

const sanitizeSystem = (raw: SystemInput): System => ({
  id: ensureString(raw?.id),
  name: ensureString(raw?.name),
  description: ensureString(raw?.description, ''),
  tags: ensureStringArray(raw?.tags),
  childIds: ensureStringArray(raw?.childIds),
  isRoot: ensureBoolean(raw?.isRoot, false)
});

const sanitizeSharedUsers = (value: unknown): string[] => {
  const emails = ensureStringArray(value).map((email) => email.toLowerCase().trim());
  const unique = new Set<string>();

  for (const email of emails) {
    if (email) {
      unique.add(email);
    }
  }

  return [...unique];
};

const sanitizeProject = (raw: ProjectInput): Project => {
  const systemsInput = raw?.systems && typeof raw.systems === 'object' ? raw.systems : {};
  const flowsInput = raw?.flows && typeof raw.flows === 'object' ? raw.flows : {};
  const dataModelsInput = raw?.dataModels && typeof raw.dataModels === 'object' ? raw.dataModels : {};
  const componentsInput = raw?.components && typeof raw.components === 'object' ? raw.components : {};
  const entryPointsInput = raw?.entryPoints && typeof raw.entryPoints === 'object' ? raw.entryPoints : {};

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

  const entryPointEntries = Object.entries(entryPointsInput as Record<string, ComponentEntryPointInput>)
    .map(([id, value]): [string, ComponentEntryPoint] => [id, sanitizeComponentEntryPoint({ id, ...value })])
    .filter((entry): entry is [string, ComponentEntryPoint] => {
      const [, entryPoint] = entry;
      return Boolean(entryPoint.id) && Boolean(entryPoint.name) && Boolean(entryPoint.type);
    });

  const rootSystemId = ensureString(raw?.rootSystemId);

  return {
    id: ensureString(raw?.id),
    name: ensureString(raw?.name),
    description: ensureString(raw?.description, ''),
    tags: ensureStringArray(raw?.tags),
    sharedWith: sanitizeSharedUsers(raw?.sharedWith),
    rootSystemId,
    systems: Object.fromEntries(systemEntries),
    flows: Object.fromEntries(flowEntries),
    dataModels: Object.fromEntries(dataModelEntries),
    components: Object.fromEntries(componentEntries),
    entryPoints: Object.fromEntries(entryPointEntries)
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
