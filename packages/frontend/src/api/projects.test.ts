import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '@architekt/domain';

const apiClientMocks = { apiRequest: vi.fn() };

vi.mock('./client.js', () => apiClientMocks);

const {
  createComponent,
  createDataModel,
  createFlow,
  createProject,
  createSystem,
  deleteComponent,
  deleteDataModel,
  deleteFlow,
  deleteSystem,
  fetchProjectDetails,
  fetchProjects,
  updateComponent,
  updateDataModel,
  updateFlow,
  updateSystem
} = await import('./projects.js');

describe('projects API helpers', () => {
  beforeEach(() => {
    apiClientMocks.apiRequest.mockReset();
  });

  it('fetchProjects returns sanitized summaries', async () => {
    const project: Project = {
      id: 'proj-1',
      name: 'Demo',
      description: 'Desc',
      tags: ['a'],
      rootSystemId: 'sys-1',
      systems: {},
      flows: {},
      dataModels: {},
      components: {}
    };
    apiClientMocks.apiRequest.mockResolvedValueOnce({ projects: [project] });

    const result = await fetchProjects();

    expect(apiClientMocks.apiRequest).toHaveBeenCalledWith('/projects');
    expect(result).toEqual([
      {
        id: 'proj-1',
        name: 'Demo',
        description: 'Desc',
        tags: ['a'],
        rootSystemId: 'sys-1'
      }
    ]);
  });

  it('createProject trims optional fields and deduplicates tags', async () => {
    const project = { id: 'proj', name: 'Name', description: '', tags: [], rootSystemId: 'root', systems: {}, flows: {}, dataModels: {}, components: {} };
    apiClientMocks.apiRequest.mockResolvedValueOnce({ project });

    const result = await createProject({ name: '  Project  ', description: undefined, tags: ['one', '  one ', ''] });

    expect(apiClientMocks.apiRequest).toHaveBeenCalledWith('/projects', {
      method: 'POST',
      body: JSON.stringify({ name: '  Project  ', description: '', tags: ['one'] })
    });
    expect(result).toEqual(project);
  });

  it('system helpers sanitize payloads', async () => {
    const system = { id: 'sys', name: 'System', description: '', tags: [], childIds: [], isRoot: false };
    apiClientMocks.apiRequest.mockResolvedValue({ system });

    await createSystem('proj', { name: ' Name ', description: undefined, tags: ['one', 'one'], parentId: 'parent' });
    expect(apiClientMocks.apiRequest).toHaveBeenCalledWith('/projects/proj/systems', {
      method: 'POST',
      body: JSON.stringify({ name: ' Name ', description: '', tags: ['one'], parentId: 'parent' })
    });

    await updateSystem('proj', 'sys', { name: ' Updated ', description: ' Desc ', tags: ['a', 'b', 'a'] });
    expect(apiClientMocks.apiRequest).toHaveBeenCalledWith('/projects/proj/systems/sys', {
      method: 'PUT',
      body: JSON.stringify({ name: ' Updated ', description: ' Desc ', tags: ['a', 'b'] })
    });

    await deleteSystem('proj', 'sys');
    expect(apiClientMocks.apiRequest).toHaveBeenCalledWith('/projects/proj/systems/sys', { method: 'DELETE' });
  });

  it('flow helpers normalize scope and steps', async () => {
    const flow = { id: 'flow', name: 'Flow', description: '', tags: [], systemScopeIds: [], steps: [] };
    apiClientMocks.apiRequest.mockResolvedValue({ flow });

    await createFlow('proj', {
      name: ' Flow ',
      description: ' Desc ',
      tags: ['a', 'a', ''],
      systemScopeIds: ['sys-1', 'sys-1', 'sys-2'],
      steps: [
        {
          name: 'Step',
          description: '  Description  ',
          sourceSystemId: 'sys-1',
          targetSystemId: 'sys-2',
          tags: ['tag', 'tag'],
          alternateFlowIds: ['alt-1', 'alt-1'],
          id: 'step-1'
        }
      ]
    });

    expect(apiClientMocks.apiRequest).toHaveBeenCalledWith('/projects/proj/flows', {
      method: 'POST',
      body: JSON.stringify({
        name: ' Flow ',
        description: ' Desc ',
        tags: ['a'],
        systemScopeIds: ['sys-1', 'sys-2'],
        steps: [
          {
            name: 'Step',
            description: '  Description  ',
            sourceSystemId: 'sys-1',
            targetSystemId: 'sys-2',
            tags: ['tag'],
            alternateFlowIds: ['alt-1'],
            id: 'step-1'
          }
        ]
      })
    });

    await updateFlow('proj', 'flow', {
      name: 'Flow',
      description: 'Desc',
      tags: [],
      systemScopeIds: [],
      steps: []
    });
    expect(apiClientMocks.apiRequest).toHaveBeenCalledWith('/projects/proj/flows/flow', {
      method: 'PUT',
      body: JSON.stringify({ name: 'Flow', description: 'Desc', tags: [], systemScopeIds: [], steps: [] })
    });

    await deleteFlow('proj', 'flow');
    expect(apiClientMocks.apiRequest).toHaveBeenCalledWith('/projects/proj/flows/flow', { method: 'DELETE' });
  });

  it('data model helpers trim attributes and drop invalid entries', async () => {
    const dataModel = { id: 'model', name: 'Model', description: '', attributes: [] };
    apiClientMocks.apiRequest.mockResolvedValue({ dataModel });

    const payload = {
      name: '  Model  ',
      description: ' Desc ',
      attributes: [
        {
          id: 'attr-1',
          name: '  Name  ',
          description: ' Details ',
          type: ' string ',
          required: true,
          unique: false,
          constraints: [
            { type: 'regex', value: ' ^[A-Z]+$ ' },
            { type: 'minLength', value: ' 5 ' },
            { type: 'minLength', value: ' 10 ' }
          ],
          readOnly: true,
          encrypted: false,
          private: false,
          attributes: [
            {
              name: 'Child',
              description: '',
              type: '',
              required: false,
              unique: false,
              constraints: [],
              readOnly: false,
              encrypted: false,
              attributes: []
            }
          ]
        },
        {
          name: '  ',
          description: '',
          type: '',
          required: false,
          unique: false,
          constraints: [],
          readOnly: false,
          encrypted: false,
          private: false,
          attributes: []
        }
      ]
    };

    await createDataModel('proj', payload);
    expect(apiClientMocks.apiRequest).toHaveBeenCalledWith('/projects/proj/data-models', expect.any(Object));

    const [, createOptions] = apiClientMocks.apiRequest.mock.calls[0];
    expect(createOptions).toMatchObject({ method: 'POST' });
    expect(createOptions?.body).toBeDefined();
    expect(JSON.parse(createOptions?.body as string)).toEqual({
      name: 'Model',
      description: 'Desc',
      attributes: [
        {
          id: 'attr-1',
          name: 'Name',
          description: 'Details',
          type: 'string',
          required: true,
          unique: false,
          constraints: [
            { type: 'regex', value: '^[A-Z]+$' },
            { type: 'minLength', value: 5 }
          ],
          readOnly: true,
          encrypted: false,
          private: false
        }
      ]
    });

    await updateDataModel('proj', 'model', payload);
    expect(apiClientMocks.apiRequest).toHaveBeenCalledWith('/projects/proj/data-models/model', expect.any(Object));

    await deleteDataModel('proj', 'model');
    expect(apiClientMocks.apiRequest).toHaveBeenCalledWith('/projects/proj/data-models/model', { method: 'DELETE' });
  });

  it('component helpers sanitize entry points and identifiers', async () => {
    const component = { id: 'component', name: 'Component', description: '', entryPoints: [] };
    apiClientMocks.apiRequest.mockResolvedValue({ component });

    const input = {
      name: ' Component ',
      description: ' Desc ',
      entryPoints: [
        {
          id: 'entry-1',
          name: ' Entry ',
          description: ' Info ',
          type: ' http ',
          protocol: ' HTTPS ',
          method: ' GET ',
          path: ' /path ',
          target: ' target ',
          requestModelIds: [' model ', 'model'],
          responseModelIds: [' resp ', 'resp']
        },
        {
          name: '   ',
          description: '',
          type: '   ',
          protocol: '',
          method: '',
          path: '',
          target: '',
          requestModelIds: [],
          responseModelIds: []
        }
      ]
    };

    await createComponent('proj', input);
    expect(apiClientMocks.apiRequest).toHaveBeenCalledWith('/projects/proj/components', expect.any(Object));

    const [, componentOptions] = apiClientMocks.apiRequest.mock.calls.at(-1) ?? [];
    expect(componentOptions).toMatchObject({ method: 'POST' });
    expect(componentOptions?.body).toBeDefined();
    expect(JSON.parse(componentOptions?.body as string)).toEqual({
      name: 'Component',
      description: 'Desc',
      entryPoints: [
        {
          id: 'entry-1',
          name: 'Entry',
          description: 'Info',
          type: 'http',
          protocol: 'HTTPS',
          method: 'GET',
          path: '/path',
          target: 'target',
          requestModelIds: ['model'],
          responseModelIds: ['resp']
        }
      ]
    });

    await updateComponent('proj', 'component', input);
    expect(apiClientMocks.apiRequest).toHaveBeenCalledWith('/projects/proj/components/component', expect.any(Object));

    await deleteComponent('proj', 'component');
    expect(apiClientMocks.apiRequest).toHaveBeenCalledWith('/projects/proj/components/component', { method: 'DELETE' });
  });

  it('fetchProjectDetails requests project payload', async () => {
    apiClientMocks.apiRequest.mockResolvedValue({ project: null });
    await fetchProjectDetails('proj-1');
    expect(apiClientMocks.apiRequest).toHaveBeenCalledWith('/projects/proj-1');
  });
});
