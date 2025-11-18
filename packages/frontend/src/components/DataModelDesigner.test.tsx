import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
      components: {},
      entryPoints: {}
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
    const originalDataModel = {
      id: 'model-a',
      name: 'Customer',
      description: 'Original',
      attributes: [
        {
          id: 'attr-1',
          name: 'Name',
          description: 'Full name',
          type: 'string',
          required: false,
          unique: false,
          constraints: [],
          readOnly: false,
          encrypted: false,
          attributes: []
        }
      ]
    };
    const attributeUpdatedDataModel = {
      ...originalDataModel,
      attributes: [
        {
          id: 'attr-1',
          name: 'Name',
          description: 'Full name',
          type: 'string',
          required: true,
          unique: false,
          constraints: [{ type: 'regex', value: '^[A-Z]+$' }],
          readOnly: true,
          encrypted: false,
          attributes: []
        }
      ]
    };
    const finalDataModel = {
      ...attributeUpdatedDataModel,
      name: 'Customer Updated',
      description: 'Updated'
    };

    const projectBase = {
      id: 'proj-1',
      name: 'Project',
      description: '',
      tags: [],
      rootSystemId: 'sys',
      systems: {},
      flows: {},
      components: {},
      entryPoints: {}
    };

    apiMocks.fetchProjectDetails
      .mockResolvedValueOnce({
        ...projectBase,
        dataModels: {
          'model-a': originalDataModel
        }
      })
      .mockResolvedValueOnce({
        ...projectBase,
        dataModels: {
          'model-a': attributeUpdatedDataModel
        }
      })
      .mockResolvedValue({
        ...projectBase,
        dataModels: {
          'model-a': finalDataModel
        }
      });
    apiMocks.updateDataModel
      .mockResolvedValueOnce(attributeUpdatedDataModel)
      .mockResolvedValueOnce(finalDataModel)
      .mockResolvedValue(finalDataModel);

    const client = createClient();
    renderDesigner(client);

    const user = userEvent.setup();
    const attributeToggle = await screen.findByRole('button', { name: 'Name' });
    await user.click(attributeToggle);
    await user.click(screen.getByRole('button', { name: /Edit attribute/i }));

    const attributeModal = await screen.findByRole('dialog', { name: /Edit attribute/i });

    const constraintTypeSelect = within(attributeModal).getByLabelText(/Constraint type/i);
    await user.selectOptions(constraintTypeSelect, 'regex');
    const constraintValueInput = within(attributeModal).getByLabelText(/Constraint value/i);
    fireEvent.change(constraintValueInput, { target: { value: ' ^[A-Z]+$ ' } });
    await user.click(within(attributeModal).getByRole('button', { name: /Add constraint/i }));
    await user.click(within(attributeModal).getByLabelText(/Required/));
    await user.click(within(attributeModal).getByLabelText(/Read-only/));
    await user.click(within(attributeModal).getByRole('button', { name: /Save attribute/i }));

    await waitFor(() => {
      expect(apiMocks.updateDataModel).toHaveBeenCalledWith('proj-1', 'model-a', {
        name: 'Customer',
        description: 'Original',
        attributes: [
          {
            id: 'attr-1',
            name: 'Name',
            description: 'Full name',
            type: 'string',
            required: true,
            unique: false,
            constraints: [{ type: 'regex', value: '^[A-Z]+$' }],
            readOnly: true,
            encrypted: false
          }
        ]
      });
    });
    await screen.findByText('All changes saved.');

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
      expect(apiMocks.updateDataModel).toHaveBeenCalledTimes(2);
    });

    const updateArgs = apiMocks.updateDataModel.mock.calls[1];
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
          required: true,
          unique: false,
          constraints: [{ type: 'regex', value: '^[A-Z]+$' }],
          readOnly: true,
          encrypted: false
        }
      ]
    });
    await screen.findByText('All changes saved.');
  });

  it('builds regex constraints with the regex builder', async () => {
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
          description: '',
          attributes: [
            {
              id: 'attr-1',
              name: 'Name',
              description: '',
              type: 'string',
              required: false,
              unique: false,
              constraints: [],
              readOnly: false,
              encrypted: false,
              attributes: []
            }
          ]
        }
      },
      components: {},
      entryPoints: {}
    });

    const client = createClient();
    renderDesigner(client);

    const user = userEvent.setup();
    const attributeToggle = await screen.findByRole('button', { name: 'Name' });
    await user.click(attributeToggle);
    await user.click(screen.getByRole('button', { name: /Edit attribute/i }));

    const attributeModal = await screen.findByRole('dialog', { name: /Edit attribute/i });
    await user.selectOptions(
      within(attributeModal).getByLabelText(/Constraint type/i),
      'regex'
    );

    await user.click(within(attributeModal).getByLabelText(/Open regex builder/i));
    const builder = within(attributeModal).getByRole('group', { name: /Regex builder/i });

    await user.click(within(builder).getByLabelText(/Alpha lowercase/i));
    await user.click(within(builder).getByLabelText(/Alpha uppercase/i));
    await user.click(within(builder).getByLabelText(/Numeric/i));
    await user.click(within(builder).getByRole('radio', { name: /Exact/i }));

    const exactLength = within(builder).getByLabelText(/Exact length/i);
    await user.clear(exactLength);
    await user.type(exactLength, '8');

    await user.click(within(builder).getByRole('button', { name: /Apply pattern/i }));

    const constraintValueInput = within(attributeModal).getByLabelText(/Constraint value/i);
    expect((constraintValueInput as HTMLInputElement).value).toBe('^[A-Z0-9]{8}$');

    await user.click(within(attributeModal).getByRole('button', { name: /Add constraint/i }));

    expect(within(attributeModal).getByText('Regex: ^[A-Z0-9]{8}$')).toBeInTheDocument();
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
      components: {},
      entryPoints: {}
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

  it('supports defining array elements with enum constraints', async () => {
    const projectBase = {
      id: 'proj-1',
      name: 'Project',
      description: '',
      tags: [],
      rootSystemId: 'sys',
      systems: {},
      flows: {},
      components: {},
      entryPoints: {}
    };

    const arrayAttribute = {
      id: 'attr-array',
      name: 'Tags',
      description: '',
      type: 'array',
      required: false,
      unique: false,
      constraints: [],
      readOnly: false,
      encrypted: false,
      attributes: [],
      element: null
    };

    const updatedAttribute = {
      ...arrayAttribute,
      element: {
        id: 'element-1',
        name: 'Item',
        description: '',
        type: 'string',
        required: false,
        unique: false,
        constraints: [{ type: 'enum', values: ['alpha', 'beta'] }],
        readOnly: false,
        encrypted: false,
        attributes: [],
        element: null
      }
    };

    const dataModel = {
      id: 'model-a',
      name: 'Collections',
      description: '',
      attributes: [arrayAttribute]
    };

    const updatedModel = { ...dataModel, attributes: [updatedAttribute] };

    apiMocks.fetchProjectDetails.mockResolvedValue({
      ...projectBase,
      dataModels: { 'model-a': dataModel }
    });
    apiMocks.updateDataModel.mockResolvedValue(updatedModel);

    const client = createClient();
    renderDesigner(client);

    const user = userEvent.setup();
    const attributeToggle = await screen.findByRole('button', { name: 'Tags' });
    await user.click(attributeToggle);
    await user.click(screen.getByRole('button', { name: /Edit attribute/i }));

    const attributeModal = await screen.findByRole('dialog', { name: /Edit attribute/i });
    const defineElementButton = within(attributeModal).getByRole('button', { name: /Define element/i });
    await user.click(defineElementButton);

    const elementName = within(attributeModal).getByLabelText(/Element name/i);
    await user.clear(elementName);
    await user.type(elementName, ' Item ');

    await user.selectOptions(within(attributeModal).getByLabelText(/Element type/i), 'string');

    const constraintTypeSelects = within(attributeModal).getAllByLabelText(/Constraint type/i);
    const constraintValueInputs = within(attributeModal).getAllByLabelText(/Constraint value/i);
    const addConstraintButtons = within(attributeModal).getAllByRole('button', { name: /Add constraint/i });

    await user.selectOptions(constraintTypeSelects[0], 'enum');
    await user.type(constraintValueInputs[0], 'alpha, beta');
    await user.click(addConstraintButtons[0]);

    await user.click(within(attributeModal).getByRole('button', { name: /Save attribute/i }));

    await waitFor(() => {
      expect(apiMocks.updateDataModel).toHaveBeenCalled();
    });

    const [, , payload] = apiMocks.updateDataModel.mock.calls.at(-1) as [
      string,
      string,
      { attributes: unknown[] }
    ];

    expect(payload.attributes[0]).toMatchObject({
      name: 'Tags',
      type: 'array',
      element: {
        name: 'Item',
        type: 'string',
        constraints: [{ type: 'enum', values: ['alpha', 'beta'] }]
      }
    });
  });

  it('saves enum constraints and keeps expanded attributes open', async () => {
    const projectBase = {
      id: 'proj-1',
      name: 'Project',
      description: '',
      tags: [],
      rootSystemId: 'sys',
      systems: {},
      flows: {},
      components: {},
      entryPoints: {}
    };

    const dataModel = {
      id: 'model-a',
      name: 'Contracts',
      description: '',
      attributes: [
        {
          id: 'attr-1',
          name: 'Status',
          description: '',
          type: 'string',
          required: false,
          unique: false,
          constraints: [],
          readOnly: false,
          encrypted: false,
          attributes: [],
          element: null
        }
      ]
    };

    const updatedModel = {
      ...dataModel,
      attributes: [
        {
          ...dataModel.attributes[0],
          constraints: [{ type: 'enum', values: ['draft', 'final'] }]
        }
      ]
    };

    apiMocks.fetchProjectDetails.mockResolvedValue({
      ...projectBase,
      dataModels: { 'model-a': dataModel }
    });
    apiMocks.updateDataModel.mockResolvedValue(updatedModel);

    const client = createClient();
    renderDesigner(client);

    const user = userEvent.setup();
    const attributeToggle = await screen.findByRole('button', { name: 'Status' });
    await user.click(attributeToggle);

    await user.click(screen.getByRole('button', { name: /Edit attribute/i }));

    const attributeModal = await screen.findByRole('dialog', { name: /Edit attribute/i });
    const constraintTypeSelect = within(attributeModal).getByLabelText(/Constraint type/i);
    const constraintValueInput = within(attributeModal).getByLabelText(/Constraint value/i);
    await user.selectOptions(constraintTypeSelect, 'enum');
    await user.type(constraintValueInput, 'draft,final');
    await user.click(within(attributeModal).getByRole('button', { name: /Add constraint/i }));

    await user.click(within(attributeModal).getByRole('button', { name: /Save attribute/i }));

    await waitFor(() => {
      expect(apiMocks.updateDataModel).toHaveBeenCalled();
    });

    const [, , payload] = apiMocks.updateDataModel.mock.calls.at(-1) as [
      string,
      string,
      { attributes: unknown[] }
    ];

    expect(payload.attributes[0]).toMatchObject({
      name: 'Status',
      constraints: [{ type: 'enum', values: ['draft', 'final'] }]
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Status' })).toHaveAttribute(
        'aria-expanded',
        'true'
      );
    });
  });
});
