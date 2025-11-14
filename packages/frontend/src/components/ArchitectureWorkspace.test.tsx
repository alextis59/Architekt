import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Project } from '@architekt/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ArchitectureWorkspace from './ArchitectureWorkspace.js';
import { useProjectStore } from '../store/projectStore.js';
import type { FilteredTreeNode } from './SystemTree.js';

type SystemTreeMockProps = {
  tree: FilteredTreeNode;
  selectedSystemId: string | null;
  onSelectSystem: (systemId: string) => void;
  isFiltered: boolean;
};

const apiMocks = vi.hoisted(() => ({
  fetchProjectDetails: vi.fn(),
  createSystem: vi.fn(),
  updateSystem: vi.fn(),
  deleteSystem: vi.fn()
}));

const systemTreeMock = vi.hoisted(() => ({
  renderSpy: vi.fn()
}));

vi.mock('../api/projects', () => ({
  fetchProjectDetails: apiMocks.fetchProjectDetails,
  createSystem: apiMocks.createSystem,
  updateSystem: apiMocks.updateSystem,
  deleteSystem: apiMocks.deleteSystem
}));

vi.mock('./SystemTree.js', () => ({
  __esModule: true,
  default: (props: SystemTreeMockProps) => {
    systemTreeMock.renderSpy(props);
    return (
      <div data-testid="system-tree-mock">
        <button type="button" onClick={() => props.onSelectSystem(props.selectedSystemId ?? '')}>
          select
        </button>
      </div>
    );
  }
}));

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false
      }
    }
  });

const resetStore = () => {
  useProjectStore.setState({
    selectedProjectId: null,
    selectedSystemId: null,
    selectedDataModelId: null,
    selectedFlowId: null,
    selectedComponentId: null
  });
};

const projectFixture: Project = {
  id: 'proj-1',
  name: 'Demo project',
  description: 'Fixture',
  tags: [],
  rootSystemId: 'sys-root',
  systems: {
    'sys-root': {
      id: 'sys-root',
      name: 'Platform Root',
      description: 'Entry point',
      tags: ['platform'],
      childIds: ['sys-auth', 'sys-worker'],
      isRoot: true
    },
    'sys-auth': {
      id: 'sys-auth',
      name: 'Authentication',
      description: 'Handles identity',
      tags: ['critical', 'edge'],
      childIds: [],
      isRoot: false
    },
    'sys-worker': {
      id: 'sys-worker',
      name: 'Background Worker',
      description: 'Processes jobs',
      tags: ['async'],
      childIds: [],
      isRoot: false
    }
  },
  flows: {},
  dataModels: {},
  components: {}
};

const getLatestSystemTreeProps = () =>
  systemTreeMock.renderSpy.mock.calls.at(-1)?.[0] as SystemTreeMockProps | undefined;

