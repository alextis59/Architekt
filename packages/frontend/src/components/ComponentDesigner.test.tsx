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
      entryPoints: [
        {
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
      ]
    },
    'comp-2': {
      id: 'comp-2',
      name: 'Billing API',
      description: 'Handles billing operations',
      entryPoints: []
    }
  }
};

const emptyProjectFixture: Project = {
  ...projectFixture,
  id: 'proj-empty',
  components: {},
  dataModels: projectFixture.dataModels
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

    const updatedComponent = {
      id: 'comp-1',
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
          path: '/customers/{id}',
          target: 'api.internal',
          requestModelIds: ['model-2'],
          responseModelIds: ['model-1', 'model-2']
        }
      ]
    };

    apiMocks.updateComponent.mockImplementation(async () => {
      project.components['comp-1'] = { ...updatedComponent };
      return updatedComponent;
    });

    await act(async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <ComponentDesigner />
        </QueryClientProvider>
      );
    });

    const saveButton = await screen.findByRole('button', { name: 'Save component' });
    const componentForm = saveButton.closest('form');
    expect(componentForm).not.toBeNull();

    const componentNameInput = within(componentForm!).getByDisplayValue('Customer API');
    await user.clear(componentNameInput);
    await user.type(componentNameInput, ' Customer API updated  ');

    const componentDescriptionInput = within(componentForm!).getByPlaceholderText(
      'How does this component operate?'
    );
    await user.clear(componentDescriptionInput);
    await user.type(componentDescriptionInput, '  Updated description  ');

    const entryPointNameInput = within(componentForm!).getByDisplayValue('Get customer');
    await user.clear(entryPointNameInput);
    await user.type(entryPointNameInput, ' Get customer details  ');

    const [typeInput] = within(componentForm!).getAllByLabelText('Type');
    await user.clear(typeInput);
    await user.type(typeInput, '  http  ');

    const [protocolInput] = within(componentForm!).getAllByLabelText('Protocol');
    await user.clear(protocolInput);
    await user.type(protocolInput, '  http/2  ');

    const [methodInput] = within(componentForm!).getAllByLabelText('Method / Verb');
    await user.clear(methodInput);
    await user.type(methodInput, '  get  ');

    const [pathInput] = within(componentForm!).getAllByLabelText('Path or channel');
    await user.clear(pathInput);
    await user.type(pathInput, '  /customers/  ');

    const [targetInput] = within(componentForm!).getAllByLabelText('Target / endpoint');
    await user.clear(targetInput);
    await user.type(targetInput, '  api.internal  ');

    const entryPointDescription = within(componentForm!).getByPlaceholderText(
      'What does this entry point do?'
    );
    await user.clear(entryPointDescription);
    await user.type(entryPointDescription, '  Retrieves customer info  ');

    const entryPointArticle = entryPointNameInput.closest('article');
    expect(entryPointArticle).not.toBeNull();

    const requestModelsSection = within(entryPointArticle!)
      .getByText('Request models')
      .closest('.association-group');
    const responseModelsSection = within(entryPointArticle!)
      .getByText('Response models')
      .closest('.association-group');
    expect(requestModelsSection).not.toBeNull();
    expect(responseModelsSection).not.toBeNull();

    await user.click(within(requestModelsSection!).getByLabelText('Audit Event'));
    await user.click(within(requestModelsSection!).getByLabelText('Customer Profile'));
    await user.click(within(responseModelsSection!).getByLabelText('Audit Event'));

    expect(saveButton).not.toBeDisabled();

    await user.click(saveButton);

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
      expect(saveButton).toBeDisabled();
    });
  });

  it('creates a component through the sidebar form', async () => {
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
      entryPoints: []
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

    const nameInput = await screen.findByPlaceholderText('Component name');
    const descriptionInput = screen.getByPlaceholderText('Optional description');

    await user.type(nameInput, '  Notifications Service  ');
    await user.type(descriptionInput, '  Handles notifications  ');

    await user.click(screen.getByRole('button', { name: 'Add component' }));

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
      expect(nameInput).toHaveValue('');
      expect(descriptionInput).toHaveValue('');
    });
  });
});
