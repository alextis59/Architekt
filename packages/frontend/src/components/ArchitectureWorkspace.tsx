import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import type { Project, System } from '@architekt/domain';
import { createSystem, deleteSystem, fetchProjectDetails, updateSystem } from '../api/projects.js';
import { queryKeys } from '../queryKeys.js';
import {
  selectSelectedProjectId,
  selectSelectedSystemId,
  useProjectStore
} from '../store/projectStore.js';
import SystemTree, { type FilteredTreeNode } from './SystemTree.js';
import SystemDetails from './SystemDetails.js';
import TagFilterBar from './TagFilterBar.js';

const collectProjectTags = (project: Project): string[] => {
  const tags = new Set<string>();
  for (const system of Object.values(project.systems)) {
    for (const tag of system.tags) {
      tags.add(tag);
    }
  }
  return [...tags].sort((a, b) => a.localeCompare(b));
};

const buildFilteredTree = (project: Project, selectedTags: string[]): FilteredTreeNode | null => {
  const rootSystem = project.systems[project.rootSystemId];
  if (!rootSystem) {
    return null;
  }

  const tagSet = new Set(selectedTags);
  const isFiltered = tagSet.size > 0;

  const visit = (system: System): FilteredTreeNode | null => {
    const childNodes = system.childIds
      .map((childId) => project.systems[childId])
      .filter((child): child is System => Boolean(child))
      .map((child) => visit(child))
      .filter((child): child is FilteredTreeNode => Boolean(child));

    const matches = !isFiltered || [...tagSet].every((tag) => system.tags.includes(tag));
    const hasVisibleChildren = childNodes.some((child) => child.isVisible);
    const isVisible = matches || hasVisibleChildren || system.isRoot;

    if (!isVisible) {
      return null;
    }

    return {
      system,
      children: childNodes,
      isMatch: matches,
      isVisible
    };
  };

  return visit(rootSystem);
};

