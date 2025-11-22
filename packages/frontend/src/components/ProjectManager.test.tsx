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
    createProject: vi.fn(),
    updateProject: vi.fn(),
    shareProject: vi.fn()
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
    projectManagerMocks.api.updateProject.mockReset();
    projectManagerMocks.api.shareProject.mockReset();
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
      { id: 'b', name: 'Beta', description: '', tags: [], rootSystemId: 'sys', sharedWith: [] },
      { id: 'a', name: 'Alpha', description: 'First', tags: ['core'], rootSystemId: 'sys', sharedWith: [] }
    ]);

    const queryClient = createClient();
    renderComponent(queryClient);

    const list = await screen.findByRole('list');
    const projectButtons = within(list).getAllByRole('button', {
      name: (name) => !name.toLowerCase().startsWith('edit project')
    });
    expect(projectButtons[0]).toHaveTextContent('Alpha');
    expect(projectButtons[1]).toHaveTextContent('Beta');

    const user = userEvent.setup();
    await user.click(projectButtons[1]);

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
      sharedWith: [],
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
    await user.click(screen.getByRole('button', { name: /New project/i }));

    const dialog = await screen.findByRole('dialog', { name: /Create project/i });
    const nameInput = within(dialog).getByLabelText(/Name/);
    const descriptionInput = within(dialog).getByLabelText(/Description/);
    const tagsInput = within(dialog).getByLabelText(/Tags/);

    await user.type(nameInput, '  New Project  ');
    await user.type(descriptionInput, ' Desc ');
    await user.type(tagsInput, ' core, core , ');

    await user.click(within(dialog).getByRole('button', { name: /^Create project$/i }));

    await waitFor(() => {
      expect(projectManagerMocks.api.createProject).toHaveBeenCalled();
    });

    const [payload] = projectManagerMocks.api.createProject.mock.calls[0] as [
      { name: string; description: string; tags: string[] }
    ];
    expect(payload).toEqual({ name: 'New Project', description: 'Desc', tags: ['core'] });

    expect(useProjectStore.getState().selectedProjectId).toBe('new');
    expect(projectManagerMocks.navigate).toHaveBeenCalledWith('/projects/new');

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /Create project/i })).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /New project/i }));
    const reopenedDialog = await screen.findByRole('dialog', { name: /Create project/i });
    expect((within(reopenedDialog).getByLabelText(/Name/) as HTMLInputElement).value).toBe('');
    expect((within(reopenedDialog).getByLabelText(/Description/) as HTMLTextAreaElement).value).toBe('');
    expect((within(reopenedDialog).getByLabelText(/Tags/) as HTMLInputElement).value).toBe('');
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
    await user.click(screen.getByRole('button', { name: /New project/i }));

    const dialog = await screen.findByRole('dialog', { name: /Create project/i });
    await user.type(within(dialog).getByLabelText(/Name/), 'Failure');
    await user.click(within(dialog).getByRole('button', { name: /^Create project$/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Unable to create project/);
    });
  });

  it('opens the edit modal with project details and submits updates', async () => {
    projectManagerMocks.api.fetchProjects.mockResolvedValue([
      {
        id: 'proj-1',
        name: 'Alpha',
        description: 'First',
        tags: ['core'],
        rootSystemId: 'root',
        sharedWith: []
      }
    ]);
    projectManagerMocks.api.updateProject.mockResolvedValue({
      id: 'proj-1',
      name: 'Alpha Revised',
      description: 'First revised',
      tags: ['core', 'beta'],
      rootSystemId: 'root',
      sharedWith: [],
      systems: {},
      flows: {},
      dataModels: {},
      components: {}
    });

    const queryClient = createClient();
    renderComponent(queryClient);

    const editButton = await screen.findByRole('button', { name: /Edit project Alpha/i });

    const user = userEvent.setup();
    await user.click(editButton);

    const dialog = await screen.findByRole('dialog', { name: /Edit project/i });
    const nameInput = within(dialog).getByLabelText(/Name/);
    const descriptionInput = within(dialog).getByLabelText(/Description/);
    const tagsInput = within(dialog).getByLabelText(/Tags/);

    expect((nameInput as HTMLInputElement).value).toBe('Alpha');
    expect((descriptionInput as HTMLTextAreaElement).value).toBe('First');
    expect((tagsInput as HTMLInputElement).value).toBe('core');

    await user.clear(nameInput);
    await user.type(nameInput, ' Alpha Revised ');
    await user.clear(descriptionInput);
    await user.type(descriptionInput, ' First revised ');
    await user.clear(tagsInput);
    await user.type(tagsInput, 'core, beta, beta');

    await user.click(within(dialog).getByRole('button', { name: /Save changes/i }));

    await waitFor(() => {
      expect(projectManagerMocks.api.updateProject).toHaveBeenCalled();
    });

    const [projectId, payload] = projectManagerMocks.api.updateProject.mock.calls[0] as [
      string,
      { name: string; description: string; tags: string[] }
    ];
    expect(projectId).toBe('proj-1');
    expect(payload).toEqual({ name: 'Alpha Revised', description: 'First revised', tags: ['core', 'beta'] });

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /Edit project/i })).not.toBeInTheDocument();
    });
  });

  it('shows an error when project update fails', async () => {
    projectManagerMocks.api.fetchProjects.mockResolvedValue([
      {
        id: 'proj-1',
        name: 'Alpha',
        description: 'First',
        tags: ['core'],
        rootSystemId: 'root',
        sharedWith: []
      }
    ]);
    projectManagerMocks.api.updateProject.mockRejectedValue(new Error('Unable to update project'));

    const queryClient = createClient();
    renderComponent(queryClient);

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Edit project Alpha/i }));

    const dialog = await screen.findByRole('dialog', { name: /Edit project/i });
    await user.type(within(dialog).getByLabelText(/Name/), ' Alpha ');
    await user.click(within(dialog).getByRole('button', { name: /Save changes/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Unable to update project/);
    });
  });

  it('shares a project with a collaborator email', async () => {
    projectManagerMocks.api.fetchProjects.mockResolvedValue([
      {
        id: 'proj-1',
        name: 'Alpha',
        description: '',
        tags: [],
        rootSystemId: 'root',
        sharedWith: ['ally@example.com']
      }
    ]);
    projectManagerMocks.api.shareProject.mockResolvedValue({
      id: 'proj-1',
      name: 'Alpha',
      description: '',
      tags: [],
      rootSystemId: 'root',
      sharedWith: ['ally@example.com', 'new@example.com'],
      systems: {},
      flows: {},
      dataModels: {},
      components: {}
    });

    const queryClient = createClient();
    renderComponent(queryClient);

    const user = userEvent.setup();
    const editButton = await screen.findByRole('button', { name: /Edit project Alpha/i });
    await user.click(editButton);

    const dialog = await screen.findByRole('dialog', { name: /Edit project/i });
    expect(within(dialog).getByText('ally@example.com')).toBeInTheDocument();

    const shareInput = within(dialog).getByLabelText(/Invite by email/i);
    await user.type(shareInput, 'New@Example.com ');
    await user.click(within(dialog).getByRole('button', { name: /Share project/i }));

    await waitFor(() => {
      expect(projectManagerMocks.api.shareProject).toHaveBeenCalledWith('proj-1', 'New@Example.com');
    });

    await waitFor(() => {
      expect(within(dialog).getByText('new@example.com')).toBeInTheDocument();
    });
  });
});
