import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '../store/projectStore.js';

const projectManagerMocks = {
  navigate: vi.fn(),
  api: {
    fetchProjects: vi.fn(),
    createProject: vi.fn()
  }
};

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => projectManagerMocks.navigate
  };
});

vi.mock('../api/projects.js', () => projectManagerMocks.api);

const ProjectManager = (await import('./ProjectManager.js')).default;

const renderComponent = (queryClient: QueryClient) =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ProjectManager />
      </MemoryRouter>
    </QueryClientProvider>
  );

describe('ProjectManager', () => {
  const createClient = () =>
    new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false }
      }
    });

  beforeEach(() => {
    projectManagerMocks.navigate.mockReset();
    projectManagerMocks.api.fetchProjects.mockReset();
    projectManagerMocks.api.createProject.mockReset();
    useProjectStore.setState({
      selectedProjectId: null,
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
  });

  it('renders projects sorted alphabetically and navigates when a project is selected', async () => {
    projectManagerMocks.api.fetchProjects.mockResolvedValue([
      { id: 'b', name: 'Beta', description: '', tags: [], rootSystemId: 'sys' },
      { id: 'a', name: 'Alpha', description: 'First', tags: ['core'], rootSystemId: 'sys' }
    ]);

    const queryClient = createClient();
    renderComponent(queryClient);

    const list = await screen.findByRole('list');
    const items = within(list).getAllByRole('button');
    expect(items[0]).toHaveTextContent('Alpha');
    expect(items[1]).toHaveTextContent('Beta');

    const user = userEvent.setup();
    await user.click(items[1]);

    expect(useProjectStore.getState().selectedProjectId).toBe('b');
    expect(projectManagerMocks.navigate).toHaveBeenCalledWith('/projects/b');
  });

  it('shows an error message when projects fail to load', async () => {
    projectManagerMocks.api.fetchProjects.mockRejectedValue(new Error('Network error'));

    const queryClient = createClient();
    renderComponent(queryClient);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Failed to load projects/);
    });
  });

  it('submits the creation form with sanitized payload and resets inputs', async () => {
    projectManagerMocks.api.fetchProjects.mockResolvedValue([]);
    projectManagerMocks.api.createProject.mockResolvedValue({
      id: 'new',
      name: 'New Project',
      description: 'Desc',
      tags: ['core'],
      rootSystemId: 'root',
      systems: {},
      flows: {},
      dataModels: {},
      components: {}
    });

    const queryClient = createClient();
    renderComponent(queryClient);

    await waitFor(() => {
      expect(projectManagerMocks.api.fetchProjects).toHaveBeenCalled();
    });

    const user = userEvent.setup();
    const nameInput = screen.getByLabelText(/Name/);
    const descriptionInput = screen.getByLabelText(/Description/);
    const tagsInput = screen.getByLabelText(/Tags/);

    await user.type(nameInput, '  New Project  ');
    await user.type(descriptionInput, ' Desc ');
    await user.type(tagsInput, ' core, core , ');

    await user.click(screen.getByRole('button', { name: /Create project/i }));

    await waitFor(() => {
      expect(projectManagerMocks.api.createProject).toHaveBeenCalled();
    });

    const [payload] = projectManagerMocks.api.createProject.mock.calls[0] as [
      { name: string; description: string; tags: string[] }
    ];
    expect(payload).toEqual({ name: 'New Project', description: 'Desc', tags: ['core'] });

    expect(useProjectStore.getState().selectedProjectId).toBe('new');
    expect(projectManagerMocks.navigate).toHaveBeenCalledWith('/projects/new');
    expect((nameInput as HTMLInputElement).value).toBe('');
    expect((descriptionInput as HTMLTextAreaElement).value).toBe('');
    expect((tagsInput as HTMLInputElement).value).toBe('');
  });

  it('shows an error when project creation fails', async () => {
    projectManagerMocks.api.fetchProjects.mockResolvedValue([]);
    projectManagerMocks.api.createProject.mockRejectedValue(new Error('Unable to create project'));

    const queryClient = createClient();
    renderComponent(queryClient);

    await waitFor(() => {
      expect(projectManagerMocks.api.fetchProjects).toHaveBeenCalled();
    });

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/Name/), 'Failure');
    await user.click(screen.getByRole('button', { name: /Create project/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Unable to create project/);
    });
  });
});
