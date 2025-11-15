import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '../store/projectStore.js';

const apiMocks = {
  fetchProjectDetails: vi.fn(),
  createDataModel: vi.fn(),
  updateDataModel: vi.fn(),
  deleteDataModel: vi.fn()
};

vi.mock('../api/projects.js', () => ({
  ...apiMocks
}));

const DataModelDesigner = (await import('./DataModelDesigner.js')).default;

const createClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false }
    }
  });

const renderDesigner = (client: QueryClient) =>
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DataModelDesigner />
      </MemoryRouter>
    </QueryClientProvider>
  );

describe('DataModelDesigner', () => {
  beforeEach(() => {
    useProjectStore.setState({
      selectedProjectId: 'proj-1',
      selectedSystemId: null,
      selectedFlowId: null,
      selectedDataModelId: null,
      selectedComponentId: null,
      selectProject: useProjectStore.getState().selectProject,
      selectSystem: useProjectStore.getState().selectSystem,
      selectFlow: useProjectStore.getState().selectFlow,
      selectDataModel: useProjectStore.getState().selectDataModel,
      selectComponent: useProjectStore.getState().selectComponent
    });
    apiMocks.fetchProjectDetails.mockReset();
    apiMocks.createDataModel.mockReset();
    apiMocks.updateDataModel.mockReset();
    apiMocks.deleteDataModel.mockReset();
  });

  it('loads project data models and selects the first model by default', async () => {
    apiMocks.fetchProjectDetails.mockResolvedValue({
      id: 'proj-1',
      name: 'Project',
      description: '',
      tags: [],
      rootSystemId: 'sys',
      systems: {},
      flows: {},
      dataModels: {
        'model-b': {
          id: 'model-b',
          name: 'Beta',
          description: '',
          attributes: []
        },
        'model-a': {
          id: 'model-a',
          name: 'Alpha',
          description: '',
          attributes: []
        }
      },
      components: {}
    });

    const client = createClient();
    renderDesigner(client);

    const modelButtons = await screen.findAllByRole('button', { name: /Alpha|Beta/ });
    expect(modelButtons[0]).toHaveTextContent('Alpha');
    await waitFor(() => {
      expect(useProjectStore.getState().selectedDataModelId).toBe('model-a');
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Beta' }));
    expect(useProjectStore.getState().selectedDataModelId).toBe('model-b');
  });

  it('saves edited data models using trimmed payloads', async () => {
    apiMocks.fetchProjectDetails.mockResolvedValue({
      id: 'proj-1',
      name: 'Project',
      description: '',
      tags: [],
      rootSystemId: 'sys',
      systems: {},
      flows: {},
      dataModels: {
        'model-a': {
          id: 'model-a',
          name: 'Customer',
          description: 'Original',
          attributes: [
            {
              id: 'attr-1',
              name: 'Name',
              description: 'Full name',
              type: 'string',
              constraints: '',
              readOnly: false,
              encrypted: false,
              attributes: []
            }
          ]
        }
      },
      components: {}
    });
    apiMocks.updateDataModel.mockResolvedValue({
      id: 'model-a',
      name: 'Customer Updated',
      description: 'Updated',
      attributes: []
    });

    const client = createClient();
    renderDesigner(client);

    const user = userEvent.setup();
    const attributeToggle = await screen.findByRole('button', { name: 'Name' });
    await user.click(attributeToggle);
    await user.click(screen.getByRole('button', { name: /Edit attribute/i }));

    const attributeModal = await screen.findByRole('dialog', { name: /Edit attribute/i });

    await user.type(within(attributeModal).getByLabelText(/Constraints/), ' required ');
    await user.click(within(attributeModal).getByLabelText(/Read-only/));
    await user.click(within(attributeModal).getByRole('button', { name: /Save attribute/i }));

    await user.click(screen.getByRole('button', { name: /Edit model details/i }));

    const modal = await screen.findByRole('dialog', { name: /Edit data model/i });

    const modelNameInput = within(modal)
      .getAllByLabelText(/^Name$/)
      .find((input) => (input as HTMLInputElement).value === 'Customer');
    if (!modelNameInput) {
      throw new Error('Data model name input not found');
    }

    const modelDescription = within(modal)
      .getAllByLabelText(/^Description$/)
      .find((textarea) => (textarea as HTMLTextAreaElement).value === 'Original');
    if (!modelDescription) {
      throw new Error('Data model description textarea not found');
    }

    await user.clear(modelNameInput);
    await user.type(modelNameInput, '  Customer Updated  ');
    await user.clear(modelDescription);
    await user.type(modelDescription, ' Updated ');

    await user.click(within(modal).getByRole('button', { name: /Save changes/i }));

    await waitFor(() => {
      expect(apiMocks.updateDataModel).toHaveBeenCalled();
    });

    const updateArgs = apiMocks.updateDataModel.mock.calls[0];
    expect(updateArgs).toBeDefined();
    const [projectId, dataModelId, payload] = updateArgs as [string, string, unknown];
    expect(projectId).toBe('proj-1');
    expect(dataModelId).toBe('model-a');
    expect(payload).toEqual({
      name: 'Customer Updated',
      description: 'Updated',
      attributes: [
        {
          id: 'attr-1',
          name: 'Name',
          description: 'Full name',
          type: 'string',
          constraints: 'required',
          readOnly: true,
          encrypted: false,
          attributes: []
        }
      ]
    });
  });

  it('deletes the current data model and selects the next available entry', async () => {
    apiMocks.fetchProjectDetails.mockResolvedValue({
      id: 'proj-1',
      name: 'Project',
      description: '',
      tags: [],
      rootSystemId: 'sys',
      systems: {},
      flows: {},
      dataModels: {
        'model-a': { id: 'model-a', name: 'Alpha', description: '', attributes: [] },
        'model-b': { id: 'model-b', name: 'Beta', description: '', attributes: [] }
      },
      components: {}
    });
    apiMocks.deleteDataModel.mockResolvedValue(undefined);

    const client = createClient();
    renderDesigner(client);

    await screen.findByRole('button', { name: 'Alpha' });
    await waitFor(() => {
      expect(useProjectStore.getState().selectedDataModelId).toBe('model-a');
    });

    const user = userEvent.setup();
    const deleteButton = await screen.findByRole('button', { name: /Delete model/i });
    await user.click(deleteButton);

    await waitFor(() => {
      expect(apiMocks.deleteDataModel).toHaveBeenCalled();
      expect(useProjectStore.getState().selectedDataModelId).toBe('model-b');
    });

    const deleteArgs = apiMocks.deleteDataModel.mock.calls[0];
    expect(deleteArgs).toEqual(['proj-1', 'model-a']);
  });
});
