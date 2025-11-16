import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Project } from '@architekt/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ComponentDesigner from './ComponentDesigner.js';
import { useProjectStore } from '../store/projectStore.js';
import { queryKeys } from '../queryKeys.js';

const apiMocks = vi.hoisted(() => ({
  fetchProjectDetails: vi.fn(),
  createComponent: vi.fn(),
  updateComponent: vi.fn(),
  deleteComponent: vi.fn()
}));

vi.mock('../api/projects', () => ({
  fetchProjectDetails: apiMocks.fetchProjectDetails,
  createComponent: apiMocks.createComponent,
  updateComponent: apiMocks.updateComponent,
  deleteComponent: apiMocks.deleteComponent
}));

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity
      }
    }
  });

const resetStore = () => {
  useProjectStore.setState({
    selectedProjectId: null,
    selectedSystemId: null,
    selectedFlowId: null,
    selectedDataModelId: null,
    selectedComponentId: null
  });
};

const projectFixture: Project = {
  id: 'proj-1',
  name: 'Component project',
  description: 'Fixture for component designer tests',
  tags: [],
  rootSystemId: 'sys-1',
  systems: {
    'sys-1': {
      id: 'sys-1',
      name: 'Platform',
      description: 'Platform root system',
      tags: [],
      childIds: [],
      isRoot: true
    }
  },
  flows: {},
  dataModels: {
    'model-1': {
      id: 'model-1',
      name: 'Customer Profile',
      description: 'Represents a customer',
      attributes: []
    },
    'model-2': {
      id: 'model-2',
      name: 'Audit Event',
      description: 'Audit log entry',
      attributes: []
    }
  },
  components: {
    'comp-1': {
      id: 'comp-1',
      name: 'Customer API',
      description: 'Handles customer operations',
      entryPointIds: ['entry-1']
    },
    'comp-2': {
      id: 'comp-2',
      name: 'Billing API',
      description: 'Handles billing operations',
      entryPointIds: []
    }
  },
  entryPoints: {
    'entry-1': {
      id: 'entry-1',
      name: 'Get customer',
      description: 'Fetch a customer by id',
      type: 'http',
      protocol: 'HTTP',
      method: 'GET',
      path: '/customers/:id',
      target: 'customers-service',
      requestModelIds: ['model-1'],
      responseModelIds: ['model-1']
    }
  }
};

const emptyProjectFixture: Project = {
  ...projectFixture,
  id: 'proj-empty',
  components: {},
  dataModels: projectFixture.dataModels,
  entryPoints: {}
};

let consoleErrorSpy: ReturnType<typeof vi.spyOn> | null = null;
let consoleWarnSpy: ReturnType<typeof vi.spyOn> | null = null;

