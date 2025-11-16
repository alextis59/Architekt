import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryHistory } from 'history';
import { Router } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App, { queryClient } from './App.js';
import { useProjectStore } from './store/projectStore.js';

const project = {
  id: 'proj-1',
  name: 'Demo Project',
  description: 'Synthetic data for tests',
  tags: ['demo'],
  rootSystemId: 'sys-1',
  systems: {
    'sys-1': {
      id: 'sys-1',
      name: 'Demo Platform',
      description: 'Root node',
      tags: ['platform'],
      childIds: ['sys-2'],
      isRoot: true
    },
    'sys-2': {
      id: 'sys-2',
      name: 'Child Service',
      description: 'Handles downstream tasks',
      tags: ['service'],
      childIds: [],
      isRoot: false
    }
  },
  flows: {
    'flow-1': {
      id: 'flow-1',
      name: 'Sample flow',
      description: 'Smoke test flow',
      tags: ['demo'],
      systemScopeIds: ['sys-1'],
      steps: [
        {
          id: 'step-a',
          name: 'Initial step',
          description: 'Synthetic step for tests',
          sourceSystemId: 'sys-1',
          targetSystemId: 'sys-1',
          tags: ['demo'],
          alternateFlowIds: []
        }
      ]
    }
  },
  dataModels: {
    'model-1': {
      id: 'model-1',
      name: 'Customer',
      description: 'Customer profile',
      attributes: [
        {
          id: 'attr-1',
          name: 'id',
          description: 'Primary identifier',
          type: 'string',
          required: true,
          unique: false,
          constraints: [{ type: 'regex', value: '^[A-Z0-9-]+$' }],
          readOnly: true,
          encrypted: false,
          attributes: []
        }
      ]
    }
  },
  components: {
    'component-1': {
      id: 'component-1',
      name: 'Customer API',
      description: 'Serves customer data',
      entryPointIds: ['entry-1']
    }
  },
  entryPoints: {
    'entry-1': {
      id: 'entry-1',
      name: 'Get customer',
      description: 'Fetch a customer record',
      type: 'http',
      protocol: 'HTTP',
      method: 'GET',
      path: '/customers/:id',
      target: '',
      requestModelIds: ['model-1'],
      responseModelIds: ['model-1']
    }
  }
};

const apiMocks = vi.hoisted(() => ({
  fetchProjects: vi.fn(),
  createProject: vi.fn(),
  fetchProjectDetails: vi.fn(),
  createSystem: vi.fn(),
  updateSystem: vi.fn(),
  deleteSystem: vi.fn(),
  createFlow: vi.fn(),
  updateFlow: vi.fn(),
  deleteFlow: vi.fn(),
  createDataModel: vi.fn(),
  updateDataModel: vi.fn(),
  deleteDataModel: vi.fn(),
  createComponent: vi.fn(),
  updateComponent: vi.fn(),
  deleteComponent: vi.fn()
}));

vi.mock('./api/projects', () => apiMocks);

const {
  fetchProjects: mockFetchProjects,
  createProject: mockCreateProject,
  fetchProjectDetails: mockFetchProjectDetails,
  createSystem: mockCreateSystem,
  updateSystem: mockUpdateSystem,
  deleteSystem: mockDeleteSystem,
  createFlow: mockCreateFlow,
  updateFlow: mockUpdateFlow,
  deleteFlow: mockDeleteFlow,
  createDataModel: mockCreateDataModel,
  updateDataModel: mockUpdateDataModel,
  deleteDataModel: mockDeleteDataModel,
  createComponent: mockCreateComponent,
  updateComponent: mockUpdateComponent,
  deleteComponent: mockDeleteComponent
} = apiMocks;

const renderWithRouter = (initialEntries: string[]) => {
  const history = createMemoryHistory({ initialEntries });
  const view = render(
    <Router location={history.location} navigator={history}>
      <App />
    </Router>
  );

  return { history, ...view };
};

const resetStore = () => {
  useProjectStore.setState({
    selectedProjectId: null,
    selectedSystemId: null,
    selectedFlowId: null,
    selectedDataModelId: null,
    selectedComponentId: null
  });
};