const ArchitectureWorkspace = () => {
  const queryClient = useQueryClient();
  const selectedProjectId = useProjectStore(selectSelectedProjectId);
  const selectedSystemId = useProjectStore(selectSelectedSystemId);
  const selectSystem = useProjectStore((state) => state.selectSystem);

  const [activeTags, setActiveTags] = useState<string[]>([]);

  useEffect(() => {
    setActiveTags([]);
  }, [selectedProjectId]);

  const projectQuery = useQuery({
    queryKey: selectedProjectId ? queryKeys.project(selectedProjectId) : ['project', 'none'],
    queryFn: () => fetchProjectDetails(selectedProjectId ?? ''),
    enabled: Boolean(selectedProjectId)
  });

  const project = projectQuery.data;

  useEffect(() => {
    if (!project) {
      return;
    }

    if (!selectedSystemId || !project.systems[selectedSystemId]) {
      selectSystem(project.rootSystemId);
    }
  }, [project, selectSystem, selectedSystemId]);

  const availableTags = useMemo(
    () => (project ? collectProjectTags(project) : []),
    [project]
  );

  const filteredTree = useMemo(
    () => (project ? buildFilteredTree(project, activeTags) : null),
    [project, activeTags]
  );

  const activeSystem = project && selectedSystemId ? project.systems[selectedSystemId] ?? null : null;

  const updateSystemMutation = useMutation({
    mutationFn: ({
      projectId,
      systemId,
      payload
    }: {
      projectId: string;
      systemId: string;
      payload: { name: string; description: string; tags: string[] };
    }) => updateSystem(projectId, systemId, payload),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.project(variables.projectId) });
    }
  });

  const createSystemMutation = useMutation({
    mutationFn: ({
      projectId,
      payload
    }: {
      projectId: string;
      payload: { name: string; description: string; tags: string[]; parentId?: string };
    }) => createSystem(projectId, payload),
    onSuccess: (system, variables) => {
      queryClient.setQueryData<Project | undefined>(queryKeys.project(variables.projectId), (previous) => {
        if (!previous) {
          return previous;
        }

        const parentId = variables.payload.parentId;
        const nextSystems: Project['systems'] = {
          ...previous.systems,
          [system.id]: system
        };

        if (parentId && previous.systems[parentId]) {
          const parent = previous.systems[parentId];
          nextSystems[parentId] = {
            ...parent,
            childIds: parent.childIds.includes(system.id)
              ? parent.childIds
              : [...parent.childIds, system.id]
          };
        }

        return {
          ...previous,
          systems: nextSystems
        };
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.project(variables.projectId) });
      selectSystem(system.id);
    }
  });

  const deleteSystemMutation = useMutation({
    mutationFn: ({ projectId, systemId }: { projectId: string; systemId: string }) =>
      deleteSystem(projectId, systemId),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.project(variables.projectId) });
      if (project?.rootSystemId) {
        selectSystem(project.rootSystemId);
      }
    }
  });

  const handleToggleTag = (tag: string) => {
    setActiveTags((previous) =>
      previous.includes(tag) ? previous.filter((entry) => entry !== tag) : [...previous, tag]
    );
  };

  const handleClearTags = () => setActiveTags([]);

  return (
    <section className="workspace">
      <header className="panel-header">
        <h2>Architecture explorer</h2>
        <p className="panel-subtitle">
          Visualize hierarchies, inspect system metadata, and evolve your architecture from the browser.
        </p>
      </header>
      {!selectedProjectId && (
        <div className="panel-content">
          <p className="status">Select a project to explore its systems.</p>
        </div>
      )}
      {selectedProjectId && projectQuery.isLoading && (
        <div className="panel-content">
          <p className="status">Loading project…</p>
        </div>
      )}
      {selectedProjectId && projectQuery.isError && (
        <div className="panel-content">
          <p className="status error" role="alert">
            Failed to load project details:{' '}
            {projectQuery.error instanceof Error ? projectQuery.error.message : 'Unknown error'}
          </p>
        </div>
      )}
      {selectedProjectId && project && (
        <div className="workspace-grid">
          <div className="workspace-tree">
            <TagFilterBar
              availableTags={availableTags}
              selectedTags={activeTags}
              onToggleTag={handleToggleTag}
              onClear={handleClearTags}
            />
            {filteredTree ? (
              <SystemTree
                tree={filteredTree}
                isFiltered={activeTags.length > 0}
                selectedSystemId={selectedSystemId}
                onSelectSystem={(systemId) => selectSystem(systemId)}
              />
            ) : (
              <p className="status">This project does not have any systems yet.</p>
            )}
          </div>
          <div className="workspace-details">
            {activeSystem ? (
              <SystemDetails
                system={activeSystem}
                isRoot={activeSystem.id === project.rootSystemId}
                onUpdate={(payload) =>
                  updateSystemMutation.mutate({
                    projectId: project.id,
                    systemId: activeSystem.id,
                    payload
                  })
                }
                onCreateChild={(payload) =>
                  createSystemMutation.mutate({
                    projectId: project.id,
                    payload: { ...payload, parentId: activeSystem.id }
                  })
                }
                onDelete={() =>
                  deleteSystemMutation.mutate({ projectId: project.id, systemId: activeSystem.id })
                }
                isMutating={
                  updateSystemMutation.isPending ||
                  createSystemMutation.isPending ||
                  deleteSystemMutation.isPending
                }
                errorMessage={
                  updateSystemMutation.isError
                    ? 'Unable to update system'
                    : createSystemMutation.isError
                      ? 'Unable to create system'
                      : deleteSystemMutation.isError
                        ? 'Unable to delete system'
                        : null
                }
              />
            ) : (
              <p className="status">Select a system from the tree to see its details.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

export { collectProjectTags, buildFilteredTree };

export default ArchitectureWorkspace;

