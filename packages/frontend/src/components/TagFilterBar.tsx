import clsx from 'clsx';

type TagFilterBarProps = {
  availableTags: string[];
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  onClear: () => void;
  label?: string;
  emptyLabel?: string;
  ariaLabel?: string;
};

const TagFilterBar = ({
  availableTags,
  selectedTags,
  onToggleTag,
  onClear,
  label = 'Filter by tag',
  emptyLabel = 'No tags defined yet.',
  ariaLabel
}: TagFilterBarProps) => {
  if (availableTags.length === 0) {
    return (
      <div className="tag-filter" role="toolbar" aria-label={ariaLabel ?? label}>
        <span className="tag-filter-empty">{emptyLabel}</span>
      </div>
    );
  }

  return (
    <div className="tag-filter" role="toolbar" aria-label={ariaLabel ?? label}>
      <span className="tag-filter-label">{label}:</span>
      <div className="tag-filter-buttons">
        {availableTags.map((tag) => (
          <button
            key={tag}
            type="button"
            className={clsx('tag-filter-button', {
              active: selectedTags.includes(tag)
            })}
            onClick={() => onToggleTag(tag)}
          >
            {tag}
          </button>
        ))}
      </div>
      {selectedTags.length > 0 && (
        <button type="button" className="link-button" onClick={onClear}>
          Clear filters
        </button>
      )}
    </div>
  );
};

export default TagFilterBar;

