import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import ArchitectureWorkspace from './ArchitectureWorkspace.js';
import FlowWorkspace from './FlowWorkspace.js';
import DataModelDesigner from './DataModelDesigner.js';
import ComponentDesigner from './ComponentDesigner.js';
import ProjectManager from './ProjectManager.js';
import { selectSelectedProjectId, useProjectStore } from '../store/projectStore.js';

type WorkspaceTabId = 'projects' | 'architecture' | 'flows' | 'data-models' | 'components';

const WORKSPACE_TABS: { id: WorkspaceTabId; label: string }[] = [
  { id: 'projects', label: 'Projects' },
  { id: 'architecture', label: 'Architecture' },
  { id: 'flows', label: 'Flows' },
  { id: 'data-models', label: 'Data models' },
  { id: 'components', label: 'Components' }
];

const DashboardPage = () => {
  const { projectId } = useParams<{ projectId?: string }>();
  const selectedProjectId = useProjectStore(selectSelectedProjectId);
  const selectProject = useProjectStore((state) => state.selectProject);
  const [activeTab, setActiveTab] = useState<WorkspaceTabId>(() =>
    projectId ? 'architecture' : 'projects'
  );
  const tabRefs = useRef<Record<WorkspaceTabId, HTMLButtonElement | null>>({
    projects: null,
    architecture: null,
    flows: null,
    'data-models': null,
    components: null
  });

  const previousProjectIdRef = useRef<string | null>(selectedProjectId);

  useEffect(() => {
    if (projectId && projectId !== selectedProjectId) {
      selectProject(projectId);
    } else if (!projectId && selectedProjectId !== null) {
      selectProject(null);
    }
  }, [projectId, selectProject, selectedProjectId]);

  const focusTab = (tabId: WorkspaceTabId) => {
    setActiveTab(tabId);
    const target = tabRefs.current[tabId];
    if (target) {
      target.focus();
    }
  };

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') {
      return;
    }

    event.preventDefault();
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    const nextIndex = (index + direction + WORKSPACE_TABS.length) % WORKSPACE_TABS.length;
    const nextTab = WORKSPACE_TABS[nextIndex];
    focusTab(nextTab.id);
  };

  const renderActiveWorkspace = () => {
    switch (activeTab) {
      case 'projects':
        return <ProjectManager />;
      case 'flows':
        return <FlowWorkspace />;
      case 'data-models':
        return <DataModelDesigner />;
      case 'components':
        return <ComponentDesigner />;
      case 'architecture':
      default:
        return <ArchitectureWorkspace />;
    }
  };

  useEffect(() => {
    const previousProjectId = previousProjectIdRef.current;

    if (selectedProjectId && selectedProjectId !== previousProjectId && activeTab === 'projects') {
      setActiveTab('architecture');
      const architectureTab = tabRefs.current.architecture;
      if (architectureTab) {
        architectureTab.focus();
      }
    }

    previousProjectIdRef.current = selectedProjectId;
  }, [activeTab, selectedProjectId]);

  return (
    <section className="workspace-tabs">
      <nav className="workspace-nav">
        <div className="workspace-nav-list" role="tablist" aria-label="Workspace tools">
          {WORKSPACE_TABS.map((tab, index) => (
            <button
              key={tab.id}
              id={`${tab.id}-tab`}
              type="button"
              role="tab"
              aria-controls={`${tab.id}-panel`}
              aria-selected={activeTab === tab.id}
              tabIndex={activeTab === tab.id ? 0 : -1}
              className={clsx('workspace-tab', { active: activeTab === tab.id })}
              ref={(element) => {
                tabRefs.current[tab.id] = element;
              }}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>
      <div
        className="workspace-panel"
        role="tabpanel"
        id={`${activeTab}-panel`}
        aria-labelledby={`${activeTab}-tab`}
      >
        {renderActiveWorkspace()}
      </div>
    </section>
  );
};

export default DashboardPage;

