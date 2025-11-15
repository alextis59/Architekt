import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { useNavigate } from 'react-router-dom';
import { createProject, fetchProjects, type ProjectSummary } from '../api/projects.js';
import { queryKeys } from '../queryKeys.js';
import { selectSelectedProjectId, useProjectStore } from '../store/projectStore.js';

const parseTags = (input: string): string[] =>
  input
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag, index, array) => tag.length > 0 && array.indexOf(tag) === index);

const sortProjects = (projects: ProjectSummary[]): ProjectSummary[] =>
  [...projects].sort((a, b) => a.name.localeCompare(b.name));

const ProjectManager = () => {
  const queryClient = useQueryClient();
  const selectedProjectId = useProjectStore(selectSelectedProjectId);
  const selectProject = useProjectStore((state) => state.selectProject);
  const navigate = useNavigate();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: queryKeys.projects,
    queryFn: fetchProjects
  });

  const [formState, setFormState] = useState({
    name: '',
    description: '',
    tags: ''
  });
  const [isCreateModalOpen, setCreateModalOpen] = useState(false);

  const nameFieldRef = useRef<HTMLInputElement | null>(null);

  const resetForm = useCallback(() => {
    setFormState({ name: '', description: '', tags: '' });
  }, []);

  const createProjectMutation = useMutation({
    mutationFn: createProject,
    onSuccess: (project) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects });
      selectProject(project.id);
      resetForm();
      setCreateModalOpen(false);
      navigate(`/projects/${project.id}`);
    }
  });

  const closeCreateModal = useCallback(() => {
    setCreateModalOpen(false);
    resetForm();
    createProjectMutation.reset();
  }, [resetForm, createProjectMutation]);

  useEffect(() => {
    if (!isCreateModalOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeCreateModal();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isCreateModalOpen, closeCreateModal]);

  useEffect(() => {
    if (!isCreateModalOpen) {
      return;
    }

    nameFieldRef.current?.focus();
  }, [isCreateModalOpen]);

  const projects = useMemo(() => (data ? sortProjects(data) : []), [data]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formState.name.trim()) {
      return;
    }

    createProjectMutation.mutate({
      name: formState.name.trim(),
      description: formState.description.trim(),
      tags: parseTags(formState.tags)
    });
  };

  return (
    <section className="project-manager">
      <div className="panel">
        <header className="panel-header">
          <h2>Projects</h2>
          <p className="panel-subtitle">Select an existing project or create a new workspace.</p>
        </header>
        <div className="panel-content">
          {isLoading && <p className="status">Loading projects…</p>}
          {isError && (
            <p className="status error" role="alert">
              Failed to load projects: {error instanceof Error ? error.message : 'Unknown error'}
            </p>
          )}
          {!isLoading && !projects.length && (
            <p className="status">Start by creating a project using the button below.</p>
          )}
          {projects.length > 0 && (
            <ul className="project-list">
              {projects.map((project) => (
                <li key={project.id}>
                  <button
                    type="button"
                    className={clsx('project-button', {
                      active: project.id === selectedProjectId
                    })}
                    onClick={() => {
                      selectProject(project.id);
                      if (project.id !== selectedProjectId) {
                        navigate(`/projects/${project.id}`);
                      }
                    }}
                  >
                    <span className="project-name">{project.name}</span>
                    {project.description && <span className="project-description">{project.description}</span>}
                    {project.tags.length > 0 && (
                      <span className="tag-list">
                        {project.tags.map((tag) => (
                          <span key={tag} className="tag">
                            {tag}
                          </span>
                        ))}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="panel">
        <header className="panel-header">
          <h3>Create project</h3>
          <p className="panel-subtitle">A root system is created automatically and can’t be removed.</p>
        </header>
        <div className="panel-content project-form-launcher">
          <p className="status">Kick off a fresh architecture workspace for your team.</p>
          <button className="primary" type="button" onClick={() => setCreateModalOpen(true)}>
            New project
          </button>
        </div>
      </div>
      {isCreateModalOpen && (
        <div
          className="modal-backdrop"
          role="button"
          tabIndex={0}
          aria-label="Dismiss create project dialog"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeCreateModal();
            }
          }}
          onKeyDown={(event) => {
            if (event.currentTarget !== event.target) {
              return;
            }
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              closeCreateModal();
            }
          }}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-project-title"
            aria-describedby="create-project-description"
          >
            <header className="modal-header">
              <h3 id="create-project-title">Create project</h3>
              <button
                type="button"
                className="icon-button"
                onClick={closeCreateModal}
                aria-label="Close create project dialog"
                disabled={createProjectMutation.isPending}
              >
                ×
              </button>
            </header>
            <p id="create-project-description" className="modal-description">
              A root system is created automatically and can’t be removed.
            </p>
            <form className="project-form modal-form" onSubmit={handleSubmit}>
              <label className="field">
                <span>Name</span>
                <input
                  type="text"
                  ref={nameFieldRef}
                  value={formState.name}
                  onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))}
                  required
                  placeholder="E.g. Payments Platform"
                />
              </label>
              <label className="field">
                <span>Description</span>
                <textarea
                  value={formState.description}
                  onChange={(event) => setFormState((prev) => ({ ...prev, description: event.target.value }))}
                  rows={3}
                  placeholder="Optional summary to help collaborators."
                />
              </label>
              <label className="field">
                <span>Tags</span>
                <input
                  type="text"
                  value={formState.tags}
                  onChange={(event) => setFormState((prev) => ({ ...prev, tags: event.target.value }))}
                  placeholder="Comma separated"
                />
              </label>
              {createProjectMutation.isError && (
                <p className="status error" role="alert">
                  {createProjectMutation.error instanceof Error
                    ? createProjectMutation.error.message
                    : 'Unable to create project'}
                </p>
              )}
              <div className="modal-actions">
                <button
                  className="secondary"
                  type="button"
                  onClick={closeCreateModal}
                  disabled={createProjectMutation.isPending}
                >
                  Cancel
                </button>
                <button className="primary" type="submit" disabled={createProjectMutation.isPending}>
                  {createProjectMutation.isPending ? 'Creating…' : 'Create project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};

export default ProjectManager;

