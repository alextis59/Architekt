/**
 * @typedef {Object} Step
 * @property {string} id
 * @property {string} name
 * @property {string} [description]
 * @property {string} sourceSystemId
 * @property {string} targetSystemId
 * @property {string[]} tags
 * @property {string[]} alternateFlowIds
 */

/**
 * @typedef {Object} Flow
 * @property {string} id
 * @property {string} name
 * @property {string} [description]
 * @property {string[]} systemScopeIds
 * @property {string[]} tags
 * @property {Step[]} steps
 */

/**
 * @typedef {Object} System
 * @property {string} id
 * @property {string} name
 * @property {string} [description]
 * @property {string[]} tags
 * @property {string[]} childIds
 * @property {boolean} isRoot
 */

/**
 * @typedef {Object} Project
 * @property {string} id
 * @property {string} name
 * @property {string} [description]
 * @property {string[]} tags
 * @property {string} rootSystemId
 * @property {Record<string, System>} systems
 * @property {Record<string, Flow>} flows
 */

/**
 * @typedef {Object} DomainAggregate
 * @property {Record<string, Project>} projects
 */

const ensureString = (value, fallback = '') =>
  typeof value === 'string' && value.trim().length > 0 ? value : fallback;

const ensureStringArray = (value) =>
  Array.isArray(value) ? value.map((item) => ensureString(item)).filter(Boolean) : [];

const ensureBoolean = (value, fallback = false) => (typeof value === 'boolean' ? value : fallback);

const sanitizeStep = (raw) => ({
  id: ensureString(raw?.id),
  name: ensureString(raw?.name),
  description: ensureString(raw?.description, ''),
  sourceSystemId: ensureString(raw?.sourceSystemId),
  targetSystemId: ensureString(raw?.targetSystemId),
  tags: ensureStringArray(raw?.tags),
  alternateFlowIds: ensureStringArray(raw?.alternateFlowIds)
});

const sanitizeFlow = (raw) => ({
  id: ensureString(raw?.id),
  name: ensureString(raw?.name),
  description: ensureString(raw?.description, ''),
  systemScopeIds: ensureStringArray(raw?.systemScopeIds),
  tags: ensureStringArray(raw?.tags),
  steps: Array.isArray(raw?.steps) ? raw.steps.map(sanitizeStep).filter((step) => step.id && step.name) : []
});

const sanitizeSystem = (raw) => ({
  id: ensureString(raw?.id),
  name: ensureString(raw?.name),
  description: ensureString(raw?.description, ''),
  tags: ensureStringArray(raw?.tags),
  childIds: ensureStringArray(raw?.childIds),
  isRoot: ensureBoolean(raw?.isRoot, false)
});

const sanitizeProject = (raw) => {
  const systemsInput = raw?.systems && typeof raw.systems === 'object' ? raw.systems : {};
  const flowsInput = raw?.flows && typeof raw.flows === 'object' ? raw.flows : {};
  const systems = Object.fromEntries(
    Object.entries(systemsInput)
      .map(([id, value]) => [id, sanitizeSystem({ id, ...value })])
      .filter(([, system]) => system.id && system.name)
  );
  const flows = Object.fromEntries(
    Object.entries(flowsInput)
      .map(([id, value]) => [id, sanitizeFlow({ id, ...value })])
      .filter(([, flow]) => flow.id && flow.name)
  );

  const rootSystemId = ensureString(raw?.rootSystemId);

  return {
    id: ensureString(raw?.id),
    name: ensureString(raw?.name),
    description: ensureString(raw?.description, ''),
    tags: ensureStringArray(raw?.tags),
    rootSystemId,
    systems,
    flows
  };
};

/**
 * Validate and sanitize persisted data to ensure downstream consumers receive predictable shapes.
 *
 * @param {unknown} input
 * @returns {DomainAggregate}
 */
export const validateDomainAggregate = (input) => {
  const projectsInput = input && typeof input === 'object' ? input.projects : undefined;
  const projectEntries =
    projectsInput && typeof projectsInput === 'object' ? Object.entries(projectsInput) : [];

  const projects = Object.fromEntries(
    projectEntries
      .map(([id, value]) => [id, sanitizeProject({ id, ...value })])
      .filter(([, project]) => project.id && project.name && project.rootSystemId)
  );

  return { projects };
};

export const createEmptyDomainAggregate = () => ({ projects: {} });

export const createProjectIndex = (aggregate) => Object.values(aggregate.projects);

export const findProjectById = (aggregate, projectId) => aggregate.projects[projectId] ?? null;

export const getRootSystem = (project) => project.systems[project.rootSystemId] ?? null;

export const isValidDomainAggregate = (input) => {
  try {
    const result = validateDomainAggregate(input);
    return Object.keys(result.projects).length > 0 || input?.projects === undefined;
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
