import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardPage from './DashboardPage.js';
import { useProjectStore } from '../store/projectStore.js';

vi.mock('./ArchitectureWorkspace.js', () => ({ default: () => <div>Architecture workspace</div> }));
vi.mock('./FlowWorkspace.js', () => ({ default: () => <div>Flow workspace</div> }));
vi.mock('./DataModelDesigner.js', () => ({ default: () => <div>Data model designer</div> }));
vi.mock('./ComponentDesigner.js', () => ({ default: () => <div>Component designer</div> }));
vi.mock('./ProjectManager.js', () => ({ default: () => <div>Project manager</div> }));

const renderWithRoute = (route: string) =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/projects" element={<DashboardPage />} />
        <Route path="/projects/:projectId" element={<DashboardPage />} />
      </Routes>
    </MemoryRouter>
  );

describe('DashboardPage', () => {
  beforeEach(() => {
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

  it('selects the architecture tab when a project is provided in the URL', async () => {
    renderWithRoute('/projects/project-1');

    expect(useProjectStore.getState().selectedProjectId).toBe('project-1');

    const tablist = await screen.findByRole('tablist', { name: /Workspace tools/i });
    const architectureTab = within(tablist).getByRole('tab', { name: /Architecture/i });
    expect(architectureTab).toHaveAttribute('aria-selected', 'true');
  });

  it('supports keyboard navigation across tabs', async () => {
    const user = userEvent.setup();
    renderWithRoute('/projects');

    const tablist = await screen.findByRole('tablist', { name: /Workspace tools/i });
    const tabs = within(tablist).getAllByRole('tab');
    const projectsTab = tabs[0];
    projectsTab.focus();
    expect(document.activeElement).toBe(projectsTab);

    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(tabs[1]);

    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(projectsTab);
  });

  it('switches to the architecture tab when a project is selected from the store', async () => {
    renderWithRoute('/projects');
    const tablist = await screen.findByRole('tablist', { name: /Workspace tools/i });
    const architectureTab = within(tablist).getByRole('tab', { name: /Architecture/i });

    expect(architectureTab).toHaveAttribute('aria-selected', 'false');

    useProjectStore.getState().selectProject('project-2');

    await screen.findByText(/Architecture workspace/);
    expect(architectureTab).toHaveAttribute('aria-selected', 'true');
    expect(document.activeElement).toBe(architectureTab);
  });
});
