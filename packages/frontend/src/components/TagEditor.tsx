import { KeyboardEvent, useEffect, useId, useState } from 'react';
import clsx from 'clsx';
import { normalizeTags } from '../utils/tags.js';

type TagEditorProps = {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  inputId?: string;
  ariaLabel?: string;
  disabled?: boolean;
  compact?: boolean;
  viewId?: string;
  enableShortcuts?: boolean;
};

const RECENT_TAG_LIMIT = 3;
const SHORTCUT_STORAGE_PREFIX = 'tag-editor-shortcuts:';

const tokenize = (value: string): string[] =>
  value
    .split(/,|\n|\t/)
    .map((token) => token.trim())
    .filter(Boolean);

const getStorageKey = (viewId: string) => `${SHORTCUT_STORAGE_PREFIX}${viewId}`;

const loadRecentTags = (viewId: string | null): string[] => {
  if (!viewId || typeof window === 'undefined') {
    return [];
  }

  const stored = window.localStorage.getItem(getStorageKey(viewId));
  if (!stored) {
    return [];
  }

  try {
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      return parsed.filter((entry): entry is string => typeof entry === 'string').slice(0, RECENT_TAG_LIMIT);
    }
  } catch (error) {
    // Ignore malformed storage entries
  }

  return [];
};

const persistRecentTags = (viewId: string, tags: string[]) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(getStorageKey(viewId), JSON.stringify(tags.slice(0, RECENT_TAG_LIMIT)));
};

const TagEditor = ({
  tags,
  onChange,
  placeholder = 'Add tag',
  inputId,
  ariaLabel,
  disabled = false,
  compact = false,
  viewId,
  enableShortcuts = true
}: TagEditorProps) => {
  const generatedId = useId();
  const [draft, setDraft] = useState('');
  const shortcutViewId = enableShortcuts ? viewId ?? null : null;
  const [recentTags, setRecentTags] = useState<string[]>(() => loadRecentTags(shortcutViewId));

  useEffect(() => {
    setRecentTags(loadRecentTags(shortcutViewId));
  }, [shortcutViewId]);

  const updateRecentTags = (addedTags: string[]) => {
    if (!shortcutViewId || addedTags.length === 0) {
      return;
    }

    setRecentTags((previous) => {
      const merged = normalizeTags([...addedTags, ...previous]);
      const nextRecent = merged.slice(0, RECENT_TAG_LIMIT);
      persistRecentTags(shortcutViewId, nextRecent);
      return nextRecent;
    });
  };

  const addTags = (raw: string) => {
    if (disabled) {
      return;
    }

    const tokens = tokenize(raw);
    if (tokens.length === 0) {
      return;
    }

    const nextTags = normalizeTags([...tags, ...tokens]);
    const addedTags = normalizeTags(tokens).filter((tag) => !tags.includes(tag));
    if (nextTags.length !== tags.length) {
      onChange(nextTags);
    }

    updateRecentTags(addedTags);
  };

  const commitDraft = () => {
    if (!draft.trim()) {
      return;
    }
    addTags(draft);
    setDraft('');
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) {
      return;
    }

    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      commitDraft();
    } else if (event.key === 'Backspace' && !draft && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  };

  const handleRemove = (tag: string) => {
    onChange(tags.filter((entry) => entry !== tag));
  };

  const availableShortcuts = recentTags.filter((tag) => !tags.includes(tag));

  return (
    <div className={clsx('tag-editor', { disabled, compact })}>
      <div className="tag-editor-chips">
        {tags.map((tag) => (
          <span key={tag} className="tag-chip">
            <span className="tag-chip-label">{tag}</span>
            {!disabled && (
              <button
                type="button"
                className="tag-chip-remove"
                onClick={() => handleRemove(tag)}
                aria-label={`Remove tag ${tag}`}
              >
                ×
              </button>
            )}
          </span>
        ))}
        <div className="tag-editor-input">
          <input
            id={inputId ?? generatedId}
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={commitDraft}
            placeholder={placeholder}
            aria-label={ariaLabel}
            disabled={disabled}
          />
        </div>
      </div>
      {availableShortcuts.length > 0 && (
        <div className="tag-editor-shortcuts" aria-label="Recently used tags">
          <span className="tag-editor-shortcuts-label">Recent</span>
          <div className="tag-editor-shortcuts-list">
            {availableShortcuts.map((tag) => (
              <button
                key={tag}
                type="button"
                className="tag-editor-shortcut"
                onClick={() => addTags(tag)}
                disabled={disabled}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default TagEditor;