describe('App', () => {
  beforeEach(() => {
    mockFetchProjects.mockResolvedValue([
      {
        id: project.id,
        name: project.name,
        description: project.description,
        tags: project.tags,
        rootSystemId: project.rootSystemId
      }
    ]);
    mockCreateProject.mockResolvedValue(project);
    mockFetchProjectDetails.mockResolvedValue(project);
    mockCreateSystem.mockResolvedValue(project.systems[project.rootSystemId]);
    mockUpdateSystem.mockResolvedValue(project.systems[project.rootSystemId]);
    mockDeleteSystem.mockResolvedValue(undefined);
    mockCreateFlow.mockResolvedValue({ ...project.flows['flow-1'] });
    mockUpdateFlow.mockResolvedValue({ ...project.flows['flow-1'] });
    mockDeleteFlow.mockResolvedValue(undefined);
    mockCreateDataModel.mockResolvedValue({ ...project.dataModels['model-1'] });
    mockUpdateDataModel.mockResolvedValue({ ...project.dataModels['model-1'] });
    mockDeleteDataModel.mockResolvedValue(undefined);
    mockCreateComponent.mockResolvedValue({ ...project.components['component-1'] });
    mockUpdateComponent.mockResolvedValue({ ...project.components['component-1'] });
    mockDeleteComponent.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
    resetStore();
  });

  it('shows the project manager tab by default when viewing projects index', async () => {
    renderWithRouter(['/projects']);

    expect(screen.getByRole('heading', { level: 1, name: /Architekt/i })).toBeInTheDocument();

    const tablist = await screen.findByRole('tablist', { name: /Workspace tools/i });
    const projectsTab = within(tablist).getByRole('tab', { name: /Projects/i });
    expect(projectsTab).toHaveAttribute('aria-selected', 'true');

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: /^Projects$/i })).toBeInTheDocument();
    });

    const projectList = await screen.findByRole('list');
    const projectButton = within(projectList).getByRole('button', {
      name: (name) => !name.toLowerCase().startsWith('edit project') && /demo project/i.test(name)
    });

    expect(projectButton).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: /Architecture explorer/i })).not.toBeInTheDocument();
  });

  it('switches between workspace tools when selecting tabs', async () => {
    renderWithRouter(['/projects']);

    const tablist = await screen.findByRole('tablist', { name: /Workspace tools/i });
    const architectureTab = within(tablist).getByRole('tab', { name: /Architecture/i });

    await userEvent.click(architectureTab);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: /Architecture explorer/i })).toBeInTheDocument();
    });

    expect(screen.queryByRole('heading', { level: 2, name: /^Projects$/i })).not.toBeInTheDocument();

    const flowTab = within(tablist).getByRole('tab', { name: /Flows/i });

    await userEvent.click(flowTab);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: /Flow designer/i })).toBeInTheDocument();
    });

    expect(screen.queryByRole('heading', { level: 2, name: /Architecture explorer/i })).not.toBeInTheDocument();

    const componentsTab = within(tablist).getByRole('tab', { name: /Components/i });
    await userEvent.click(componentsTab);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: /Component designer/i })).toBeInTheDocument();
    });
  });

  it('navigates to a project specific route when a project is selected', async () => {
    const { history } = renderWithRouter(['/projects']);

    const projectList = await screen.findByRole('list');
    const projectButton = within(projectList).getByRole('button', {
      name: (name) => !name.toLowerCase().startsWith('edit project') && /demo project/i.test(name)
    });
    await userEvent.click(projectButton);

    await waitFor(() => {
      expect(history.location.pathname).toBe('/projects/proj-1');
    });

    const tablist = await screen.findByRole('tablist', { name: /Workspace tools/i });
    const architectureTab = within(tablist).getByRole('tab', { name: /Architecture/i });
    expect(architectureTab).toHaveAttribute('aria-selected', 'true');

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: /Architecture explorer/i })).toBeInTheDocument();
    });
  });

  it('loads project data when the URL already targets a project', async () => {
    renderWithRouter(['/projects/proj-1']);

    const tablist = await screen.findByRole('tablist', { name: /Workspace tools/i });
    const architectureTab = within(tablist).getByRole('tab', { name: /Architecture/i });
    expect(architectureTab).toHaveAttribute('aria-selected', 'true');

    const detailsHeading = await screen.findByRole('heading', { level: 3, name: /Demo Platform/i });
    const detailsPanel = detailsHeading.closest('.system-details-panel');
    expect(detailsPanel).not.toBeNull();

    if (!detailsPanel) {
      throw new Error('System details panel not found');
    }

    const editButton = within(detailsPanel).getByRole('button', { name: 'Edit system' });
    await userEvent.click(editButton);

    const nameInput = await screen.findByLabelText('Name');
    expect(nameInput).toHaveValue('Demo Platform');
  });
});
