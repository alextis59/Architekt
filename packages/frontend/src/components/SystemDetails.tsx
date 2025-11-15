import type { System } from '@architekt/domain';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

type SystemDetailsProps = {
  system: System;
  isRoot: boolean;
  onUpdate: (payload: { name: string; description: string; tags: string[] }) => void;
  onCreateChild: (payload: { name: string; description: string; tags: string[] }) => void;
  onDelete: () => void;
  isMutating: boolean;
  errorMessage: string | null;
};

const parseTags = (value: string): string[] =>
  value
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag, index, array) => tag.length > 0 && array.indexOf(tag) === index);

const SystemDetails = ({
  system,
  isRoot,
  onUpdate,
  onCreateChild,
  onDelete,
  isMutating,
  errorMessage
}: SystemDetailsProps) => {
  const [details, setDetails] = useState({
    name: system.name,
    description: system.description,
    tags: system.tags.join(', ')
  });

  const [childDraft, setChildDraft] = useState({
    name: '',
    description: '',
    tags: ''
  });

  const [activeModal, setActiveModal] = useState<'edit' | 'create' | null>(null);
  const [pendingAction, setPendingAction] = useState<'edit' | 'create' | null>(null);

  const editNameFieldRef = useRef<HTMLInputElement | null>(null);
  const createNameFieldRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDetails({
      name: system.name,
      description: system.description,
      tags: system.tags.join(', ')
    });
    setChildDraft({ name: '', description: '', tags: '' });
    setActiveModal(null);
    setPendingAction(null);
  }, [system]);

  const tags = useMemo(() => system.tags, [system.tags]);

  const resetEditForm = useCallback(() => {
    setDetails({
      name: system.name,
      description: system.description,
      tags: system.tags.join(', ')
    });
  }, [system.description, system.name, system.tags]);

  const resetCreateForm = useCallback(() => {
    setChildDraft({ name: '', description: '', tags: '' });
  }, []);

  const openEditModal = useCallback(() => {
    resetEditForm();
    setActiveModal('edit');
    setPendingAction(null);
  }, [resetEditForm]);

  const openCreateModal = useCallback(() => {
    resetCreateForm();
    setActiveModal('create');
    setPendingAction(null);
  }, [resetCreateForm]);

  const dismissModal = useCallback(() => {
    setActiveModal(null);
    setPendingAction(null);
    resetEditForm();
    resetCreateForm();
  }, [resetCreateForm, resetEditForm]);

  useEffect(() => {
    if (activeModal === null) {
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
    if (activeModal === 'edit') {
      editNameFieldRef.current?.focus();
    }
  }, [activeModal]);

  useEffect(() => {
    if (activeModal === 'create') {
      createNameFieldRef.current?.focus();
    }
  }, [activeModal]);

  useEffect(() => {
    if (!pendingAction || isMutating) {
      return;
    }

    if (!errorMessage) {
      dismissModal();
    }

    setPendingAction(null);
  }, [dismissModal, errorMessage, isMutating, pendingAction]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!details.name.trim()) {
      return;
    }

    setPendingAction('edit');
    onUpdate({
      name: details.name.trim(),
      description: details.description.trim(),
      tags: parseTags(details.tags)
    });
  };

  const handleCreateChild = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!childDraft.name.trim()) {
      return;
    }

    setPendingAction('create');
    onCreateChild({
      name: childDraft.name.trim(),
      description: childDraft.description.trim(),
      tags: parseTags(childDraft.tags)
    });
  };

  return (
    <div className="panel system-details-panel">
      <header className="panel-header">
        <h3>{system.name}</h3>
        <p className="panel-subtitle">
          {isRoot
            ? 'Root system anchors the entire architecture and cannot be removed.'
            : 'Update metadata, add nested systems, or prune branches.'}
        </p>
        {tags.length > 0 && (
          <p className="tag-list">
            {tags.map((tag) => (
              <span className="tag" key={tag}>
                {tag}
              </span>
            ))}
          </p>
        )}
      </header>
      <div className="panel-content system-details-summary">
        <dl className="system-details-meta">
          <div>
            <dt>Description</dt>
            <dd>{system.description ? system.description : 'No description provided.'}</dd>
          </div>
          <div>
            <dt>Children</dt>
            <dd>{system.childIds.length}</dd>
          </div>
        </dl>
        <p className="status">
          Manage architecture changes through focused dialogs to keep the workspace clutter-free.
        </p>
        <div className="action-row system-details-actions">
          <button type="button" className="primary" onClick={openEditModal}>
            Edit system
          </button>
          <button type="button" className="secondary" onClick={openCreateModal}>
            Add child system
          </button>
          <button
            type="button"
            className="danger"
            disabled={isRoot || isMutating}
            onClick={() => {
              if (!isRoot) {
                onDelete();
              }
            }}
          >
            {isMutating ? 'Working…' : 'Delete system'}
          </button>
        </div>
        {errorMessage && (
          <p className="status error" role="alert">
            {errorMessage}
          </p>
        )}
      </div>
      {activeModal && (
        <div
          className="modal-backdrop"
          role="button"
          tabIndex={0}
          aria-label={`Dismiss ${activeModal === 'edit' ? 'edit system' : 'create child system'} dialog`}
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
            className={`modal${activeModal === 'edit' ? ' system-modal-edit' : ' system-modal-create'}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby={activeModal === 'edit' ? 'edit-system-title' : 'create-system-title'}
            aria-describedby={
              activeModal === 'edit' ? 'edit-system-description' : 'create-system-description'
            }
          >
            <header className="modal-header">
              <h3 id={activeModal === 'edit' ? 'edit-system-title' : 'create-system-title'}>
                {activeModal === 'edit' ? 'Edit system' : 'Create child system'}
              </h3>
              <button
                type="button"
                className="icon-button"
                onClick={dismissModal}
                aria-label={`Close ${activeModal === 'edit' ? 'edit system' : 'create child system'} dialog`}
                disabled={isMutating}
              >
                ×
              </button>
            </header>
            <p
              id={activeModal === 'edit' ? 'edit-system-description' : 'create-system-description'}
              className="modal-description"
            >
              {activeModal === 'edit'
                ? 'Update the system name, description, and tags to reflect architecture changes.'
                : 'Define metadata for the new child system. Tags help filter and discover nodes quickly.'}
            </p>
            <div className="modal-body">
              {activeModal === 'edit' && (
                <form className="modal-form" onSubmit={handleSubmit}>
                  <label className="field">
                    <span>Name</span>
                    <input
                      type="text"
                      ref={editNameFieldRef}
                      value={details.name}
                      onChange={(event) =>
                        setDetails((prev) => ({ ...prev, name: event.target.value }))
                      }
                      required
                      disabled={isMutating}
                    />
                  </label>
                  <label className="field">
                    <span>Description</span>
                    <textarea
                      rows={4}
                      value={details.description}
                      onChange={(event) =>
                        setDetails((prev) => ({ ...prev, description: event.target.value }))
                      }
                      disabled={isMutating}
                    />
                  </label>
                  <label className="field">
                    <span>Tags</span>
                    <input
                      type="text"
                      value={details.tags}
                      onChange={(event) =>
                        setDetails((prev) => ({ ...prev, tags: event.target.value }))
                      }
                      placeholder="Comma separated"
                      disabled={isMutating}
                    />
                  </label>
                  <div className="modal-actions">
                    <button
                      className="secondary"
                      type="button"
                      onClick={dismissModal}
                      disabled={isMutating}
                    >
                      Cancel
                    </button>
                    <button className="primary" type="submit" disabled={isMutating}>
                      {isMutating ? 'Saving…' : 'Save changes'}
                    </button>
                  </div>
                </form>
              )}
              {activeModal === 'create' && (
                <form className="modal-form" onSubmit={handleCreateChild}>
                  <label className="field">
                    <span>Name</span>
                    <input
                      type="text"
                      ref={createNameFieldRef}
                      value={childDraft.name}
                      onChange={(event) =>
                        setChildDraft((prev) => ({ ...prev, name: event.target.value }))
                      }
                      placeholder="Authentication service"
                      required
                      disabled={isMutating}
                    />
                  </label>
                  <label className="field">
                    <span>Description</span>
                    <textarea
                      rows={3}
                      value={childDraft.description}
                      onChange={(event) =>
                        setChildDraft((prev) => ({ ...prev, description: event.target.value }))
                      }
                      disabled={isMutating}
                    />
                  </label>
                  <label className="field">
                    <span>Tags</span>
                    <input
                      type="text"
                      value={childDraft.tags}
                      onChange={(event) =>
                        setChildDraft((prev) => ({ ...prev, tags: event.target.value }))
                      }
                      placeholder="lambda, queue"
                      disabled={isMutating}
                    />
                  </label>
                  <div className="modal-actions">
                    <button
                      className="secondary"
                      type="button"
                      onClick={dismissModal}
                      disabled={isMutating}
                    >
                      Cancel
                    </button>
                    <button className="primary" type="submit" disabled={isMutating}>
                      {isMutating ? 'Creating…' : 'Create child'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SystemDetails;

