import type { System } from '@architekt/domain';
import { FormEvent, useEffect, useMemo, useState } from 'react';

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

const SystemDetails = ({ system, isRoot, onUpdate, onCreateChild, onDelete, isMutating, errorMessage }: SystemDetailsProps) => {
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

  useEffect(() => {
    setDetails({
      name: system.name,
      description: system.description,
      tags: system.tags.join(', ')
    });
    setChildDraft({ name: '', description: '', tags: '' });
  }, [system]);

  const tags = useMemo(() => system.tags, [system.tags]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!details.name.trim()) {
      return;
    }

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
      <form className="panel-content system-details" onSubmit={handleSubmit}>
        <fieldset disabled={isMutating}>
          <label className="field">
            <span>Name</span>
            <input
              type="text"
              value={details.name}
              onChange={(event) => setDetails((prev) => ({ ...prev, name: event.target.value }))}
              required
            />
          </label>
          <label className="field">
            <span>Description</span>
            <textarea
              rows={4}
              value={details.description}
              onChange={(event) => setDetails((prev) => ({ ...prev, description: event.target.value }))}
            />
          </label>
          <label className="field">
            <span>Tags</span>
            <input
              type="text"
              value={details.tags}
              onChange={(event) => setDetails((prev) => ({ ...prev, tags: event.target.value }))}
              placeholder="Comma separated"
            />
          </label>
          <div className="action-row">
            <button className="primary" type="submit">
              Save changes
            </button>
            <button
              type="button"
              className="danger"
              disabled={isRoot}
              onClick={() => {
                if (!isRoot) {
                  onDelete();
                }
              }}
            >
              Delete system
            </button>
          </div>
          {errorMessage && (
            <p className="status error" role="alert">
              {errorMessage}
            </p>
          )}
        </fieldset>
      </form>
      <div className="panel-content system-child-form">
        <h4>Add child system</h4>
        <form onSubmit={handleCreateChild}>
          <fieldset disabled={isMutating}>
            <label className="field">
              <span>Name</span>
              <input
                type="text"
                value={childDraft.name}
                onChange={(event) => setChildDraft((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Authentication service"
                required
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
              />
            </label>
            <label className="field">
              <span>Tags</span>
              <input
                type="text"
                value={childDraft.tags}
                onChange={(event) => setChildDraft((prev) => ({ ...prev, tags: event.target.value }))}
                placeholder="lambda, queue"
              />
            </label>
            <button className="secondary" type="submit">
              Create child
            </button>
          </fieldset>
        </form>
      </div>
    </div>
  );
};

export default SystemDetails;