describe('ArchitectureWorkspace', () => {
  afterEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  it('surfaces project loading errors with context', async () => {
    apiMocks.fetchProjectDetails.mockRejectedValue(new Error('Boom'));
    useProjectStore.setState({
      selectedProjectId: 'proj-1',
      selectedSystemId: null,
      selectedFlowId: null,
      selectedDataModelId: null,
      selectedComponentId: null
    });

    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <ArchitectureWorkspace />
      </QueryClientProvider>
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Failed to load project details: Boom');
  });

  it('renders project details, selects the root system, and lists project tags', async () => {
    apiMocks.fetchProjectDetails.mockResolvedValue(projectFixture);
    apiMocks.updateSystem.mockResolvedValue(projectFixture.systems['sys-root']);
    apiMocks.createSystem.mockResolvedValue(projectFixture.systems['sys-auth']);
    apiMocks.deleteSystem.mockResolvedValue(undefined);

    useProjectStore.setState({
      selectedProjectId: 'proj-1',
      selectedSystemId: null,
      selectedFlowId: null,
      selectedDataModelId: null,
      selectedComponentId: null
    });

    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <ArchitectureWorkspace />
      </QueryClientProvider>
    );

    await screen.findByText('Root system anchors the entire architecture and cannot be removed.');

    expect(useProjectStore.getState().selectedSystemId).toBe('sys-root');

    expect(screen.getByRole('button', { name: 'async' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'critical' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'edge' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'platform' })).toBeInTheDocument();

    const latestProps = getLatestSystemTreeProps();
    expect(latestProps?.selectedSystemId).toBe('sys-root');
    expect(latestProps?.isFiltered).toBe(false);
  });

  it('allows toggling tag filters and clearing them', async () => {
    const user = userEvent.setup();
    apiMocks.fetchProjectDetails.mockResolvedValue(projectFixture);
    apiMocks.updateSystem.mockResolvedValue(projectFixture.systems['sys-root']);
    apiMocks.createSystem.mockResolvedValue(projectFixture.systems['sys-auth']);
    apiMocks.deleteSystem.mockResolvedValue(undefined);

    useProjectStore.setState({
      selectedProjectId: 'proj-1',
      selectedSystemId: 'sys-root',
      selectedFlowId: null,
      selectedDataModelId: null,
      selectedComponentId: null
    });

    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <ArchitectureWorkspace />
      </QueryClientProvider>
    );

    const edgeButton = await screen.findByRole('button', { name: 'edge' });
    await user.click(edgeButton);

    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();

    await waitFor(() => {
      const latestProps = getLatestSystemTreeProps();
      expect(latestProps?.isFiltered).toBe(true);
      const childIds = latestProps?.tree.children.map((child) => child.system.id) ?? [];
      expect(childIds).toEqual(['sys-auth']);
    });

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));

    await waitFor(() => {
      const latestProps = getLatestSystemTreeProps();
      expect(latestProps?.isFiltered).toBe(false);
    });
  });

  it('surfaces mutation errors from the system details panel', async () => {
    const user = userEvent.setup();
    apiMocks.fetchProjectDetails.mockResolvedValue(projectFixture);
    apiMocks.updateSystem.mockRejectedValueOnce(new Error('Update failed'));
    apiMocks.createSystem.mockResolvedValue(projectFixture.systems['sys-auth']);
    apiMocks.deleteSystem.mockResolvedValue(undefined);

    useProjectStore.setState({
      selectedProjectId: 'proj-1',
      selectedSystemId: 'sys-root',
      selectedFlowId: null,
      selectedDataModelId: null,
      selectedComponentId: null
    });

    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <ArchitectureWorkspace />
      </QueryClientProvider>
    );

    const saveButton = await screen.findByRole('button', { name: 'Save changes' });
    await user.click(saveButton);

    await screen.findByText('Unable to update system');
    expect(apiMocks.updateSystem).toHaveBeenCalledWith('proj-1', 'sys-root', {
      name: 'Platform Root',
      description: 'Entry point',
      tags: ['platform']
    });
  });

  it('selects the created system after a successful child creation', async () => {
    const user = userEvent.setup();
    const updatedProject: Project = {
      ...projectFixture,
      systems: {
        ...projectFixture.systems,
        'sys-new': {
          id: 'sys-new',
          name: 'New child',
          description: '',
          tags: [],
          childIds: [],
          isRoot: false
        }
      }
    };
    apiMocks.fetchProjectDetails.mockResolvedValueOnce(projectFixture);
    apiMocks.fetchProjectDetails.mockResolvedValue(updatedProject);
    apiMocks.updateSystem.mockResolvedValue(projectFixture.systems['sys-root']);
    apiMocks.createSystem.mockResolvedValue({
      id: 'sys-new',
      name: 'New child',
      description: '',
      tags: [],
      childIds: [],
      isRoot: false
    });
    apiMocks.deleteSystem.mockResolvedValue(undefined);

    useProjectStore.setState({
      selectedProjectId: 'proj-1',
      selectedSystemId: 'sys-root',
      selectedFlowId: null,
      selectedDataModelId: null,
      selectedComponentId: null
    });

    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <ArchitectureWorkspace />
      </QueryClientProvider>
    );

    const childNameInput = await screen.findByPlaceholderText('Authentication service');
    await user.clear(childNameInput);
    await user.type(childNameInput, 'Billing');

    await user.click(screen.getByRole('button', { name: 'Create child' }));

    await waitFor(() =>
      expect(apiMocks.createSystem).toHaveBeenCalledWith('proj-1', {
        name: 'Billing',
        description: '',
        tags: [],
        parentId: 'sys-root'
      })
    );

    await waitFor(() => expect(useProjectStore.getState().selectedSystemId).toBe('sys-new'));
  });
});

