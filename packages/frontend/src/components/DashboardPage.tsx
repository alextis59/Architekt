import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import ArchitectureWorkspace from './ArchitectureWorkspace.js';
import ProjectManager from './ProjectManager.js';
import { selectSelectedProjectId, useProjectStore } from '../store/projectStore.js';

const DashboardPage = () => {
  const { projectId } = useParams<{ projectId?: string }>();
  const selectedProjectId = useProjectStore(selectSelectedProjectId);
  const selectProject = useProjectStore((state) => state.selectProject);

  useEffect(() => {
    if (projectId && projectId !== selectedProjectId) {
      selectProject(projectId);
    } else if (!projectId && selectedProjectId !== null) {
      selectProject(null);
    }
  }, [projectId, selectProject, selectedProjectId]);

  return (
    <>
      <ProjectManager />
      <ArchitectureWorkspace />
    </>
  );
};

export default DashboardPage;