describe('ComponentDesigner', () => {
  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    resetStore();
    consoleErrorSpy?.mockRestore();
    consoleWarnSpy?.mockRestore();
    consoleErrorSpy = null;
    consoleWarnSpy = null;
  });

  it('prompts the user to select a project when none is active', async () => {
    const queryClient = createTestQueryClient();

    await act(async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <ComponentDesigner />
        </QueryClientProvider>
      );
    });

    expect(
      screen.getByText('Select a project to manage its components.')
    ).toBeInTheDocument();
    expect(apiMocks.fetchProjectDetails).not.toHaveBeenCalled();
  });

  it('edits a component entry point and saves the changes', async () => {
    const user = userEvent.setup();
    const queryClient = createTestQueryClient();
    const project = structuredClone(projectFixture);

    apiMocks.fetchProjectDetails.mockImplementation(async () => project);

    await act(async () => {
      useProjectStore.setState({
        selectedProjectId: 'proj-1',
        selectedSystemId: null,
        selectedFlowId: null,
        selectedDataModelId: null,
        selectedComponentId: 'comp-1'
      });
    });

    queryClient.setQueryData(queryKeys.project('proj-1'), project);

    const updatedEntryPoint = {
      id: 'entry-1',
      name: 'Get customer details',
      description: 'Retrieves customer info',
      type: 'http',
      protocol: 'http/2',
      method: 'get',
      path: '/customers/{id}',
      target: 'api.internal',
      requestModelIds: ['model-2'],
      responseModelIds: ['model-1', 'model-2']
    };

    const updatedComponent = {
      id: 'comp-1',
      name: 'Customer API updated',
      description: 'Updated description',
      entryPointIds: ['entry-1']
    };

    apiMocks.updateComponent.mockImplementation(async () => {
      project.components['comp-1'] = { ...updatedComponent };
      project.entryPoints['entry-1'] = { ...updatedEntryPoint };
      return updatedComponent;
    });

    await act(async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <ComponentDesigner />
        </QueryClientProvider>
      );
    });

    const entryPointCard = await screen.findByText('Get customer');
    const entryPointArticle = entryPointCard.closest('article');
    expect(entryPointArticle).not.toBeNull();

    const entryPointToggle = within(entryPointArticle!).getByRole('button', { name: /get customer/i });
    await user.click(entryPointToggle);

    const editEntryPointButton = within(entryPointArticle!).getByRole('button', { name: 'Edit entry point' });
    await user.click(editEntryPointButton);

    const entryPointModal = await screen.findByRole('dialog', { name: 'Edit entry point' });

    const entryPointNameInput = within(entryPointModal).getByLabelText('Name');
    await user.clear(entryPointNameInput);
    await user.type(entryPointNameInput, ' Get customer details  ');

    const typeSelect = within(entryPointModal).getByLabelText('Type');
    await user.selectOptions(typeSelect, 'http');

    const protocolSelect = within(entryPointModal).getByLabelText('Protocol');
    await user.selectOptions(protocolSelect, 'http/2');

    const methodSelect = within(entryPointModal).getByLabelText('Method / Verb');
    await user.selectOptions(methodSelect, 'get');

    const pathInput = within(entryPointModal).getByLabelText('Path or channel');
    await user.clear(pathInput);
    await user.type(pathInput, '  /customers/  ');

    const targetInput = within(entryPointModal).getByLabelText('Target / endpoint');
    await user.clear(targetInput);
    await user.type(targetInput, '  api.internal  ');

    const entryPointDescription = within(entryPointModal).getByPlaceholderText(
      'What does this entry point do?'
    );
    await user.clear(entryPointDescription);
    await user.type(entryPointDescription, '  Retrieves customer info  ');

    const requestModelsSection = within(entryPointModal)
      .getByText('Request models')
      .closest('.association-group');
    const responseModelsSection = within(entryPointModal)
      .getByText('Response models')
      .closest('.association-group');
    expect(requestModelsSection).not.toBeNull();
    expect(responseModelsSection).not.toBeNull();

    await user.click(within(requestModelsSection!).getByLabelText('Audit Event'));
    await user.click(within(requestModelsSection!).getByLabelText('Customer Profile'));
    await user.click(within(responseModelsSection!).getByLabelText('Audit Event'));

    await user.click(within(entryPointModal).getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Edit entry point' })).not.toBeInTheDocument();
    });

    const entryPointForm = entryPointArticle!.closest('form');
    expect(entryPointForm).not.toBeNull();
    const formSaveButton = within(entryPointForm!).getByRole('button', { name: 'Save changes' });
    expect(formSaveButton).not.toBeDisabled();

    const editDetailsButton = screen.getByRole('button', { name: 'Edit component details' });
    await user.click(editDetailsButton);

    const modal = await screen.findByRole('dialog', { name: 'Edit component' });
    const modalNameInput = within(modal).getByDisplayValue('Customer API');
    await user.clear(modalNameInput);
    await user.type(modalNameInput, ' Customer API updated  ');

    const modalDescriptionInput = within(modal).getByPlaceholderText(
      'How does this component operate?'
    );
    await user.clear(modalDescriptionInput);
    await user.type(modalDescriptionInput, '  Updated description  ');

    const modalSaveButton = within(modal).getByRole('button', { name: 'Save changes' });
    await user.click(modalSaveButton);

    await waitFor(() => {
      expect(apiMocks.updateComponent).toHaveBeenCalledWith('proj-1', 'comp-1', {
        name: 'Customer API updated',
        description: 'Updated description',
        entryPoints: [
          {
            id: 'entry-1',
            name: 'Get customer details',
            description: 'Retrieves customer info',
            type: 'http',
            protocol: 'http/2',
            method: 'get',
            path: '/customers/',
            target: 'api.internal',
            requestModelIds: ['model-2'],
            responseModelIds: ['model-1', 'model-2']
          }
        ]
      });
    });

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Edit component' })).not.toBeInTheDocument();
    });
  });

  it('creates a component through the modal form', async () => {
    const user = userEvent.setup();
    const queryClient = createTestQueryClient();
    const project = structuredClone(emptyProjectFixture);

    apiMocks.fetchProjectDetails.mockImplementation(async () => project);

    await act(async () => {
      useProjectStore.setState({
        selectedProjectId: 'proj-empty',
        selectedSystemId: null,
        selectedFlowId: null,
        selectedDataModelId: null,
        selectedComponentId: null
      });
    });

    queryClient.setQueryData(queryKeys.project('proj-empty'), project);

    const createdComponent = {
      id: 'comp-new',
      name: 'Notifications Service',
      description: 'Handles notifications',
      entryPointIds: []
    };

    apiMocks.createComponent.mockImplementation(async () => {
      project.components[createdComponent.id] = { ...createdComponent };
      return createdComponent;
    });

    await act(async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <ComponentDesigner />
        </QueryClientProvider>
      );
    });

    const createButton = await screen.findByRole('button', { name: 'New component' });
    await user.click(createButton);

    let modal = await screen.findByRole('dialog', { name: 'Create component' });
    const nameInput = within(modal).getByLabelText('Name');
    const descriptionInput = within(modal).getByLabelText('Description');

    await user.type(nameInput, '  Notifications Service  ');
    await user.type(descriptionInput, '  Handles notifications  ');

    await user.click(within(modal).getByRole('button', { name: 'Create component' }));

    await waitFor(() => {
      expect(apiMocks.createComponent).toHaveBeenCalledWith('proj-empty', {
        name: 'Notifications Service',
        description: '  Handles notifications  ',
        entryPoints: []
      });
    });

    await waitFor(() => {
      const cached = queryClient.getQueryData<Project | undefined>(queryKeys.project('proj-empty'));
      expect(cached?.components).toHaveProperty('comp-new');
    });

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Create component' })).not.toBeInTheDocument();
    });

    await user.click(createButton);
    modal = await screen.findByRole('dialog', { name: 'Create component' });
    expect(within(modal).getByLabelText('Name')).toHaveValue('');
    expect(within(modal).getByLabelText('Description')).toHaveValue('');
  });

  it('restores focus to the create button after closing the create modal', async () => {
    const user = userEvent.setup();
    const queryClient = createTestQueryClient();
    const project = structuredClone(emptyProjectFixture);

    apiMocks.fetchProjectDetails.mockImplementation(async () => project);

    await act(async () => {
      useProjectStore.setState({
        selectedProjectId: 'proj-empty',
        selectedSystemId: null,
        selectedFlowId: null,
        selectedDataModelId: null,
        selectedComponentId: null
      });
    });

    queryClient.setQueryData(queryKeys.project('proj-empty'), project);

    await act(async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <ComponentDesigner />
        </QueryClientProvider>
      );
    });

    const createButton = await screen.findByRole('button', { name: 'New component' });
    await user.click(createButton);

    const modal = await screen.findByRole('dialog', { name: 'Create component' });
    await user.click(within(modal).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Create component' })).not.toBeInTheDocument();
    });

    expect(createButton).toHaveFocus();
  });

  it('restores focus to the edit button after closing the edit modal', async () => {
    const user = userEvent.setup();
    const queryClient = createTestQueryClient();
    const project = structuredClone(projectFixture);

    apiMocks.fetchProjectDetails.mockImplementation(async () => project);

    await act(async () => {
      useProjectStore.setState({
        selectedProjectId: 'proj-1',
        selectedSystemId: null,
        selectedFlowId: null,
        selectedDataModelId: null,
        selectedComponentId: 'comp-1'
      });
    });

    queryClient.setQueryData(queryKeys.project('proj-1'), project);

    await act(async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <ComponentDesigner />
        </QueryClientProvider>
      );
    });

    const editButton = await screen.findByRole('button', { name: 'Edit component details' });
    await user.click(editButton);

    await screen.findByRole('dialog', { name: 'Edit component' });
    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Edit component' })).not.toBeInTheDocument();
    });

    expect(editButton).toHaveFocus();
  });
});
