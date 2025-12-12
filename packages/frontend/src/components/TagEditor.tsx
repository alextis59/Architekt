import { KeyboardEvent, useId, useState } from 'react';
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
};

const tokenize = (value: string): string[] =>
  value
    .split(/,|\n|\t/)
    .map((token) => token.trim())
    .filter(Boolean);

const TagEditor = ({
  tags,
  onChange,
  placeholder = 'Add tag',
  inputId,
  ariaLabel,
  disabled = false,
  compact = false
}: TagEditorProps) => {
  const generatedId = useId();
  const [draft, setDraft] = useState('');

  const addTags = (raw: string) => {
    const nextTags = normalizeTags([...tags, ...tokenize(raw)]);
    if (nextTags.length !== tags.length) {
      onChange(nextTags);
    }
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
    </div>
  );
};

export default TagEditor;
