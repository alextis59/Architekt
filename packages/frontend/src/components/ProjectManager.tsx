import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { useNavigate } from 'react-router-dom';
import { createProject, fetchProjects, shareProject, updateProject, type ProjectSummary } from '../api/projects.js';
import { queryKeys } from '../queryKeys.js';
import { selectSelectedProjectId, useProjectStore } from '../store/projectStore.js';
import TagEditor from './TagEditor.js';
import { normalizeTags } from '../utils/tags.js';

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
    tags: [] as string[]
  });
  const [shareEmail, setShareEmail] = useState('');
  const [activeModal, setActiveModal] = useState<'create' | 'edit' | null>(null);
  const [editingProject, setEditingProject] = useState<ProjectSummary | null>(null);

  const nameFieldRef = useRef<HTMLInputElement | null>(null);
  const tagsInputId = useId();

  const resetForm = useCallback(() => {
    setFormState({ name: '', description: '', tags: [] });
    setShareEmail('');
  }, []);

  const closeModalState = useCallback(() => {
    setActiveModal(null);
    setEditingProject(null);
    resetForm();
  }, [resetForm]);

  const createProjectMutation = useMutation({
    mutationFn: createProject,
    onSuccess: (project) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects });
      selectProject(project.id);
      closeModalState();
      navigate(`/projects/${project.id}`);
    }
  });

  const updateProjectMutation = useMutation({
    mutationFn: ({
      projectId,
      payload
    }: {
      projectId: string;
      payload: { name: string; description: string; tags: string[] };
    }) => updateProject(projectId, payload),
    onSuccess: (project) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects });
      void queryClient.invalidateQueries({ queryKey: queryKeys.project(project.id) });
      closeModalState();
      if (project.id === selectedProjectId) {
        navigate(`/projects/${project.id}`);
      }
    }
  });

  const shareProjectMutation = useMutation({
    mutationFn: ({ projectId, email }: { projectId: string; email: string }) => shareProject(projectId, email),
    onSuccess: (project) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects });
      void queryClient.invalidateQueries({ queryKey: queryKeys.project(project.id) });
      setEditingProject((previous) => (previous && previous.id === project.id ? { ...previous, sharedWith: project.sharedWith } : previous));
      setShareEmail('');
    }
  });

  const dismissModal = useCallback(() => {
    createProjectMutation.reset();
    updateProjectMutation.reset();
    shareProjectMutation.reset();
    closeModalState();
  }, [closeModalState, createProjectMutation, shareProjectMutation, updateProjectMutation]);

  const openCreateModal = useCallback(() => {
    createProjectMutation.reset();
    updateProjectMutation.reset();
    shareProjectMutation.reset();
    setEditingProject(null);
    setFormState({ name: '', description: '', tags: [] });
    setActiveModal('create');
  }, [createProjectMutation, shareProjectMutation, updateProjectMutation]);

  const openEditModal = useCallback(
    (project: ProjectSummary) => {
      createProjectMutation.reset();
      updateProjectMutation.reset();
      shareProjectMutation.reset();
      setEditingProject(project);
      setFormState({
        name: project.name,
        description: project.description ?? '',
        tags: [...project.tags]
      });
      setShareEmail('');
      setActiveModal('edit');
    },
    [createProjectMutation, shareProjectMutation, updateProjectMutation]
  );

  useEffect(() => {
    if (!activeModal) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        dismissModal();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [activeModal, dismissModal]);

  useEffect(() => {
    if (!activeModal) {
      return;
    }

    nameFieldRef.current?.focus();
  }, [activeModal]);

  const projects = useMemo(() => (data ? sortProjects(data) : []), [data]);
  const sharedUsers = useMemo(
    () => (editingProject ? [...editingProject.sharedWith].sort((a, b) => a.localeCompare(b)) : []),
    [editingProject]
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formState.name.trim()) {
      return;
    }

    const payload = {
      name: formState.name.trim(),
      description: formState.description.trim(),
      tags: normalizeTags(formState.tags)
    };

    if (activeModal === 'edit' && editingProject) {
      updateProjectMutation.mutate({ projectId: editingProject.id, payload });
    } else {
      createProjectMutation.mutate(payload);
    }
  };

  const handleShare = () => {
    if (!editingProject) {
      return;
    }

    const normalizedEmail = shareEmail.trim();
    if (!normalizedEmail) {
      return;
    }

    shareProjectMutation.mutate({ projectId: editingProject.id, email: normalizedEmail });
  };

  const isEditModalOpen = activeModal === 'edit';
  const isModalOpen = activeModal !== null;
  const activeMutation = activeModal === 'edit' ? updateProjectMutation : createProjectMutation;
  const modalTitleId = isEditModalOpen ? 'edit-project-title' : 'create-project-title';
  const modalDescriptionId = isEditModalOpen ? 'edit-project-description' : 'create-project-description';
  const modalHeading = isEditModalOpen ? 'Edit project' : 'Create project';
  const modalDescription = isEditModalOpen
    ? 'Update the name, description, or tags for this workspace.'
    : 'A root system is created automatically and can’t be removed.';
  const submitLabel = activeMutation.isPending
    ? isEditModalOpen
      ? 'Saving…'
      : 'Creating…'
    : isEditModalOpen
      ? 'Save changes'
      : 'Create project';

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
              {projects.map((project) => {
                const nameId = `project-${project.id}-name`;
                const descriptionId = project.description ? `project-${project.id}-description` : undefined;
                const tagsId = project.tags.length > 0 ? `project-${project.id}-tags` : undefined;
                const describedBy = [descriptionId, tagsId].filter(Boolean).join(' ');

                return (
                  <li key={project.id}>
                    <div className="project-item">
                      <button
                        type="button"
                        className={clsx('project-button', {
                          active: project.id === selectedProjectId
                        })}
                        aria-labelledby={nameId}
                        aria-describedby={describedBy || undefined}
                        onClick={() => {
                          selectProject(project.id);
                          if (project.id !== selectedProjectId) {
                            navigate(`/projects/${project.id}`);
                          }
                        }}
                      >
                        <span id={nameId} className="project-name">
                          {project.name}
                        </span>
                        {project.description && (
                          <span id={descriptionId} className="project-description">
                            {project.description}
                          </span>
                        )}
                        {project.tags.length > 0 && (
                          <span id={tagsId} className="tag-list">
                            {project.tags.map((tag) => (
                              <span key={tag} className="tag">
                                {tag}
                              </span>
                            ))}
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        className="link-button project-edit-button"
                        onClick={() => openEditModal(project)}
                        aria-label={`Edit project ${project.name}`}
                      >
                        Edit
                      </button>
                    </div>
                  </li>
                );
              })}
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
          <button className="primary" type="button" onClick={openCreateModal}>
            New project
          </button>
        </div>
      </div>
      {isModalOpen && (
        <div
          className="modal-backdrop"
          role="button"
          tabIndex={0}
          aria-label={`Dismiss ${isEditModalOpen ? 'edit' : 'create'} project dialog`}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              dismissModal();
            }
          }}
          onKeyDown={(event) => {
            if (event.currentTarget !== event.target) {
              return;
            }
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              dismissModal();
            }
          }}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={modalTitleId}
            aria-describedby={modalDescriptionId}
          >
            <header className="modal-header">
              <h3 id={modalTitleId}>{modalHeading}</h3>
              <button
                type="button"
                className="icon-button"
                onClick={dismissModal}
                aria-label={`Close ${isEditModalOpen ? 'edit' : 'create'} project dialog`}
                disabled={activeMutation.isPending}
              >
                ×
              </button>
            </header>
            <p id={modalDescriptionId} className="modal-description">
              {modalDescription}
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
              <div className="field">
                <label htmlFor={tagsInputId}>
                  <span>Tags</span>
                </label>
                <TagEditor
                  inputId={tagsInputId}
                  tags={formState.tags}
                  onChange={(tags) => setFormState((prev) => ({ ...prev, tags }))}
                  placeholder="Add a tag"
                />
              </div>
              {activeMutation.isError && (
                <p className="status error" role="alert">
                  {activeMutation.error instanceof Error
                    ? activeMutation.error.message
                    : isEditModalOpen
                      ? 'Unable to update project'
                      : 'Unable to create project'}
                </p>
              )}
              <div className="modal-actions">
                <button
                  className="secondary"
                  type="button"
                  onClick={dismissModal}
                  disabled={activeMutation.isPending}
                >
                  Cancel
                </button>
                <button className="primary" type="submit" disabled={activeMutation.isPending}>
                  {submitLabel}
                </button>
              </div>
            </form>
            {isEditModalOpen && (
              <div className="share-section" aria-live="polite">
                <div className="share-header">
                  <h4>Share project</h4>
                  <p className="panel-subtitle">Invite collaborators by email to edit this workspace.</p>
                </div>
                {sharedUsers.length > 0 ? (
                  <div className="shared-users" aria-label="Collaborators">
                    {sharedUsers.map((email) => (
                      <span key={email} className="tag">
                        {email}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="status">No collaborators yet.</p>
                )}
                <div className="share-controls">
                  <label className="field">
                    <span>Invite by email</span>
                    <input
                      type="email"
                      value={shareEmail}
                      onChange={(event) => setShareEmail(event.target.value)}
                      placeholder="person@example.com"
                    />
                  </label>
                  {shareProjectMutation.isError && (
                    <p className="status error" role="alert">
                      {shareProjectMutation.error instanceof Error
                        ? shareProjectMutation.error.message
                        : 'Unable to share project'}
                    </p>
                  )}
                  <button
                    className="primary"
                    type="button"
                    onClick={handleShare}
                    disabled={!shareEmail.trim() || shareProjectMutation.isPending || !editingProject}
                  >
                    {shareProjectMutation.isPending ? 'Sharing…' : 'Share project'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

export default ProjectManager;

